# Dataset V3 🧬📘

Zwischenversion des Datenschemas zwischen v2 und v4.

## Status 🚦
- Weiterhin über `*:v3` Skripte verfügbar ✅
- Nicht der zentrale Runtime-Standard ❗
- App-Standard ist v4 (`MONGODB_DB_V4` oder `${MONGODB_DB}_v4`) 🚀

## Scope 🧩
- `income`
- `depots`
- `private_expenses`/`requests` mit `bank_account_id`
- `funding_participants` mit `bank_account_id`
- `transactions` mit genau einer Source-Referenz

## Dateien 📁
- `schema.dbml`
- `schema-setup.js`
- `seed-reset.mjs`
- `wipe-data.mjs`
- `check-connection.mjs`
- `prepare-data.mjs`
- `data-service.mjs`
- `entity-factory.mjs`
- `db-client.mjs`

## DB-Name 🗄️
- `MONGODB_DB_V3` oder `${MONGODB_DB}_v3`

## Nutzung (vom Repo-Root) ▶️
1. `npm run schema:setup:v3`
2. `npm run seed:reset:v3`
3. `npm run data:prepare:v3`

Optional:
- `npm run db:check:v3`
- `npm run db:wipe:v3`

## Datenstruktur (aktueller Gesamtstand) 🧭🗂️
![Aktuelle Datenstruktur](../../Datastructure.png)
