# FinanzApp

Persönliche Finanz-App mit Dashboard, Aktien-Depot, Gruppen-Finanzen, Forum und KI-Assistent.

**Stack:** Next.js 15 · Hono (Cloudflare Workers) · React 19 · TypeScript · Supabase · Cloudflare Pages

---

## Lokal starten

### Voraussetzungen

- Node.js 20+ (LTS)
- Ein laufendes [Supabase](https://supabase.com)-Projekt mit Base-Schema (Tabellen `users`, `bank_accounts`, `private_expenses`, `income`, `groups` etc.)
- Wrangler CLI (`npm i -g wrangler`) + eingeloggter Cloudflare-Account
- Resend-Account (für Verifikations-Mails) und OpenRouter-Account (für KI-Chat)

> Für ein vollständiges Production-Setup (Cloudflare Pages + Workers + Hyperdrive + KV) siehe [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md). Die folgenden Schritte zeigen den **lokalen Dev-Aufbau**.

### 1. Dependencies installieren

```bash
npm run install:all
```

### 2. Umgebungsvariablen anlegen

**Backend** — Datei `backend/.dev.vars` erstellen (Vorlage: `backend/.dev.vars.example`):

```env
# Datenbank — bevorzugt: Hyperdrive (Session-Pooler). Fallback: DATABASE_URL + Supabase-REST.
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

SESSION_COOKIE_NAME=finanzapp_session
SESSION_TTL_MINUTES=180
EMAIL_CODE_TTL_MINUTES=15
CODE_HMAC_SECRET=generate-a-32-byte-random-string

RESEND_API_KEY=re_your_key_here
EMAIL_FROM=FinanzApp <noreply@yourdomain.com>

STOCK_API_URL=http://3.225.21.161
STOCK_API_KEY=your-stock-api-key
TWELVE_DATA_API_KEY=your-twelve-data-key
FINNHUB_API_KEY=your-finnhub-key

OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-oss-20b:free
OPENROUTER_SITE_URL=http://localhost:4000
OPENROUTER_APP_NAME=FinanzApp

LOGO_DEV_API_KEY=your-logo-dev-key
FINZBRO_BOT_EMAIL=finzbro@finanzapp.local

FRONTEND_ORIGIN=http://localhost:4000
DEV_EXPOSE_VERIFICATION_CODE=true
```

**Frontend** — Datei `frontend/.env.local` erstellen (Vorlage: `frontend/.env.local.example`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8787
```

### 3. Cloudflare-Bindings konfigurieren (einmalig)

**KV-Namespace für Sessions:**

```bash
cd backend
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

Die zwei ausgegebenen IDs in `backend/wrangler.toml` unter `kv_namespaces` für `<SESSIONS_KV_NAMESPACE_ID>` / `<SESSIONS_KV_PREVIEW_ID>` eintragen.

**Hyperdrive (Production-DB-Pooling):**

```bash
npx wrangler hyperdrive create finanzapp-db --connection-string="postgresql://postgres.<ref>:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

Die ausgegebene Hyperdrive-ID in `backend/wrangler.toml` unter `[[hyperdrive]]` für `<HYPERDRIVE_ID>` eintragen. Im **lokalen Dev** reicht stattdessen `DATABASE_URL` in `.dev.vars` — Wrangler nutzt dann den `localConnectionString`-Override.

### 4. Datenbank-Migrationen einspielen (einmalig)

Voraussetzung: Das Base-Schema (Tabellen `users`, `bank_accounts`, `private_expenses`, `income`, `groups`, …) existiert bereits im Supabase-Projekt.

Im Supabase **SQL Editor** in dieser Reihenfolge ausführen:

1. `seeds/migrations/2026-06-29_groups_expansion.sql` — Peer-Transfers, Group-Expenses, Trips, Funding-Status
2. `seeds/migrations/2026-06-30_audit_fixes.sql` — atomare RPCs (`increment_bank_balance`, `transfer_between_accounts`, `contribute_to_funding`, `refund_from_funding`, `release_period_reservations`)
3. `seeds/migrations/2026-06-30_grant_permissions.sql` — Rechte auf neue Tabellen

Verifikation:

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'increment_bank_balance', 'transfer_between_accounts',
    'contribute_to_funding', 'refund_from_funding', 'release_period_reservations'
  );
-- soll 5 Zeilen liefern
```

### 5. Starten

```bash
npm start
```

| Service  | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:4000    |
| Backend  | http://localhost:8787    |

---

## Projektstruktur

```
FinanzApp/
├── frontend/               # Next.js 15 App — reine UI, keine DB-Zugriffe
│   └── src/
│       ├── app/
│       │   ├── (app)/      # Authentifizierte Seiten
│       │   ├── (auth)/     # Login / Register / Verify
│       │   └── (public)/   # Öffentliche Homepage
│       ├── components/
│       ├── lib/            # api-client, session, theme
│       ├── stores/         # Zustand: app-store, ui-store
│       ├── styles/         # globals.css (einzige CSS-Datei)
│       └── types/
└── backend/                # Hono API-Server — Cloudflare Worker
    └── src/
        ├── routes/         # auth, finance, budgets, groups, questions, stocks, users
        └── lib/helpers/    # finance, session-Helpers
```

Das Frontend kommuniziert mit dem Backend ausschließlich über HTTP (`NEXT_PUBLIC_API_URL`). Keine Supabase-Schlüssel oder Server-Secrets im Frontend-Bundle.

---

## Features & Seiten

| Seite          | URL                         | Beschreibung                              |
|----------------|-----------------------------|-------------------------------------------|
| Homepage       | `/home`                     | Öffentliche Landing Page                  |
| Login/Register | `/login`                    | Auth mit E-Mail-Verifikation              |
| Dashboard      | `/dashboard`                | Übersicht: Konten, Ausgaben, Budget-Alerts |
| Konten         | `/accounts`                 | Bankkonten, Einnahmen, Ausgaben           |
| Aktien         | `/stocks`                   | Depot, Kursdaten, Suche                   |
| Gruppen        | `/groups`                   | Gemeinsame Finanzen & Sparziele           |
| Forum          | `/questions`                | Fragen stellen & beantworten              |
| KI-Chat        | `/questions/chat`           | KI-Assistent (OpenRouter)                 |
| Einstellungen  | `/settings`                 | Profil, Passwort, Theme                   |

---

## Design

Die vollständige Design-Sprache, Farbpalette, Spacing-Tokens und Komponenten-Patterns sind in [`design/`](./design/) dokumentiert:

- [`design/README.md`](./design/README.md) — Übersicht, Design-Prinzipien, Themes
- [`design/design-tokens.md`](./design/design-tokens.md) — vollständige CSS-Token-Referenz
- [`design/screenshots/`](./design/screenshots/) — Aufnahmen aller Hauptseiten

---

## Nützliche Befehle

```bash
npm start                   # Frontend + Backend gleichzeitig starten
npm run type-check          # TypeScript-Check für beide Pakete
npm run build               # Production-Build (Frontend + Backend)

# Einzeln starten
npm run dev --prefix frontend   # Next.js auf :4000
npm run dev --prefix backend    # Wrangler auf :8787

# Wenn Port 8787 belegt ist:
lsof -ti :8787 | xargs kill -9
```

### Docker (optional)

For a containerized frontend (useful for evaluation):

```sh
docker compose up --build       # builds + starts frontend on :4000
cd backend && npm run dev       # backend Worker still runs on the host (:8787)
```

See `docs/DOCKER.md` for why the backend isn't containerized.

---

## Sicherheit

- **CSRF:** Alle schreibenden Requests erwarten Header `x-csrf-token` mit dem Wert des `csrf_token`-Cookies (Double-Submit-Cookie-Pattern).
- **Session-Cookie:** `finanzapp_session` (HttpOnly, SameSite=Lax).
- **CORS:** Backend akzeptiert Requests nur vom konfigurierten `FRONTEND_ORIGIN`.
- **Session-Isolation:** QueryClient-Cache wird bei Login und Logout vollständig geleert.

---

## Deployment

**Backend (Cloudflare Workers):**
```bash
cd backend
npm run deploy
```
Secrets im Cloudflare Dashboard unter **Settings → Environment Variables** setzen (nicht in `wrangler.toml`).

**Frontend (Cloudflare Pages):**
```bash
cd frontend
npm run pages:build
npm run deploy
```
`NEXT_PUBLIC_API_URL` als Pages-Variable auf die Worker-URL setzen.
