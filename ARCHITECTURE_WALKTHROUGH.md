# Broker CSV Trade Import Service — Complete Architecture Walkthrough

> A senior backend engineer's deep-dive mentorship into a production-grade financial data ingestion system.

---

# Table of Contents

1. [PART 1 — High Level System Understanding](#part-1--high-level-system-understanding)
2. [PART 2 — Project Folder Structure Analysis](#part-2--project-folder-structure-analysis)
3. [PART 3 — Full Request Lifecycle Analysis](#part-3--full-request-lifecycle-analysis)
4. [PART 4 — Deep Parser Analysis](#part-4--deep-parser-analysis)
5. [PART 5 — CSV Parsing Internals](#part-5--csv-parsing-internals)
6. [PART 6 — Zod Validation Deep Dive](#part-6--zod-validation-deep-dive)
7. [PART 7 — TypeScript Engineering Analysis](#part-7--typescript-engineering-analysis)
8. [PART 8 — Error Handling Philosophy](#part-8--error-handling-philosophy)
9. [PART 9 — API Design Analysis](#part-9--api-design-analysis)
10. [PART 10 — Software Engineering Patterns](#part-10--software-engineering-patterns)
11. [PART 11 — Scalability & Production Readiness](#part-11--scalability--production-readiness)
12. [PART 12 — Security Analysis](#part-12--security-analysis)
13. [PART 13 — Testing Analysis](#part-13--testing-analysis)
14. [PART 14 — Senior Engineer Review](#part-14--senior-engineer-review)
15. [PART 15 — Full Learning Walkthrough](#part-15--full-learning-walkthrough)

---

# PART 1 — High Level System Understanding

## What This Project Does

This is a **Broker CSV Trade Import Service** — a backend API that accepts trade history CSV files from different stock brokers, automatically figures out which broker the file came from, normalizes every trade into a single unified format, validates the data, and returns a structured JSON response showing what was imported and what failed.

## The Business Problem It Solves

In the real financial world, every broker exports trade data differently:
- **Zerodha** (India's largest retail broker) exports: `symbol, trade_date, trade_type, quantity, price, exchange, ...`
- **Interactive Brokers (IBKR)** exports: `TradeID, Symbol, DateTime, Buy/Sell, Quantity, TradePrice, Currency, ...`
- Angel One, Upstox, TD Ameritrade, Charles Schwab — all have different column names, date formats, number formats, and side indicators.

If you are building a portfolio tracker, tax reporting tool, or P&L analysis dashboard, you need to ingest data from ALL of these brokers. But you can't build a separate integration for each one from scratch. That's unmaintainable.

**This system solves that by:**
1. Accepting ANY broker CSV via a single endpoint `POST /import`
2. Auto-detecting which broker format it is
3. Parsing the broker-specific format
4. Normalizing every trade into ONE universal schema
5. Returning clear success/failure information

## Why Broker CSV Normalization Matters

In production financial systems, data ingestion is one of the hardest problems:
- **Data quality**: Users upload garbage. Missing columns, wrong dates, negative quantities, extra commas.
- **Format diversity**: 50+ brokers, each with slightly different CSV layouts.
- **Audit requirements**: Financial regulators require you to preserve original data while also producing normalized views.
- **Partial failure tolerance**: One bad row should NOT kill a 10,000-row import. The user needs to know WHICH rows failed and WHY.
- **Schema evolution**: Brokers change their export formats over time. Your system must adapt without breaking.

## How Real Financial Ingestion Systems Work

At companies like Robinhood, Zerodha, Coinbase, or Stripe:
1. Data arrives via file upload, SFTP, email attachment, or API push.
2. A **format detection engine** identifies the source (broker, version, file type).
3. A **parser pipeline** transforms the raw data into an internal canonical model.
4. A **validation layer** checks business rules (e.g., trades must have positive quantity, dates must be in the past).
5. A **reconciliation engine** matches imported trades against existing records.
6. **Error reporting** gives users actionable feedback.
7. **Audit logging** stores the original file for compliance.

This project implements steps 1-4 and 6 at a small scale, but with production-grade architecture that could grow.

## High-Level System Flow

```
┌─────────────────┐
│  User uploads   │
│  broker CSV     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  POST /import   │  ← Fastify route + multipart plugin
│  (import.route) │
└────────┬────────┘
         │ reads file stream → string
         ▼
┌─────────────────┐
│ ImportService   │  ← framework-agnostic orchestration
│ (import.service)│
└────────┬────────┘
         │ passes CSV text
         ▼
┌─────────────────┐
│ detectBroker()  │  ← header fingerprint scoring
│ (detectBroker)  │
└────────┬────────┘
         │ returns matching parser
         ▼
┌─────────────────┐
│ BrokerParser    │  ← ZerodhaParser or IbkrParser
│ (strategy impl) │
└────────┬────────┘
         │ for each row:
         │   - extract fields
         │   - normalize values
         │   - validate with Zod
         │   - collect errors
         ▼
┌─────────────────┐
│ ImportResponse  │  ← { broker, summary, trades, errors }
│ (trade.schema)  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ JSON Response   │
│ to client       │
└─────────────────┘
```

---

# PART 2 — Project Folder Structure Analysis

## Full Folder Tree

```
broker-csv-importer/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── .env.example
├── src/
│   ├── server.ts              # Entrypoint
│   ├── app.ts                 # Fastify app factory
│   ├── parsers/
│   │   ├── parser.interface.ts   # Contract (Strategy Pattern)
│   │   ├── registry.ts             # Parser registry
│   │   ├── zerodha.parser.ts     # Zerodha implementation
│   │   └── ibkr.parser.ts        # IBKR implementation
│   ├── schemas/
│   │   └── trade.schema.ts       # Zod schemas
│   ├── utils/
│   │   ├── csv.ts                # CSV parsing wrapper
│   │   ├── date.ts             # Date parsing utilities
│   │   ├── detectBroker.ts     # Auto-detection engine
│   │   └── parse.ts            # Number/side parsing helpers
│   ├── services/
│   │   └── import.service.ts   # Business logic orchestrator
│   ├── routes/
│   │   └── import.route.ts     # HTTP route wiring
│   └── tests/
│       ├── fixtures.ts             # Shared test data
│       ├── zerodha.parser.test.ts
│       ├── ibkr.parser.test.ts
│       ├── import.service.test.ts
│       ├── detectBroker.test.ts
│       └── date.test.ts
```

## Analysis of Each Layer

### `src/parsers/` — The Strategy Pattern Layer

**Purpose**: Isolate every broker's parsing logic into its own class. No parser knows about any other parser.

**Why this matters**: 
- **Low coupling**: `ZerodhaParser` doesn't import `IbkrParser`. They share only the `BrokerParser` interface.
- **High cohesion**: Everything about Zerodha (date format, currency inference, side mapping) lives in ONE file.
- **Extensibility**: Adding Broker C = one new file + one line in `registry.ts`.

This is textbook **Open/Closed Principle** — open for extension (new brokers), closed for modification (existing files don't change).

### `src/schemas/` — The Single Source of Truth

**Purpose**: Define the canonical data model that ALL brokers normalize into.

**Why one schema file**:
- Every parser produces the same output shape. There's no "ZerodhaTrade" vs "IbkrTrade" — there's only `Trade`.
- This is the **bounded context** of the ingestion domain.
- Zod provides both TypeScript types AND runtime validation.

### `src/utils/` — Reusable Primitives

**Purpose**: Extract domain-agnostic logic (dates, numbers, CSV, detection) so parsers stay clean.

**Why this separation**:
- `parseZerodhaDate()` and `parseIbkrDateTime()` live in `date.ts` because date parsing is a cross-cutting concern.
- `parsePositiveFloat()` is reusable — any future broker might need positive number validation.
- `detectBroker()` uses `csv.ts`'s `extractHeaders()` — separation of concerns means detection doesn't need to parse the full CSV.

### `src/services/` — Framework-Agnostic Business Logic

**Purpose**: Hold the core business orchestration without ANY framework imports.

**Why no Fastify here**:
- `ImportService` takes a `string` and returns a plain object. You could call it from a CLI script, a background job worker, or a test without spinning up an HTTP server.
- This is **hexagonal architecture** (ports and adapters) in miniature. The service is the "port." The Fastify route is the "adapter."

### `src/routes/` — Thin HTTP Wiring

**Purpose**: Handle HTTP-specific concerns (multipart parsing, mimetype checks, status codes, Swagger docs) and delegate to the service.

**Why keep routes thin**:
- HTTP is just a transport. The business logic shouldn't be here.
- If you later switch from Fastify to Express or Hono, you only rewrite this folder.
- Swagger schemas are HTTP-documentation concerns, not business concerns.

### `src/tests/` — Comprehensive Test Suite

**Purpose**: Prove correctness at every layer independently.

**Test philosophy**:
- `date.test.ts` tests utility functions in isolation.
- `zerodha.parser.test.ts` tests ONE parser with real CSV fixtures.
- `import.service.test.ts` tests the orchestration layer end-to-end.
- `detectBroker.test.ts` tests the detection algorithm.
- No tests for the route layer — in a larger project, you'd add integration tests with `inject()`.

## Architecture Principles Used

| Principle | Evidence in Codebase |
|-----------|---------------------|
| **Modularity** | Each folder has a single responsibility. Parsers don't touch routes. |
| **Scalability** | Strategy pattern means parsers scale linearly with broker count. |
| **Maintainability** | Zod schemas + TypeScript strict mode catch errors at compile time. |
| **Extensibility** | New broker = 1 file + 1 registry entry. Zero existing code changes. |
| **Low Coupling** | Parsers only depend on the `BrokerParser` interface and utilities. |
| **High Cohesion** | Everything about Zerodha lives in `zerodha.parser.ts`. |

## Is This Architecture Good?

**Yes, for its scope.** It's a clean, layered architecture that follows SOLID principles:
- **S**ingle Responsibility: Each class/file does one thing.
- **O**pen/Closed: New brokers extend without modifying existing code.
- **L**iskov Substitution: Any `BrokerParser` can be swapped in.
- **I**nterface Segregation: `BrokerParser` is minimal (3 properties/methods).
- **D**ependency Inversion: `ImportService` depends on `BrokerParser` interface, not concrete parsers.

In a real production system, you might add:
- An event bus for async processing
- A database layer with transactions
- A plugin system for custom validations
- A streaming layer for large files

But as a foundation, this architecture is solid.

---

# PART 3 — Full Request Lifecycle Analysis

Let's trace a real request through the system with internal data transformations.

## Scenario

User uploads `zerodha.csv`:
```csv
symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
RELIANCE,INE002A01018,01-04-2026,buy,10,2450.50,TRD001,ORD001,NSE,EQ
INFY,INE009A01021,01-04-2026,sell,25,1520.75,TRD002,ORD002,NSE,EQ
WIPRO,INE075A01022,05-04-2026,buy,-5,450.00,TRD007,ORD007,NSE,EQ
```

---

## Step 1: User Uploads CSV

```bash
curl -X POST http://localhost:3000/import -F "file=@zerodha.csv"
```

The multipart form-data request hits the Fastify server.

---

## Step 2: Fastify App Receives Request

**File**: `src/server.ts`

```typescript
import "dotenv/config";      // loads .env variables
import { buildApp } from "./app.js";

async function start() {
  const app = await buildApp();
  await app.listen({ port: 3000, host: "0.0.0.0" });
}
```

`server.ts` is the **entrypoint**. It:
1. Loads environment variables via `dotenv`
2. Calls `buildApp()` to create a configured Fastify instance
3. Starts the HTTP listener

**Why separate `server.ts` from `app.ts`?**
- `app.ts` creates the app. `server.ts` starts it.
- Tests can call `buildApp()` to create isolated instances without starting a real server.

---

## Step 3: Fastify App Factory Builds the App

**File**: `src/app.ts`

```typescript
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "info" } });

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(swagger, { openapi: { info: { title: "Broker CSV Trade Import API", version: "1.0.0" } } });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(importRoute);  // ← registers POST /import
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
```

`buildApp()` is a **factory function** (not a singleton). It wires plugins:
1. `@fastify/multipart` — parses `multipart/form-data` uploads with a 10MB file size limit
2. `@fastify/swagger` + `@fastify/swagger-ui` — auto-generates OpenAPI docs at `/docs`
3. `importRoute` — registers `POST /import`
4. `/health` — simple health check for load balancers

---

## Step 4: Route Receives the File

**File**: `src/routes/import.route.ts`

```typescript
async (request, reply) => {
  const data = await request.file();  // ← multipart plugin parses the file

  if (!data) {
    return reply.status(400).send({ error: "No file uploaded." });
  }

  // Mimetype check (allows csv, text, octet-stream)
  const isCsvLike = data.mimetype.includes("csv") || ...;
  if (!isCsvLike) return reply.status(400).send({ error: "Unsupported file type." });

  // Read stream into memory
  const chunks: Buffer[] = [];
  for await (const chunk of data.file) {
    chunks.push(chunk);
  }
  const csvText = Buffer.concat(chunks).toString("utf-8").trim();

  if (!csvText) return reply.status(400).send({ error: "Uploaded file is empty." });

  try {
    const result = await importService.importCsv(csvText);
    return reply.status(200).send(result);
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
}
```

**Data transformation at this step**:
- `request` → `data` (multipart file object)
- `data.file` (stream) → `chunks[]` (Buffer array) → `csvText` (string)

**Why buffer the whole file?**
- Trade CSVs are small (usually < 1MB). Buffering is simpler than streaming and avoids backpressure complexity.
- For 100MB+ files, you'd switch to streaming csv-parse.

---

## Step 5: ImportService Orchestrates

**File**: `src/services/import.service.ts`

```typescript
export class ImportService {
  async importCsv(csvText: string): Promise<ImportResponse> {
    const parser = detectBroker(csvText, parserRegistry);   // Step 5a
    const { trades, errors } = await parser.parse(csvText);  // Step 5b

    const total = trades.length + errors.length;
    return {
      broker: parser.brokerName,
      summary: { total, valid: trades.length, skipped: errors.length },
      trades,
      errors,
    };
  }
}
```

Notice: `ImportService` has ZERO Fastify imports. It's pure business logic.

**Why a class and not just a function?**
- A class is easier to extend later (add caching, add metrics, add a database dependency).
- It also makes testing easier — you instantiate `new ImportService()` in tests.

---

## Step 5a: Broker Detection

**File**: `src/utils/detectBroker.ts`

```typescript
export function detectBroker(csvText: string, parsers: BrokerParser[]): BrokerParser {
  const headers = new Set(extractHeaders(csvText).map(h => h.toLowerCase()));

  let bestParser = null;
  let bestScore = 0;

  for (const parser of parsers) {
    const fingerprint = parser.headerFingerprint;
    let matches = 0;
    for (const col of fingerprint) {
      if (headers.has(col.toLowerCase())) matches++;
    }
    const score = matches / fingerprint.size;
    if (score > bestScore) { bestScore = score; bestParser = parser; }
  }

  if (!bestParser || bestScore < 0.6) {
    throw new Error(`Unrecognized CSV format. Headers found: [...] (best score: ${bestScore}%)`);
  }

  return bestParser;
}
```

**How detection works**:
1. Extract the first line of the CSV → split by comma → trim → `headers` Set
2. For each parser, count how many of its `headerFingerprint` columns appear in the CSV headers
3. Score = matches / fingerprint size (ratio, not absolute count)
4. Pick the parser with the highest score, but require at least 60% match

**Example with our CSV**:
- Headers: `{"symbol", "isin", "trade_date", "trade_type", "quantity", "price", "trade_id", "order_id", "exchange", "segment"}`
- Zerodha fingerprint: `{"symbol", "trade_date", "trade_type", "exchange", "segment"}` → 5/5 = 100%
- IBKR fingerprint: `{"TradeID", "AccountID", "Buy/Sell", "TradePrice", "AssetClass"}` → 0/5 = 0%
- Winner: **ZerodhaParser**

**Why ratio-based scoring?**
- If Zerodha adds an optional `"tax_deducted"` column, the fingerprint still matches 5/5 = 100%.
- If they remove `"segment"`, it still matches 4/5 = 80% (above 60% threshold).
- This makes the system **resilient to schema evolution**.

**Why 60% threshold?**
- Prevents false positives. A random CSV with `"symbol"` and `"price"` would only match 2/5 = 40% for Zerodha.
- In production, you'd tune this threshold with real data.

---

## Step 5b: Parser Parses the CSV

**File**: `src/parsers/zerodha.parser.ts`

```typescript
async parse(csvText: string): Promise<ParseResult> {
  const rows = parseCsvToRows(csvText);   // [{symbol: "RELIANCE", isin: "INE002A01018", ...}, ...]
  const trades: Trade[] = [];
  const errors: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;  // 1-indexed + skip header

    try {
      const trade = this.parseRow(row);   // ← normalization + validation
      trades.push(trade);
    } catch (err) {
      errors.push({ row: rowNumber, reason: err.message });
    }
  }

  return { trades, errors };
}
```

**Data transformation at this step**:
- `csvText` (string) → `rows` (array of objects, via `csv-parse`)
- Each `row` is a `Record<string, string>` — ALL values are strings because CSV has no types.

**Row number calculation**:
- `i = 0` → data row 1 → file row 2 (row 1 is the header) → `rowNumber = 2`
- This is user-facing, so it uses the file's line numbers.

---

## Step 6: Row-Level Parsing and Normalization

**File**: `src/parsers/zerodha.parser.ts` — `parseRow()`

Let's trace the first data row:

```typescript
private parseRow(row: Record<string, string>): Trade {
  const symbol = row["symbol"]?.trim();           // "RELIANCE"
  if (!symbol) throw new Error("'symbol' is missing.");

  const side = normalizeSide(row["trade_type"] ?? "", "trade_type", SIDE_MAP);
  // "buy" → "BUY" (case-insensitive lookup in {BUY: "BUY", SELL: "SELL"})

  const quantity = parsePositiveFloat(row["quantity"] ?? "", "quantity");
  // "10" → 10 (number)

  const price = parsePositiveFloat(row["price"] ?? "", "price");
  // "2450.50" → 2450.50

  const executedAt = parseZerodhaDate(row["trade_date"] ?? "");
  // "01-04-2026" → "2026-04-01T00:00:00.000Z"

  const currency = inferCurrency(row["exchange"] ?? "");
  // "NSE" → "INR" (inferred from exchange)

  const totalAmount = side === "BUY" ? quantity * price : -(quantity * price);
  // "BUY" → 10 * 2450.50 = 24505.00

  return TradeSchema.parse({
    symbol, side, quantity, price, totalAmount,
    currency, executedAt,
    broker: this.brokerName,      // "zerodha"
    rawData: row as Record<string, unknown>,
  });
}
```

**Transformation chain for Row 1**:

| Field | Raw CSV Value | After Normalization | Type |
|-------|--------------|---------------------|------|
| `symbol` | `"RELIANCE"` | `"RELIANCE"` | string |
| `side` | `"buy"` | `"BUY"` | enum |
| `quantity` | `"10"` | `10` | number (positive) |
| `price` | `"2450.50"` | `2450.50` | number (positive) |
| `executedAt` | `"01-04-2026"` | `"2026-04-01T00:00:00.000Z"` | ISO string |
| `currency` | `"NSE"` (exchange) | `"INR"` | string (3 chars) |
| `totalAmount` | computed | `24505.00` | number |
| `broker` | static | `"zerodha"` | string |
| `rawData` | full row object | original strings preserved | object |

**The `rawData` field is critical**:
- It stores the ENTIRE original CSV row as-is.
- This is for **auditability** — if a user disputes a normalized trade, you can show them exactly what the broker sent.
- Financial regulations often require preserving original source data.

---

## Step 7: Zod Final Validation Gate

Even after manual parsing, every row runs through:

```typescript
TradeSchema.parse({
  symbol: "RELIANCE",
  side: "BUY",
  quantity: 10,
  price: 2450.50,
  totalAmount: 24505.00,
  currency: "INR",
  executedAt: "2026-04-01T00:00:00.000Z",
  broker: "zerodha",
  rawData: { ... },
})
```

`TradeSchema` checks:
- `symbol`: non-empty string
- `side`: exactly `"BUY"` or `"SELL"`
- `quantity`: positive number
- `price`: positive number
- `totalAmount`: any number (can be negative for sells)
- `currency`: exactly 3 characters (ISO 4217)
- `executedAt`: valid ISO 8601 datetime
- `broker`: non-empty string
- `rawData`: object with string keys and any values

**Why validate twice?**
1. Manual parsing gives **descriptive error messages** (e.g., `"'quantity' must be positive, got -5."`)
2. Zod validation is the **safety net** that catches edge cases the manual parsing missed (e.g., `quantity` somehow became `NaN` due to a parsing bug)
3. This is **defense in depth** — a core security and reliability principle.

---

## Step 8: Error Collection

Now trace the bad row (WIPRO with `-5` quantity):

```typescript
const quantity = parsePositiveFloat("-5", "quantity");
// throws Error("'quantity' must be positive, got -5.")
```

The `try/catch` in `parse()` catches this:

```typescript
try {
  const trade = this.parseRow(row);
  trades.push(trade);
} catch (err) {
  errors.push({ row: 4, reason: "'quantity' must be positive, got -5." });
}
```

**Key insight**: The loop CONTINUES. Row 4 failed, but if there were rows 5, 6, 7, they would still be processed. The import **never aborts**.

---

## Step 9: Response Assembly

Back in `ImportService`:

```typescript
const total = trades.length + errors.length;  // 2 + 1 = 3
return {
  broker: "zerodha",
  summary: { total: 3, valid: 2, skipped: 1 },
  trades: [/* 2 Trade objects */],
  errors: [{ row: 4, reason: "'quantity' must be positive, got -5." }],
};
```

The route sends this as JSON with HTTP 200.

**Why 200 for partial failure?**
- The SYSTEM succeeded in processing the file.
- Some rows were skipped, but that's expected user data quality, not a system error.
- If the file format was unrecognized, THAT returns 400 (user error).
- This is a key API design decision — distinguish between "system couldn't process" (400) and "system processed but some data was bad" (200 with errors).

---

# PART 4 — Deep Parser Analysis

## The BrokerParser Interface

**File**: `src/parsers/parser.interface.ts`

```typescript
export interface BrokerParser {
  readonly brokerName: string;
  readonly headerFingerprint: ReadonlySet<string>;
  parse(csvText: string): Promise<ParseResult>;
}
```

**Why an interface?**
- An interface is a **contract**. It says: "If you want to be a broker parser, you MUST implement these three things."
- The rest of the system (detection, service, routes) ONLY knows about `BrokerParser`. It doesn't know about Zerodha or IBKR specifically.
- This is the **Strategy Pattern** — interchangeable algorithms with a common interface.

**Why `readonly`?**
- `brokerName` and `headerFingerprint` should never change after construction. `readonly` enforces this at compile time.
- It's a defensive programming practice.

**Why `ReadonlySet<string>`?**
- A `Set` gives O(1) lookup. An array would be O(n).
- `ReadonlySet` prevents accidental mutation of the fingerprint.
- The fingerprint is the parser's "DNA" — it must be stable.

**Why `Promise<ParseResult>`?**
- Even though current parsers are synchronous, making the interface async means you could later add:
  - A parser that calls an external API for symbol lookup
  - A parser that reads from a database
  - A parser that does async file I/O
- This is **future-proofing** the interface.

---

## ZerodhaParser Deep Dive

**File**: `src/parsers/zerodha.parser.ts`

### Header Fingerprint

```typescript
readonly headerFingerprint: ReadonlySet<string> = new Set([
  "symbol", "trade_date", "trade_type", "exchange", "segment"
]);
```

These 5 columns are the **core identifiers** of a Zerodha export. Even if they add/remove optional columns, these will likely remain.

### Side Mapping

```typescript
const SIDE_MAP: Record<string, "BUY" | "SELL"> = {
  BUY: "BUY",
  SELL: "SELL",
};
```

Zerodha uses lowercase `"buy"` / `"sell"` in exports, but the map is case-insensitive because `normalizeSide()` uppercases the input first.

### Currency Inference

```typescript
function inferCurrency(exchange: string): string {
  const upper = exchange.trim().toUpperCase();
  if (upper === "NSE" || upper === "BSE") return "INR";
  throw new Error(`Cannot infer currency for unknown exchange: '${exchange}'.`);
}
```

**Why infer instead of reading from CSV?**
- Zerodha exports don't include a currency column. The exchange (`NSE`/`BSE`) implies `INR` because those are Indian exchanges.
- If Zerodha ever supports international exchanges (e.g., `NYSE`), this function would need extension.
- The `throw` ensures we don't silently guess wrong — explicit failure is better than silent bad data.

### totalAmount Calculation

```typescript
const totalAmount = side === "BUY" ? quantity * price : -(quantity * price);
```

**Why negative for SELL?**
- In accounting, a BUY is a debit (money out), a SELL is a credit (money in).
- Signed amounts make P&L calculations easier: `sum(totalAmount)` across all trades gives net cash flow.
- This follows standard financial data modeling.

---

## IbkrParser Deep Dive

**File**: `src/parsers/ibkr.parser.ts`

### Symbol Normalization

```typescript
function normalizeSymbol(raw: string): string {
  return raw.trim().replace(".", "/");
}
```

IBKR uses `"EUR.USD"` for forex pairs. The system normalizes to `"EUR/USD"` because that's the standard market notation.

**Why not normalize in the TradeSchema?**
- Schema should be generic. Normalization is broker-specific. Keeping it in the parser is correct.

### Side Mapping

```typescript
const SIDE_MAP: Record<string, "BUY" | "SELL"> = {
  BOT: "BUY",   // "Bought" — IBKR terminology
  SLD: "SELL",  // "Sold" — IBKR terminology
  BUY: "BUY",
  SELL: "SELL",
};
```

IBKR uses brokerage jargon (`BOT`/`SLD`) instead of plain English. This map handles both IBKR-specific and standard terms.

### Date Parsing Dual Support

```typescript
const executedAt = parseIbkrDateTime(row["DateTime"] ?? "");
```

IBKR exports sometimes use ISO 8601, sometimes `MM/DD/YYYY`. The utility handles both (see Part 5).

### NetAmount Handling

```typescript
const netAmountRaw = row["NetAmount"]?.trim() ?? "";
const totalAmount = netAmountRaw !== ""
  ? parseFloat_(netAmountRaw, "NetAmount")
  : side === "BUY" ? quantity * price : -(quantity * price);
```

**Why prefer NetAmount when available?**
- NetAmount includes commissions and fees. `quantity * price` is gross.
- For accurate P&L, you want the net amount the broker actually settled.
- If NetAmount is missing, fall back to gross calculation.

---

## How to Add Broker C

To add a new broker (e.g., Angel One):

1. **Create `src/parsers/angel.parser.ts`**:
```typescript
export class AngelParser implements BrokerParser {
  readonly brokerName = "angel";
  readonly headerFingerprint = new Set(["symbol", "order_time", "transaction_type", "exchange"]);

  async parse(csvText: string): Promise<ParseResult> {
    // Angel-specific parsing logic
  }
}
```

2. **Add to `src/parsers/registry.ts`**:
```typescript
import { AngelParser } from "./angel.parser.js";
export const parserRegistry: BrokerParser[] = [
  new ZerodhaParser(),
  new IbkrParser(),
  new AngelParser(),  // ← one line
];
```

3. **Add tests** in `src/tests/angel.parser.test.ts`.

**Zero existing files modified.** This is the power of the Strategy Pattern.

---

# PART 5 — CSV Parsing Internals

## How csv-parse Works

The project uses `csv-parse/sync` — a battle-tested CSV parser from the `csv` ecosystem.

### Row-to-Object Transformation

```typescript
import { parse } from "csv-parse/sync";

const rows = parse(csvText, {
  columns: true,              // first row becomes object keys
  skip_empty_lines: true,     // ignore blank lines
  trim: true,                 // strip whitespace from values
  relax_column_count: true,   // don't crash on malformed rows
});
```

Given:
```csv
symbol,price
AAPL,150.00
GOOGL,2800.00
```

`parse()` produces:
```javascript
[
  { symbol: "AAPL",  price: "150.00" },
  { symbol: "GOOGL", price: "2800.00" }
]
```

**All values are strings** — CSV has no native type system. `"150.00"` is NOT a number. The parser doesn't know it's numeric. That's the job of our type conversion layer.

### Option-by-Option Analysis

| Option | Purpose | Why It Matters |
|--------|---------|---------------|
| `columns: true` | Uses first row as property names | Enables `row["symbol"]` instead of `row[0]` |
| `skip_empty_lines: true` | Ignores blank lines | Prevents parsing errors on files with trailing newlines |
| `trim: true` | Strips surrounding whitespace | `" buy "` → `"buy"` — fixes user-edited files |
| `relax_column_count: true` | Allows rows with wrong column count | Prevents crashes on malformed broker exports |

### Header Extraction for Detection

```typescript
export function extractHeaders(csvText: string): string[] {
  const firstLine = csvText.split(/\r?\n/)[0];
  if (!firstLine) return [];
  return firstLine.split(",").map((h) => h.trim());
}
```

This is a lightweight parser that ONLY reads the first line. It doesn't use `csv-parse` because:
1. It's faster — no need to parse the whole file.
2. It's simpler — detection is header-only.
3. It avoids dependency on `csv-parse`'s options for detection logic.

### Malformed Row Handling

With `relax_column_count: true`:
- A row with too few columns: missing fields become `undefined` (which we handle with `?? ""`)
- A row with too many columns: extra fields are ignored by `columns: true`
- A row with commas inside quoted fields: `csv-parse` handles quoting automatically

Example of a tricky case:
```csv
symbol,description
AAPL,"Apple, Inc."
```

`csv-parse` correctly produces `{ symbol: "AAPL", description: "Apple, Inc." }` because it respects the quotes.

---

# PART 6 — Zod Validation Deep Dive

## What is Zod?

Zod is a TypeScript-first schema validation library. It lets you define schemas that produce both:
1. **Runtime validation** — checks data at runtime
2. **Static types** — infers TypeScript types from the schema

## The TradeSchema

```typescript
export const TradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  totalAmount: z.number(),
  currency: z.string().length(3),
  executedAt: z.string().datetime(),
  broker: z.string().min(1),
  rawData: z.record(z.string(), z.unknown()),
});
```

### Validator Breakdown

| Validator | What It Checks | Example Failure |
|-----------|---------------|-----------------|
| `z.string().min(1)` | Non-empty string | `""` fails |
| `z.enum(["BUY", "SELL"])` | Exact match to one of the enum values | `"HOLD"` fails |
| `z.number().positive()` | Number > 0 | `-5` fails, `0` fails, `NaN` fails |
| `z.number()` | Any finite number | `NaN` fails, `Infinity` fails |
| `z.string().length(3)` | Exactly 3 characters | `"US"` fails, `"USDT"` fails |
| `z.string().datetime()` | Valid ISO 8601 datetime | `"not-a-date"` fails |
| `z.record(z.string(), z.unknown())` | Object with string keys, any values | `null` fails, array fails |

### parse() vs safeParse()

The code uses `.parse()`:

```typescript
return TradeSchema.parse({ /* ... */ });
```

`.parse()` throws a `ZodError` if validation fails. This is caught by the per-row `try/catch` in the parser's `parse()` loop.

Alternative: `.safeParse()` returns `{ success: true, data: ... }` or `{ success: false, error: ... }` without throwing.

**Why `.parse()` here?**
- The parser already has a `try/catch` around each row. Throwing is fine — it gets caught.
- `.parse()` is terser. The error object thrown by Zod is rich and contains the path to the invalid field.

### Why TypeScript Alone Is Insufficient

TypeScript types disappear at runtime:

```typescript
interface Trade {
  quantity: number;  // Compile-time only!
}

const trade: Trade = { quantity: "ten" as any };  // Compiles! Runtime disaster.
```

Zod validates at runtime:
```typescript
TradeSchema.parse({ quantity: "ten" });  // Throws at runtime!
```

**In production systems, you NEED both**:
- TypeScript for developer experience (autocomplete, compile-time errors)
- Zod for runtime safety (user data is untrusted)

This is called **parse, don't validate** — a philosophy where you transform untrusted input into trusted, typed data through an explicit validation step.

### Error Propagation

When Zod validation fails inside a row:

```
ZodError (thrown by TradeSchema.parse)
  ↓ caught by
BrokerParser.parse() try/catch
  ↓ converted to
{ row: 4, reason: "Invalid value for 'quantity': expected number, received nan" }
  ↓ collected in
errors[] array
  ↓ returned in
ImportResponse
```

---

# PART 7 — TypeScript Engineering Analysis

## Strict Mode Benefits

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### `strict: true`

Enables ALL strict type-checking options:
- `noImplicitAny`: Variables must have explicit or inferred types. No `any` by default.
- `strictNullChecks`: `null` and `undefined` are separate types. `string | null` is NOT just `string`.
- `strictFunctionTypes`: Function parameters are checked contravariantly.
- `strictBindCallApply`: `bind`, `call`, `apply` are strongly typed.

**Why this matters for backend reliability**:
- A function that might return `null` must be handled. No more `Cannot read property of null` at runtime.
- The compiler forces you to think about edge cases.

### `noImplicitAny: true` (via strict)

```typescript
// Without strict mode, this compiles with implicit 'any':
function process(data) {   // data: any ❌
  return data.name;
}

// With strict mode, this is an ERROR. You must write:
function process(data: { name: string }) {   // ✅
  return data.name;
}
```

### `noUnusedLocals` / `noUnusedParameters`

Prevents dead code. If you declare a variable or parameter and don't use it, the build fails.

This keeps the codebase clean and prevents "import rot" where files import things they no longer need.

### Type Narrowing in the Codebase

```typescript
if (err instanceof Error) {
  return err.message;   // TypeScript knows err is Error here
} else {
  return String(err);   // TypeScript knows err is unknown here
}
```

This pattern appears in `import.route.ts` and both parsers. It uses **type narrowing** — TypeScript narrows the type based on the `instanceof` check.

### Interface vs Type

The codebase uses `interface` for contracts:

```typescript
export interface BrokerParser {
  readonly brokerName: string;
  readonly headerFingerprint: ReadonlySet<string>;
  parse(csvText: string): Promise<ParseResult>;
}
```

**Why interface over type?**
- Interfaces are extendable (`interface BrokerParser extends BaseParser`).
- Interfaces produce better error messages.
- Interfaces support declaration merging (useful in larger codebases).
- For object shapes that represent "contracts" or "capabilities," interfaces are idiomatic in TypeScript.

### Readonly and Immutability

```typescript
readonly brokerName: string;
readonly headerFingerprint: ReadonlySet<string>;
```

`readonly` prevents mutation after construction. `ReadonlySet` prevents adding/removing elements.

**Why immutability matters**:
- Immutable data is easier to reason about. If `brokerName` can't change, you never have to wonder "did something mutate this?"
- In concurrent systems, immutable data is thread-safe.
- It prevents a whole class of bugs where state changes unexpectedly.

### Async Typing

```typescript
async parse(csvText: string): Promise<ParseResult>
```

The return type is explicit: `Promise<ParseResult>`. TypeScript enforces that:
1. The function is `async` (or returns a Promise)
2. The resolved value matches `ParseResult`

Without explicit typing, a missing `return` would silently return `Promise<undefined>`.

---

# PART 8 — Error Handling Philosophy

## How Errors Are Handled

This system uses a **layered error handling strategy**:

### Layer 1: Per-Row Try/Catch (Graceful Degradation)

```typescript
for (let i = 0; i < rows.length; i++) {
  try {
    const trade = this.parseRow(row);
    trades.push(trade);
  } catch (err) {
    errors.push({ row: i + 2, reason: err.message });
  }
}
```

**Philosophy**: One bad row must NEVER abort the entire import.

**Why this matters in production**:
- A user uploads 10,000 trades. Row 9,847 has a typo in the date.
- If the system aborts, the user must fix the file and re-upload all 10,000 rows.
- If the system skips the bad row, the user gets 9,999 successful imports + one actionable error message.
- This is **fault tolerance** — the system continues operating despite partial failures.

### Layer 2: Structured Error Objects

```typescript
errors: [{ row: 4, reason: "'quantity' must be positive, got -5." }]
```

Not just `"Error at row 4"` — but a structured object that:
- Tells the user WHICH row failed (1-indexed, matching their spreadsheet)
- Tells the user WHY it failed (human-readable reason)
- Is machine-parseable (the frontend can highlight row 4 in a preview)

### Layer 3: Service-Level Throw for Unrecoverable Errors

```typescript
// In detectBroker:
if (!bestParser || bestScore < 0.6) {
  throw new Error("Unrecognized CSV format...");
}
```

This propagates up to the route, which converts it to a 400 response.

**Classification**:
- **Row errors** (invalid date, negative quantity) → collected, import continues → HTTP 200 with errors array
- **File errors** (unknown format, empty file) → thrown, import aborts → HTTP 400

This distinction is critical for API usability.

### Is This Production-Grade?

**Yes, with room for improvement**:

**Strengths**:
- Row-level isolation prevents cascading failures
- Structured errors enable good UX
- Clear separation between user errors (400) and data errors (200 + errors)

**Improvements for production**:
- **Error codes**: Instead of just strings, add machine-readable codes: `{ code: "ERR_NEGATIVE_QUANTITY", row: 4 }`
- **Error categorization**: Group errors by type so the UI can say "3 rows had invalid dates, 2 rows had negative quantities"
- **Retry guidance**: Some errors are fixable by the user. Include `"suggestion": "Check that quantity is a positive number."`
- **Logging**: Currently only the route logs `request.log.warn({ err }, "Import failed")`. In production, every skipped row should be logged with context (user ID, file name, timestamp).

---

# PART 9 — API Design Analysis

## Route Design

### `POST /import`

**Strengths**:
- Single endpoint for all brokers. The user doesn't need to know which broker they're uploading from.
- Multipart form-data is the standard for file uploads.
- Swagger docs are auto-generated from the route schema.

### Request Validation

```typescript
if (!data) return reply.status(400).send({ error: "No file uploaded." });
if (!isCsvLike) return reply.status(400).send({ error: "Unsupported file type." });
if (!csvText) return reply.status(400).send({ error: "Uploaded file is empty." });
```

**Why validate at the route layer?**
- Fast failures: Don't waste time parsing garbage.
- User-friendly errors: The route knows about HTTP, so it produces HTTP-appropriate messages.
- The service layer assumes it receives valid CSV text.

### Response Structure

```json
{
  "broker": "zerodha",
  "summary": { "total": 3, "valid": 2, "skipped": 1 },
  "trades": [...],
  "errors": [{ "row": 4, "reason": "..." }]
}
```

**Why this structure?**
- `broker`: tells the client which format was detected (useful for debugging)
- `summary`: at-a-glance statistics
- `trades` and `errors`: the actual payload

**Status code choices**:
- `200 OK`: Import processed, partial results may exist
- `400 Bad Request`: File missing, wrong type, empty, or unrecognized format
- No `500` — the system never crashes on bad input

### Swagger Integration

```typescript
await app.register(swagger, {
  openapi: {
    info: { title: "Broker CSV Trade Import API", version: "1.0.0" }
  }
});
```

Interactive docs at `/docs` let users test the API without curl. This is production-ready developer experience.

### Is the API Production-Ready?

**Mostly yes, with gaps**:

| Aspect | Status | Notes |
|--------|--------|-------|
| File upload | ✅ | Multipart with size limits |
| Error responses | ✅ | Clear, structured |
| Swagger docs | ✅ | Auto-generated |
| Health check | ✅ | `/health` endpoint |
| Rate limiting | ❌ | Not implemented |
| Authentication | ❌ | Not implemented |
| Request logging | ⚠️ | Basic Fastify logging only |
| Pagination | N/A | Not applicable for uploads |
| Idempotency | ❌ | Re-uploading same file creates duplicates |

---

# PART 10 — Software Engineering Patterns

## 1. Strategy Pattern

**Where**: `src/parsers/` — `ZerodhaParser` and `IbkrParser` both implement `BrokerParser`.

**Definition**: Define a family of algorithms (parsing strategies), encapsulate each one, and make them interchangeable.

**Benefit**: The `ImportService` doesn't know which parser it's using. It just calls `parser.parse(csvText)`.

## 2. Registry Pattern

**Where**: `src/parsers/registry.ts`

```typescript
export const parserRegistry: BrokerParser[] = [
  new ZerodhaParser(),
  new IbkrParser(),
];
```

**Definition**: Maintain a central list of available strategies. Consumers iterate the registry to find the right one.

**Benefit**: Adding a parser is declarative — just add to the array. No other code changes.

## 3. Factory Pattern

**Where**: `src/app.ts` — `buildApp()`

```typescript
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ ... });
  // configure plugins...
  return app;
}
```

**Definition**: A function that creates and configures objects without exposing the construction logic.

**Benefit**: Tests call `buildApp()` to create isolated instances. No global singleton state.

## 4. Dependency Inversion

**Where**: `ImportService` depends on `BrokerParser` interface, not concrete parsers.

```typescript
const parser = detectBroker(csvText, parserRegistry);  // returns BrokerParser
const result = await parser.parse(csvText);             // calls interface method
```

**Definition**: High-level modules should not depend on low-level modules. Both should depend on abstractions.

**Benefit**: You can swap the parser implementation without touching `ImportService`.

## 5. Separation of Concerns

**Where**: Every folder in `src/`

| Folder | Concern | What it does NOT do |
|--------|---------|-------------------|
| `routes/` | HTTP handling | Business logic |
| `services/` | Business logic | HTTP responses |
| `parsers/` | Broker-specific parsing | HTTP or database |
| `utils/` | Reusable primitives | Business rules |
| `schemas/` | Data contracts | Parsing or HTTP |

## 6. Abstraction Layers

**Where**: `BrokerParser` interface abstracts away implementation details.

The route layer doesn't know:
- How many brokers are supported
- What date formats they use
- How detection works

It just knows: "I give CSV text to ImportService, I get back a structured response."

---

# PART 11 — Scalability & Production Readiness

## Current Scaling Characteristics

### Memory Efficiency

```typescript
const csvText = Buffer.concat(chunks).toString("utf-8").trim();
const rows = parseCsvToRows(csvText);
```

**Problem**: The entire file is loaded into memory twice:
1. Once as a Buffer array during stream reading
2. Once as a string (`csvText`)
3. Then parsed into an array of objects (`rows`)

For a 10MB CSV with 100,000 rows, this is ~30-50MB of memory per request. With 100 concurrent requests, that's 3-5GB.

**What would break at scale**:
- Files larger than the Node.js heap limit (~1.4GB by default)
- High concurrency — memory doesn't scale linearly with requests
- Memory pressure causes garbage collection pauses, increasing latency

### What Real Companies Would Improve

1. **Streaming Parser**
   ```typescript
   // Instead of parseCsvToRows (sync, loads all into memory):
   const parser = parse({ columns: true });
   for await (const record of parser) {
     // process one row at a time
   }
   ```
   This processes rows one at a time, keeping memory constant regardless of file size.

2. **Async Job Queue**
   - Upload returns immediately with a `jobId`
   - A background worker processes the file
   - Client polls `GET /jobs/:jobId` for status
   - This decouples upload from processing and prevents server overload

3. **Database Persistence**
   - Instead of returning trades in the response, store them in PostgreSQL
   - Return a summary + query endpoint for paginated results
   - Enables reconciliation, auditing, and historical analysis

4. **Horizontal Scaling**
   - Run multiple server instances behind a load balancer
   - The stateless design (`buildApp()` factory) makes this trivial
   - Use Redis for shared state if needed

5. **Caching**
   - Cache parser registry (it's static)
   - Cache detection results for identical headers
   - This is micro-optimization but helps at extreme scale

## Performance Bottlenecks

1. **Synchronous CSV parsing**: `csv-parse/sync` blocks the event loop for large files.
2. **String manipulation**: `Buffer.concat().toString()` creates large intermediate strings.
3. **Zod validation**: Zod is fast, but validating 100k rows synchronously blocks the loop.

**Fix**: Use `csv-parse` streaming + process rows in batches with `setImmediate()` to yield the event loop.

---

# PART 12 — Security Analysis

## File Upload Risks

### Current Protections
- **File size limit**: 10MB via `@fastify/multipart` config
- **Mimetype check**: Only accepts CSV-like files
- **Empty file rejection**: Prevents processing empty uploads

### Missing Protections

1. **Filename validation**: A user could upload `../../../etc/passwd` as the filename (though the content is what matters).
2. **Content validation**: The mimetype check is weak. A user could rename `malware.exe` to `trades.csv` and upload it. The system would try to parse it as CSV.
3. **Rate limiting**: No protection against a user uploading thousands of files.
4. **Authentication**: Anyone can upload. No API keys, no session checks.

## CSV Injection Risks

CSV injection (also called "formula injection") occurs when a cell starts with `=` or `+` and gets interpreted as a formula by Excel:

```csv
symbol,price
=CMD|' /C calc'!A0,150
```

**Current status**: The system reads the CSV but doesn't open it in Excel. The raw string goes into `rawData`. However, if the frontend renders this in an HTML table without escaping, it could execute JavaScript or formulas.

**Fix**: Sanitize `rawData` values before rendering, or strip leading `=`, `+`, `-`, `@` characters.

## Malformed Input Risks

The system handles malformed input well:
- `relax_column_count: true` prevents crashes on mismatched columns
- Per-row try/catch prevents one bad row from killing the import
- Zod validation catches type mismatches

**But**: A crafted CSV with extremely long strings could cause memory exhaustion. For example, a single cell with 10MB of text would be loaded into memory.

**Fix**: Add a per-cell or per-row size limit.

## Denial of Service

**Attack vectors**:
1. **Very large file**: Upload a 10MB CSV with one giant cell → memory spike
2. **Billion laughs variant**: A CSV with deeply nested structures (though CSV doesn't really nest)
3. **Slowloris-style**: Open many connections and upload slowly

**Mitigations needed**:
- Rate limiting (`@fastify/rate-limit`)
- Connection timeouts
- Request timeout middleware
- File size limits (already present)
- Input sanitization

## Production-Grade Security Improvements

1. **Authentication**: Add API key or OAuth2 middleware
2. **Rate limiting**: Max 10 uploads per minute per user
3. **Content scanning**: Scan uploads for malicious content (though CSV is mostly text)
4. **Audit logging**: Log every upload with user ID, IP, file size, result summary
5. **Input sanitization**: Strip or escape formula-injection characters
6. **Secure headers**: Helmet.js for security headers
7. **CORS**: Restrict to known frontend origins

---

# PART 13 — Testing Analysis

## Test Suite Overview

| Test File | Tests | What It Tests |
|-----------|-------|---------------|
| `date.test.ts` | 11 | Date parsing utilities in isolation |
| `detectBroker.test.ts` | 8 | Auto-detection algorithm |
| `import.service.test.ts` | 13 | Full orchestration layer |
| `zerodha.parser.test.ts` | 20 | Zerodha-specific parsing logic |
| `ibkr.parser.test.ts` | 16 | IBKR-specific parsing logic |
| **Total** | **68** | |

## Test Architecture

### Fixture-Driven Testing

**File**: `src/tests/fixtures.ts`

```typescript
export const ZERODHA_VALID_CSV = `symbol,isin,trade_date,...
RELIANCE,INE002A01018,01-04-2026,buy,10,2450.50,...`;
```

**Why fixtures?**
- Tests use REAL CSV data, not mocked objects.
- This ensures the entire parsing pipeline works end-to-end.
- Fixtures are reusable across multiple test files.

### Isolated Unit Tests

Each parser is tested in isolation:

```typescript
const parser = new ZerodhaParser();

it("normalizes lowercase trade_type to uppercase", async () => {
  const { trades } = await parser.parse(ZERODHA_VALID_CSV);
  expect(trades[0]?.side).toBe("BUY");
});
```

**Why instantiate directly?**
- No Fastify server, no HTTP layer, no database.
- Tests run in milliseconds.
- Failures are localized to the parser logic.

### What Is Tested (Strengths)

1. **Happy paths**: Valid CSVs parse correctly
2. **Normalization**: lowercase → uppercase, EUR.USD → EUR/USD
3. **Date parsing**: DD-MM-YYYY → ISO, MM/DD/YYYY → ISO
4. **Numeric validation**: Positive numbers, zero rejection
5. **Currency inference**: NSE/BSE → INR
6. **Error handling**: Invalid dates, negative quantities, zero quantities
7. **Edge cases**: Empty CSV, headers-only CSV, single row, all-invalid rows
8. **Detection**: Correct broker identified, wrong broker rejected
9. **Response shape**: All required fields present

### Missing Test Coverage

| Gap | Why It Matters |
|-----|---------------|
| **Route-layer tests** | No tests for `POST /import` with actual HTTP requests |
| **Swagger schema tests** | No tests that verify OpenAPI spec matches implementation |
| **Large file tests** | No tests for 10MB files or 100k rows |
| **Concurrency tests** | No tests for simultaneous uploads |
| **Security tests** | No tests for malformed uploads, injection attempts |
| **Performance tests** | No benchmarks for parse speed |
| **Database integration** | N/A (no database yet), but would need tests if added |

### Production-Grade Testing Strategy

For a production system, you'd add:

1. **Integration tests**: Spin up `buildApp()`, use Fastify's `inject()` to send requests:
   ```typescript
   const response = await app.inject({
     method: "POST", url: "/import", payload: formData
   });
   expect(response.statusCode).toBe(200);
   ```

2. **Property-based tests**: Use a library like `fast-check` to generate random CSVs and ensure the system never crashes.

3. **Contract tests**: Ensure the API response schema hasn't changed in ways that break the frontend.

4. **Load tests**: Use `autocannon` or `k6` to test 100 concurrent uploads.

5. **Mutation testing**: Use `stryker-js` to verify that tests actually catch bugs.

---

# PART 14 — Senior Engineer Review

## Architecture Quality: B+

**Strengths**:
- Clean separation of concerns
- Strategy pattern makes parsers extensible
- Framework-agnostic service layer
- Zod provides runtime safety
- Good error handling philosophy

**Weaknesses**:
- No async job queue for large files
- No database persistence
- Synchronous CSV parsing won't scale
- No event system for extensibility

## Code Readability: A-

**Strengths**:
- Every function has a JSDoc comment explaining WHY, not just WHAT
- Short methods (most under 20 lines)
- Descriptive variable names
- Consistent formatting

**Weaknesses**:
- Some comments are slightly redundant for senior engineers (but helpful for juniors)
- No inline examples in complex logic

## Maintainability: A

**Strengths**:
- Adding a broker requires zero existing code changes
- Zod schemas centralize the data model
- TypeScript strict mode prevents regressions
- Tests cover all major code paths

**Weaknesses**:
- `package.json` uses `.js` extension imports which don't work with `ts-node` (we fixed with `tsx`)
- No shared base class for parsers — some code duplication in the loop structure

## Scalability: C+

**Current state**: Works for small files (< 1000 rows), single server.

**To reach production scale**:
- Streaming CSV parser
- Async job queue (BullMQ, SQS)
- Database persistence
- Horizontal scaling with load balancer

## Production Readiness: B

**What's production-ready**:
- Error handling
- Swagger docs
- Health checks
- Input validation
- Test coverage

**What's missing**:
- Authentication
- Rate limiting
- Audit logging
- Database
- Monitoring/metrics
- CI/CD pipeline
- Docker containerization

## Engineering Maturity: B+

This is a **well-architected prototype** that could grow into a production system. The author clearly understands:
- Design patterns (Strategy, Registry, Factory)
- TypeScript best practices (strict mode, interfaces, readonly)
- Separation of concerns
- Error handling philosophy
- Testing strategies

The main gap is operational concerns — how it runs at scale, how it's monitored, how it's deployed.

## Improvement Suggestions

### High Priority
1. **Fix dev script**: Use `tsx` instead of `ts-node` (already done)
2. **Add route integration tests**: Test the full HTTP lifecycle
3. **Add rate limiting**: `@fastify/rate-limit`
4. **Add request logging**: Log uploads with user context

### Medium Priority
5. **Refactor parsers**: Extract a `BaseBrokerParser` class with the shared loop logic
6. **Add error codes**: Machine-readable error codes alongside human messages
7. **Add input sanitization**: Strip formula-injection characters from rawData

### Low Priority
8. **Streaming support**: For files > 10MB
9. **Database layer**: PostgreSQL with migrations
10. **Metrics**: Prometheus metrics for upload count, parse duration, error rate

---

# PART 15 — Full Learning Walkthrough

## How to Mentally Understand Backend Systems

When you look at a backend system, ask these questions in order:

### 1. What is the INPUT?
- In this system: A CSV file uploaded via HTTP multipart

### 2. What is the OUTPUT?
- A JSON response with normalized trades and error details

### 3. What is the TRANSFORMATION?
- CSV → detected broker → parsed rows → normalized trades → validated objects → JSON

### 4. What are the LAYERS?
- HTTP → Service → Detection → Parsing → Validation → Response

### 5. Where does FAILURE happen?
- Upload level (missing file, wrong type)
- Detection level (unknown format)
- Row level (invalid date, bad number)
- Validation level (Zod catches edge cases)

### 6. How is FAILURE handled?
- Upload/detection failures: Throw → 400 response
- Row failures: Collect → 200 response with errors array

## How Senior Engineers Trace Execution Flow

Given a request, trace it backward from the response:

```
1. Where does the response come from?
   → import.route.ts line 89

2. What calls that?
   → importService.importCsv(csvText)

3. What does importCsv do?
   → detectBroker() + parser.parse()

4. What does detectBroker do?
   → extractHeaders() + score parsers

5. What does parser.parse() do?
   → parseCsvToRows() + loop with try/catch

6. What does parseRow() do?
   → field extraction + normalization + Zod validation
```

**The key insight**: Follow the data. Don't read top-to-bottom. Start from the entrypoint and trace how data transforms at each step.

## Backend Design Thinking

### When designing a system, ask:

1. **"What if this grows 10x?"**
   - Current: loads entire file into memory
   - Better: stream processing

2. **"What if a user uploads garbage?"**
   - Current: per-row try/catch
   - Better: sanitize input, add validation layers

3. **"What if we need to support Broker C tomorrow?"**
   - Current: one file + one registry entry
   - This is GOOD. The architecture is already right.

4. **"What if the system crashes mid-import?"**
   - Current: stateless, no database — user just re-uploads
   - Better: async jobs with persistence and retry

5. **"What if a bug slips through?"**
   - Current: Zod catches edge cases
   - Better: also add monitoring and alerting

## Production Systems Thinking

A senior engineer thinks beyond "does it work?" to:

| Concern | Question |
|---------|----------|
| **Reliability** | "What happens when this fails?" |
| **Observability** | "How do I know it's working?" |
| **Scalability** | "What breaks when load increases?" |
| **Security** | "How could an attacker abuse this?" |
| **Maintainability** | "Can a new engineer understand this in a week?" |
| **Operability** | "How do I deploy this without downtime?" |

## Mental Model for This System

```
┌─────────────────────────────────────────────┐
│  UPLOAD        →  Fastify route layer        │
│  (untrusted)      (HTTP concerns only)        │
└─────────────────────────────────────────────┘
              ↓ passes string
┌─────────────────────────────────────────────┐
│  DETECT        →  detectBroker()             │
│  (broker ID)    (header fingerprint match) │
└─────────────────────────────────────────────┘
              ↓ returns parser
┌─────────────────────────────────────────────┐
│  PARSE         →  BrokerParser.parse()       │
│  (broker data)    (row-by-row normalization) │
└─────────────────────────────────────────────┘
              ↓ for each row
┌─────────────────────────────────────────────┐
│  VALIDATE      →  Zod + manual checks      │
│  (clean data)     (defense in depth)        │
└─────────────────────────────────────────────┘
              ↓ collect results
┌─────────────────────────────────────────────┐
│  RESPOND       →  JSON with trades+errors  │
│  (API output)     (structured, actionable)  │
└─────────────────────────────────────────────┘
```

**Remember**: Every layer has ONE job. The route handles HTTP. The service handles orchestration. The parser handles broker-specific logic. The schema defines the contract. When each layer does one thing well, the system becomes understandable, testable, and maintainable.

---

# Summary

This Broker CSV Trade Import Service is a **well-architected, production-quality foundation** for financial data ingestion. It demonstrates:

- **Clean architecture** with separation of concerns
- **Strategy pattern** for extensible parser design
- **Runtime validation** with Zod schemas
- **Fault-tolerant error handling** with per-row isolation
- **Comprehensive testing** with fixture-driven unit tests
- **TypeScript best practices** with strict mode and readonly immutability

With the suggested improvements (streaming, async jobs, database persistence, auth, rate limiting, and monitoring), this could power a real financial data platform.

The author's engineering maturity is evident in the design choices: they prioritized correctness, extensibility, and maintainability over cleverness. That's exactly how senior engineers build systems.
