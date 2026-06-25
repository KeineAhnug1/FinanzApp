# FinanzApp

Persönliche Finanz-App mit Dashboard, Aktien-Depot, Gruppen-Finanzen, Forum und KI-Assistent.

**Stack:** Next.js 15 · Hono (Cloudflare Workers) · React 19 · TypeScript · Supabase · Cloudflare Pages

---

## Lokal starten

### Voraussetzungen

- Node.js 18+
- Ein laufendes [Supabase](https://supabase.com)-Projekt
- Wrangler CLI (`npm i -g wrangler`) + eingeloggter Cloudflare-Account

### 1. Dependencies installieren

```bash
npm run install:all
```

### 2. Umgebungsvariablen anlegen

**Backend** — Datei `backend/.dev.vars` erstellen (Vorlage: `backend/.dev.vars.example`):

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

SESSION_COOKIE_NAME=finanzapp_session
SESSION_TTL_MINUTES=180
EMAIL_CODE_TTL_MINUTES=15

RESEND_API_KEY=re_your_key_here
EMAIL_FROM=FinanzApp <noreply@yourdomain.com>

STOCK_API_URL=http://3.225.21.161
STOCK_API_KEY=your-stock-api-key
TWELVE_DATA_API_KEY=your-twelve-data-key

OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=arcee-ai/trinity-large-preview:free
OPENROUTER_SITE_URL=http://localhost:4000
OPENROUTER_APP_NAME=FinanzApp

LOGO_DEV_API_KEY=your-logo-dev-key

FRONTEND_ORIGIN=http://localhost:4000
DEV_EXPOSE_VERIFICATION_CODE=true
```

**Frontend** — Datei `frontend/.env.local` erstellen (Vorlage: `frontend/.env.local.example`):

```env
NEXT_PUBLIC_API_URL=http://localhost:8787
```

### 3. KV-Namespace für Sessions anlegen (einmalig)

```bash
cd backend
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

Die ausgegebenen IDs in `backend/wrangler.toml` unter `kv_namespaces` eintragen.

### 4. Datenbank einrichten (einmalig)

Im Supabase SQL-Editor folgende Funktion ausführen:

```sql
CREATE OR REPLACE FUNCTION increment_bank_balance(p_account_id UUID, p_delta NUMERIC)
RETURNS VOID AS $$
  UPDATE bank_accounts SET balance = balance + p_delta WHERE id = p_account_id;
$$ LANGUAGE sql;
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
