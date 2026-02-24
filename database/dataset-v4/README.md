# Dataset V4

This folder contains the v4 MongoDB schema, seed data, and data preparation logic for FinanzApp.

## Scope

V4 keeps the v3 finance model and adds social/Q&A collections:
- `private_message`
- `group_message`
- `global_questions`
- `question_likes`
- `global_answers`
- `answer_likes`

`transactions` still enforce exactly one source reference:
- `request_id` OR `private_expense_id` OR `group_expense_id` OR `funding_participant_id` OR `income_id`

Schema reference:
- `database/dataset-v4/schema.dbml`
- `database/dataset-v4/schema-setup.js`

## Files

- `schema-setup.js`: create/update validators and indexes
- `seed-reset.mjs`: clear and reseed v4 demo data
- `wipe-data.mjs`: wipe all documents in v4 DB collections
- `check-connection.mjs`: ping DB and print status JSON
- `prepare-data.mjs`: output normalized, app-ready JSON
- `data-service.mjs`: query and reshape data for preparation
- `entity-factory.mjs`: typed entity constructors and normalization helpers
- `db-client.mjs`: shared DB connection utilities

## Database Name

- Uses `MONGODB_DB_V4` if present.
- Otherwise defaults to `${MONGODB_DB}_v4`.

## Usage (repo root)

1. `npm run schema:setup:v4`
2. `npm run seed:reset:v4`
3. `npm run data:prepare:v4`

Optional:
- `npm run db:check:v4`
- `npm run db:wipe:v4`

## Notes

- Money fields are stored as `Decimal128`.
- The seed script validates schema compatibility before inserting data.
