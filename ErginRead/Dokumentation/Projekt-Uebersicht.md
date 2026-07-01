# Projekt-Übersicht

**FBM FinanzApp** — Personal-Finance-Webanwendung.

## Features

- Mehrkonten-Verwaltung (Giro, Sparen, Aktiendepot)
- Einnahmen/Ausgaben mit Kategorien, Wiederholungen, Budget-Alerts
- Aktien-Portfolio mit Live-Kursen und FX-Umrechnung
- Gruppen: geteilte Ausgaben, Trips (Min-Cash-Flow-Settlement), Sammelaktionen
- Peer-Transfers zwischen Nutzern
- Forum mit KI-Assistenz (Finzbro)
- Auth mit E-Mail-Verifizierung, HttpOnly-Session-Cookies, CSRF-Schutz

## Stack

| Layer | Technologie |
|---|---|
| Frontend | Next.js 15 · React 19 · TypeScript strict |
| State | Zustand + TanStack Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Backend | Hono auf Cloudflare Workers |
| DB | Supabase Postgres über Cloudflare Hyperdrive |
| Sessions | Cloudflare KV |
| E-Mail | Brevo |

## Repo-Struktur

```
FinanzApp/
├── frontend/    Next.js-App (Cloudflare Pages)
├── backend/     Hono-Worker (Cloudflare Workers)
├── seeds/       SQL-Migrationen
└── package.json Root-Runner (npm start → beide parallel)
```

## Ports lokal

| Service | Port |
|---|---|
| Frontend | 4000 |
| Backend  | 8787 |
