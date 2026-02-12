# FinanzApp

FinanzApp combines two parts in one repository:
- a MongoDB schema + seed toolkit for personal/shared finance data
- a stock analysis frontend (`aktien/ShareView.html`) using Twelve Data

This file is the single source of truth for project setup.

## Project Structure

```text
FinanzApp/
  aktien/
    ShareView.html
    css/ShareView.css
    js/ShareView.js
    testdata/
  database/
    dataset-legacy/
      schema.dbml
      schema-setup.js
      seed-reset.mjs
      wipe-data.mjs
      db-client.mjs
      data-service.mjs
      prepare-data.mjs
      check-connection.mjs
    dataset-v2/
      schema.dbml
      schema-setup.js
      wipe-data.mjs
      db-client.mjs
      check-connection.mjs
    schema-setup.js
    seed-reset.mjs
    wipe-data.mjs
    check-connection.mjs
    prepare-data.mjs
  Datastructure.png
  README.md
  package.json
  package-lock.json
  .env
```

## Part 1: Database (MongoDB)

### Purpose
`database/` contains two dataset-specific setups:
- `database/dataset-legacy/` for the current/original model
- `database/dataset-v2/` for the new model variant

Root-level scripts in `database/` are compatibility wrappers that run the legacy setup.

Both setups provide scripts to:
- create/update collections, validators, and indexes
- wipe existing app data (legacy + v2)
- reset/import linked demo data (legacy)

### Collections (Legacy Dataset)
- `users`
- `groups`
- `group_members`
- `bank_accounts`
- `expenses`
- `expense_shares`
- `requests`
- `transactions`
- `shares`
- `budget`

### Notes (Legacy Dataset)
- Money fields are stored as MongoDB `Decimal128`.
- `transactions` enforces exactly one source: `request_id` XOR `expense_share_id`.
- MongoDB relation behavior is modeled through validators + indexes (no FK enforcement).

### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster (or compatible MongoDB URI)

### Environment
Create `.env` in project root:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-host>/?appName=FinanzApp"
MONGODB_DB="finanzapp"
```

### Install dependencies

```bash
npm install
```

### Apply schema

```bash
npm run schema:setup
```

### Reset and import demo data

```bash
npm run seed:reset
```

Equivalent:

```bash
npm run import:testdata
```

### Wipe all data (keep collections/indexes/validators)

```bash
npm run db:wipe
```

### Check database connection

```bash
npm run db:check
```

Returns JSON with:
- `ok` (boolean)
- `database`
- `checked_at`
- `error` (present on failure)

### Read and prepare app-ready data

Outputs normalized JSON (ObjectId/Decimal128/Date converted) with:
- profile + account snapshot
- memberships
- budgets
- requests (incoming/outgoing)
- expense share status
- stock holdings
- quick finance counters

```bash
npm run data:prepare
```

Filter to one user:

```bash
npm run data:prepare -- --username anna
```

### Data Model Reference
- Legacy DBML source: `database/dataset-legacy/schema.dbml`
- V2 DBML source: `database/dataset-v2/schema.dbml`
- Diagram: `Datastructure.png`

![FinanzApp data structure](./Datastructure.png)

## Part 2: Stock Frontend (`aktien/`)

### Purpose
The stock module provides:
- portfolio/depot overview
- single stock analysis
- quote/time series based views
- symbol/stock list lookups based on Twelve Data endpoints

Entry point:
- `aktien/ShareView.html`

### Start locally
From project root:

```bash
npm run stocks:server
```

Then open:
- `http://localhost:5500/aktien/ShareView.html`

Stop server:
- `Ctrl + C`

### Start frontend + API as separate servers
If you want to run the HTML on a separate static server and the API on its own port:

```bash
npm run stocks:all
```

This starts:
- Frontend static server: `http://localhost:5500/aktien/ShareView.html`
- Positions API: `http://localhost:5588/api/positions`

### Stocks backend endpoint (temporary fallback data)
The stock module now includes a simple backend endpoint:
- `GET /api/positions`
- `GET /api/twelvedata/*` (proxy to Twelve Data)

Source for the temporary fallback positions:
- `aktien/backend/fallback-positions.mjs`

Server implementation:
- `aktien/backend/server.mjs`

### Configuration note
The stock frontend no longer calls Twelve Data directly.
Set your Twelve Data API key in backend environment:

```env
TWELVE_DATA_API_KEY="<your-key>"
```

The backend proxy route `/api/twelvedata/*` appends this key server-side.

## Part 3: Login Demo (`uebersicht/`)

### Start

```bash
npm run web:start
```

Open:
- `http://localhost:3000`

### Login source
- Login checks `users.email` and `users.password` in MongoDB.
- Seed users are inserted by `npm run seed:reset`.

### Seed test credentials
- `anna@example.com` / `anna_pw_hash`
- `ben@example.com` / `ben_pw_hash`
- `clara@example.com` / `clara_pw_hash`
- `emre@example.com` / `emre_pw_hash`
- `farah@example.com` / `farah_pw_hash`

## NPM Scripts
Defined in `package.json`:
- `npm run schema:setup`
- `npm run seed:reset`
- `npm run import:testdata`
- `npm run db:wipe`
- `npm run db:check`
- `npm run data:prepare`
- `npm run schema:setup:legacy`
- `npm run seed:reset:legacy`
- `npm run db:wipe:legacy`
- `npm run db:check:legacy`
- `npm run data:prepare:legacy`
- `npm run schema:setup:v2`
- `npm run db:wipe:v2`
- `npm run db:check:v2`
