# FinanzApp – Personal Finance & Shared WG Cost Manager

FinanzApp is envisioned as a combined personal finance tracker and shared household (WG) expense manager. Each user has private finances and can also participate in shared group expenses. The goal is to keep personal data private while making shared costs transparent and fair.

## Vision
The app supports two distinct areas after login:

Personal Area
- Track your own income, expenses, and savings goals.
- All personal data is visible only to the owner.

Group / WG Area
- Create groups (apartments or shared flats) or join via invitation.
- Record shared costs like rent, utilities, internet, and groceries.
- Automatically split costs fairly across members.

The app should show:
- Who paid what
- How much each member owes or should receive
- A clear monthly and overall summary

## Why It Matters
For individuals:
- Clear overview of personal finances
- Less conflict in shared living situations
- Transparent, auditable cost splitting

## Key Challenges
- User authentication and login
- Groups and roles (creator, member)
- Strict separation between private and shared data
- Database logic for cost splitting and reporting

## Current Status
This repository contains a MongoDB schema setup script for the FinanzApp architecture.  
Running `database/schema-setup.js` creates (or updates) all required collections, validators, and indexes in your Atlas database.

## Project Structure
```text
FinanzApp/
  database/
    schema-setup.js   # creates/updates collections, validators, indexes
    seed-reset.mjs    # deletes current data and inserts upgraded test data
  README.md
  package.json
  package-lock.json
  .env
  .gitignore
```

## Current Data Structure (MongoDB)
All IDs are MongoDB `ObjectId`.  
Money fields (`amount`, `balance`) are stored as integer cents (`Int32`).

### Collections and fields
- `users`
  - `username` (string, unique, required)
  - `created_at` (date, required)
- `wgs` (Wohngemeinschaften)
  - `name` (string, required)
  - `created_at` (date, required)
- `wg_members`
  - `wg_id` (ObjectId -> `wgs._id`, required)
  - `user_id` (ObjectId -> `users._id`, required)
  - `role` (string, required)
  - `joined_at` (date, required)
  - unique index on (`wg_id`, `user_id`)
- `bank_accounts`
  - `user_id` (ObjectId -> `users._id`, required)
  - `wg_id` (ObjectId -> `wgs._id`, nullable)
  - `balance` (int, required)
  - `currency` (string length 3, required)
  - `created_at` (date, required)
  - unique index on (`user_id`, `wg_id`)
- `transactions`
  - `from_user_id` (ObjectId -> `users._id`, required)
  - `to_user_id` (ObjectId -> `users._id`, required)
  - `wg_id` (ObjectId -> `wgs._id`, nullable)
  - `amount` (int, required)
  - `currency` (string length 3, required)
  - `expense_id` (ObjectId -> `expenses._id`, nullable)
  - `created_at` (date, required)
- `requests`
  - `from_user_id` (ObjectId -> `users._id`, required)
  - `to_user_id` (ObjectId -> `users._id`, required)
  - `wg_id` (ObjectId -> `wgs._id`, nullable)
  - `amount` (int, required)
  - `currency` (string length 3, required)
  - `due_date` (date, required)
  - `status` (enum: `pending`, `accepted`, `rejected`, `paid`, required)
  - `created_at` (date, required)
- `expenses`
  - `wg_id` (ObjectId -> `wgs._id`, required)
  - `paid_by_user_id` (ObjectId -> `users._id`, required)
  - `amount` (int, required)
  - `currency` (string length 3, required)
  - `info` (string, required)
  - `category` (string, required)
  - `due_date` (date, required)
  - `created_at` (date, required)
- `expense_shares`
  - `expense_id` (ObjectId -> `expenses._id`, required)
  - `user_id` (ObjectId -> `users._id`, required)
  - `amount` (int, required)
  - `is_settled` (bool, required)
  - `settled_at` (date, nullable)
  - unique index on (`expense_id`, `user_id`)

### Relation overview
- One user can be in many WGs through `wg_members`
- One WG has many members through `wg_members`
- `transactions`, `requests`, `expenses`, and `expense_shares` reference users/WGs/expenses by `ObjectId`
- MongoDB does not enforce foreign keys automatically; referential integrity must be handled in application logic

## Tech Stack
- Backend: JavaScript (Node.js) with a NoSQL database (MongoDB)
- Frontend: Classic web stack (HTML, CSS, JavaScript)
- Application logic: JavaScript

## Next Steps (Planned)
- Define data models for users, groups, expenses, and splits
- Build authentication (signup/login)
- Add APIs for personal transactions and group expenses
- Implement reporting (monthly/overall summaries)
- Add basic UI

## Development Setup (Current)
### Prerequisites
- Node.js 18+ recommended
- A MongoDB Atlas cluster and connection URI

### Install
```bash
npm install mongodb dotenv
```

### Configure
Create a `.env` file in the project root with your MongoDB URI:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-host>/?appName=FinanzApp"
MONGODB_DB="finanzapp"
```

### Run schema setup
```bash
npm run schema:setup
```

You should see logs for:
- collection creation/validator updates
- index creation
- final schema setup confirmation

No sample records are inserted by this script.

### Import test data
```bash
npm run import:testdata
```

This script clears existing documents in the app collections and inserts linked test data for:
- users
- wgs
- wg_members
- bank_accounts
- expenses
- expense_shares
- requests
- transactions
