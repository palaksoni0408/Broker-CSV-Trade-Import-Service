/**
 * Date parsing utilities.
 *
 * Brokers use wildly different date formats. These helpers centralize
 * the messiness so parsers stay clean.
 */

/**
 * Parses a Zerodha-style date string (DD-MM-YYYY) into an ISO 8601 datetime string.
 * Throws if the date is not valid.
 *
 * @example
 * parseZerodhaDate("01-04-2026") // => "2026-04-01T00:00:00.000Z"
 * parseZerodhaDate("invalid_date") // throws Error
 */
export function parseZerodhaDate(raw: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());

  if (!match) {
    throw new Error(`Invalid Zerodha date format: '${raw}'. Expected DD-MM-YYYY.`);
  }

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);

  // Guard against JavaScript silently accepting invalid dates like 2026-02-31
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date value: '${raw}'.`);
  }

  return date.toISOString();
}

/**
 * Parses an IBKR DateTime field, which can be either:
 *   - ISO 8601 with timezone:  "2026-04-01T14:30:00Z"
 *   - MM/DD/YYYY (no time):    "04/03/2026"
 *
 * Returns an ISO 8601 string. Throws if unparseable.
 */
export function parseIbkrDateTime(raw: string): string {
  const trimmed = raw.trim();

  // ISO 8601 path — fast and reliable
  if (trimmed.includes("T")) {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ISO 8601 datetime: '${raw}'.`);
    }
    return date.toISOString();
  }

  // MM/DD/YYYY fallback
  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date value: '${raw}'.`);
    }
    return date.toISOString();
  }

  throw new Error(`Unrecognized IBKR date format: '${raw}'. Expected ISO 8601 or MM/DD/YYYY.`);
}
