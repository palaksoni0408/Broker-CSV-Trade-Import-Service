import { parse } from "csv-parse/sync";

/**
 * Parses raw CSV text into an array of row objects.
 * Each row is a Record<string, string> keyed by the header column names.
 *
 * Uses csv-parse in synchronous mode for simplicity; the overhead is
 * negligible for typical trade file sizes (< 100k rows).
 */
export function parseCsvToRows(csvText: string): Record<string, string>[] {
  return parse(csvText, {
    columns: true,         // use first row as keys
    skip_empty_lines: true,
    trim: true,            // strip surrounding whitespace from values
    relax_column_count: true, // don't throw on rows with mismatched columns
  }) as Record<string, string>[];
}

/**
 * Extracts the header columns from a CSV string without parsing all rows.
 * Used for broker auto-detection.
 */
export function extractHeaders(csvText: string): string[] {
  const firstLine = csvText.split(/\r?\n/)[0];
  if (!firstLine) return [];
  return firstLine.split(",").map((h) => h.trim());
}
