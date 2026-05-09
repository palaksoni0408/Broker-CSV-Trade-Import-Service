import { detectBroker } from "../utils/detectBroker.js";
import { parserRegistry } from "../parsers/registry.js";
import type { ImportResponse } from "../schemas/trade.schema.js";

/**
 * Core business logic for the trade import flow.
 *
 * This service is intentionally framework-agnostic — it takes raw CSV text
 * and returns a structured response. Fastify wiring lives in the route layer.
 */
export class ImportService {
  /**
   * Processes a raw CSV string through the full import pipeline:
   * 1. Auto-detect broker format
   * 2. Parse and normalize rows
   * 3. Collect errors for invalid rows
   * 4. Return structured summary
   *
   * @throws {Error} if the CSV format is unrecognized (no parser matched)
   */
  async importCsv(csvText: string): Promise<ImportResponse> {
    // Step 1: Identify which broker this CSV comes from
    const parser = detectBroker(csvText, parserRegistry);

    // Step 2: Parse — invalid rows are collected, not thrown
    const { trades, errors } = await parser.parse(csvText);

    // Step 3: Assemble response
    const total = trades.length + errors.length;

    return {
      broker: parser.brokerName,
      summary: {
        total,
        valid: trades.length,
        skipped: errors.length,
      },
      trades,
      errors,
    };
  }
}
