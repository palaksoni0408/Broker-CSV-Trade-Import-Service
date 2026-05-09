import { describe, it, expect } from "vitest";
import { detectBroker } from "../utils/detectBroker.js";
import { parserRegistry } from "../parsers/registry.js";
import {
  ZERODHA_VALID_CSV,
  IBKR_VALID_CSV,
  UNKNOWN_BROKER_CSV,
  EMPTY_CSV,
} from "./fixtures.js";

describe("detectBroker", () => {
  it("detects Zerodha from its header fingerprint", () => {
    const parser = detectBroker(ZERODHA_VALID_CSV, parserRegistry);
    expect(parser.brokerName).toBe("zerodha");
  });

  it("detects IBKR from its header fingerprint", () => {
    const parser = detectBroker(IBKR_VALID_CSV, parserRegistry);
    expect(parser.brokerName).toBe("ibkr");
  });

  it("throws for an unrecognized CSV format", () => {
    expect(() => detectBroker(UNKNOWN_BROKER_CSV, parserRegistry)).toThrow(
      /unrecognized/i
    );
  });

  it("throws for an empty CSV", () => {
    expect(() => detectBroker(EMPTY_CSV, parserRegistry)).toThrow();
  });

  it("throws with a helpful error message listing found headers", () => {
    expect(() => detectBroker(UNKNOWN_BROKER_CSV, parserRegistry)).toThrow(
      /headers found/i
    );
  });

  it("throws when parser registry is empty", () => {
    expect(() => detectBroker(ZERODHA_VALID_CSV, [])).toThrow();
  });

  it("does not detect Zerodha from IBKR CSV", () => {
    const parser = detectBroker(IBKR_VALID_CSV, parserRegistry);
    expect(parser.brokerName).not.toBe("zerodha");
  });

  it("does not detect IBKR from Zerodha CSV", () => {
    const parser = detectBroker(ZERODHA_VALID_CSV, parserRegistry);
    expect(parser.brokerName).not.toBe("ibkr");
  });
});
