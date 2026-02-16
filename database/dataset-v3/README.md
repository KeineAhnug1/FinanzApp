# Dataset V3

This folder contains the v3 MongoDB schema, seed data, and data preparation logic for FinanzApp.

## Scope

V3 introduces the updated structure with:
- `income` collection
- `depots` collection
- bank-account-based links for `private_expenses` and `requests`
- updated `funding_participants` relation (`bank_account_id`)
- `transactions` with exactly one source reference

Schema reference:
- `database/dataset-v3/schema.dbml`
- `database/dataset-v3/schema-setup.js`

## Files

- `schema-setup.js`: create/update validators and indexes
- `seed-reset.mjs`: clear and reseed v3 demo data
- `wipe-data.mjs`: wipe all documents in v3 DB collections
- `check-connection.mjs`: ping DB and print status JSON
- `prepare-data.mjs`: output normalized, app-ready JSON
- `data-service.mjs`: query and reshape data for preparation
- `entity-factory.mjs`: typed entity constructors and normalization helpers
- `db-client.mjs`: shared DB connection utilities

## Database Name

- Uses `MONGODB_DB_V3` if present.
- Otherwise defaults to `${MONGODB_DB}_v3`.

## Usage (repo root)

1. `npm run schema:setup:v3`
2. `npm run seed:reset:v3`
3. `npm run data:prepare:v3`

Optional:
- `npm run db:check:v3`
- `npm run db:wipe:v3`

## Notes

- Money fields are stored as `Decimal128`.
- The seed script validates schema compatibility before inserting data.
- Existing app runtime still targets v2 by default unless changed separately.
