# FinanzApp (MongoDB demo)

Small Node.js script that connects to MongoDB Atlas, inserts a sample user, and lists all users.

## Prerequisites
- Node.js 18+ recommended
- A MongoDB Atlas cluster and connection URI

## Setup
1. Install dependencies:

```bash
npm install mongodb dotenv
```

2. Create a `.env` file in the project root with your MongoDB URI:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-host>/?appName=FinanzApp"
```

## Run
```bash
node index.js
```

You should see a "Connected to MongoDB!" message and the list of users.
