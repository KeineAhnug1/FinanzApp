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
    schema.dbml
    schema-setup.js
    seed-reset.mjs
    wipe-data.mjs
    db-client.mjs
    data-service.mjs
    prepare-data.mjs
    check-connection.mjs
  Datastructure.png
  README.md
  package.json
  package-lock.json
  .env
```

## Part 1: Database (MongoDB)

### Purpose
`database/` contains scripts to:
- create/update collections, validators, and indexes
- wipe existing app data
- reset and import linked demo data

### Collections
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

### Notes
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
- DBML source: `database/schema.dbml`
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
python3 -m http.server 5500
```

If `python3` is unavailable:

```bash
python -m http.server 5500
```

Then open:
- `http://localhost:5500/aktien/ShareView.html`

Stop server:
- `Ctrl + C`

### Configuration note
The stock frontend currently uses a Twelve Data API key in client-side code (`aktien/js/ShareView.js`).
For production usage, move the key to a backend proxy/service and do not expose secrets in frontend code.

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
