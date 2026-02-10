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
This repository currently contains a small Node.js script that connects to MongoDB Atlas, inserts a sample user, and lists all users. It serves as a starting point for database connectivity.

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
```

### Run
```bash
node index.js
```

You should see a "Connected to MongoDB!" message and the list of users.
