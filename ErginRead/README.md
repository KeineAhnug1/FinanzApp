# Für Ergin

Willkommen. Diese Sammlung fasst die wichtigsten Infos zum Projekt kompakt zusammen.

## Struktur

```
ErginRead/
├── README.md
├── Datenschema.sql
├── Dokumentation/
│   ├── Projekt-Uebersicht.md
│   └── Docker.md
└── Entwicklung/
    ├── datenbankschema-aktuell.png
    ├── design-erst.png
    ├── design-final.png
    └── design-aktuell.png
```

## Was wo?

| Frage | Datei |
|---|---|
| Was macht das Projekt? | [Dokumentation/Projekt-Uebersicht.md](./Dokumentation/Projekt-Uebersicht.md) |
| Wie sieht die DB aus? | [Datenschema.sql](./Datenschema.sql) und [Entwicklung/datenbankschema-aktuell.png](./Entwicklung/datenbankschema-aktuell.png) |
| Wie hat sich das Design entwickelt? | [Entwicklung/](./Entwicklung/) — `design-erst` → `design-final` → `design-aktuell` |
| Kann ich das in Docker laufen lassen? | [Dokumentation/Docker.md](./Dokumentation/Docker.md) — nur Frontend, Backend ist ein Cloudflare Worker |
| Wie deploye ich das? | Siehe die globale `README.md` im Repo-Root |

## Stack (kurz)

- **Frontend:** Next.js 15 + React 19 + TypeScript
- **Backend:** Hono auf Cloudflare Workers
- **DB:** Supabase Postgres
- **Sessions:** Cloudflare KV
- **E-Mail:** Brevo

## Login (Demo)

**Dieser User ist mit Daten gefüllt.**

| Feld | Wert |
|---|---|
| Email | `demo@finanzapp.test` |
| Passwort | `Test1234!` |
