import { z } from "zod";

/**
 * Unified trade schema — every broker's data is normalized into this shape.
 * rawData preserves the original row for auditability.
 */
export const TradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  totalAmount: z.number(), // quantity * price (negative for sells)
  currency: z.string().length(3),
  executedAt: z.string().datetime(), // ISO 8601
  broker: z.string().min(1),
  rawData: z.record(z.string(), z.unknown()), // original CSV row
});

export type Trade = z.infer<typeof TradeSchema>;

/**
 * Structured error for a skipped row — includes row number and human-readable reason.
 */
export const RowErrorSchema = z.object({
  row: z.number().int().positive(),
  reason: z.string(),
});

export type RowError = z.infer<typeof RowErrorSchema>;

/**
 * Full response shape returned by POST /import.
 */
export const ImportResponseSchema = z.object({
  broker: z.string(),
  summary: z.object({
    total: z.number(),
    valid: z.number(),
    skipped: z.number(),
  }),
  trades: z.array(TradeSchema),
  errors: z.array(RowErrorSchema),
});

export type ImportResponse = z.infer<typeof ImportResponseSchema>;
