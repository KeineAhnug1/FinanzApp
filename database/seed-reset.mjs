import "dotenv/config";
import { MongoClient, ObjectId, Int32 } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI env var.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "finanzapp";
const client = new MongoClient(uri);

const ids = {
  users: {
    anna: new ObjectId("65f100000000000000000001"),
    ben: new ObjectId("65f100000000000000000002"),
    clara: new ObjectId("65f100000000000000000003"),
    emre: new ObjectId("65f100000000000000000004"),
    farah: new ObjectId("65f100000000000000000005")
  },
  groups: {
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
      first_name: "Anna",
      last_name: "Schmidt",
      age: new Int32(24),
      income: 2800.0,
      created_at: createdAt
    },
    {
      _id: ids.users.ben,
      username: "ben",
      email: "ben@example.com",
      password: "ben_pw_hash",
      first_name: "Ben",
      last_name: "Keller",
      age: new Int32(26),
      income: 3100.0,
      created_at: createdAt
    },
    {
      _id: ids.users.clara,
      username: "clara",
      email: "clara@example.com",
      password: "clara_pw_hash",
      first_name: "Clara",
      last_name: "Weber",
      age: new Int32(23),
      income: 2250.0,
      created_at: createdAt
    },
    {
      _id: ids.users.emre,
      username: "emre",
      email: "emre@example.com",
      password: "emre_pw_hash",
      first_name: "Emre",
      last_name: "Yilmaz",
      age: new Int32(27),
      income: 3400.0,
      created_at: createdAt
    },
    {
      _id: ids.users.farah,
      username: "farah",
      email: "farah@example.com",
      password: "farah_pw_hash",
      first_name: "Farah",
      last_name: "Ali",
      age: new Int32(25),
      income: 2100.0,
      created_at: createdAt
    }
  ],
  groups: [
    {
      _id: ids.groups.sonnenallee,
      name: "WG Sonnenallee Berlin",
      address: "Sonnenallee 110, Berlin",
      created_at: createdAt
    },
    {
      _id: ids.groups.neckarstadt,
      name: "WG Neckarstadt Mannheim",
      address: "Mittelstrasse 8, Mannheim",
      created_at: createdAt
    },
    {
      _id: ids.groups.barcelonaTrip,
      name: "Urlaubs-WG Barcelona",
      address: "Carrer de Mallorca 220, Barcelona",
      created_at: createdAt
    }
  ],
  group_members: [
    {
      group_id: ids.groups.sonnenallee,
      user_id: ids.users.anna,
      role: "admin",
      joined_at: new Date("2026-01-01T10:00:00.000Z")
    },
    {
      group_id: ids.groups.sonnenallee,
      user_id: ids.users.ben,
      role: "member",
      joined_at: new Date("2026-01-01T10:05:00.000Z")
    },
    {
      group_id: ids.groups.sonnenallee,
      user_id: ids.users.clara,
      role: "member",
      joined_at: new Date("2026-01-01T10:10:00.000Z")
    },
    {
      group_id: ids.groups.neckarstadt,
      user_id: ids.users.emre,
      role: "admin",
      joined_at: new Date("2026-01-03T09:00:00.000Z")
    },
    {
      group_id: ids.groups.neckarstadt,
      user_id: ids.users.farah,
      role: "member",
      joined_at: new Date("2026-01-03T09:05:00.000Z")
    },
    {
      group_id: ids.groups.barcelonaTrip,
      user_id: ids.users.ben,
      role: "organizer",
      joined_at: new Date("2026-01-15T12:00:00.000Z")
    },
    {
      group_id: ids.groups.barcelonaTrip,
      user_id: ids.users.clara,
      role: "member",
      joined_at: new Date("2026-01-15T12:10:00.000Z")
    },
    {
      group_id: ids.groups.barcelonaTrip,
      user_id: ids.users.farah,
      role: "member",
      joined_at: new Date("2026-01-15T12:20:00.000Z")
    }
  ],
  bank_accounts: [
    {
      _id: ids.bank_accounts.anna,
      user_id: ids.users.anna,
      balance: 2450.0,
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.ben,
      user_id: ids.users.ben,
      balance: 1760.0,
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.clara,
      user_id: ids.users.clara,
      balance: 1340.0,
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.emre,
      user_id: ids.users.emre,
      balance: 2120.0,
      created_at: createdAt
    },
    {
      _id: ids.bank_accounts.farah,
      user_id: ids.users.farah,
      balance: 980.0,
      created_at: createdAt
    }
  ],
  expenses: [
    {
      _id: ids.expenses.rentJan,
      amount: 1800.0,
      info: "Miete Januar",
      category: "rent",
      due_date: new Date("2026-02-03T00:00:00.000Z"),
      group_id: ids.groups.sonnenallee,
      repeating: true,
      cycle_date: new Date("2026-03-03T00:00:00.000Z"),
      created_at: new Date("2026-01-29T08:00:00.000Z")
    },
    {
      _id: ids.expenses.internetJan,
      amount: 45.0,
      info: "Internet Januar",
      category: "utilities",
      due_date: new Date("2026-02-10T00:00:00.000Z"),
      group_id: ids.groups.sonnenallee,
      repeating: true,
      cycle_date: new Date("2026-03-10T00:00:00.000Z"),
      created_at: new Date("2026-02-01T11:30:00.000Z")
    },
    {
      _id: ids.expenses.groceriesWeek2,
      amount: 78.0,
      info: "Wocheneinkauf KW6",
      category: "food",
      due_date: new Date("2026-02-18T00:00:00.000Z"),
      group_id: ids.groups.sonnenallee,
      repeating: false,
      cycle_date: null,
      created_at: new Date("2026-02-07T16:20:00.000Z")
    },
    {
      _id: ids.expenses.electricityJan,
      amount: 63.0,
      info: "Strom Januar",
      category: "utilities",
      due_date: new Date("2026-02-20T00:00:00.000Z"),
      group_id: ids.groups.neckarstadt,
      repeating: true,
      cycle_date: new Date("2026-03-20T00:00:00.000Z"),
      created_at: new Date("2026-02-02T09:10:00.000Z")
    },
    {
      _id: ids.expenses.flights,
      amount: 549.0,
      info: "Fluege Barcelona",
      category: "travel",
      due_date: new Date("2026-03-05T00:00:00.000Z"),
      group_id: ids.groups.barcelonaTrip,
      repeating: false,
      cycle_date: null,
      created_at: new Date("2026-02-09T18:05:00.000Z")
    }
  ],
  expense_shares: [
    {
      _id: ids.expense_shares.rentAnna,
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.anna,
      paid_amount: 600.0,
      theo_amount: 600.0,
      is_settled: true,
      settled_at: new Date("2026-01-29T08:10:00.000Z")
    },
    {
      _id: ids.expense_shares.rentBen,
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.ben,
      paid_amount: 600.0,
      theo_amount: 600.0,
      is_settled: true,
      settled_at: new Date("2026-02-03T09:15:00.000Z")
    },
    {
      _id: ids.expense_shares.rentClara,
      expense_id: ids.expenses.rentJan,
      user_id: ids.users.clara,
      paid_amount: 0,
      theo_amount: 600.0,
      is_settled: false,
      settled_at: null
    },
    {
      _id: ids.expense_shares.internetAnna,
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.anna,
      paid_amount: 0,
      theo_amount: 15.0,
      is_settled: false,
      settled_at: null
    },
    {
      _id: ids.expense_shares.internetBen,
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.ben,
      paid_amount: 15.0,
      theo_amount: 15.0,
      is_settled: true,
      settled_at: new Date("2026-02-01T11:35:00.000Z")
    },
    {
      _id: ids.expense_shares.internetClara,
      expense_id: ids.expenses.internetJan,
      user_id: ids.users.clara,
      paid_amount: 15.0,
      theo_amount: 15.0,
      is_settled: true,
      settled_at: new Date("2026-02-11T19:00:00.000Z")
    },
    {
      _id: ids.expense_shares.electricityEmre,
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.emre,
      paid_amount: 31.5,
      theo_amount: 31.5,
      is_settled: true,
      settled_at: new Date("2026-02-02T09:15:00.000Z")
    },
    {
      _id: ids.expense_shares.electricityFarah,
      expense_id: ids.expenses.electricityJan,
      user_id: ids.users.farah,
      paid_amount: 0,
      theo_amount: 31.5,
      is_settled: false,
      settled_at: null
    }
  ],
  requests: [
    {
      _id: ids.requests.annaToClara,
      from_user_id: ids.users.anna,
      to_user_id: ids.users.clara,
      expense_share_id: ids.expense_shares.rentClara,
      amount: 300.0,
      due_date: new Date("2026-02-26T00:00:00.000Z"),
      info: "Teilzahlung offene Miete",
      category: "rent",
      status: "pending",
      created_at: new Date("2026-02-11T08:30:00.000Z")
    },
    {
      _id: ids.requests.farahToBen,
      from_user_id: ids.users.farah,
      to_user_id: ids.users.ben,
      expense_share_id: null,
      amount: 183.0,
      due_date: new Date("2026-03-06T00:00:00.000Z"),
      info: "Ausgleich Barcelona Hotel",
      category: "travel",
      status: "accepted",
      created_at: new Date("2026-02-10T09:20:00.000Z")
    },
    {
      _id: ids.requests.emreToAnna,
      from_user_id: ids.users.emre,
      to_user_id: ids.users.anna,
      expense_share_id: null,
      amount: 40.0,
      due_date: new Date("2026-02-20T00:00:00.000Z"),
      info: "Rueckzahlung Einkauf",
      category: "food",
      status: "paid",
      created_at: new Date("2026-02-09T10:00:00.000Z")
    },
    {
      _id: ids.requests.claraToBen,
      from_user_id: ids.users.clara,
      to_user_id: ids.users.ben,
      expense_share_id: null,
      amount: 20.0,
      due_date: new Date("2026-02-22T00:00:00.000Z"),
      info: "Kuechenbedarf",
      category: "household",
      status: "rejected",
      created_at: new Date("2026-02-10T18:10:00.000Z")
    }
  ],
  transactions: [
    {
      amount: 600.0,
      request_id: null,
      expense_share_id: ids.expense_shares.rentBen,
      created_at: new Date("2026-02-03T09:15:00.000Z")
    },
    {
      amount: 15.0,
      request_id: null,
      expense_share_id: ids.expense_shares.internetClara,
      created_at: new Date("2026-02-11T19:00:00.000Z")
    },
    {
      amount: 31.5,
      request_id: null,
      expense_share_id: ids.expense_shares.electricityEmre,
      created_at: new Date("2026-02-02T09:15:00.000Z")
    },
    {
      amount: 183.0,
      request_id: ids.requests.farahToBen,
      expense_share_id: null,
      created_at: new Date("2026-02-11T13:20:00.000Z")
    },
    {
      amount: 40.0,
      request_id: ids.requests.emreToAnna,
      expense_share_id: null,
      created_at: new Date("2026-02-10T09:00:00.000Z")
    }
  ],
  shares: [
    {
      bank_account_id: ids.bank_accounts.anna,
      symbol: "AAPL",
      units: 12.25,
      bought_at: new Date("2025-11-15T09:30:00.000Z"),
      bought_for: 1875.0
    },
    {
      bank_account_id: ids.bank_accounts.ben,
      symbol: "MSFT",
      units: 8.0,
      bought_at: new Date("2025-10-20T09:30:00.000Z"),
      bought_for: 2520.0
    },
    {
      bank_account_id: ids.bank_accounts.clara,
      symbol: "TSLA",
      units: 5.5,
      bought_at: new Date("2025-12-05T09:30:00.000Z"),
      bought_for: 1386.0
    },
    {
      bank_account_id: ids.bank_accounts.emre,
      symbol: "SAP",
      units: 14.0,
      bought_at: new Date("2025-09-13T09:30:00.000Z"),
      bought_for: 2184.0
    },
    {
      bank_account_id: ids.bank_accounts.farah,
      symbol: "NVDA",
      units: 4.2,
      bought_at: new Date("2025-08-28T09:30:00.000Z"),
      bought_for: 2035.0
    }
  ],
  budget: [
    {
      user_id: ids.users.anna,
      category: "food",
      target_amount: 350.0,
      current_amount: 142.5,
      cycle_date: new Date("2026-02-01T00:00:00.000Z"),
      created_at: createdAt
    },
    {
      user_id: ids.users.ben,
      category: "travel",
      target_amount: 250.0,
      current_amount: 183.0,
      cycle_date: new Date("2026-02-01T00:00:00.000Z"),
      created_at: createdAt
    },
    {
      user_id: ids.users.clara,
      category: "rent",
      target_amount: 700.0,
      current_amount: 600.0,
      cycle_date: new Date("2026-02-01T00:00:00.000Z"),
      created_at: createdAt
    }
  ]
};

const collectionOrder = [
  "users",
  "groups",
  "group_members",
  "bank_accounts",
  "expenses",
  "expense_shares",
  "requests",
  "transactions",
  "shares",
  "budget"
];

function getRequiredSet(validator) {
  const required = validator?.$jsonSchema?.required;
  return new Set(Array.isArray(required) ? required : []);
}

function getProperties(validator) {
  const props = validator?.$jsonSchema?.properties;
  return props && typeof props === "object" ? props : {};
}

async function assertSchemaIsUpToDate(db) {
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const byName = new Map(collections.map((c) => [c.name, c]));

  const issues = [];

  for (const name of collectionOrder) {
    if (!byName.has(name)) {
      issues.push(`Missing collection "${name}"`);
    }
  }

  const checks = [
    {
      name: "users",
      requiredFields: ["username", "email", "password", "first_name", "last_name", "income", "created_at"]
    },
    {
      name: "groups",
      requiredFields: ["name", "created_at"]
    },
    {
      name: "expense_shares",
      requiredFields: ["expense_id", "user_id", "paid_amount", "theo_amount", "is_settled"]
    },
    {
      name: "transactions",
      requiredFields: ["amount", "request_id", "expense_share_id", "created_at"]
    },
    {
      name: "budget",
      requiredFields: ["user_id", "target_amount", "current_amount", "created_at"]
    }
  ];

  for (const check of checks) {
    const info = byName.get(check.name);
    if (!info) {
      continue;
    }

    const required = getRequiredSet(info.options?.validator);
    for (const field of check.requiredFields) {
      if (!required.has(field)) {
        issues.push(`Collection "${check.name}" validator does not require "${field}"`);
      }
    }
  }

  const txInfo = byName.get("transactions");
  if (txInfo) {
    const txProps = getProperties(txInfo.options?.validator);
    if (!Object.prototype.hasOwnProperty.call(txProps, "request_id")) {
      issues.push('Collection "transactions" validator is missing "request_id"');
    }
    if (!Object.prototype.hasOwnProperty.call(txProps, "expense_share_id")) {
      issues.push('Collection "transactions" validator is missing "expense_share_id"');
    }
  }

  if (issues.length > 0) {
    const details = issues.map((i) => `- ${i}`).join("\n");
    throw new Error(
      `Database schema is not compatible with this seed file.\n${details}\nRun "npm run schema:setup" and then retry "npm run seed:reset".`
    );
  }
}

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

    console.log("Checking schema compatibility...");
    await assertSchemaIsUpToDate(db);
    console.log("Schema check passed.");

    console.log("Resetting existing app data...");
    await clearCollections(db);
    console.log("Inserting upgraded test data...");
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
