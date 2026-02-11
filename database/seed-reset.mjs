import "dotenv/config";
import { MongoClient, ObjectId, Int32 } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI env var.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "finanzapp";
const client = new MongoClient(uri);

const money = (value) => new Int32(value);

const ids = {
  users: {
    anna: new ObjectId("65f100000000000000000001"),
    ben: new ObjectId("65f100000000000000000002"),
    clara: new ObjectId("65f100000000000000000003"),
    emre: new ObjectId("65f100000000000000000004"),
    farah: new ObjectId("65f100000000000000000005")
  },
  wgs: {
    sonnenallee: new ObjectId("65f200000000000000000001"),
    neckarstadt: new ObjectId("65f200000000000000000002"),
    barcelonaTrip: new ObjectId("65f200000000000000000003")
  },
  bank_accounts: {
    anna: new ObjectId("65f210000000000000000001"),
    ben: new ObjectId("65f210000000000000000002"),
    clara: new ObjectId("65f210000000000000000003"),
    emre: new ObjectId("65f210000000000000000004"),
    farah: new ObjectId("65f210000000000000000005")
  },
  expenses: {
    rentJan: new ObjectId("65f300000000000000000001"),
    internetJan: new ObjectId("65f300000000000000000002"),
    groceriesWeek2: new ObjectId("65f300000000000000000003"),
    electricityJan: new ObjectId("65f300000000000000000004"),
    flights: new ObjectId("65f300000000000000000005")
  },
  expense_shares: {
    rentAnna: new ObjectId("65f310000000000000000001"),
    rentBen: new ObjectId("65f310000000000000000002"),
    rentClara: new ObjectId("65f310000000000000000003"),
    internetAnna: new ObjectId("65f310000000000000000004"),
    internetBen: new ObjectId("65f310000000000000000005"),
    internetClara: new ObjectId("65f310000000000000000006"),
    electricityEmre: new ObjectId("65f310000000000000000007"),
    electricityFarah: new ObjectId("65f310000000000000000008")
  },
  requests: {
    annaToClara: new ObjectId("65f320000000000000000001"),
    farahToBen: new ObjectId("65f320000000000000000002"),
    emreToAnna: new ObjectId("65f320000000000000000003"),
    claraToBen: new ObjectId("65f320000000000000000004")
  }
};

const createdAt = new Date("2026-01-01T09:00:00.000Z");

const data = {
  users: [
    {
      _id: ids.users.anna,
      username: "anna",
      email: "anna@example.com",
      password: "anna_pw_hash",
      firstname: "Anna",
      lastname: "Schmidt",
      age: new Int32(24),
      created_at: createdAt
    },
    {
      _id: ids.users.ben,
      username: "ben",
      email: "ben@example.com",
      password: "ben_pw_hash",
      firstname: "Ben",
      lastname: "Keller",
      age: new Int32(26),
      created_at: createdAt
    },
    {
      _id: ids.users.clara,
      username: "clara",
      email: "clara@example.com",
      password: "clara_pw_hash",
      firstname: "Clara",
      lastname: "Weber",
      age: new Int32(23),
      created_at: createdAt
    },
    {
      _id: ids.users.emre,
      username: "emre",
      email: "emre@example.com",
      password: "emre_pw_hash",
      firstname: "Emre",
      lastname: "Yilmaz",
      age: new Int32(27),
      created_at: createdAt
    },
    {
      _id: ids.users.farah,
      username: "farah",
      email: "farah@example.com",
      password: "farah_pw_hash",
      firstname: "Farah",
      lastname: "Ali",
      age: new Int32(25),
      created_at: createdAt
    }
  ],
  wgs: [
    {
      _id: ids.wgs.sonnenallee,
      name: "WG Sonnenallee Berlin",
      adress: "Sonnenallee 110, Berlin",
      created_at: createdAt
    },
    {
      _id: ids.wgs.neckarstadt,
      name: "WG Neckarstadt Mannheim",
      adress: "Mittelstrasse 8, Mannheim",
      created_at: createdAt
    },
    {
      _id: ids.wgs.barcelonaTrip,
      name: "Urlaubs-WG Barcelona",
      adress: "Carrer de Mallorca 220, Barcelona",
      created_at: createdAt
    }
  ],
  wg_members: [
    {
      wg_id: ids.wgs.sonnenallee,
      user_id: ids.users.anna,
      role: "admin",
      joined_at: new Date("2026-01-01T10:00:00.000Z")
    },
    {
      wg_id: ids.wgs.sonnenallee,
      user_id: ids.users.ben,
      role: "member",
      joined_at: new Date("2026-01-01T10:05:00.000Z")
    },
    {
      wg_id: ids.wgs.sonnenallee,
      user_id: ids.users.clara,
      role: "member",
      joined_at: new Date("2026-01-01T10:10:00.000Z")
    },
    {
      wg_id: ids.wgs.neckarstadt,
      user_id: ids.users.emre,
      role: "admin",
      joined_at: new Date("2026-01-03T09:00:00.000Z")
    },
    {
      wg_id: ids.wgs.neckarstadt,
      user_id: ids.users.farah,
      role: "member",
      joined_at: new Date("2026-01-03T09:05:00.000Z")
    },
    {
      wg_id: ids.wgs.barcelonaTrip,
      user_id: ids.users.ben,
      role: "organizer",
      joined_at: new Date("2026-01-15T12:00:00.000Z")
    },
    {
      wg_id: ids.wgs.barcelonaTrip,
      user_id: ids.users.clara,
      role: "member",
      joined_at: new Date("2026-01-15T12:10:00.000Z")
    },
    {
      wg_id: ids.wgs.barcelonaTrip,
      user_id: ids.users.farah,
      role: "member",
      joined_at: new Date("2026-01-15T12:20:00.000Z")
    }
  ],
  bank_accounts: [
    {
      _id: ids.bank_accounts.anna,
      user_id: ids.users.anna,
      balance: money(245000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.ben,
      user_id: ids.users.ben,
      balance: money(176000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.clara,
      user_id: ids.users.clara,
      balance: money(134000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.emre,
      user_id: ids.users.emre,
      balance: money(212000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.farah,
      user_id: ids.users.farah,
      balance: money(98000),
      currency: "EUR",
      created_at: createdAt
    }
  ],
  expenses: [
    {
      _id: ids.expenses.rentJan,
      amount: money(180000),
      currency: "EUR",
      info: "Miete Januar",
      category: "rent",
      due_date: new Date("2026-02-03T00:00:00.000Z"),
      created_at: new Date("2026-01-29T08:00:00.000Z")
    },
    {
      _id: ids.expenses.internetJan,
      amount: money(4500),
      currency: "EUR",
      info: "Internet Januar",
      category: "utilities",
      due_date: new Date("2026-02-10T00:00:00.000Z"),
      created_at: new Date("2026-02-01T11:30:00.000Z")
    },
    {
      _id: ids.expenses.groceriesWeek2,
      amount: money(7800),
      currency: "EUR",
      info: "Wocheneinkauf KW6",
      category: "food",
      due_date: new Date("2026-02-18T00:00:00.000Z"),
      created_at: new Date("2026-02-07T16:20:00.000Z")
    },
    {
      _id: ids.expenses.electricityJan,
      amount: money(6300),
      currency: "EUR",
      info: "Strom Januar",
      category: "utilities",
      due_date: new Date("2026-02-20T00:00:00.000Z"),
      created_at: new Date("2026-02-02T09:10:00.000Z")
    },
    {
      _id: ids.expenses.flights,
      amount: money(54900),
      currency: "EUR",
      info: "Fluege Barcelona",
      category: "travel",
      due_date: new Date("2026-03-05T00:00:00.000Z"),
      created_at: new Date("2026-02-09T18:05:00.000Z")
    }
  ],
  expense_shares: [
    {
      _id: ids.expense_shares.rentAnna,
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.anna,
      amount: money(60000),
      is_settled: true,
      settled_at: new Date("2026-01-29T08:10:00.000Z")
    },
    {
      _id: ids.expense_shares.rentBen,
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.ben,
      amount: money(60000),
      is_settled: true,
      settled_at: new Date("2026-02-03T09:15:00.000Z")
    },
    {
      _id: ids.expense_shares.rentClara,
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.clara,
      amount: money(60000),
      is_settled: false,
      settled_at: null
    },
    {
      _id: ids.expense_shares.internetAnna,
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.anna,
      amount: money(1500),
      is_settled: false,
      settled_at: null
    },
    {
      _id: ids.expense_shares.internetBen,
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.ben,
      amount: money(1500),
      is_settled: true,
      settled_at: new Date("2026-02-01T11:35:00.000Z")
    },
    {
      _id: ids.expense_shares.internetClara,
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.clara,
      amount: money(1500),
      is_settled: true,
      settled_at: new Date("2026-02-11T19:00:00.000Z")
    },
    {
      _id: ids.expense_shares.electricityEmre,
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.emre,
      amount: money(3150),
      is_settled: true,
      settled_at: new Date("2026-02-02T09:15:00.000Z")
    },
    {
      _id: ids.expense_shares.electricityFarah,
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.farah,
      amount: money(3150),
      is_settled: false,
      settled_at: null
    }
  ],
  requests: [
    {
      _id: ids.requests.annaToClara,
      from_user_id: ids.users.anna,
      to_user_id: ids.users.clara,
      amount: money(30000),
      currency: "EUR",
      due_date: new Date("2026-02-26T00:00:00.000Z"),
      status: "pending",
      created_at: new Date("2026-02-11T08:30:00.000Z")
    },
    {
      _id: ids.requests.farahToBen,
      from_user_id: ids.users.farah,
      to_user_id: ids.users.ben,
      amount: money(18300),
      currency: "EUR",
      due_date: new Date("2026-03-06T00:00:00.000Z"),
      status: "accepted",
      created_at: new Date("2026-02-10T09:20:00.000Z")
    },
    {
      _id: ids.requests.emreToAnna,
      from_user_id: ids.users.emre,
      to_user_id: ids.users.anna,
      amount: money(4000),
      currency: "EUR",
      due_date: new Date("2026-02-20T00:00:00.000Z"),
      status: "paid",
      created_at: new Date("2026-02-09T10:00:00.000Z")
    },
    {
      _id: ids.requests.claraToBen,
      from_user_id: ids.users.clara,
      to_user_id: ids.users.ben,
      amount: money(2000),
      currency: "EUR",
      due_date: new Date("2026-02-22T00:00:00.000Z"),
      status: "rejected",
      created_at: new Date("2026-02-10T18:10:00.000Z")
    }
  ],
  transactions: [
    {
      amount: money(60000),
      currency: "EUR",
      request_id: null,
      expense_shares_id: ids.expense_shares.rentBen,
      created_at: new Date("2026-02-03T09:15:00.000Z")
    },
    {
      amount: money(1500),
      currency: "EUR",
      request_id: null,
      expense_shares_id: ids.expense_shares.internetClara,
      created_at: new Date("2026-02-11T19:00:00.000Z")
    },
    {
      amount: money(3150),
      currency: "EUR",
      request_id: null,
      expense_shares_id: ids.expense_shares.electricityEmre,
      created_at: new Date("2026-02-02T09:15:00.000Z")
    },
    {
      amount: money(18300),
      currency: "EUR",
      request_id: ids.requests.farahToBen,
      expense_shares_id: null,
      created_at: new Date("2026-02-11T13:20:00.000Z")
    },
    {
      amount: money(4000),
      currency: "EUR",
      request_id: ids.requests.emreToAnna,
      expense_shares_id: null,
      created_at: new Date("2026-02-10T09:00:00.000Z")
    }
  ],
  shares: [
    {
      bank_id: ids.bank_accounts.anna,
      shares: "AAPL",
      amount: new Int32(12)
    },
    {
      bank_id: ids.bank_accounts.ben,
      shares: "MSFT",
      amount: new Int32(8)
    },
    {
      bank_id: ids.bank_accounts.clara,
      shares: "TSLA",
      amount: new Int32(5)
    },
    {
      bank_id: ids.bank_accounts.emre,
      shares: "SAP",
      amount: new Int32(14)
    },
    {
      bank_id: ids.bank_accounts.farah,
      shares: "NVDA",
      amount: new Int32(4)
    }
  ]
};

const collectionOrder = [
  "users",
  "wgs",
  "wg_members",
  "bank_accounts",
  "expenses",
  "expense_shares",
  "requests",
  "transactions",
  "shares"
];

async function clearCollections(db) {
  const clearOrder = [...collectionOrder].reverse();
  for (const name of clearOrder) {
    const result = await db.collection(name).deleteMany({});
    console.log(`Deleted ${result.deletedCount} docs from ${dbName}.${name}`);
  }
}

async function insertCollections(db) {
  for (const name of collectionOrder) {
    const docs = data[name];
    if (!docs || docs.length === 0) {
      continue;
    }
    const result = await db.collection(name).insertMany(docs, { ordered: true });
    console.log(`Inserted ${result.insertedCount} docs into ${dbName}.${name}`);
  }
}

async function run() {
  try {
    await client.connect();
    const db = client.db(dbName);

    console.log("Resetting existing app data...");
    await clearCollections(db);
    console.log("Inserting upgraded WG test data...");
    await insertCollections(db);

    console.log("Reset + import complete.");
  } catch (err) {
    console.error("Import failed:", err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
