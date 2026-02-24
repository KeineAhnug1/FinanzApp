# FinanzApp

Diese README beschreibt **genau**, wie du das Projekt lokal startest.

## Was ist enthalten?
- Zentrales Backend: `backend/server.mjs`
- Frontends:
  - Login: `/`
  - Dashboard: `/dashboard.html`
  - Groups: `/groups/`
  - Aktien: `/aktien/`
- MongoDB-Datenmodell + Seed-Skripte unter `database/`

Wichtig: Es gibt nur noch **einen** Serverprozess für alles.

---

## 1) Voraussetzungen

Du brauchst:
1. Node.js 18+
2. Eine laufende MongoDB (Atlas oder lokal)
3. Eine `.env` im Projekt-Root

---

## 2) Installation

Im Projektordner:

```bash
npm install
```

Warum? Installiert alle Abhängigkeiten (`mongodb`, `dotenv`, `nodemailer`, ...).

---

## 3) `.env` anlegen

Datei: `.env` im Root von `FinanzApp`.

Minimal:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-host>/?appName=FinanzApp"
MONGODB_DB="finanzapp"
```

Empfohlen/optional:

```env
# v4 ist Standard-Datenbankname im Projekt
MONGODB_DB_V4="finanzapp_v4"

# Sessiondauer in Minuten (Default: 180)
SESSION_TTL_MINUTES="180"

# Fuer Aktienkurs-Proxy
TWELVE_DATA_API_KEY="<dein_key>"

# Optional fuer Mail-Verifizierung (sonst nur Server-Log)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
EMAIL_CODE_TTL_MINUTES="15"
DEV_EXPOSE_VERIFICATION_CODE="true"
```

Warum? Ohne `MONGODB_URI` kann der Server nicht starten.

---

## 4) Datenbank vorbereiten (einmalig oder bei Reset)

### Schema/Validatoren/Indizes anlegen
```bash
npm run schema:setup
```

### Testdaten einspielen
```bash
npm run seed:reset
```

Warum? Danach hast du sofort nutzbare User, Gruppen, Konten und Aktienpositionen.

---

## 5) App starten

```bash
npm run backend:start
```

Dann im Browser:
- Login: `http://localhost:3000/`
- Dashboard: `http://localhost:3000/dashboard.html`
- Groups: `http://localhost:3000/groups/`
- Aktien: `http://localhost:3000/aktien/`

---

## 6) Login / Session-Verhalten

- Login erzeugt eine Cookie-Session (`HttpOnly`, `SameSite=Lax`).
- Ohne Session kommst du **nicht** auf Dashboard/Groups/Aktien.
- Ungueltige/abgelaufene Session -> Redirect auf Login (`/`).
- Logout entfernt Session (`/api/logout`).

---

## 7) Seed-Logins (nach `seed:reset`)

- `anna@example.com` / `anna_pw_hash`
- `ben@example.com` / `ben_pw_hash`
- `clara@example.com` / `clara_pw_hash`
- `emre@example.com` / `emre_pw_hash`
- `farah@example.com` / `farah_pw_hash`

Optionaler Demo-Account mit langer Historie:

```bash
npm run seed:family-demo
```

Login:
- `familienvater.dev@example.com` / `FamilieDev2026!`

---

## 8) Nützliche Skripte

- `npm run backend:start` -> Startet den zentralen Server
- `npm run schema:setup` -> Erstellt Collections/Validatoren/Indizes
- `npm run seed:reset` -> Setzt v4-Testdaten neu
- `npm run db:check` -> Testet DB-Verbindung
- `npm run db:wipe` -> Leert App-Daten (Struktur bleibt)
- `npm run data:prepare` -> Gibt aufbereitete Daten aus

Legacy/v2-spezifische Skripte stehen ebenfalls in `package.json`.

---

## 9) Häufige Fehler und Lösung

### Server startet nicht: `MONGODB_URI is not set`
- `.env` fehlt oder Variable falsch geschrieben.

### Login klappt, aber Seite bleibt leer/ohne Styles
- Hard reload im Browser (`Cmd+Shift+R`).
- Prüfen, ob der zentrale Server läuft (`npm run backend:start`).

### Auf Dashboard/Groups/Aktien kommt sofort Redirect auf Login
- Session fehlt/abgelaufen -> neu einloggen.

### Keine Aktienkurse
- `TWELVE_DATA_API_KEY` fehlt oder API-Limit erreicht.

---

## 10) Projektstruktur (relevant)

```text
FinanzApp/
  backend/
    server.mjs
  uebersicht/
    index.html
    dashboard.html
  groups/
    index.html
  aktien/
    ShareView.html
    css/ShareView.css
    js/ShareView.js
  shared/
    unified-ui.css
    topbar.js
  database/
    dataset-v4/
      schema-setup.js
      seed-reset.mjs
  package.json
  .env
```

Wenn du möchtest, kann ich als nächsten Schritt eine zweite README `README-DEV.md` ergänzen (nur für Entwickler mit API-Endpunkten und Datenmodell-Details).

---

## 11) Aufgeraeumte Struktur (Refactor)

Das Projekt wurde strukturell bereinigt:

- `backend/`
  - aktiver zentraler Server (`server.mjs`)
- `shared/`
  - gemeinsame UI/CSS (`unified-ui.css`)
  - gemeinsame Browser-JS (`shared/js/*`)
- `legacy/`
  - alte, nicht mehr aktive Server-Dateien (nur Referenz)

Aktive Shared-JS-Dateien:
- `shared/js/theme-utils.js`
- `shared/js/session-utils.js`
- `shared/topbar.js`

Diese Shared-Dateien werden von mehreren Seiten genutzt, damit Funktionen nicht mehrfach gepflegt werden muessen.
