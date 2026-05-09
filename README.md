# Broker CSV Trade Import Service

A production-quality backend service that accepts broker CSV trade export files, auto-detects the broker format, normalizes trades into a unified schema, and returns structured JSON responses.

**Supported brokers:** Zerodha (Indian equity) & Interactive Brokers (IBKR)

---

## Quick Start (2 minutes)

### Prerequisites

- [Node.js](https://nodejs.org/) **v18+** (tested on v20)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd broker-csv-importer
npm install
```

> Expected: `added 237 packages` (or similar) with no errors.

### 2. Run Tests

```bash
npm test
```

**Expected output:**
```
✓ src/tests/date.test.ts (11)
✓ src/tests/ibkr.parser.test.ts (16)
✓ src/tests/detectBroker.test.ts (8)
✓ src/tests/zerodha.parser.test.ts (20)
✓ src/tests/import.service.test.ts (13)

Test Files  5 passed (5)
Tests       68 passed (68)
```

### 3. Start the Server

```bash
npm run dev
```

**Expected output:**
```
{"level":30,"time":...,"msg":"Server listening at http://0.0.0.0:3000"}
```

The server is now running at `http://localhost:3000`.

### 4. Quick API Test (in a new terminal)

```bash
curl http://localhost:3000/health
```

**Expected:**
```json
{"status":"ok","timestamp":"..."}
```

### 5. Upload a Sample CSV

Create a test file:

```bash
cat > zerodha.csv << 'EOF'
symbol,isin,trade_date,trade_type,quantity,price,trade_id,order_id,exchange,segment
RELIANCE,INE002A01018,01-04-2026,buy,10,2450.50,TRD001,ORD001,NSE,EQ
INFY,INE009A01021,01-04-2026,sell,25,1520.75,TRD002,ORD002,NSE,EQ
WIPRO,INE075A01022,05-04-2026,buy,-5,450.00,TRD007,ORD007,NSE,EQ
EOF
```

Upload it:

```bash
curl -s -X POST http://localhost:3000/import -F "file=@zerodha.csv"
```

**Expected response:**
```json
{
  "broker": "zerodha",
  "summary": { "total": 3, "valid": 2, "skipped": 1 },
  "trades": [
    { "symbol": "RELIANCE", "side": "BUY", "quantity": 10, "price": 2450.5, "totalAmount": 24505, "currency": "INR", "executedAt": "2026-04-01T00:00:00.000Z", "broker": "zerodha", "rawData": { ... } },
    { "symbol": "INFY", "side": "SELL", "quantity": 25, "price": 1520.75, "totalAmount": -38018.75, "currency": "INR", "executedAt": "2026-04-01T00:00:00.000Z", "broker": "zerodha", "rawData": { ... } }
  ],
  "errors": [
    { "row": 4, "reason": "'quantity' must be positive, got -5." }
  ]
}
```

> The WIPRO row (quantity `-5`) is skipped and reported as an error. The other two trades are successfully normalized.

### 6. Explore the Swagger UI

Open `http://localhost:3000/docs` in your browser to test the API interactively.

---

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server with auto-reload (`tsx`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

---

## API Reference

### `POST /import`

Upload a broker CSV file via multipart form data (field name: `file`).

**cURL:**
```bash
curl -X POST http://localhost:3000/import -F "file=@your_trades.csv"
```

**Success Response (200):**
```json
{
  "broker": "zerodha",
  "summary": { "total": 5, "valid": 5, "skipped": 0 },
  "trades": [ ... ],
  "errors": []
}
```

**Partial Success (200 with errors):**
```json
{
  "broker": "zerodha",
  "summary": { "total": 7, "valid": 5, "skipped": 2 },
  "trades": [ ... ],
  "errors": [
    { "row": 7, "reason": "Invalid Zerodha date format: 'invalid_date'. Expected DD-MM-YYYY." },
    { "row": 8, "reason": "'quantity' must be positive, got -5." }
  ]
}
```

**Unrecognized Format (400):**
```json
{
  "error": "Unrecognized CSV format. Headers found: [date, ticker, action, shares, unit_price]. No registered broker parser matched (best score: 0%)."
}
```

### `GET /health`

```bash
curl http://localhost:3000/health
```

```json
{"status":"ok","timestamp":"2026-04-01T12:00:00.000Z"}
```

### `GET /docs`

Interactive Swagger UI for testing uploads in the browser.

---

## Supported Broker Formats

### Zerodha (Indian Equity)

| Field | Notes |
|-------|-------|
| `symbol` | e.g. `RELIANCE`, `INFY` |
| `trade_date` | `DD-MM-YYYY` format |
| `trade_type` | `buy`/`sell` (case-insensitive) |
| `quantity` | Must be positive |
| `price` | Per-unit price |
| `exchange` | `NSE` or `BSE` — used to infer `INR` currency |
| `isin` | Optional |

### Interactive Brokers (IBKR)

| Field | Notes |
|-------|-------|
| `Symbol` | `EUR.USD` normalized to `EUR/USD` |
| `DateTime` | ISO 8601 or `MM/DD/YYYY` |
| `Buy/Sell` | `BOT` → BUY, `SLD` → SELL |
| `Quantity` | Must be > 0 (zero = rejected) |
| `TradePrice` | Per-unit price |
| `Currency` | 3-letter ISO code |
| `NetAmount` | Used as `totalAmount` when present |
| All extra fields | Preserved in `rawData` |

---

## Architecture

```
src/
├── parsers/
│   ├── parser.interface.ts   # BrokerParser contract (strategy pattern)
│   ├── registry.ts           # All parsers registered here
│   ├── zerodha.parser.ts     # Zerodha-specific parsing logic
│   └── ibkr.parser.ts        # IBKR-specific parsing logic
├── schemas/
│   └── trade.schema.ts       # Zod schemas: Trade, RowError, ImportResponse
├── utils/
│   ├── csv.ts                # csv-parse wrapper
│   ├── date.ts               # Broker-specific date parsers
│   ├── detectBroker.ts       # Header-fingerprint auto-detection
│   └── parse.ts              # Safe number/side parsing helpers
├── routes/
│   └── import.route.ts       # Fastify route: POST /import
├── services/
│   └── import.service.ts     # Orchestrates detection → parsing → response
├── tests/
│   ├── fixtures.ts           # Shared CSV test data
│   ├── zerodha.parser.test.ts
│   ├── ibkr.parser.test.ts
│   ├── detectBroker.test.ts
│   ├── import.service.test.ts
│   └── date.test.ts
├── app.ts                    # Fastify app factory (plugins + routes)
└── server.ts                 # Entrypoint (reads .env, starts listener)
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **Route** | HTTP parsing, file reading, request/response shaping |
| **Service** | Orchestration — detect broker, call parser, assemble response |
| **Parser** | Broker-specific row normalization and Zod validation |
| **Utils** | Reusable primitives (dates, numbers, CSV, detection) |
| **Schema** | Single source of truth for all types |

---

## Design Decisions

### Strategy Pattern for Parsers

Each broker is a class implementing `BrokerParser`. Adding Broker C means creating one new file and adding one line to `registry.ts`. No existing code changes.

### Header Fingerprint Detection

Auto-detection scores parsers by the percentage of their "fingerprint" columns that appear in the CSV headers. A 60% match threshold prevents false positives while tolerating brokers that add optional columns over time.

### Row-Level Error Isolation

Each row is parsed inside a `try/catch`. Errors are structured as `{ row, reason }` and collected — never thrown. The import succeeds even if every row is invalid.

### Zod as the Final Gate

Parsers manually extract and convert fields, but every row is still passed through `TradeSchema.parse()` at the end. This catches edge cases that slip through manual validation (e.g. a `quantity` that parsed to `NaN`).

### Framework-Agnostic Service Layer

`ImportService` has no Fastify imports. It takes a string and returns a plain object. This makes it trivially testable and easy to swap the HTTP framework if needed.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `vitest: command not found` | Run `npm install` first |
| `Cannot find module './app.js'` when running `npm run dev` | The project uses `tsx` (included in devDependencies) which handles `.js` extension imports correctly. Do not use `ts-node`. |
| Server won't start | Check port 3000 isn't already in use. Set `PORT=3001` in `.env` if needed. |
| `Unsupported file type` from curl | The API accepts `text/csv`, `application/csv`, and `application/octet-stream`. If you get this, ensure you're sending a `.csv` file. |
| Tests fail | Ensure you're on Node.js v18+. Run `node --version` to check. |

---

## Assumptions

- CSV files are UTF-8 encoded
- File size limit: 10 MB (configurable via `MAX_FILE_SIZE_MB` env var)
- Zerodha currency is always INR (inferred from NSE/BSE exchange); MCX or other exchanges would need extension
- IBKR `NetAmount` is used as `totalAmount` when present; otherwise computed as `quantity × price` (signed by side)
- `totalAmount` is positive for BUY, negative for SELL (for Zerodha where it isn't in the CSV)
- Row numbers in errors are 1-indexed and include the header row (so data row 1 = error row 2)

---

## Future Improvements

- **Streaming parser** — for very large files (>100k rows), switch to streaming csv-parse instead of sync
- **Broker C+** — Angel One, Upstox, TD Ameritrade parsers are one-file additions
- **File size telemetry** — log file size and parse duration for performance monitoring
- **Rate limiting** — add `@fastify/rate-limit` for production deployments
- **Auth** — API key middleware for protecting the endpoint
- **Async job queue** — for large files, return a job ID and poll for results
- **Database persistence** — store normalized trades in PostgreSQL with a unique constraint on `(broker, rawData.trade_id)`
- **Decimal precision** — use a fixed-point library (e.g. `decimal.js`) for financial arithmetic instead of IEEE 754 floats
