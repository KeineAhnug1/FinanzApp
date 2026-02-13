# FinanzApp

FinanzApp combines two parts in one repository:
- a MongoDB schema + seed toolkit for personal/shared finance data
- a stock analysis frontend (`aktien/ShareView.html`) using Twelve Data

This file is the single source of truth for project setup.

## Current Status Snapshot (2026-02-13)

The `uebersicht/` app is no longer a single JS file. It is split into domain-focused files under:

- `uebersicht/js/dashboard/core/*`
- `uebersicht/js/dashboard/ui/*`
- `uebersicht/js/dashboard/categories/*`
- `uebersicht/js/dashboard/overview/*`
- `uebersicht/js/dashboard/profile/*`
- `uebersicht/js/dashboard/settings/*`
- `uebersicht/js/dashboard/api/*`
- `uebersicht/js/dashboard/interactions/*`
- `uebersicht/js/dashboard/bootstrap.js`

Implemented dashboard features:

- login + registration + email verification flow
- profile menu with logout
- settings menu (currency, locale, start view, default recurrence)
- income and expense CRUD
- recurrence support (`once`, `weekly`, `monthly`) + active toggle
- category presets + custom category persistence + custom category deletion
- nested timeline grouping (year -> month -> day) with search
- cashflow line chart (income/expense/savings), horizontal scroll, y-axis labels
- interactive chart hover tooltip with monthly values

Helpful docs for follow-up chats:

- `uebersicht/README.md` (frontend/dashboard handover)
- `backend/server.mjs` (zentraler API- und Static-Server)
- `database/seed-family-demo.mjs` (demo account + 24 months seeded finance data)

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
- `database/dataset-v2/` as the active/default model
- `database/dataset-legacy/` as fallback/compatibility model

Both setups provide scripts to:
- create/update collections, validators, and indexes
- wipe existing app data
- reset/import linked demo data

### Collections (V2 Default Dataset)
- `users`
- `groups`
- `group_members`
- `bank_accounts`
- `private_expenses`
- `group_expenses`
- `group_funding`
- `funding_participants`
- `requests`
- `transactions`
- `shares`
- `budgets`
- `group_activities`

### Notes (V2 Dataset)
- Money fields are stored as MongoDB `Decimal128`.
- `transactions` enforces exactly one source: `request_id` XOR `private_expense_id` XOR `group_expense_id`.
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
- V2 DBML source: `database/dataset-v2/schema.dbml`
- Legacy DBML source: `database/dataset-legacy/schema.dbml`
- Diagram: `Datastructure.png`

![FinanzApp data structure](./Datastructure.png)

## Part 2: Unified Backend + Frontends

### Purpose
Alle drei bisherigen Server (`uebersicht`, `groups`, `aktien`) wurden in einen zentralen Server zusammengefuehrt:
- `backend/server.mjs`

Der Server stellt bereit:
- Auth + Session (`/api/login`, `/api/logout`, `/api/session`, Registrierung/Verifizierung)
- Dashboard APIs (`/api/income-entries`, `/api/expense-entries`, `/api/categories`, `/api/user-income`)
- Groups APIs (`/api/groups`, `/api/inbox/invitations`, ...)
- Stocks APIs (`/api/positions`, `/api/bank-accounts`, `/api/twelvedata/*`)
- statische Dateien fuer Login, Dashboard, Groups und Aktien-View

### Session-Verhalten
- Bei erfolgreichem Login erstellt der Server eine Cookie-Session (`HttpOnly`, `SameSite=Lax`).
- Session-TTL ist per `SESSION_TTL_MINUTES` konfigurierbar (Default: `180`).
- Alle datenrelevanten APIs lesen den User ausschliesslich aus der Session.
- Frontend-seitig wird weiterhin ein kurzer User-Snapshot in `sessionStorage` gehalten, aber serverseitig ist die Session die Quelle der Wahrheit.

### Start

```bash
npm run backend:start
```

Danach:
- Login: `http://localhost:3000/`
- Dashboard: `http://localhost:3000/dashboard.html`
- Groups: `http://localhost:3000/groups`
- Aktien: `http://localhost:3000/aktien`

## Part 3: Stock Frontend (`aktien/`)

### Purpose
The stock module provides:
- portfolio/depot overview
- single stock analysis
- quote/time series based views
- symbol/stock list lookups based on Twelve Data endpoints

Entry point:
- `aktien/ShareView.html`

### Start locally
Aktien laufen jetzt ueber denselben zentralen Server:

```bash
npm run backend:start
```

Dann oeffnen:
- `http://localhost:3000/aktien`

### Stocks backend endpoints
Das Stock-Modul nutzt im zentralen Backend:
- `GET /api/positions`
- `GET /api/bank-accounts`
- `GET /api/twelvedata/*` (proxy to Twelve Data)

Server implementation:
- `backend/server.mjs`

### Configuration note
The stock frontend no longer calls Twelve Data directly.
Set your Twelve Data API key in backend environment:

```env
TWELVE_DATA_API_KEY="<your-key>"
```

The backend proxy route `/api/twelvedata/*` appends this key server-side.

## Part 4: Login Demo (`uebersicht/`)

### Start

```bash
npm run backend:start
```

Open:
- `http://localhost:3000`

### Login source
- Login checks `users.email` and `users.password` in MongoDB.
- Seed users are inserted by `npm run seed:reset`.
- Full API and frontend split are documented in `uebersicht/README.md`.

### Seed test credentials
- `anna@example.com` / `anna_pw_hash`
- `ben@example.com` / `ben_pw_hash`
- `clara@example.com` / `clara_pw_hash`
- `emre@example.com` / `emre_pw_hash`
- `farah@example.com` / `farah_pw_hash`

Additional demo account (24-month realistic history):
- run `npm run seed:family-demo`
- login: `familienvater.dev@example.com` / `FamilieDev2026!`

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
