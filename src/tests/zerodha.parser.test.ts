import { describe, it, expect } from "vitest";
import { ZerodhaParser } from "../parsers/zerodha.parser.js";
import {
  ZERODHA_VALID_CSV,
  ZERODHA_WITH_ERRORS_CSV,
  SINGLE_VALID_ZERODHA_ROW,
  ALL_INVALID_ZERODHA_CSV,
  HEADERS_ONLY_CSV,
} from "./fixtures.js";

const parser = new ZerodhaParser();

describe("ZerodhaParser", () => {
  describe("valid CSV", () => {
    it("parses all 5 valid rows correctly", async () => {
      const { trades, errors } = await parser.parse(ZERODHA_VALID_CSV);

      expect(trades).toHaveLength(5);
      expect(errors).toHaveLength(0);
    });

    it("normalizes lowercase trade_type to uppercase BUY/SELL", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);

      expect(trades[0]?.side).toBe("BUY");   // row 2: "buy"
      expect(trades[1]?.side).toBe("SELL");  // row 3: "sell"
    });

    it("handles uppercase SELL (row 5) correctly", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);

      const sbin = trades.find((t) => t.symbol === "SBIN");
      expect(sbin?.side).toBe("SELL");
    });

    it("infers INR currency from NSE exchange", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const nseTradesCurrencies = trades
        .filter((_, i) => i !== 2) // TATAMOTORS is BSE
        .map((t) => t.currency);

      expect(nseTradesCurrencies.every((c) => c === "INR")).toBe(true);
    });

    it("infers INR currency from BSE exchange", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const tatamotors = trades.find((t) => t.symbol === "TATAMOTORS");
      expect(tatamotors?.currency).toBe("INR");
    });

    it("parses numeric fields correctly", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const reliance = trades.find((t) => t.symbol === "RELIANCE");

      expect(reliance?.quantity).toBe(10);
      expect(reliance?.price).toBe(2450.50);
    });

    it("calculates totalAmount as positive for BUY", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const reliance = trades.find((t) => t.symbol === "RELIANCE");

      expect(reliance?.totalAmount).toBe(10 * 2450.50);
    });

    it("calculates totalAmount as negative for SELL", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const infy = trades.find((t) => t.symbol === "INFY");

      expect(infy?.totalAmount).toBe(-(25 * 1520.75));
    });

    it("converts DD-MM-YYYY date to ISO 8601", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const reliance = trades.find((t) => t.symbol === "RELIANCE");

      expect(reliance?.executedAt).toBe("2026-04-01T00:00:00.000Z");
    });

    it("sets broker to 'zerodha'", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      expect(trades.every((t) => t.broker === "zerodha")).toBe(true);
    });

    it("stores original row data in rawData", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const reliance = trades.find((t) => t.symbol === "RELIANCE");

      expect(reliance?.rawData).toMatchObject({
        symbol: "RELIANCE",
        trade_id: "TRD001",
        isin: "INE002A01018",
      });
    });

    it("allows empty ISIN (row 4 - HDFCBANK)", async () => {
      const { trades } = await parser.parse(ZERODHA_VALID_CSV);
      const hdfcbank = trades.find((t) => t.symbol === "HDFCBANK");

      expect(hdfcbank).toBeDefined();
      expect((hdfcbank?.rawData as Record<string, string>)["isin"]).toBe("");
    });
  });

  describe("error handling", () => {
    it("skips row with invalid date and continues parsing", async () => {
      const { trades, errors } = await parser.parse(ZERODHA_WITH_ERRORS_CSV);

      expect(trades).toHaveLength(5);
      expect(errors).toHaveLength(2);
    });

    it("reports correct row number for invalid date (row 7 in file = row 6 data)", async () => {
      const { errors } = await parser.parse(ZERODHA_WITH_ERRORS_CSV);
      const dateError = errors.find((e) => e.row === 7);

      expect(dateError).toBeDefined();
      expect(dateError?.reason).toMatch(/invalid.*date/i);
    });

    it("reports correct row number for negative quantity (row 8 in file = row 7 data)", async () => {
      const { errors } = await parser.parse(ZERODHA_WITH_ERRORS_CSV);
      const qtyError = errors.find((e) => e.row === 8);

      expect(qtyError).toBeDefined();
      expect(qtyError?.reason).toMatch(/positive/i);
    });

    it("skips row with negative quantity", async () => {
      const { trades } = await parser.parse(ZERODHA_WITH_ERRORS_CSV);
      const wipro = trades.find((t) => t.symbol === "WIPRO");
      expect(wipro).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("parses a single valid row", async () => {
      const { trades, errors } = await parser.parse(SINGLE_VALID_ZERODHA_ROW);

      expect(trades).toHaveLength(1);
      expect(errors).toHaveLength(0);
    });

    it("returns all errors when all rows are invalid", async () => {
      const { trades, errors } = await parser.parse(ALL_INVALID_ZERODHA_CSV);

      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(2);
    });

    it("returns empty arrays for headers-only CSV", async () => {
      const { trades, errors } = await parser.parse(HEADERS_ONLY_CSV);

      expect(trades).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });
  });

  describe("headerFingerprint", () => {
    it("contains the expected identifying columns", () => {
      expect(parser.headerFingerprint.has("symbol")).toBe(true);
      expect(parser.headerFingerprint.has("trade_date")).toBe(true);
      expect(parser.headerFingerprint.has("trade_type")).toBe(true);
    });
  });
});
