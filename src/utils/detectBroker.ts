import type { BrokerParser } from "../parsers/parser.interface.js";
import { extractHeaders } from "./csv.js";

/**
 * Detects which broker parser should handle the given CSV.
 *
 * Strategy: each parser exposes a `headerFingerprint` — a set of column names
 * that uniquely identify its format. We score each parser by how many of its
 * fingerprint columns appear in the CSV headers, then pick the best match.
 *
 * This approach is more resilient than exact-match: it handles brokers that
 * add/remove optional columns over time, as long as the core identifiers remain.
 *
 * @throws {Error} if no parser reaches a minimum match threshold.
 */
export function detectBroker(
  csvText: string,
  parsers: BrokerParser[]
): BrokerParser {
  const headers = new Set(extractHeaders(csvText).map((h) => h.toLowerCase()));

  if (headers.size === 0) {
    throw new Error("CSV appears to be empty or has no headers.");
  }

  let bestParser: BrokerParser | null = null;
  let bestScore = 0;

  for (const parser of parsers) {
    const fingerprint = parser.headerFingerprint;
    let matches = 0;

    for (const col of fingerprint) {
      if (headers.has(col.toLowerCase())) {
        matches++;
      }
    }

    const score = matches / fingerprint.size; // ratio of matched cols

    if (score > bestScore) {
      bestScore = score;
      bestParser = parser;
    }
  }

  // Require at least 60% of fingerprint columns to match — prevents false positives
  const MATCH_THRESHOLD = 0.6;

  if (!bestParser || bestScore < MATCH_THRESHOLD) {
    const headerList = [...headers].join(", ");
    throw new Error(
      `Unrecognized CSV format. Headers found: [${headerList}]. ` +
      `No registered broker parser matched (best score: ${(bestScore * 100).toFixed(0)}%).`
    );
  }

  return bestParser;
}
