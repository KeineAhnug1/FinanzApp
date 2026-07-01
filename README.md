# FinanzApp

Persönliche Finanz-Webapp mit Dashboard, Konten- und Budget-Verwaltung, Aktien-Depot mit Live-Kursen, Gruppen-Funktionen (geteilte Ausgaben, Ausflüge, Sammelaktionen, Chat) und einem Forum mit KI-Assistent.

**Live:** [fbm-finance.com](https://fbm-finance.com)

**Stack:** Next.js 15 · React 19 · Hono auf Cloudflare Workers · TypeScript strict · Supabase Postgres

---

## Lokal starten



### Schritt 1 — Repo klonen und Abhängigkeiten installieren

```bash
git clone https://github.com/KeineAhnug1/FinanzApp.git
cd FinanzApp
npm run install:all
```

### Schritt 2 — Backend-Konfiguration

`backend/.dev.vars.example` kopieren und ausfüllen:

```bash
cp backend/.dev.vars.example backend/.dev.vars
```

Dann `backend/.dev.vars` öffnen und die API-Keys eintragen (`BREVO_API_KEY`, `FINNHUB_API_KEY`, `OPENROUTER_API_KEY`, `LOGO_DEV_API_KEY`). Jede Variable ist in der Datei selbst erklärt — inkl. wo man den Wert bekommt und was passiert, wenn sie fehlt.

### Schritt 3 — Frontend-Konfiguration

```bash
cp frontend/.env.local.example frontend/.env.local
```

Die Default-Werte (`NEXT_PUBLIC_API_URL=http://localhost:8787`) passen schon — nur ändern, wenn das Backend auf einem anderen Port läuft.

### Schritt 4 — Starten

```bash
npm start
```

Das startet Frontend und Backend gleichzeitig:

| Service  | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:4000    |
| Backend  | http://localhost:8787    |

Im Browser http://localhost:4000 öffnen. Bei der Registrierung wird der 6-stellige Code per E-Mail an die angegebene Adresse geschickt.

---

## Befehle

```bash
npm start                # Frontend + Backend gleichzeitig
npm run type-check       # TypeScript-Check für beide Pakete
npm run build            # Production-Build
```

---

## Mehr Doku

- **Architektur, alle API-Endpoints, DB-Schema** — siehe Repo-interne Doku
- **Deployment auf Cloudflare** — Frontend -> Pages, Backend -> Workers, Domain -> fbm-finance.com
