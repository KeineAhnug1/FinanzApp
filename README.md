# FinanzApp

Persönliche Finanz-App mit Dashboard, Aktien-Depot, Gruppen, Forum und KI-Assistent.

Stack: **Next.js 15** · **Hono** · React 19 · TypeScript · Supabase · Cloudflare Pages + Workers

---

## Projektstruktur

```
FinanzApp/
├── frontend/   # Next.js 15 App — reine UI, keine DB-Zugriffe
└── backend/    # Hono API-Server — Cloudflare Worker
```

Das Frontend kommuniziert mit dem Backend ausschließlich über HTTP (`NEXT_PUBLIC_API_URL`).
Keine Supabase-Schlüssel und keine Server-Secrets im Frontend-Bundle.

---

## Voraussetzungen

- Node.js 18+
- Supabase-Projekt (Schema einmalig ausführen, siehe unten)
- Cloudflare-Account (für KV-Namespace `SESSIONS`)

---

## Backend (`backend/`)

### Entwicklung

```bash
cd backend
npm install
npx wrangler dev           # Hono-Worker auf http://localhost:8787
```

### Umgebungsvariablen

Lokale Entwicklung → `.dev.vars` im `backend/`-Verzeichnis:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=<min. 32 zufällige Zeichen>
CODE_HMAC_SECRET=<min. 32 zufällige Zeichen>
SESSION_COOKIE_NAME=finanzapp_session
SESSION_TTL_MINUTES=180
EMAIL_CODE_TTL_MINUTES=15
RESEND_API_KEY=re_...
EMAIL_FROM=FinanzApp <noreply@yourdomain.com>
STOCK_API_URL=http://3.225.21.161
STOCK_API_KEY=<key>
TWELVE_DATA_API_KEY=<key>
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=arcee-ai/trinity-large-preview:free
OPENROUTER_SITE_URL=https://finanzapp.pages.dev
OPENROUTER_APP_NAME=FinanzApp
LOGO_DEV_API_KEY=<key>
FRONTEND_ORIGIN=http://localhost:3000
DEV_EXPOSE_VERIFICATION_CODE=true
```

KV-Namespace anlegen (einmalig):
```bash
cd backend
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```
IDs in `backend/wrangler.toml` eintragen.

### Deployment

```bash
cd backend
npm run deploy   # wrangler deploy
```

Secrets im Cloudflare Dashboard unter **Settings → Environment Variables** setzen (nicht in `wrangler.toml`).

---

## Frontend (`frontend/`)

### Entwicklung

```bash
cd frontend
npm install
# .env.local anlegen:
echo "NEXT_PUBLIC_API_URL=http://localhost:8787" > .env.local
npm run dev        # Next.js auf http://localhost:3000
```

| Seite | URL |
|---|---|
| Login / Register | `http://localhost:3000/login` |
| Dashboard | `http://localhost:3000/dashboard` |
| Konten | `http://localhost:3000/accounts` |
| Aktien | `http://localhost:3000/stocks` |
| Gruppen | `http://localhost:3000/groups` |
| Forum | `http://localhost:3000/questions` |
| Einstellungen | `http://localhost:3000/settings` |
| Homepage | `http://localhost:3000/home` |

### Umgebungsvariablen

`.env.local` (lokale Entwicklung):

```env
NEXT_PUBLIC_API_URL=http://localhost:8787
```

`.env.production` / Cloudflare Pages-Variable:

```env
NEXT_PUBLIC_API_URL=https://api.finanzapp.workers.dev
```

### Cloudflare Pages

```bash
cd frontend
npm run pages:build   # baut mit @cloudflare/next-on-pages
npm run preview       # startet wrangler pages dev
npm run deploy        # pages:build + wrangler pages deploy
```

---

## Datenbank (Supabase)

Schema einmalig im Supabase SQL-Editor ausführen.

Benötigte PostgreSQL-Funktion:
```sql
CREATE OR REPLACE FUNCTION increment_bank_balance(p_account_id UUID, p_delta NUMERIC)
RETURNS VOID AS $$
  UPDATE bank_accounts SET balance = balance + p_delta WHERE id = p_account_id;
$$ LANGUAGE sql;
```

---

## API-Endpunkte (Backend)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/auth/session` | Aktuelle Session |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/register` | Registrierung |
| POST | `/api/auth/verify` | E-Mail-Bestätigung |
| POST | `/api/auth/forgot-password` | Passwort-Reset anfordern |
| POST | `/api/auth/reset-password` | Passwort zurücksetzen |
| GET/PATCH/DELETE | `/api/users/me` | Eigenes Profil |
| POST | `/api/users/me/password` | Passwort ändern |
| GET/POST | `/api/finance/bank-accounts` | Konten |
| GET/POST | `/api/finance/income` | Einnahmen |
| GET/POST | `/api/finance/expenses` | Ausgaben |
| GET | `/api/finance/transactions` | Transaktionen |
| GET | `/api/budgets/status` | Budget-Alerts |
| GET/POST | `/api/groups` | Gruppen |
| GET/POST | `/api/questions` | Forum-Fragen |
| GET | `/api/stocks/search` | Aktiensuche |

---

## Sicherheit

- **CSRF:** Alle schreibenden Requests erwarten Header `x-csrf-token` mit dem Wert des `csrf_token`-Cookies (Double-Submit-Cookie-Pattern).
- **Session-Cookie:** `finanzapp_session` (HttpOnly, SameSite=Lax).
- **CORS:** Backend akzeptiert Requests nur vom konfigurierten `FRONTEND_ORIGIN`.
