# FinanzApp - Personal Finance and Shared Group Cost Manager

FinanzApp combines personal finance tracking with shared group expense management. This repository contains the MongoDB schema setup and seed scripts aligned to the new DBML v2 structure.

## Project Structure
```text
FinanzApp/
  database/
    schema.dbml        # canonical DBML v2 schema
    schema-setup.js    # creates/updates MongoDB collections, validators, indexes
    seed-reset.mjs     # clears and re-inserts linked test data for all collections
    wipe-data.mjs      # deletes all documents from all non-system collections
  README.md
  Datastructure.png
  package.json
  package-lock.json
  .env
```

## Data Model (DBML v2)
Collections and fields now follow this structure:
- `users`
- `groups`
- `group_members`
- `bank_accounts`
- `expenses`
- `expense_shares`
- `requests`
- `transactions`
- `shares`
- `budget`

Key updates from previous schema:
- Money fields use MongoDB `Decimal128` values to model DBML decimals (`decimal(12,2)` / `decimal(12,4)`).
- Naming consistency fixed (`groups`, `group_members`, `address`, `first_name`, `last_name`, `expense_share_id`, `bank_account_id`).
- `transactions` enforces exactly one source (`request_id` XOR `expense_share_id`).
- Added `budget` collection.
- Added/updated validators, indexes, and uniqueness constraints in MongoDB setup.

## Data Structure Diagram
Reference image file: `Datastructure.png`

![FinanzApp data structure](./Datastructure.png)

## Full Schema Text (for context sharing)
```dbml
Table users {
  id int [pk, increment]
  username varchar [not null, unique]
  email varchar [not null, unique]
  password varchar [not null]
  first_name varchar [not null]
  last_name varchar [not null]
  age int
  income decimal(12,2) [not null, default: 0]
  created_at timestamp [not null]
}

Table groups {
  id int [pk, increment]
  name varchar [not null]
  address varchar
  created_at timestamp [not null]
}

Table group_members {
  id int [pk, increment]
  group_id int [not null]
  user_id int [not null]
  role varchar [not null]
  joined_at timestamp [not null]
}

Table bank_accounts {
  id int [pk, increment]
  user_id int [not null]
  balance decimal(12,2) [not null, default: 0]
  created_at timestamp [not null]
}

Table expenses {
  id int [pk, increment]
  amount decimal(12,2) [not null]
  info text
  category varchar
  due_date timestamp
  group_id int
  repeating bool
  cycle_date timestamp
  created_at timestamp [not null]
}

Table expense_shares {
  id int [pk, increment]
  expense_id int [not null]
  user_id int [not null]
  theo_amount decimal(12,2) [not null]
  is_settled bool [not null, default: false]
  settled_at timestamp [null]
}

Table requests {
  id int [pk, increment]
  from_user_id int [not null]
  to_user_id int [not null]
  expense_share_id int
  amount decimal(12,2) [not null]
  due_date timestamp
  info varchar
  category varchar
  status varchar [not null]
  created_at timestamp [not null]
}

Table transactions {
  id int [pk, increment]
  amount decimal(12,2) [not null]
  request_id int
  expense_share_id int
  created_at timestamp [not null]
}

Table shares {
  id int [pk, increment]
  bank_account_id int [not null]
  symbol varchar [not null]
  units decimal(12,4) [not null]
  bought_at timestamp [not null]
  bought_for decimal(12,2) [not null]
}

Table budget {
  id int [pk, increment]
  user_id int [not null]
  category varchar
  target_amount decimal(12,2) [not null]
  current_amount decimal(12,2) [not null]
  cycle_date timestamp
  created_at timestamp [not null]
}

Ref: group_members.group_id > groups.id
Ref: group_members.user_id > users.id

Ref: expenses.group_id > groups.id

Ref: budget.user_id > users.id

Ref: bank_accounts.user_id > users.id

Ref: expense_shares.expense_id > expenses.id
Ref: expense_shares.user_id > users.id

Ref: requests.from_user_id > users.id
Ref: requests.to_user_id > users.id
Ref: requests.expense_share_id > expense_shares.id

Ref: transactions.request_id > requests.id
Ref: transactions.expense_share_id > expense_shares.id

Ref: shares.bank_account_id > bank_accounts.id
```

## MongoDB Notes
MongoDB does not enforce relational foreign keys. This project enforces structure through:
- collection validators
- indexes (including unique composite indexes)
- application logic for referential integrity

`transactions` source rule is enforced in validator with `oneOf`:
- `request_id` is present as `ObjectId` and `expense_share_id` is absent
- or `expense_share_id` is present as `ObjectId` and `request_id` is absent

## Implemented Constraints and Indexes
Implemented in `database/schema-setup.js`:

- `users`
  - unique: `username`, `email`
- `groups`
  - index: `name`
- `group_members`
  - unique composite: `(group_id, user_id)`
  - indexes: `user_id`, `group_id`
- `bank_accounts`
  - index: `user_id`
- `expenses`
  - indexes: `(group_id, due_date)`, `category`, `created_at desc`
- `expense_shares`
  - unique composite: `(expense_id, user_id)`
  - indexes: `(user_id, is_settled)`, `expense_id`
- `requests`
  - indexes: `(from_user_id, to_user_id, status)`, `expense_share_id`, `(due_date, status)`
- `transactions`
  - validator constraint: exactly one of `request_id` or `expense_share_id`
  - indexes: `request_id`, `expense_share_id`, `created_at desc`
- `shares`
  - indexes: `bank_account_id`, `symbol`
- `budget`
  - indexes: `(user_id, category)`, `cycle_date`

## Setup
### Prerequisites
- Node.js 18+
- MongoDB Atlas cluster (or compatible MongoDB URI)

### Install dependencies
```bash
npm install
```

### Configure environment
Create `.env` in the project root:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-host>/?appName=FinanzApp"
MONGODB_DB="finanzapp"
```

### Apply schema
```bash
npm run schema:setup
```

### Reset and import test data
```bash
npm run seed:reset
```

(Equivalent command: `npm run import:testdata`)

### Wipe all database data
```bash
npm run db:wipe
```

This removes all documents from all non-system collections in `MONGODB_DB` while keeping collections, validators, and indexes.
