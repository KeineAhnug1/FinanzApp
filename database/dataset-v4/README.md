# Dataset V4 🚀🧬✅

Aktueller Standard-Datensatz der FinanzApp.

## Scope 🧩
V4 enthält Finanzmodell + Social/Q&A:
- `private_message`
- `group_message`
- `global_questions`
- `question_likes`
- `global_answers`
- `answer_likes`

`transactions` erzwingt genau eine Quelle:
- `request_id` ODER
- `private_expense_id` ODER
- `group_expense_id` ODER
- `funding_participant_id` ODER
- `income_id`

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
- `MONGODB_DB_V4` oder `${MONGODB_DB}_v4`

## Nutzung (vom Repo-Root) ▶️
1. `npm run schema:setup:v4`
2. `npm run seed:reset:v4`
3. `npm run data:prepare:v4`

Optional:
- `npm run db:check:v4`
- `npm run db:wipe:v4`

## Datenstruktur (aktueller Stand) 🧭🗂️
![Aktuelle Datenstruktur](../../Datastructure.png)
