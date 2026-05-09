import { describe, it, expect } from "vitest";
import { IbkrParser } from "../parsers/ibkr.parser.js";
import {
  IBKR_VALID_CSV,
  IBKR_WITH_ERRORS_CSV,
} from "./fixtures.js";

const parser = new IbkrParser();

describe("IbkrParser", () => {
  describe("valid CSV", () => {
    it("parses all 4 valid rows correctly", async () => {
      const { trades, errors } = await parser.parse(IBKR_VALID_CSV);

      expect(trades).toHaveLength(4);
      expect(errors).toHaveLength(0);
    });

    it("maps BOT to BUY", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const aapl = trades.find((t) => t.symbol === "AAPL");
      expect(aapl?.side).toBe("BUY");
    });

    it("maps SLD to SELL", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const msft = trades.find((t) => t.symbol === "MSFT");
      expect(msft?.side).toBe("SELL");
    });

    it("normalizes EUR.USD to EUR/USD", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const forex = trades.find((t) => t.symbol === "EUR/USD");
      expect(forex).toBeDefined();
    });

    it("does not create a trade with symbol EUR.USD (unnormalized)", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const unnormalized = trades.find((t) => t.symbol === "EUR.USD");
      expect(unnormalized).toBeUndefined();
    });

    it("parses ISO 8601 datetime correctly", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const aapl = trades.find((t) => t.symbol === "AAPL");
      expect(aapl?.executedAt).toBe("2026-04-01T14:30:00.000Z");
    });

    it("parses MM/DD/YYYY datetime (TSLA row 4)", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const tsla = trades.find((t) => t.symbol === "TSLA");
      expect(tsla?.executedAt).toBe("2026-04-03T00:00:00.000Z");
    });

    it("preserves extra fields in rawData", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const aapl = trades.find((t) => t.symbol === "AAPL");

      expect(aapl?.rawData).toMatchObject({
        AccountID: "U1234567",
        Commission: "-1.00",
        AssetClass: "STK",
      });
    });

    it("uses NetAmount from CSV when available", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const aapl = trades.find((t) => t.symbol === "AAPL");
      expect(aapl?.totalAmount).toBe(18549.00);
    });

    it("SELL trade has negative NetAmount from CSV", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      const msft = trades.find((t) => t.symbol === "MSFT");
      expect(msft?.totalAmount).toBe(-21011.50);
    });

    it("sets broker to 'ibkr'", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      expect(trades.every((t) => t.broker === "ibkr")).toBe(true);
    });

    it("uses USD currency from CSV", async () => {
      const { trades } = await parser.parse(IBKR_VALID_CSV);
      expect(trades.every((t) => t.currency === "USD")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("skips row 5 (zero quantity) and row 6 (empty commission handled, but passes if NetAmount present)", async () => {
      const { trades, errors } = await parser.parse(IBKR_WITH_ERRORS_CSV);
      // Row 5 (AMZN) has qty=0 — must be skipped
      // Row 6 (GOOGL) has empty commission — but commission isn't required, should parse
      expect(trades.length).toBeGreaterThanOrEqual(4);
      const amzn = trades.find((t) => t.symbol === "AMZN");
      expect(amzn).toBeUndefined();
    });

    it("reports an error for zero quantity row", async () => {
      const { errors } = await parser.parse(IBKR_WITH_ERRORS_CSV);
      const zeroQtyError = errors.find((e) => e.row === 6);
      expect(zeroQtyError).toBeDefined();
      expect(zeroQtyError?.reason).toMatch(/positive/i);
    });

    it("allows GOOGL row with empty Commission to pass (commission not required)", async () => {
      const { trades } = await parser.parse(IBKR_WITH_ERRORS_CSV);
      const googl = trades.find((t) => t.symbol === "GOOGL");
      expect(googl).toBeDefined();
    });
  });

  describe("headerFingerprint", () => {
    it("contains IBKR-specific identifying columns", () => {
      expect(parser.headerFingerprint.has("TradeID")).toBe(true);
      expect(parser.headerFingerprint.has("Buy/Sell")).toBe(true);
      expect(parser.headerFingerprint.has("AssetClass")).toBe(true);
    });
  });
});
