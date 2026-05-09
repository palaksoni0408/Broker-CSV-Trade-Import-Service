import type { Trade, RowError } from "../schemas/trade.schema.js";

/**
 * Result of parsing a CSV file from a specific broker.
 */
export interface ParseResult {
  trades: Trade[];
  errors: RowError[];
}

/**
 * Contract every broker parser must satisfy.
 *
 * To add a new broker (e.g. Broker C), create a class implementing this interface
 * and register it in the parser registry — no other files need to change.
 */
export interface BrokerParser {
  /** Human-readable broker name (e.g. "zerodha", "ibkr") */
  readonly brokerName: string;

  /**
   * The set of CSV header columns that uniquely identify this broker's format.
   * Used by auto-detection.
   */
  readonly headerFingerprint: ReadonlySet<string>;

  /**
   * Parse raw CSV text into normalized Trade objects.
   * Invalid rows must be skipped (not thrown) and recorded in errors[].
   */
  parse(csvText: string): Promise<ParseResult>;
}
