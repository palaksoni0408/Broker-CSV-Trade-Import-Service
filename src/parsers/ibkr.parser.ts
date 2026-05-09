import { TradeSchema, type Trade, type RowError } from "../schemas/trade.schema.js";
import type { BrokerParser, ParseResult } from "./parser.interface.js";
import { parseCsvToRows } from "../utils/csv.js";
import { parseIbkrDateTime } from "../utils/date.js";
import { parseFloat_, parsePositiveFloat, normalizeSide } from "../utils/parse.js";

/**
 * Maps IBKR Buy/Sell indicator values to the unified side enum.
 * IBKR uses "BOT" (bought) and "SLD" (sold) in their exports.
 */
const SIDE_MAP: Record<string, "BUY" | "SELL"> = {
  BOT: "BUY",
  SLD: "SELL",
  BUY: "BUY",  // some IBKR account types use the full word
  SELL: "SELL",
};

/**
 * Normalizes IBKR symbol notation to standard format.
 * IBKR uses "EUR.USD" for forex pairs; we normalize to "EUR/USD".
 */
function normalizeSymbol(raw: string): string {
  return raw.trim().replace(".", "/");
}

/**
 * Parser for Interactive Brokers (IBKR)-style international broker CSVs.
 *
 * Expected headers:
 *   TradeID, AccountID, Symbol, DateTime, Buy/Sell, Quantity,
 *   TradePrice, Currency, Commission, NetAmount, AssetClass
 *
 * Key behaviors:
 * - BOT => BUY, SLD => SELL
 * - DateTime can be ISO 8601 or MM/DD/YYYY
 * - EUR.USD normalized to EUR/USD
 * - Zero quantity fails validation
 * - Empty Commission is allowed (goes into rawData as empty string)
 * - All extra fields preserved in rawData
 */
export class IbkrParser implements BrokerParser {
  readonly brokerName = "ibkr";

  readonly headerFingerprint: ReadonlySet<string> = new Set([
    "TradeID",
    "AccountID",
    "Buy/Sell",
    "TradePrice",
    "AssetClass",
  ]);

  async parse(csvText: string): Promise<ParseResult> {
    const rows = parseCsvToRows(csvText);
    const trades: Trade[] = [];
    const errors: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // 1-indexed + skip header

      try {
        const trade = this.parseRow(row);
        trades.push(trade);
      } catch (err) {
        errors.push({
          row: rowNumber,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { trades, errors };
  }

  private parseRow(row: Record<string, string>): Trade {
    const symbol = normalizeSymbol(row["Symbol"] ?? "");
    if (!symbol) throw new Error("'Symbol' is missing.");

    const side = normalizeSide(row["Buy/Sell"] ?? "", "Buy/Sell", SIDE_MAP);

    // Quantity: IBKR uses zero quantity for cancelled/erroneous trades — reject these
    const quantity = parsePositiveFloat(row["Quantity"] ?? "", "Quantity");

    const price = parsePositiveFloat(row["TradePrice"] ?? "", "TradePrice");
    const executedAt = parseIbkrDateTime(row["DateTime"] ?? "");
    const currency = (row["Currency"] ?? "").trim();
    if (currency.length !== 3) {
      throw new Error(`'Currency' must be a 3-letter code, got: '${currency}'.`);
    }

    // NetAmount from IBKR is already signed — use it directly when present
    // If missing, fall back to calculating it ourselves
    const netAmountRaw = row["NetAmount"]?.trim() ?? "";
    const totalAmount = netAmountRaw !== ""
      ? parseFloat_(netAmountRaw, "NetAmount")
      : side === "BUY"
        ? quantity * price
        : -(quantity * price);

    return TradeSchema.parse({
      symbol,
      side,
      quantity,
      price,
      totalAmount,
      currency,
      executedAt,
      broker: this.brokerName,
      rawData: row as Record<string, unknown>,
    });
  }
}
