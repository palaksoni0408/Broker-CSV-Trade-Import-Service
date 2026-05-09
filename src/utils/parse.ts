/**
 * Reusable parsing helpers for extracting typed values from raw CSV strings.
 * These throw descriptive errors on bad input, which the per-row try/catch will catch.
 */

/**
 * Parses a string to a finite float. Throws on empty, non-numeric, or NaN input.
 */
export function parseFloat_(raw: string, fieldName: string): number {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === undefined) {
    throw new Error(`'${fieldName}' is missing or empty.`);
  }
  const value = Number(trimmed);
  if (isNaN(value) || !isFinite(value)) {
    throw new Error(`'${fieldName}' is not a valid number: '${trimmed}'.`);
  }
  return value;
}

/**
 * Parses a string to a positive float. Throws if zero or negative.
 */
export function parsePositiveFloat(raw: string, fieldName: string): number {
  const value = parseFloat_(raw, fieldName);
  if (value <= 0) {
    throw new Error(`'${fieldName}' must be positive, got ${value}.`);
  }
  return value;
}

/**
 * Normalizes a side string (e.g. "buy", "BUY", "BOT") to "BUY" | "SELL".
 * Throws if unrecognized.
 */
export function normalizeSide(
  raw: string,
  fieldName: string,
  mapping: Record<string, "BUY" | "SELL">
): "BUY" | "SELL" {
  const upper = raw.trim().toUpperCase();
  const result = mapping[upper];
  if (!result) {
    const valid = Object.keys(mapping).join(", ");
    throw new Error(`'${fieldName}' has unrecognized value '${raw}'. Expected one of: ${valid}.`);
  }
  return result;
}
