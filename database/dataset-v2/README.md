# Dataset V2

This folder contains the v2 MongoDB schema, seed data, and data preparation logic for FinanzApp.

## Purpose

V2 replaces the older mixed expense model with a clearer split between:
- private user expenses
- group funding and group expenses

It also keeps membership status handling for group invitations while allowing nullable status values.

## Main Differences vs Legacy

- `expenses` is split into:
  - `private_expenses`
  - `group_expenses` (linked through `group_funding`)
- `budget` is renamed to `budgets`.
- `group_members` keeps `status` support (`invited`, `denied`, `accepted`) instead of `joined_at`.
- `transactions` supports exactly one source:
  - `request_id` or
  - `private_expense_id` or
  - `group_expense_id`
- Additional group-specific collections:
  - `group_funding`
  - `funding_participants`
  - `group_activities`

## Collection Overview

- `users`: account identity/profile
- `groups`: group metadata
- `group_members`: user/group membership with role + status
- `bank_accounts`: account balance per user
- `private_expenses`: personal expenses
- `group_funding`: funding buckets for a group (optional link to `group_activities`)
- `funding_participants`: member participation in a funding bucket
- `group_expenses`: expenses paid from group funding
- `requests`: payment requests between users (optional link to private expense)
- `transactions`: settled money movement (exactly one source reference)
- `shares`: stock holdings linked to bank account
- `budgets`: budgeting targets/current values per user/category
- `group_activities`: group timeline/events

Schema reference:
- `database/dataset-v2/schema.dbml`
- `database/dataset-v2/schema-setup.js`

## Scripts in This Folder

- `schema-setup.js`: create/update validators and indexes
- `seed-reset.mjs`: clear and reseed v2 demo data
- `wipe-data.mjs`: wipe all documents in v2 DB collections
- `check-connection.mjs`: ping DB and print status JSON
- `prepare-data.mjs`: output normalized, app-ready JSON
- `data-service.mjs`: query and reshape data for preparation
- `entity-factory.mjs`: typed entity constructors and normalization helpers
- `db-client.mjs`: shared DB connection utilities

## Expected Database Name

- Uses `MONGODB_DB_V2` if present.
- Otherwise defaults to `${MONGODB_DB}_v2`.

## Recommended Usage (from repo root)

1. `npm run schema:setup:v2`
2. `npm run seed:reset:v2`
3. `npm run data:prepare:v2`

Optional:
- `npm run db:check:v2`
- `npm run db:wipe:v2`

## Notes

- Money fields are stored as `Decimal128`.
- The seed script validates schema compatibility before inserting data.
- V2 is the dataset expected by the `groups/` app.
