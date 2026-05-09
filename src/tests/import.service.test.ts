import { describe, it, expect } from "vitest";
import { ImportService } from "../services/import.service.js";
import {
  ZERODHA_VALID_CSV,
  ZERODHA_WITH_ERRORS_CSV,
  IBKR_VALID_CSV,
  IBKR_WITH_ERRORS_CSV,
  UNKNOWN_BROKER_CSV,
  EMPTY_CSV,
  SINGLE_VALID_ZERODHA_ROW,
  ALL_INVALID_ZERODHA_CSV,
  HEADERS_ONLY_CSV,
} from "./fixtures.js";

const service = new ImportService();

describe("ImportService", () => {
  describe("Zerodha integration", () => {
    it("processes a valid Zerodha CSV and returns correct summary", async () => {
      const result = await service.importCsv(ZERODHA_VALID_CSV);

      expect(result.broker).toBe("zerodha");
      expect(result.summary.total).toBe(5);
      expect(result.summary.valid).toBe(5);
      expect(result.summary.skipped).toBe(0);
      expect(result.trades).toHaveLength(5);
      expect(result.errors).toHaveLength(0);
    });

    it("returns correct valid/skipped counts for Zerodha CSV with errors", async () => {
      const result = await service.importCsv(ZERODHA_WITH_ERRORS_CSV);

      expect(result.summary.total).toBe(7);
      expect(result.summary.valid).toBe(5);
      expect(result.summary.skipped).toBe(2);
    });

    it("includes error details for each skipped row", async () => {
      const result = await service.importCsv(ZERODHA_WITH_ERRORS_CSV);

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toHaveProperty("row");
      expect(result.errors[0]).toHaveProperty("reason");
    });
  });

  describe("IBKR integration", () => {
    it("processes a valid IBKR CSV and returns correct summary", async () => {
      const result = await service.importCsv(IBKR_VALID_CSV);

      expect(result.broker).toBe("ibkr");
      expect(result.summary.valid).toBe(4);
      expect(result.summary.skipped).toBe(0);
    });

    it("skips zero-quantity IBKR rows", async () => {
      const result = await service.importCsv(IBKR_WITH_ERRORS_CSV);

      const amzn = result.trades.find((t) => t.symbol === "AMZN");
      expect(amzn).toBeUndefined();
      expect(result.summary.skipped).toBeGreaterThanOrEqual(1);
    });
  });

  describe("error scenarios", () => {
    it("throws for unrecognized broker format", async () => {
      await expect(service.importCsv(UNKNOWN_BROKER_CSV)).rejects.toThrow(
        /unrecognized/i
      );
    });

    it("throws for empty CSV", async () => {
      await expect(service.importCsv(EMPTY_CSV)).rejects.toThrow();
    });

    it("returns 0 trades for headers-only CSV (no data rows)", async () => {
      const result = await service.importCsv(HEADERS_ONLY_CSV);

      expect(result.summary.total).toBe(0);
      expect(result.trades).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("handles a single valid row", async () => {
      const result = await service.importCsv(SINGLE_VALID_ZERODHA_ROW);

      expect(result.summary.total).toBe(1);
      expect(result.summary.valid).toBe(1);
      expect(result.summary.skipped).toBe(0);
    });

    it("handles all invalid rows gracefully", async () => {
      const result = await service.importCsv(ALL_INVALID_ZERODHA_CSV);

      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(0);
      expect(result.summary.skipped).toBe(2);
      expect(result.trades).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
    });

    it("summary total equals valid + skipped", async () => {
      const result = await service.importCsv(ZERODHA_WITH_ERRORS_CSV);
      expect(result.summary.total).toBe(
        result.summary.valid + result.summary.skipped
      );
    });
  });

  describe("response shape", () => {
    it("always includes broker, summary, trades, and errors keys", async () => {
      const result = await service.importCsv(ZERODHA_VALID_CSV);

      expect(result).toHaveProperty("broker");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("trades");
      expect(result).toHaveProperty("errors");
    });

    it("trade objects include all required schema fields", async () => {
      const result = await service.importCsv(ZERODHA_VALID_CSV);
      const trade = result.trades[0];

      expect(trade).toHaveProperty("symbol");
      expect(trade).toHaveProperty("side");
      expect(trade).toHaveProperty("quantity");
      expect(trade).toHaveProperty("price");
      expect(trade).toHaveProperty("totalAmount");
      expect(trade).toHaveProperty("currency");
      expect(trade).toHaveProperty("executedAt");
      expect(trade).toHaveProperty("broker");
      expect(trade).toHaveProperty("rawData");
    });
  });
});
