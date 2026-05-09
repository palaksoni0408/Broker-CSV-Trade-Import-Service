import { describe, it, expect } from "vitest";
import { parseZerodhaDate, parseIbkrDateTime } from "../utils/date.js";

describe("parseZerodhaDate", () => {
  it("parses a valid DD-MM-YYYY date", () => {
    expect(parseZerodhaDate("01-04-2026")).toBe("2026-04-01T00:00:00.000Z");
  });

  it("handles end-of-month dates correctly", () => {
    expect(parseZerodhaDate("31-03-2026")).toBe("2026-03-31T00:00:00.000Z");
  });

  it("throws for 'invalid_date' string", () => {
    expect(() => parseZerodhaDate("invalid_date")).toThrow(/invalid.*date/i);
  });

  it("throws for ISO format (wrong format for Zerodha)", () => {
    expect(() => parseZerodhaDate("2026-04-01")).toThrow();
  });

  it("throws for empty string", () => {
    expect(() => parseZerodhaDate("")).toThrow();
  });

  it("throws for partial date", () => {
    expect(() => parseZerodhaDate("01-04")).toThrow();
  });
});

describe("parseIbkrDateTime", () => {
  it("parses ISO 8601 with timezone", () => {
    expect(parseIbkrDateTime("2026-04-01T14:30:00Z")).toBe(
      "2026-04-01T14:30:00.000Z"
    );
  });

  it("parses MM/DD/YYYY fallback format", () => {
    expect(parseIbkrDateTime("04/03/2026")).toBe("2026-04-03T00:00:00.000Z");
  });

  it("throws for unrecognized format", () => {
    expect(() => parseIbkrDateTime("March 1, 2026")).toThrow(
      /unrecognized/i
    );
  });

  it("throws for empty string", () => {
    expect(() => parseIbkrDateTime("")).toThrow();
  });

  it("preserves time zone offset in ISO dates", () => {
    const result = parseIbkrDateTime("2026-04-01T14:30:00Z");
    expect(result).toMatch(/Z$/);
  });
});
