# FinanzApp — Deployment-Guide (Cloudflare Pages + Workers)

> Ziel: Frontend (Next.js 15) auf **Cloudflare Pages** über `@cloudflare/next-on-pages`, Backend (Hono) auf **Cloudflare Workers** mit **Hyperdrive** + **KV** auf einer **Supabase**-Datenbank.
>
> Diese Anleitung ist deterministisch — jeder Befehl ist vollständig, jede Variable ist namentlich gelistet, jede Reihenfolge ist eingehalten. Wenn du jeden Schritt in der gezeigten Reihenfolge ausführst, funktioniert das Deployment.

**Begleitdokument:** [`PROJECT-OVERVIEW.md`](./PROJECT-OVERVIEW.md) (Architektur-Referenz)

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Account- und CLI-Setup](#2-account--und-cli-setup)
3. [Datenbank vorbereiten (Supabase)](#3-datenbank-vorbereiten-supabase)
4. [Sammeln aller benötigten Secrets/Keys](#4-sammeln-aller-benötigten-secretskeys)
5. [Backend — Workers-Ressourcen anlegen (KV + Hyperdrive)](#5-backend--workers-ressourcen-anlegen)
6. [Backend — `wrangler.toml` aktualisieren](#6-backend--wranglertoml-aktualisieren)
7. [Backend — Secrets setzen](#7-backend--secrets-setzen)
8. [Backend — Deploy](#8-backend--deploy)
9. [Frontend — Pages-Projekt erstellen](#9-frontend--pages-projekt-erstellen)
10. [Frontend — Build + Deploy](#10-frontend--build--deploy)
11. [Frontend ⇄ Backend verdrahten (CORS + Origins)](#11-frontend--backend-verdrahten)
12. [Verifikation: E2E-Smoke-Test](#12-verifikation-e2e-smoke-test)
13. [Custom Domains (optional)](#13-custom-domains-optional)
14. [Updates / Re-Deploy / Rollback](#14-updates--re-deploy--rollback)
15. [Häufige Fehler & Lösungen](#15-häufige-fehler--lösungen)
16. [Anhang: Vollständige Variablen-Referenz](#16-anhang-vollständige-variablen-referenz)

---

## 1. Voraussetzungen

| Tool | Mindestversion | Prüfen |
|---|---|---|
| Node.js | 20.11.0 LTS | `node -v` |
| npm | 10.x | `npm -v` |
| Git | 2.40+ | `git --version` |
| Cloudflare-Account | Free-Tier reicht zum Start | https://dash.cloudflare.com |
| Supabase-Account | Free-Tier OK | https://supabase.com |
| Resend-Account | Free-Tier OK | https://resend.com |

**Wichtig:**
- Cloudflare **Workers Free** erlaubt 100.000 Requests/Tag, **Hyperdrive ist im Free-Plan inkludiert** (keine Bezahl-Pflicht für DB-Connections).
- **Pages Free** ist unlimitiert für Static-Hosting.
- Für TCP-Datenbank-Verbindungen über `postgres` benötigst du `nodejs_compat` (bereits gesetzt — keine Aktion nötig).

---

## 2. Account- und CLI-Setup

### 2.1 Cloudflare-Account-ID notieren

1. Anmelden auf https://dash.cloudflare.com.
2. Rechts oben in der URL siehst du deine **Account-ID** (alternativ rechte Seitenleiste „Account ID" mit Kopier-Icon).
3. Notiere die ID — sie wird gleich als Env-Var gebraucht:

```bash
export CLOUDFLARE_ACCOUNT_ID="<deine-account-id>"
```

### 2.2 API-Token erzeugen

`wrangler login` öffnet einen Browser-OAuth-Flow und reicht für den Anfang. Für CI/CD oder wenn du keinen Browser hast, lege stattdessen einen **API-Token** an:

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Custom Token**.
2. Mindest-Permissions setzen:
   - **Account → Workers Scripts → Edit**
   - **Account → Workers KV Storage → Edit**
   - **Account → Cloudflare Pages → Edit**
   - **Account → Hyperdrive → Edit**
   - **Account → Account Settings → Read**
   - **User → Memberships → Read**
3. Token erzeugen und kopieren — wird **nur einmal angezeigt**.
4. In dein Terminal exportieren:

```bash
export CLOUDFLARE_API_TOKEN="<dein-token>"
```

### 2.3 Wrangler verfügbar machen

Wrangler ist bereits in `backend/devDependencies` (`^4.0.0`). Es gibt zwei Optionen:

```bash
# Option A: lokal über npx (empfohlen, nutzt Repo-Pin-Version)
cd backend && npx wrangler --version

# Option B: global
npm i -g wrangler@latest
wrangler --version
```

### 2.4 Login prüfen

```bash
cd backend
npx wrangler whoami
```

Erwartet: Anzeige deiner E-Mail + Account-ID. Wenn `CLOUDFLARE_API_TOKEN` gesetzt ist, sollte das ohne Browser funktionieren.

Falls noch nicht eingeloggt:

```bash
npx wrangler login   # öffnet Browser-OAuth
```

---

## 3. Datenbank vorbereiten (Supabase)

### 3.1 Projekt anlegen

1. https://supabase.com/dashboard → **New Project**.
2. Region wählen: **passend zur Cloudflare-Hyperdrive-Region**, z. B. `eu-central-1` (Frankfurt) für deutsche User.
3. DB-Passwort generieren und **sicher speichern** — du brauchst es gleich für Hyperdrive.
4. Warten, bis das Projekt provisioniert ist (~2 Min).

### 3.2 Connection-String holen (für Hyperdrive)

Supabase bietet drei Connection-Strings unter **Project Settings → Database → Connection string**:

| Typ | Port | Geeignet für Hyperdrive? |
|---|---|---|
| **Direct connection** (`db.<ref>.supabase.co:5432`) | 5432 | ❌ Nur IPv6 → Workers brauchen IPv4 → meist NICHT geeignet |
| **Session pooler** (`aws-X-<region>.pooler.supabase.com:5432`) | 5432 | ✅ **EMPFOHLEN für Hyperdrive** (IPv4, Session-Mode = volle SQL-Features) |
| **Transaction pooler** (`aws-X-<region>.pooler.supabase.com:6543`) | 6543 | ⚠ Funktioniert, aber prepared statements/PG-Extensions eingeschränkt — wir wollen Session-Mode |

→ Wähle den **Session-Pooler-String** (Port `5432`, Host enthält `pooler.supabase.com`).

Format:
```
postgresql://postgres.<project-ref>:<DB-PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```

**Sonderzeichen im Passwort URL-encoden** (z. B. `@` → `%40`, `#` → `%23`).

### 3.3 Migrationen einspielen

Im Repo existieren zwei idempotente Migrationen unter `seeds/migrations/`:

- `2026-06-29_groups_expansion.sql` — Peer-Transfers, Group-Expenses, Trips, Default-Accounts, Funding-Status
- `2026-06-30_audit_fixes.sql` — atomare RPC-Funktionen (`increment_bank_balance`, `transfer_between_accounts`, `contribute_to_funding`, `refund_from_funding`)

**Voraussetzung:** Das Base-Schema (Tabellen `users`, `bank_accounts`, `groups`, `private_expenses`, `income`, etc.) muss **vorher** existieren. Wenn dein Supabase-Projekt frisch ist und du noch kein Base-Schema hast, sprich kurz mit dem Team — diese Anleitung geht davon aus, dass dein bestehendes Projekt schon das Base-Schema enthält.

Migrationen ausführen:

1. Supabase-Dashboard → **SQL Editor** → **New query**.
2. Inhalt von `seeds/migrations/2026-06-29_groups_expansion.sql` einfügen → **Run**.
3. Dasselbe für `seeds/migrations/2026-06-30_audit_fixes.sql`.
4. Verifizieren — folgende RPCs müssen existieren:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_schema = 'public'
     AND routine_name IN (
       'increment_bank_balance',
       'transfer_between_accounts',
       'contribute_to_funding',
       'refund_from_funding',
       'release_period_reservations'
     );
   ```
   → Soll **5 Zeilen** zurückgeben.

### 3.4 Service-Role-Key holen (Fallback)

Optional, aber als Fallback empfohlen (das Backend wechselt bei fehlender Hyperdrive auf Supabase-REST):

Supabase-Dashboard → **Project Settings → API**:
- `Project URL` → wird `SUPABASE_URL`
- `service_role` Key (NICHT `anon`) → wird `SUPABASE_SERVICE_ROLE_KEY`

---

## 4. Sammeln aller benötigten Secrets/Keys

Bevor wir deployen, sammelst du diese Werte. **Schreibe sie in einen Passwort-Manager**, nicht in eine Datei im Repo.

### 4.1 Datenbank
| Variable | Quelle |
|---|---|
| Hyperdrive-Connection-String | Supabase Session-Pooler-URL (Schritt 3.2) |
| `SUPABASE_URL` | Supabase Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API → `service_role` |
| `DATABASE_URL` | Identisch zur Hyperdrive-URL — Fallback für lokalen Dev |

### 4.2 E-Mail (Resend)
1. https://resend.com → API-Key erstellen.
2. `EMAIL_FROM`: Nutze entweder `onboarding@resend.dev` (Resend-Default, nur für Tests) oder verifiziere eine eigene Domain.

| Variable | Wert |
|---|---|
| `RESEND_API_KEY` | `re_xxxxx…` |
| `EMAIL_FROM` | `FinanzApp <noreply@deine-domain.tld>` |

### 4.3 Stock-APIs
| Variable | Quelle |
|---|---|
| `FINNHUB_API_KEY` | https://finnhub.io/dashboard (Free-Tier) |
| `LOGO_DEV_API_KEY` | https://www.logo.dev (Public-Key reicht) |
| `TWELVE_DATA_API_KEY` | https://twelvedata.com (optional, derzeit ungenutzt) |

### 4.4 AI (OpenRouter)
| Variable | Quelle |
|---|---|
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `OPENROUTER_API_KEY_2` | (optional) Zweiter Key als Fallback |

### 4.5 App-Sicherheit
| Variable | Wert |
|---|---|
| `CODE_HMAC_SECRET` | Mindestens 32 Zeichen Random, z. B. `openssl rand -base64 48` |

### 4.6 Statische Konfiguration (kein Secret)
| Variable | Beispiel-Wert |
|---|---|
| `FRONTEND_ORIGIN` | `https://finanzapp.pages.dev` (nach Frontend-Deploy aktualisieren) |
| `OPENROUTER_SITE_URL` | `https://finanzapp.pages.dev` |
| `OPENROUTER_APP_NAME` | `FinanzApp` |
| `OPENROUTER_MODEL` | `openai/gpt-oss-20b:free` (Default in `wrangler.toml`) |
| `SESSION_COOKIE_NAME` | `finanzapp_session` |
| `SESSION_TTL_MINUTES` | `180` |
| `EMAIL_CODE_TTL_MINUTES` | `15` |
| `STOCK_SEARCH_DEFAULT_EXCHANGE` | `NASDAQ` |
| `TRUST_PROXY` | `true` |
| `NODE_ENV` | `production` |
| `FINZBRO_BOT_EMAIL` | `finzbro@finanzapp.local` |

---

## 5. Backend — Workers-Ressourcen anlegen

Ab hier arbeitest du im `backend/`-Verzeichnis. Alle Befehle gehen davon aus:

```bash
cd "/Users/I767629/Documents/Hochschule/Semester 1/Web-Engineering/FinanzApp/backend"
```

### 5.1 KV-Namespace für Sessions erzeugen

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
```

Output sieht etwa so aus:

```
🌀 Creating namespace with title "finanzapp-backend-SESSIONS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "SESSIONS"
id = "abcdef1234567890abcdef1234567890"
```

Und für Preview:

```
id = "fedcba0987654321fedcba0987654321"   # das wird preview_id
```

**Notiere beide IDs** — sie kommen gleich in `wrangler.toml`.

> **Wichtig:** Bei modernen Wrangler-Versionen (4.x) ist die korrekte Subcommand-Form `kv namespace create` (mit Leerzeichen). Das alte `kv:namespace create` (mit Doppelpunkt) ist deprecated.

### 5.2 Hyperdrive-Konfiguration erzeugen

```bash
npx wrangler hyperdrive create finanzapp-prod \
  --connection-string="postgresql://postgres.<project-ref>:<URL-encoded-pw>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

Output:

```
✅ Created new Hyperdrive config: finanzapp-prod
ID: 9f8e7d6c5b4a3210fedcba9876543210
…
```

**Notiere die `ID`** — sie kommt in die `wrangler.toml` als `[[hyperdrive]] id`.

Prüfen:

```bash
npx wrangler hyperdrive list
```

---

## 6. Backend — `wrangler.toml` aktualisieren

Datei: `backend/wrangler.toml`.

Aktueller Inhalt (Stand Repo):

```toml
name = "finanzapp-backend"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

kv_namespaces = [
  { binding = "SESSIONS", id = "<SESSIONS_KV_NAMESPACE_ID>", preview_id = "<SESSIONS_KV_PREVIEW_ID>" }
]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<HYPERDRIVE_ID>"
localConnectionString = "postgresql://user:password@host:5432/dbname"

[vars]
NODE_ENV = "production"
SESSION_COOKIE_NAME = "finanzapp_session"
SESSION_TTL_MINUTES = "180"
EMAIL_CODE_TTL_MINUTES = "15"
OPENROUTER_MODEL = "openai/gpt-oss-20b:free"
OPENROUTER_APP_NAME = "FinanzApp"
STOCK_SEARCH_DEFAULT_EXCHANGE = "NASDAQ"
TRUST_PROXY = "true"
FRONTEND_ORIGIN = "https://finanzapp.pages.dev"
```

**Zu ersetzen:**

1. `<SESSIONS_KV_NAMESPACE_ID>` → Production-ID aus Schritt 5.1
2. `<SESSIONS_KV_PREVIEW_ID>` → Preview-ID aus Schritt 5.1
3. `<HYPERDRIVE_ID>` → Hyperdrive-ID aus Schritt 5.2
4. `localConnectionString` → optional belassen oder durch echten Supabase-Session-Pooler-String ersetzen (für `wrangler dev`)
5. `FRONTEND_ORIGIN` → später, nach Pages-Deploy, auf echte URL setzen

> **Niemals** die produktive Datenbank-URL als `localConnectionString` ins Git committen, falls die `wrangler.toml` versioniert wird. Bei sensiblen Repos verwende stattdessen `.dev.vars` mit der Variable `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (genauso heißt der Eintrag im `.dev.vars`-Beispiel des Repos).

### 6.1 Optional: zusätzliche Vars

Falls du `FINZBRO_BOT_EMAIL` oder `OPENROUTER_SITE_URL` projektweit fixieren willst, in `[vars]` ergänzen:

```toml
[vars]
…
OPENROUTER_SITE_URL = "https://finanzapp.pages.dev"
FINZBRO_BOT_EMAIL = "finzbro@finanzapp.local"
```

Sonst werden Defaults aus `backend/src/lib/config.ts` benutzt.

---

## 7. Backend — Secrets setzen

Secrets gehören **nicht** in `wrangler.toml`. Setze sie per CLI:

```bash
cd backend
```

### 7.1 Einzeln (interaktiv)

Jeder Befehl fragt einmal nach dem Wert; einfach einfügen und Enter:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put FINNHUB_API_KEY
npx wrangler secret put LOGO_DEV_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put OPENROUTER_API_KEY_2     # optional, leer lassen falls keiner
npx wrangler secret put CODE_HMAC_SECRET
npx wrangler secret put STOCK_API_KEY            # optional (Reserve)
npx wrangler secret put TWELVE_DATA_API_KEY      # optional (Reserve)
```

### 7.2 Alternativ: Bulk per JSON

Lege lokal eine **NICHT-gecommittete** Datei `backend/.secrets.bulk.json` an:

```json
{
  "SUPABASE_URL": "https://abcd.supabase.co",
  "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGc…",
  "DATABASE_URL": "postgresql://postgres.abcd:…",
  "RESEND_API_KEY": "re_…",
  "EMAIL_FROM": "FinanzApp <noreply@example.com>",
  "FINNHUB_API_KEY": "d8…",
  "LOGO_DEV_API_KEY": "pk_…",
  "OPENROUTER_API_KEY": "sk-or-v1-…",
  "CODE_HMAC_SECRET": "…32+ Zeichen…"
}
```

Hochladen:

```bash
npx wrangler secret bulk .secrets.bulk.json
```

Anschließend **lokale Datei löschen**:

```bash
shred -u .secrets.bulk.json 2>/dev/null || rm -P .secrets.bulk.json
```

### 7.3 Secrets prüfen

```bash
npx wrangler secret list
```

Sollte mindestens diese Namen zeigen (Werte werden NIE angezeigt): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `FINNHUB_API_KEY`, `LOGO_DEV_API_KEY`, `OPENROUTER_API_KEY`, `CODE_HMAC_SECRET`.

---

## 8. Backend — Deploy

### 8.1 Build dry-run (Sanity-Check)

```bash
cd backend
npm install
npm run type-check    # MUSS 0 Fehler haben
npm run build         # tsc --noEmit && wrangler deploy --dry-run --outdir=dist
```

Bei Fehlern: nicht weitermachen. Typ-/Bundling-Fehler werden in Production auch fehlschlagen.

### 8.2 Deploy

```bash
npx wrangler deploy
```

Erwartete Ausgabe (verkürzt):

```
Total Upload: XXX KiB / gzip: XX KiB
Uploaded finanzapp-backend (X.XX sec)
Published finanzapp-backend (X.XX sec)
  https://finanzapp-backend.<deine-subdomain>.workers.dev
Current Version ID: 0123abcd-…
```

Die URL `https://finanzapp-backend.<subdomain>.workers.dev` notieren — sie wird gleich `NEXT_PUBLIC_API_URL` für das Frontend.

### 8.3 Backend-Health-Check

```bash
curl -i "https://finanzapp-backend.<subdomain>.workers.dev/api/auth/session"
```

Erwartet:
- HTTP 200
- `Content-Type: application/json`
- Body: `{"ok":true,"session_user":null,"csrf":"…"}`
- `Set-Cookie: csrf_token=…; …`

Wenn 500: in der Dashboard-UI unter **Workers & Pages → finanzapp-backend → Logs** den realen Fehler ansehen, meist fehlt eine DB-Verbindung oder ein Env-Var.

---

## 9. Frontend — Pages-Projekt erstellen

### 9.1 Pages-Projekt anlegen

```bash
cd "/Users/I767629/Documents/Hochschule/Semester 1/Web-Engineering/FinanzApp/frontend"
npx wrangler pages project create finanzapp \
  --production-branch=main \
  --compatibility-flags=nodejs_compat
```

Output:

```
✨ Successfully created the 'finanzapp' project.
It will be available at https://finanzapp.pages.dev/ once you deploy.
```

> Wenn der Name `finanzapp` belegt ist (global eindeutig auf Cloudflare), nimm z. B. `finanzapp-<dein-namensraum>`. Die resultierende URL ändert sich entsprechend.

### 9.2 Frontend-`wrangler.toml` prüfen

Datei: `frontend/wrangler.toml` (existiert bereits):

```toml
name = "finanzapp-frontend"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".vercel/output/static"

[vars]
NODE_ENV = "production"
```

> Diese Datei wird vom Pages-CLI gelesen, aber `name` darf vom Pages-Projektnamen abweichen — entscheidend ist nur, dass `pages_build_output_dir` stimmt.

### 9.3 Frontend-Env-Variable setzen

Das Frontend muss zur Build-Zeit wissen, wo das Backend lebt — die Variable wird in den JS-Bundle gebrannt:

```bash
npx wrangler pages secret put NEXT_PUBLIC_API_URL --project-name=finanzapp
# Wert eingeben: https://finanzapp-backend.<subdomain>.workers.dev
```

Alternativ in der Dashboard-UI: **Pages → finanzapp → Settings → Environment variables → Production → Add variable**.

> Achtung: `NEXT_PUBLIC_*`-Werte sind **nicht geheim**, sie landen im ausgelieferten JS — trotzdem nutzen wir `secret put`, weil das die einfachste Methode ist, sie für Production-Builds zu setzen.

---

## 10. Frontend — Build + Deploy

### 10.1 Lokal bauen

```bash
cd frontend
npm install
npm run type-check        # MUSS 0 Fehler haben
NEXT_PUBLIC_API_URL="https://finanzapp-backend.<subdomain>.workers.dev" \
  npm run pages:build     # = npx @cloudflare/next-on-pages
```

Output enthält am Ende:

```
⚡️ Build completed successfully!
⚡️ Files in .vercel/output/static
```

### 10.2 Deploy zu Cloudflare Pages

```bash
npx wrangler pages deploy .vercel/output/static \
  --project-name=finanzapp \
  --branch=main
```

Output:

```
✨ Uploading … files
✨ Success! Uploaded XYZ files (Z.ZZ sec)
✨ Compiled Worker successfully
✨ Deployment complete! Take a peek over at https://abcdef12.finanzapp.pages.dev
```

Die Production-URL ist `https://finanzapp.pages.dev` (oder dein Projektname). Die `abcdef12.finanzapp.pages.dev` ist die Preview-Deployment-URL dieser Version.

### 10.3 In einem Schritt (per npm-Script)

Es gibt bereits `npm run deploy`, das beides erledigt:

```bash
NEXT_PUBLIC_API_URL="https://finanzapp-backend.<subdomain>.workers.dev" \
  npm run deploy
```

Was passiert:
1. `npm run pages:build` → `npx @cloudflare/next-on-pages` → erzeugt `.vercel/output/static/`
2. `npx wrangler pages deploy` → lädt zu Cloudflare Pages

---

## 11. Frontend ⇄ Backend verdrahten

Jetzt hast du:

- Backend: `https://finanzapp-backend.<subdomain>.workers.dev`
- Frontend: `https://finanzapp.pages.dev`

Sie kennen sich noch nicht. Zwei Änderungen sind nötig:

### 11.1 Backend muss Frontend-Origin akzeptieren

`backend/wrangler.toml` → `FRONTEND_ORIGIN` setzen auf die echte Frontend-URL:

```toml
[vars]
…
FRONTEND_ORIGIN = "https://finanzapp.pages.dev"
```

Mehrere Origins (z. B. echte Domain + `*.pages.dev`-Preview) gehen mit Komma:

```toml
FRONTEND_ORIGIN = "https://finanzapp.pages.dev,https://finanzapp.example.com"
```

Hinweis: Localhost (`http://localhost:*`) ist **immer** erlaubt (hardcodiert in `backend/src/index.ts`).

Backend neu deployen:

```bash
cd backend && npx wrangler deploy
```

### 11.2 Cookie-Anforderungen für Cross-Origin

Frontend und Backend liegen auf **verschiedenen Origins** (`*.pages.dev` vs `*.workers.dev`). Damit Cookies funktionieren, muss:

1. Frontend `credentials: 'include'` setzen → bereits überall im Code, kein Eingriff nötig.
2. Backend antworten mit:
   - `Access-Control-Allow-Origin: https://finanzapp.pages.dev` (kein Wildcard!) — bereits durch CORS-Middleware
   - `Access-Control-Allow-Credentials: true` — gesetzt
3. Cookies müssen `SameSite=None; Secure` haben. Das geschieht **automatisch in `buildSessionCookie`**, wenn der `secure`-Parameter `true` ist. Damit der Backend das auch tatsächlich `true` setzt, lebt die Worker hinter HTTPS — `*.workers.dev` ist immer HTTPS, also passt das.

> **Wenn du Login-Probleme hast** (Browser blockt Cookie): in DevTools → Network → Login-Request prüfen. `Set-Cookie` muss `Secure; SameSite=None` enthalten und der Browser muss als „Cross-Site Cookie" akzeptiert haben. Bei Firefox „Total Cookie Protection" oder Safari ITP kann das blockiert werden — siehe [Custom Domains](#13-custom-domains-optional) für Same-Site-Setup.

---

## 12. Verifikation: E2E-Smoke-Test

Diese Reihenfolge prüft, dass alle Schichten funktionieren.

### 12.1 Backend-Smoke-Tests via curl

Setze die Variable einmal:

```bash
export API="https://finanzapp-backend.<subdomain>.workers.dev"
```

**Test 1: Session-Endpoint reagiert**

```bash
curl -i "$API/api/auth/session"
```

Erwartet: HTTP 200, `Set-Cookie: csrf_token=…`, Body `{"ok":true,"session_user":null,"csrf":"…"}`.

**Test 2: CORS-Header bei OPTIONS-Preflight**

```bash
curl -i -X OPTIONS "$API/api/auth/login" \
  -H "Origin: https://finanzapp.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-csrf-token"
```

Erwartet:
- `Access-Control-Allow-Origin: https://finanzapp.pages.dev`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, x-csrf-token`

**Test 3: DB-Anbindung — Register**

```bash
curl -i -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "smoketest1",
    "email": "smoketest@example.com",
    "password": "TestPasswort123!",
    "first_name": "Smoke",
    "last_name": "Test"
  }'
```

Erwartet: HTTP 200 mit `{"ok":true,"pending_email":"…","expires_in_seconds":900,"message":"…"}`.

Wenn 500 zurückkommt → meistens DB-Connection. Logs prüfen:

```bash
cd backend && npx wrangler tail
```

**Test 4: E-Mail-Versand prüfen**

Posteingang von `smoketest@example.com` → es sollte ein 6-stelliger Code von Resend kommen. Wenn nicht: `RESEND_API_KEY` / `EMAIL_FROM` falsch oder Domain nicht verifiziert.

### 12.2 Frontend-Smoke-Test

1. https://finanzapp.pages.dev öffnen → Landing-Page lädt.
2. `/login` → Registrierungsformular ausfüllen → Code empfangen → Verifizieren.
3. Eingeloggt → `/dashboard` zeigt leere Übersicht.
4. Konto anlegen → Einnahme erfassen → Konto-Saldo aktualisiert sich.
5. Logout → Re-Login funktioniert.

**Browser-DevTools-Check:**
- **Network-Tab**: Alle `/api/*`-Requests gehen an `finanzapp-backend.workers.dev`, alle haben `cookie` Header und antworten mit 2xx.
- **Application → Cookies**: `csrf_token` (nicht HttpOnly) und `finanzapp_session` (HttpOnly) sind gesetzt, beide `Secure; SameSite=None`.

Wenn alle 5 Schritte funktionieren → Deployment ist erfolgreich.

### 12.3 Live-Logs während Test

In einem zweiten Terminal:

```bash
cd backend && npx wrangler tail
```

zeigt Requests + `console.log/error` Output in Echtzeit. Sehr nützlich für Debugging.

---

## 13. Custom Domains (optional)

Für eine echte Domain (z. B. `finanzapp.de`):

### 13.1 Domain zu Cloudflare hinzufügen

1. Cloudflare-Dashboard → **Websites → Add a Site**.
2. Domain eingeben, Plan **Free** auswählen.
3. Cloudflare zeigt Nameserver — bei deinem Registrar als Nameserver eintragen.
4. Warten, bis Cloudflare den Switch bestätigt (Minuten bis Stunden).

### 13.2 Frontend an Subdomain binden

**Pages-Dashboard → finanzapp → Custom domains → Set up a custom domain**:
- Eingeben: `app.finanzapp.de` (oder `finanzapp.de` für Apex).
- Cloudflare richtet das CNAME automatisch ein.

### 13.3 Backend an Subdomain binden

**Workers-Dashboard → finanzapp-backend → Settings → Triggers → Custom Domains → Add Custom Domain**:
- Eingeben: `api.finanzapp.de`.
- Cloudflare richtet alles ein.

### 13.4 Cookie-Vorteil bei Apex+Subdomain

Wenn Frontend = `app.finanzapp.de` und Backend = `api.finanzapp.de` (gleiche Parent-Domain):

- Browser betrachtet das als **Same-Site** → `SameSite=Lax`-Cookies funktionieren.
- Cookie-Domain auf `.finanzapp.de` setzen würde Cross-Subdomain-Sharing erlauben — die App tut das aktuell **nicht** (jeder Origin hat seinen eigenen Cookie-Scope), was sicherer ist.

### 13.5 Backend-Origins erweitern

```toml
# backend/wrangler.toml
FRONTEND_ORIGIN = "https://app.finanzapp.de,https://finanzapp.pages.dev"
```

Beide URLs erlauben, damit Pages-Preview-Deployments weiter funktionieren.

### 13.6 Frontend-API-URL aktualisieren

```bash
cd frontend
npx wrangler pages secret put NEXT_PUBLIC_API_URL --project-name=finanzapp
# Neuer Wert: https://api.finanzapp.de
```

Dann Frontend neu deployen (Schritt 10).

---

## 14. Updates / Re-Deploy / Rollback

### 14.1 Backend re-deployen

```bash
cd backend
npm run type-check && npx wrangler deploy
```

### 14.2 Frontend re-deployen

```bash
cd frontend
npm run deploy   # NEXT_PUBLIC_API_URL ist als Pages-Secret persistent gesetzt
```

### 14.3 Backend-Rollback

```bash
npx wrangler rollback --message "Rolling back due to incident X"
```

Wrangler listet die letzten 10 Versionen, du wählst eine ältere.

### 14.4 Pages-Rollback

Pages-Dashboard → **finanzapp → Deployments**: jede vorherige Version hat einen **„Rollback to this deployment"**-Button. Ein Klick reicht.

### 14.5 Datenbank-Migrationen (zukünftig)

Neue SQL-Files in `seeds/migrations/<datum>_<beschreibung>.sql` ablegen, idempotent schreiben (`IF NOT EXISTS`, `IF EXISTS`). Im Supabase SQL Editor ausführen, bevor das zugehörige Backend live geht.

---

## 15. Häufige Fehler & Lösungen

| Fehler | Ursache | Fix |
|---|---|---|
| `Error: No database credentials.` | Hyperdrive-Binding fehlt, kein `DATABASE_URL`, kein Supabase-Setup | `wrangler hyperdrive create` ausführen, ID in `wrangler.toml` eintragen, neu deployen |
| `Connection terminated unexpectedly` (DB) | Falscher Pooler-String (Direct statt Session-Pooler) | In Supabase **Session-Pooler** (Port 5432) wählen |
| `[email] Resend error: 401` | `RESEND_API_KEY` fehlt/falsch | `wrangler secret put RESEND_API_KEY` neu setzen |
| `[email] Resend error: 422 "domain not verified"` | `EMAIL_FROM` nutzt unverifizierte Domain | Resend-Dashboard → Domain verifizieren oder `onboarding@resend.dev` als From nutzen (nur an eigene Mail erlaubt) |
| CORS-Fehler im Browser | `FRONTEND_ORIGIN` enthält nicht die Frontend-URL | `wrangler.toml` → `FRONTEND_ORIGIN` ergänzen → re-deploy |
| Login funktioniert, aber nach Reload ist man ausgeloggt | Cookie wird vom Browser blockiert (`SameSite=None` ohne Secure, Cross-Site-Block) | Frontend MUSS HTTPS sein (Pages ist automatisch HTTPS — keine `localhost`-Tests mit prod-Backend) |
| `Method Not Allowed` bei OPTIONS | Preflight wird nicht von Hono CORS-Middleware behandelt | Sollte automatisch funktionieren; prüfen, ob `app.use('*', cors(...))` als ERSTE Middleware geladen wird |
| Stock-Quote leer | `FINNHUB_API_KEY` fehlt | Secret setzen, Worker neu deployen |
| AI-Chat antwortet nicht | `OPENROUTER_API_KEY` Rate-Limited oder fehlt | Zweiten Key als `OPENROUTER_API_KEY_2` setzen, Backend nutzt automatisch Fallback |
| `next-on-pages` schlägt fehl: „edge runtime required" | Eine Route nutzt etwas Node-spezifisches, das die Adapter nicht support | Die App nutzt aktuell keine Server-Routes — falls künftig ja: `export const runtime = 'edge'` setzen |
| `Worker exceeded CPU limit` | Free-Plan: 10 ms CPU pro Request | Auf Workers Paid Plan ($5/Monat → 30 s CPU) upgraden |
| Hyperdrive-Connection failed lokal mit `.hyperdrive.local` | Wrangler-Local-Emulation funktioniert nicht zuverlässig | Code wechselt automatisch auf Supabase-REST — sorge dafür, dass `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars` gesetzt sind |
| Session läuft nach 3 h aus | `SESSION_TTL_MINUTES=180` Default | Höher setzen in `wrangler.toml` `[vars]` |
| `KV namespace "SESSIONS" not found` | KV-ID falsch in `wrangler.toml` | `wrangler kv namespace list` → korrekte ID nachtragen |

### 15.1 Logs lesen

```bash
# Live-Stream
cd backend && npx wrangler tail

# Mit Filter auf Fehler
npx wrangler tail --format pretty --status error
```

### 15.2 Pages-Logs

Pages-Dashboard → **finanzapp → Deployments → [Deployment auswählen] → View build log** für Build-Fehler. Runtime-Logs des Pages-Functions-Workers sind auch unter **Workers & Pages → finanzapp (pages) → Logs** zu sehen.

---

## 16. Anhang: Vollständige Variablen-Referenz

### 16.1 Backend (Cloudflare Workers)

**Bindings (in `wrangler.toml`):**

| Binding | Typ | Pflicht | Zweck |
|---|---|---|---|
| `SESSIONS` | KV Namespace | ✅ | Session-Token-Storage |
| `HYPERDRIVE` | Hyperdrive Config | ✅ (Production) | Postgres-Connection |

**Plain Vars (in `[vars]` — keine Secrets):**

| Variable | Default in `wrangler.toml` | Wo gelesen | Zweck |
|---|---|---|---|
| `NODE_ENV` | `"production"` | überall | Umgebungs-Indikator |
| `SESSION_COOKIE_NAME` | `"finanzapp_session"` | `lib/session.ts`, `config.ts` | Cookie-Name |
| `SESSION_TTL_MINUTES` | `"180"` | `lib/session.ts` | TTL in Minuten |
| `EMAIL_CODE_TTL_MINUTES` | `"15"` | `config.ts` | Code-Gültigkeit |
| `OPENROUTER_MODEL` | `"openai/gpt-oss-20b:free"` | `config.ts` | LLM-Modell |
| `OPENROUTER_APP_NAME` | `"FinanzApp"` | `config.ts` | OpenRouter X-Title |
| `STOCK_SEARCH_DEFAULT_EXCHANGE` | `"NASDAQ"` | `config.ts` | Stock-Suche Default |
| `TRUST_PROXY` | `"true"` | (allg.) | Proxy-Header trust |
| `FRONTEND_ORIGIN` | `"https://finanzapp.pages.dev"` | `index.ts` (CORS) | erlaubte Origins (komma-getrennt) |
| `OPENROUTER_SITE_URL` | (optional) | `config.ts` | OpenRouter HTTP-Referer |
| `FINZBRO_BOT_EMAIL` | (optional) | `routes/questions/` | AI-Bot-User-E-Mail |

**Secrets (per `wrangler secret put` setzen):**

| Variable | Pflicht | Zweck |
|---|---|---|
| `SUPABASE_URL` | ⚠ (oder Hyperdrive) | Supabase-REST (Local-Fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠ (oder Hyperdrive) | Supabase-Auth |
| `DATABASE_URL` | ⚠ (oder Hyperdrive) | Postgres-Fallback (Local) |
| `RESEND_API_KEY` | ✅ | E-Mail-Versand |
| `EMAIL_FROM` | ✅ | From-Adresse |
| `FINNHUB_API_KEY` | ✅ | Stock-Quotes |
| `LOGO_DEV_API_KEY` | ✅ | Firmen-Logos |
| `OPENROUTER_API_KEY` | ✅ | AI-Forum-Chat |
| `OPENROUTER_API_KEY_2` | optional | AI-Fallback-Key |
| `CODE_HMAC_SECRET` | ✅ | HMAC für Codes |
| `STOCK_API_KEY` | optional | Reserve-Stock-API |
| `TWELVE_DATA_API_KEY` | optional | Reserve-Stock-API |

### 16.2 Frontend (Cloudflare Pages)

**Env Vars (per `wrangler pages secret put` oder Dashboard setzen):**

| Variable | Pflicht | Zweck | Beispielwert |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend-Base-URL | `https://finanzapp-backend.example.workers.dev` |

**Plain Vars (in `frontend/wrangler.toml`):**

| Variable | Wert |
|---|---|
| `NODE_ENV` | `"production"` |

---

## 17. Quick-Reference: Vollständige Deploy-Sequenz (Cheat-Sheet)

Falls alles oben einmal funktioniert hat — hier die kondensierte Sequenz für künftige Deploys:

```bash
# ============== EINMALIG ==============
cd backend
npx wrangler login
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --preview
npx wrangler hyperdrive create finanzapp-prod \
  --connection-string="postgresql://postgres.<ref>:<pw>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
# → IDs in wrangler.toml eintragen

npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put FINNHUB_API_KEY
npx wrangler secret put LOGO_DEV_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put CODE_HMAC_SECRET

# In Supabase SQL Editor:
#   seeds/migrations/2026-06-29_groups_expansion.sql ausführen
#   seeds/migrations/2026-06-30_audit_fixes.sql      ausführen

cd ../frontend
npx wrangler pages project create finanzapp \
  --production-branch=main \
  --compatibility-flags=nodejs_compat

# ============== INITIAL DEPLOY ==============
cd backend  && npx wrangler deploy
# → URL notieren: https://finanzapp-backend.<sub>.workers.dev
cd ../frontend
npx wrangler pages secret put NEXT_PUBLIC_API_URL --project-name=finanzapp
# Wert: die Worker-URL von oben
NEXT_PUBLIC_API_URL="https://finanzapp-backend.<sub>.workers.dev" npm run deploy

# Final: backend/wrangler.toml → FRONTEND_ORIGIN auf echte Pages-URL setzen, dann
cd ../backend && npx wrangler deploy

# ============== FUTURE UPDATES ==============
cd backend  && npm run type-check && npx wrangler deploy
cd ../frontend && npm run deploy
```

---

*Diese Anleitung wurde am 2026-06-29 aus einer tiefen Code-Inspektion des Repos abgeleitet. Bei Code-Änderungen, die neue Env-Vars/Bindings einführen, diese Datei mit aktualisieren.*
