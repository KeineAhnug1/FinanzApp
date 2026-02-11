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
  expenses: {
    rentJan: new ObjectId("65f300000000000000000001"),
    internetJan: new ObjectId("65f300000000000000000002"),
    groceriesWeek2: new ObjectId("65f300000000000000000003"),
    electricityJan: new ObjectId("65f300000000000000000004"),
    kitchenRepair: new ObjectId("65f300000000000000000005"),
    flights: new ObjectId("65f300000000000000000006")
  }
};

const createdAt = new Date("2026-01-01T09:00:00.000Z");

const data = {
  users: [
    { _id: ids.users.anna, username: "anna", created_at: createdAt },
    { _id: ids.users.ben, username: "ben", created_at: createdAt },
    { _id: ids.users.clara, username: "clara", created_at: createdAt },
    { _id: ids.users.emre, username: "emre", created_at: createdAt },
    { _id: ids.users.farah, username: "farah", created_at: createdAt }
  ],
  wgs: [
    { _id: ids.wgs.sonnenallee, name: "WG Sonnenallee Berlin", created_at: createdAt },
    { _id: ids.wgs.neckarstadt, name: "WG Neckarstadt Mannheim", created_at: createdAt },
    { _id: ids.wgs.barcelonaTrip, name: "Urlaubs-WG Barcelona", created_at: createdAt }
  ],
  wg_members: [
    { wg_id: ids.wgs.sonnenallee, user_id: ids.users.anna, role: "admin", joined_at: new Date("2026-01-01T10:00:00.000Z") },
    { wg_id: ids.wgs.sonnenallee, user_id: ids.users.ben, role: "member", joined_at: new Date("2026-01-01T10:05:00.000Z") },
    { wg_id: ids.wgs.sonnenallee, user_id: ids.users.clara, role: "member", joined_at: new Date("2026-01-01T10:10:00.000Z") },
    { wg_id: ids.wgs.neckarstadt, user_id: ids.users.emre, role: "admin", joined_at: new Date("2026-01-03T09:00:00.000Z") },
    { wg_id: ids.wgs.neckarstadt, user_id: ids.users.farah, role: "member", joined_at: new Date("2026-01-03T09:05:00.000Z") },
    { wg_id: ids.wgs.neckarstadt, user_id: ids.users.anna, role: "member", joined_at: new Date("2026-01-03T09:10:00.000Z") },
    { wg_id: ids.wgs.barcelonaTrip, user_id: ids.users.ben, role: "organizer", joined_at: new Date("2026-01-15T12:00:00.000Z") },
    { wg_id: ids.wgs.barcelonaTrip, user_id: ids.users.clara, role: "member", joined_at: new Date("2026-01-15T12:10:00.000Z") },
    { wg_id: ids.wgs.barcelonaTrip, user_id: ids.users.farah, role: "member", joined_at: new Date("2026-01-15T12:20:00.000Z") }
  ],
  bank_accounts: [
    {
      user_id: ids.users.anna,
      wg_id: null,
      balance: money(245000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.ben,
      wg_id: null,
      balance: money(176000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.clara,
      wg_id: null,
      balance: money(134000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.emre,
      wg_id: null,
      balance: money(212000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.farah,
      wg_id: null,
      balance: money(98000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.anna,
      wg_id: ids.wgs.sonnenallee,
      balance: money(76000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.ben,
      wg_id: ids.wgs.sonnenallee,
      balance: money(42000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.clara,
      wg_id: ids.wgs.sonnenallee,
      balance: money(39000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.emre,
      wg_id: ids.wgs.neckarstadt,
      balance: money(51000),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.farah,
      wg_id: ids.wgs.neckarstadt,
      balance: money(24500),
      currency: "EUR",
      created_at: createdAt
    },
    {
      user_id: ids.users.anna,
      wg_id: ids.wgs.neckarstadt,
      balance: money(18000),
      currency: "EUR",
      created_at: createdAt
    }
  ],
  expenses: [
    {
      _id: ids.expenses.rentJan,
      wg_id: ids.wgs.sonnenallee,
      paid_by_user_id: ids.users.anna,
      amount: money(180000),
      currency: "EUR",
      info: "Miete Januar",
      category: "rent",
      due_date: new Date("2026-02-03T00:00:00.000Z"),
      created_at: new Date("2026-01-29T08:00:00.000Z")
    },
    {
      _id: ids.expenses.internetJan,
      wg_id: ids.wgs.sonnenallee,
      paid_by_user_id: ids.users.ben,
      amount: money(4500),
      currency: "EUR",
      info: "Internet Januar",
      category: "utilities",
      due_date: new Date("2026-02-10T00:00:00.000Z"),
      created_at: new Date("2026-02-01T11:30:00.000Z")
    },
    {
      _id: ids.expenses.groceriesWeek2,
      wg_id: ids.wgs.sonnenallee,
      paid_by_user_id: ids.users.clara,
      amount: money(7800),
      currency: "EUR",
      info: "Wocheneinkauf KW6",
      category: "food",
      due_date: new Date("2026-02-18T00:00:00.000Z"),
      created_at: new Date("2026-02-07T16:20:00.000Z")
    },
    {
      _id: ids.expenses.electricityJan,
      wg_id: ids.wgs.neckarstadt,
      paid_by_user_id: ids.users.emre,
      amount: money(6300),
      currency: "EUR",
      info: "Strom Januar",
      category: "utilities",
      due_date: new Date("2026-02-20T00:00:00.000Z"),
      created_at: new Date("2026-02-02T09:10:00.000Z")
    },
    {
      _id: ids.expenses.kitchenRepair,
      wg_id: ids.wgs.neckarstadt,
      paid_by_user_id: ids.users.anna,
      amount: money(12000),
      currency: "EUR",
      info: "Kuechenreparatur",
      category: "maintenance",
      due_date: new Date("2026-02-25T00:00:00.000Z"),
      created_at: new Date("2026-02-08T14:40:00.000Z")
    },
    {
      _id: ids.expenses.flights,
      wg_id: ids.wgs.barcelonaTrip,
      paid_by_user_id: ids.users.farah,
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
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.anna,
      amount: money(60000),
      is_settled: true,
      settled_at: new Date("2026-01-29T08:10:00.000Z")
    },
    {
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.ben,
      amount: money(60000),
      is_settled: true,
      settled_at: new Date("2026-02-03T09:15:00.000Z")
    },
    {
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.clara,
      amount: money(60000),
      is_settled: false,
      settled_at: null
    },
    {
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.anna,
      amount: money(1500),
      is_settled: false,
      settled_at: null
    },
    {
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.ben,
      amount: money(1500),
      is_settled: true,
      settled_at: new Date("2026-02-01T11:35:00.000Z")
    },
    {
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.clara,
      amount: money(1500),
      is_settled: true,
      settled_at: new Date("2026-02-11T19:00:00.000Z")
    },
    {
      expense_id: ids.expenses.groceriesWeek2,
      user_id: ids.users.anna,
      amount: money(2600),
      is_settled: true,
      settled_at: new Date("2026-02-08T10:00:00.000Z")
    },
    {
      expense_id: ids.expenses.groceriesWeek2,
      user_id: ids.users.ben,
      amount: money(2600),
      is_settled: true,
      settled_at: new Date("2026-02-09T10:30:00.000Z")
    },
    {
      expense_id: ids.expenses.groceriesWeek2,
      user_id: ids.users.clara,
      amount: money(2600),
      is_settled: true,
      settled_at: new Date("2026-02-07T16:30:00.000Z")
    },
    {
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.emre,
      amount: money(2100),
      is_settled: true,
      settled_at: new Date("2026-02-02T09:15:00.000Z")
    },
    {
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.farah,
      amount: money(2100),
      is_settled: false,
      settled_at: null
    },
    {
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.anna,
      amount: money(2100),
      is_settled: true,
      settled_at: new Date("2026-02-12T08:00:00.000Z")
    },
    {
      expense_id: ids.expenses.kitchenRepair,
      user_id: ids.users.emre,
      amount: money(4000),
      is_settled: false,
      settled_at: null
    },
    {
      expense_id: ids.expenses.kitchenRepair,
      user_id: ids.users.farah,
      amount: money(4000),
      is_settled: true,
      settled_at: new Date("2026-02-10T09:00:00.000Z")
    },
    {
      expense_id: ids.expenses.kitchenRepair,
      user_id: ids.users.anna,
      amount: money(4000),
      is_settled: true,
      settled_at: new Date("2026-02-08T14:45:00.000Z")
    },
    {
      expense_id: ids.expenses.flights,
      user_id: ids.users.ben,
      amount: money(18300),
      is_settled: false,
      settled_at: null
    },
    {
      expense_id: ids.expenses.flights,
      user_id: ids.users.clara,
      amount: money(18300),
      is_settled: false,
      settled_at: null
    },
    {
      expense_id: ids.expenses.flights,
      user_id: ids.users.farah,
      amount: money(18300),
      is_settled: true,
      settled_at: new Date("2026-02-09T18:10:00.000Z")
    }
  ],
  requests: [
    {
      from_user_id: ids.users.anna,
      to_user_id: ids.users.clara,
      wg_id: ids.wgs.sonnenallee,
      amount: money(30000),
      currency: "EUR",
      due_date: new Date("2026-02-26T00:00:00.000Z"),
      status: "pending",
      created_at: new Date("2026-02-11T08:30:00.000Z")
    },
    {
      from_user_id: ids.users.farah,
      to_user_id: ids.users.ben,
      wg_id: ids.wgs.barcelonaTrip,
      amount: money(18300),
      currency: "EUR",
      due_date: new Date("2026-03-06T00:00:00.000Z"),
      status: "accepted",
      created_at: new Date("2026-02-10T09:20:00.000Z")
    },
    {
      from_user_id: ids.users.emre,
      to_user_id: ids.users.anna,
      wg_id: ids.wgs.neckarstadt,
      amount: money(4000),
      currency: "EUR",
      due_date: new Date("2026-02-20T00:00:00.000Z"),
      status: "paid",
      created_at: new Date("2026-02-09T10:00:00.000Z")
    },
    {
      from_user_id: ids.users.clara,
      to_user_id: ids.users.ben,
      wg_id: ids.wgs.sonnenallee,
      amount: money(2000),
      currency: "EUR",
      due_date: new Date("2026-02-22T00:00:00.000Z"),
      status: "rejected",
      created_at: new Date("2026-02-10T18:10:00.000Z")
    }
  ],
  transactions: [
    {
      from_user_id: ids.users.ben,
      to_user_id: ids.users.anna,
      wg_id: ids.wgs.sonnenallee,
      amount: money(60000),
      currency: "EUR",
      expense_id: ids.expenses.rentJan,
      created_at: new Date("2026-02-03T09:15:00.000Z")
    },
    {
      from_user_id: ids.users.clara,
      to_user_id: ids.users.anna,
      wg_id: ids.wgs.sonnenallee,
      amount: money(30000),
      currency: "EUR",
      expense_id: ids.expenses.rentJan,
      created_at: new Date("2026-02-06T19:00:00.000Z")
    },
    {
      from_user_id: ids.users.clara,
      to_user_id: ids.users.ben,
      wg_id: ids.wgs.sonnenallee,
      amount: money(1500),
      currency: "EUR",
      expense_id: ids.expenses.internetJan,
      created_at: new Date("2026-02-11T19:00:00.000Z")
    },
    {
      from_user_id: ids.users.ben,
      to_user_id: ids.users.clara,
      wg_id: ids.wgs.sonnenallee,
      amount: money(2600),
      currency: "EUR",
      expense_id: ids.expenses.groceriesWeek2,
      created_at: new Date("2026-02-09T10:30:00.000Z")
    },
    {
      from_user_id: ids.users.anna,
      to_user_id: ids.users.emre,
      wg_id: ids.wgs.neckarstadt,
      amount: money(2100),
      currency: "EUR",
      expense_id: ids.expenses.electricityJan,
      created_at: new Date("2026-02-12T08:00:00.000Z")
    },
    {
      from_user_id: ids.users.farah,
      to_user_id: ids.users.anna,
      wg_id: ids.wgs.neckarstadt,
      amount: money(4000),
      currency: "EUR",
      expense_id: ids.expenses.kitchenRepair,
      created_at: new Date("2026-02-10T09:00:00.000Z")
    },
    {
      from_user_id: ids.users.ben,
      to_user_id: ids.users.farah,
      wg_id: ids.wgs.barcelonaTrip,
      amount: money(10000),
      currency: "EUR",
      expense_id: ids.expenses.flights,
      created_at: new Date("2026-02-11T13:20:00.000Z")
    },
    {
      from_user_id: ids.users.clara,
      to_user_id: ids.users.farah,
      wg_id: ids.wgs.barcelonaTrip,
      amount: money(8500),
      currency: "EUR",
      expense_id: ids.expenses.flights,
      created_at: new Date("2026-02-11T14:10:00.000Z")
    },
    {
      from_user_id: ids.users.anna,
      to_user_id: ids.users.farah,
      wg_id: null,
      amount: money(5000),
      currency: "EUR",
      expense_id: null,
      created_at: new Date("2026-02-11T20:00:00.000Z")
    },
    {
      from_user_id: ids.users.emre,
      to_user_id: ids.users.ben,
      wg_id: null,
      amount: money(2500),
      currency: "EUR",
      expense_id: null,
      created_at: new Date("2026-02-10T17:30:00.000Z")
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
  "transactions"
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
