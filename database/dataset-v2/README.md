# Dataset V2 🧬📚

Legacy-kompatibler Datensatz mit älterer Modellstruktur.

## Status 🚦
- Weiterhin nutzbar über `*:v2` Skripte ✅
- Nicht der zentrale Runtime-Standard ❗
- Standard-Runtime der App ist v4 (`MONGODB_DB_V4` oder `${MONGODB_DB}_v4`) 🧠

## Enthalten 📦
- Schema: `schema.dbml`
- Setup: `schema-setup.js`
- Seed: `seed-reset.mjs`
- Wipe/Check/Prepare Tools 🔧

## DB-Name 🗄️
- `MONGODB_DB_V2` oder `${MONGODB_DB}_v2`

## Nutzung (vom Repo-Root) ▶️
1. `npm run schema:setup:v2`
2. `npm run seed:reset:v2`
3. `npm run data:prepare:v2`

Optional:
- `npm run db:check:v2`
- `npm run db:wipe:v2`

## Datenstruktur (aktueller Gesamtstand) 🧭🗂️
![Aktuelle Datenstruktur](../../Datastructure.png)
