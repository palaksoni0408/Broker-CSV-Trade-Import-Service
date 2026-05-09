import { TradeSchema, type Trade, type RowError } from "../schemas/trade.schema.js";
import type { BrokerParser, ParseResult } from "./parser.interface.js";
import { parseCsvToRows } from "../utils/csv.js";
import { parseZerodhaDate } from "../utils/date.js";
import { parsePositiveFloat, normalizeSide } from "../utils/parse.js";

/**
 * Maps Zerodha trade_type values to the unified side enum.
 * Zerodha uses "buy"/"sell" but the docs confirm uppercase is also seen in the wild.
 */
const SIDE_MAP: Record<string, "BUY" | "SELL"> = {
  BUY: "BUY",
  SELL: "SELL",
};

/**
 * Infers currency from exchange field.
 * NSE and BSE are Indian exchanges — all trades settle in INR.
 * Extend this map if Zerodha ever adds MCX (commodity) or other exchanges.
 */
function inferCurrency(exchange: string): string {
  const upper = exchange.trim().toUpperCase();
  if (upper === "NSE" || upper === "BSE") return "INR";
  throw new Error(`Cannot infer currency for unknown exchange: '${exchange}'.`);
}

/**
 * Parser for Zerodha-style Indian equity broker CSVs.
 *
 * Expected headers:
 *   symbol, isin, trade_date, trade_type, quantity, price, trade_id, order_id, exchange, segment
 *
 * Key behaviors:
 * - Date format is DD-MM-YYYY
 * - trade_type is case-insensitive ("buy"/"SELL" both work)
 * - isin may be empty — that's fine, it goes into rawData only
 * - Currency is always INR (inferred from NSE/BSE exchange)
 * - Negative quantity fails validation
 * - Invalid dates fail validation
 */
export class ZerodhaParser implements BrokerParser {
  readonly brokerName = "zerodha";

  readonly headerFingerprint: ReadonlySet<string> = new Set([
    "symbol",
    "trade_date",
    "trade_type",
    "exchange",
    "segment",
  ]);

  async parse(csvText: string): Promise<ParseResult> {
    const rows = parseCsvToRows(csvText);
    const trades: Trade[] = [];
    const errors: RowError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Row numbers in errors are 1-indexed and offset by 1 for the header row
      const rowNumber = i + 2;

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
    const symbol = row["symbol"]?.trim();
    if (!symbol) throw new Error("'symbol' is missing.");

    const side = normalizeSide(row["trade_type"] ?? "", "trade_type", SIDE_MAP);
    const quantity = parsePositiveFloat(row["quantity"] ?? "", "quantity");
    const price = parsePositiveFloat(row["price"] ?? "", "price");
    const executedAt = parseZerodhaDate(row["trade_date"] ?? "");
    const currency = inferCurrency(row["exchange"] ?? "");
    const totalAmount = side === "BUY" ? quantity * price : -(quantity * price);

    // Validate through Zod — catches any edge cases the manual parsing missed
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
