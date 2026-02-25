import { ObjectId } from "mongodb";
import { dbName, withDb } from "./db-client.mjs";
import {
  createBankAccountEntity,
  createBudgetEntity,
  createDepotEntity,
  createFundingParticipantEntity,
  createGroupActivityEntity,
  createGroupEntity,
  createGroupExpenseEntity,
  createGroupFundingEntity,
  createGroupMemberEntity,
  createIncomeEntity,
  createPrivateExpenseEntity,
  createRequestEntity,
  createShareEntity,
  createTransactionEntity,
  createUserEntity
} from "./entity-factory.mjs";

const ids = {
  users: {
    anna: new ObjectId("76a100000000000000000001"),
    ben: new ObjectId("76a100000000000000000002"),
    clara: new ObjectId("76a100000000000000000003"),
    emre: new ObjectId("76a100000000000000000004"),
    farah: new ObjectId("76a100000000000000000005"),
    finzbro: new ObjectId("76a100000000000000000006")
  },
  groups: {
    sonnenallee: new ObjectId("76a200000000000000000001"),
    neckarstadt: new ObjectId("76a200000000000000000002")
  },
  group_members: {
    annaSonnenallee: new ObjectId("76a210000000000000000001"),
    benSonnenallee: new ObjectId("76a210000000000000000002"),
    claraSonnenallee: new ObjectId("76a210000000000000000003"),
    emreNeckarstadt: new ObjectId("76a210000000000000000004"),
    farahNeckarstadt: new ObjectId("76a210000000000000000005")
  },
  bank_accounts: {
    anna: new ObjectId("76a220000000000000000001"),
    ben: new ObjectId("76a220000000000000000002"),
    clara: new ObjectId("76a220000000000000000003"),
    emre: new ObjectId("76a220000000000000000004"),
    farah: new ObjectId("76a220000000000000000005")
  },
  depots: {
    anna: new ObjectId("76a230000000000000000001"),
    ben: new ObjectId("76a230000000000000000002"),
    emre: new ObjectId("76a230000000000000000003")
  },
  private_expenses: {
    annaPhone: new ObjectId("76a300000000000000000001"),
    benInsurance: new ObjectId("76a300000000000000000002"),
    claraLaptop: new ObjectId("76a300000000000000000003")
  },
  group_activities: {
    sonnenalleeCleanup: new ObjectId("76a600000000000000000001"),
    neckarstadtGameNight: new ObjectId("76a600000000000000000002")
  },
  group_funding: {
    sonnenalleeFeb: new ObjectId("76a400000000000000000001"),
    neckarstadtTrip: new ObjectId("76a400000000000000000002")
  },
  funding_participants: {
    annaSonnenallee: new ObjectId("76a700000000000000000001"),
    benSonnenallee: new ObjectId("76a700000000000000000002"),
    claraSonnenallee: new ObjectId("76a700000000000000000003"),
    emreNeckarstadt: new ObjectId("76a700000000000000000004"),
    farahNeckarstadt: new ObjectId("76a700000000000000000005")
  },
  group_expenses: {
    sonnenalleeGroceries: new ObjectId("76a410000000000000000001"),
    sonnenalleeInternet: new ObjectId("76a410000000000000000002"),
    neckarstadtTrain: new ObjectId("76a410000000000000000003")
  },
  income: {
    annaSalary: new ObjectId("76a800000000000000000001"),
    benSalary: new ObjectId("76a800000000000000000002"),
    emreSalary: new ObjectId("76a800000000000000000003")
  },
  requests: {
    annaToBenPhone: new ObjectId("76a500000000000000000001"),
    emreToFarahTrip: new ObjectId("76a500000000000000000002"),
    claraToAnnaBorrowed: new ObjectId("76a500000000000000000003")
  }
};

const createdAt = new Date("2026-01-01T09:00:00.000Z");

const data = {
  users: [
    createUserEntity({
      _id: ids.users.anna,
      username: "anna",
      email: "anna@example.com",
      password: "anna_pw_hash",
      first_name: "Anna",
      last_name: "Schmidt",
      age: 24,
      verification_code: 112233,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.ben,
      username: "ben",
      email: "ben@example.com",
      password: "ben_pw_hash",
      first_name: "Ben",
      last_name: "Keller",
      age: 26,
      verification_code: 223344,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.clara,
      username: "clara",
      email: "clara@example.com",
      password: "clara_pw_hash",
      first_name: "Clara",
      last_name: "Weber",
      age: 23,
      verification_code: null,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.emre,
      username: "emre",
      email: "emre@example.com",
      password: "emre_pw_hash",
      first_name: "Emre",
      last_name: "Yilmaz",
      age: 27,
      verification_code: 445566,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.farah,
      username: "farah",
      email: "farah@example.com",
      password: "farah_pw_hash",
      first_name: "Farah",
      last_name: "Ali",
      age: 25,
      verification_code: null,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.finzbro,
      username: "finzbro",
      email: "finzbro@finanzapp.local",
      password: "finzbro_pw_hash",
      first_name: "Finzbro",
      last_name: "Bot",
      age: null,
      verification_code: null,
      created_at: createdAt
    })
  ],
  groups: [
    createGroupEntity({
      _id: ids.groups.sonnenallee,
      name: "WG Sonnenallee Berlin",
      info: "Shared flat in Berlin-Neukoelln",
      address: "Sonnenallee 110, Berlin",
      created_at: createdAt
    }),
    createGroupEntity({
      _id: ids.groups.neckarstadt,
      name: "WG Neckarstadt Mannheim",
      info: "Student flat near Neckarstadt center",
      address: "Mittelstrasse 8, Mannheim",
      created_at: createdAt
    })
  ],
  group_members: [
    createGroupMemberEntity({
      _id: ids.group_members.annaSonnenallee,
      group_id: ids.groups.sonnenallee,
      user_id: ids.users.anna,
      role: "admin",
      status: "accepted"
    }),
    createGroupMemberEntity({
      _id: ids.group_members.benSonnenallee,
      group_id: ids.groups.sonnenallee,
      user_id: ids.users.ben,
      role: "member",
      status: "accepted"
    }),
    createGroupMemberEntity({
      _id: ids.group_members.claraSonnenallee,
      group_id: ids.groups.sonnenallee,
      user_id: ids.users.clara,
      role: "member",
      status: "accepted"
    }),
    createGroupMemberEntity({
      _id: ids.group_members.emreNeckarstadt,
      group_id: ids.groups.neckarstadt,
      user_id: ids.users.emre,
      role: "admin",
      status: "accepted"
    }),
    createGroupMemberEntity({
      _id: ids.group_members.farahNeckarstadt,
      group_id: ids.groups.neckarstadt,
      user_id: ids.users.farah,
      role: "member",
      status: "accepted"
    })
  ],
  bank_accounts: [
    createBankAccountEntity({ _id: ids.bank_accounts.anna, user_id: ids.users.anna, balance: 2450, created_at: createdAt }),
    createBankAccountEntity({ _id: ids.bank_accounts.ben, user_id: ids.users.ben, balance: 1760, created_at: createdAt }),
    createBankAccountEntity({ _id: ids.bank_accounts.clara, user_id: ids.users.clara, balance: 1340, created_at: createdAt }),
    createBankAccountEntity({ _id: ids.bank_accounts.emre, user_id: ids.users.emre, balance: 2120, created_at: createdAt }),
    createBankAccountEntity({ _id: ids.bank_accounts.farah, user_id: ids.users.farah, balance: 980, created_at: createdAt })
  ],
  depots: [
    createDepotEntity({ _id: ids.depots.anna, user_id: ids.users.anna, created_at: createdAt }),
    createDepotEntity({ _id: ids.depots.ben, user_id: ids.users.ben, created_at: createdAt }),
    createDepotEntity({ _id: ids.depots.emre, user_id: ids.users.emre, created_at: createdAt })
  ],
  private_expenses: [
    createPrivateExpenseEntity({
      _id: ids.private_expenses.annaPhone,
      bank_account_id: ids.bank_accounts.anna,
      amount: 65,
      theo_amount: 65,
      info: "Phone bill January",
      state: "open",
      cycle: "monthly",
      pay_date: "2026-02-14T00:00:00.000Z",
      created_at: "2026-01-31T10:20:00.000Z"
    }),
    createPrivateExpenseEntity({
      _id: ids.private_expenses.benInsurance,
      bank_account_id: ids.bank_accounts.ben,
      amount: 120,
      theo_amount: 120,
      info: "Bike insurance",
      state: "paid",
      cycle: "monthly",
      pay_date: "2026-02-05T00:00:00.000Z",
      created_at: "2026-01-20T08:10:00.000Z"
    }),
    createPrivateExpenseEntity({
      _id: ids.private_expenses.claraLaptop,
      bank_account_id: ids.bank_accounts.clara,
      amount: 840,
      theo_amount: 420,
      info: "Laptop repair shared with Anna",
      state: "partially_paid",
      cycle: null,
      pay_date: "2026-02-28T00:00:00.000Z",
      created_at: "2026-02-02T13:30:00.000Z"
    })
  ],
  group_activities: [
    createGroupActivityEntity({
      _id: ids.group_activities.sonnenalleeCleanup,
      group_id: ids.groups.sonnenallee,
      info: "Common kitchen cleanup plan",
      date: "2026-02-02T18:00:00.000Z",
      created_at: "2026-02-01T19:01:00.000Z"
    }),
    createGroupActivityEntity({
      _id: ids.group_activities.neckarstadtGameNight,
      group_id: ids.groups.neckarstadt,
      info: "Board game night organization",
      date: "2026-02-06T19:30:00.000Z",
      created_at: "2026-02-03T09:01:00.000Z"
    })
  ],
  group_funding: [
    createGroupFundingEntity({
      _id: ids.group_funding.sonnenalleeFeb,
      group_id: ids.groups.sonnenallee,
      group_activity_id: ids.group_activities.sonnenalleeCleanup,
      amount: 750,
      info: "Monthly funding February",
      created_at: "2026-02-01T08:00:00.000Z"
    }),
    createGroupFundingEntity({
      _id: ids.group_funding.neckarstadtTrip,
      group_id: ids.groups.neckarstadt,
      group_activity_id: ids.group_activities.neckarstadtGameNight,
      amount: 360,
      info: "Weekend trip funding",
      created_at: "2026-02-03T09:00:00.000Z"
    })
  ],
  funding_participants: [
    createFundingParticipantEntity({
      _id: ids.funding_participants.annaSonnenallee,
      group_funding_id: ids.group_funding.sonnenalleeFeb,
      bank_account_id: ids.bank_accounts.anna,
      amount: 250,
      created_at: "2026-02-01T08:05:00.000Z"
    }),
    createFundingParticipantEntity({
      _id: ids.funding_participants.benSonnenallee,
      group_funding_id: ids.group_funding.sonnenalleeFeb,
      bank_account_id: ids.bank_accounts.ben,
      amount: 250,
      created_at: "2026-02-01T08:06:00.000Z"
    }),
    createFundingParticipantEntity({
      _id: ids.funding_participants.claraSonnenallee,
      group_funding_id: ids.group_funding.sonnenalleeFeb,
      bank_account_id: ids.bank_accounts.clara,
      amount: 250,
      created_at: "2026-02-01T08:07:00.000Z"
    }),
    createFundingParticipantEntity({
      _id: ids.funding_participants.emreNeckarstadt,
      group_funding_id: ids.group_funding.neckarstadtTrip,
      bank_account_id: ids.bank_accounts.emre,
      amount: 180,
      created_at: "2026-02-03T09:10:00.000Z"
    }),
    createFundingParticipantEntity({
      _id: ids.funding_participants.farahNeckarstadt,
      group_funding_id: ids.group_funding.neckarstadtTrip,
      bank_account_id: ids.bank_accounts.farah,
      amount: 180,
      created_at: "2026-02-03T09:12:00.000Z"
    })
  ],
  group_expenses: [
    createGroupExpenseEntity({
      _id: ids.group_expenses.sonnenalleeGroceries,
      group_funding_id: ids.group_funding.sonnenalleeFeb,
      amount: 132,
      info: "WG grocery run",
      state: "paid",
      cycle: "monthly",
      pay_date: "2026-02-12T00:00:00.000Z",
      created_at: "2026-02-08T17:00:00.000Z"
    }),
    createGroupExpenseEntity({
      _id: ids.group_expenses.sonnenalleeInternet,
      group_funding_id: ids.group_funding.sonnenalleeFeb,
      amount: 45,
      info: "Internet February",
      state: "open",
      cycle: "monthly",
      pay_date: "2026-02-20T00:00:00.000Z",
      created_at: "2026-02-10T09:00:00.000Z"
    }),
    createGroupExpenseEntity({
      _id: ids.group_expenses.neckarstadtTrain,
      group_funding_id: ids.group_funding.neckarstadtTrip,
      amount: 96,
      info: "Train tickets",
      state: "paid",
      cycle: null,
      pay_date: "2026-02-09T00:00:00.000Z",
      created_at: "2026-02-05T14:00:00.000Z"
    })
  ],
  income: [
    createIncomeEntity({
      _id: ids.income.annaSalary,
      bank_account_id: ids.bank_accounts.anna,
      amount: 2800,
      info: "Salary January",
      state: "received",
      cycle: "monthly",
      pay_date: "2026-01-31T00:00:00.000Z",
      created_at: "2026-01-31T07:00:00.000Z"
    }),
    createIncomeEntity({
      _id: ids.income.benSalary,
      bank_account_id: ids.bank_accounts.ben,
      amount: 3100,
      info: "Salary January",
      state: "received",
      cycle: "monthly",
      pay_date: "2026-01-31T00:00:00.000Z",
      created_at: "2026-01-31T07:10:00.000Z"
    }),
    createIncomeEntity({
      _id: ids.income.emreSalary,
      bank_account_id: ids.bank_accounts.emre,
      amount: 3400,
      info: "Salary January",
      state: "received",
      cycle: "monthly",
      pay_date: "2026-01-31T00:00:00.000Z",
      created_at: "2026-01-31T07:20:00.000Z"
    })
  ],
  requests: [
    createRequestEntity({
      _id: ids.requests.annaToBenPhone,
      from_bank_account_id: ids.bank_accounts.anna,
      to_bank_account_id: ids.bank_accounts.ben,
      private_expense_id: ids.private_expenses.annaPhone,
      amount: 32.5,
      due_date: "2026-02-16T00:00:00.000Z",
      info: "Half phone bill",
      category: "utilities",
      status: "pending",
      cycle: null,
      pay_date: null,
      created_at: "2026-02-01T10:00:00.000Z"
    }),
    createRequestEntity({
      _id: ids.requests.emreToFarahTrip,
      from_bank_account_id: ids.bank_accounts.emre,
      to_bank_account_id: ids.bank_accounts.farah,
      amount: 48,
      due_date: "2026-02-11T00:00:00.000Z",
      info: "Trip train split",
      category: "travel",
      status: "paid",
      cycle: null,
      pay_date: "2026-02-06T10:00:00.000Z",
      created_at: "2026-02-05T15:00:00.000Z"
    }),
    createRequestEntity({
      _id: ids.requests.claraToAnnaBorrowed,
      from_bank_account_id: ids.bank_accounts.clara,
      to_bank_account_id: ids.bank_accounts.anna,
      private_expense_id: ids.private_expenses.claraLaptop,
      amount: 120,
      due_date: "2026-02-26T00:00:00.000Z",
      info: "Laptop repair partial",
      category: "tech",
      status: "accepted",
      cycle: null,
      pay_date: null,
      created_at: "2026-02-04T16:45:00.000Z"
    })
  ],
  transactions: [
    createTransactionEntity({
      request_id: ids.requests.emreToFarahTrip,
      created_at: "2026-02-06T10:00:00.000Z"
    }),
    createTransactionEntity({
      group_expense_id: ids.group_expenses.neckarstadtTrain,
      created_at: "2026-02-06T11:00:00.000Z"
    }),
    createTransactionEntity({
      private_expense_id: ids.private_expenses.claraLaptop,
      created_at: "2026-02-07T09:30:00.000Z"
    }),
    createTransactionEntity({
      funding_participant_id: ids.funding_participants.annaSonnenallee,
      created_at: "2026-02-01T08:08:00.000Z"
    }),
    createTransactionEntity({
      income_id: ids.income.annaSalary,
      created_at: "2026-01-31T07:01:00.000Z"
    })
  ],
  shares: [
    createShareEntity({
      depot_id: ids.depots.anna,
      symbol: "AAPL",
      units: 12.25,
      bought_at: "2025-11-15T09:30:00.000Z",
      bought_for: 1875
    }),
    createShareEntity({
      depot_id: ids.depots.ben,
      symbol: "MSFT",
      units: 8,
      bought_at: "2025-10-20T09:30:00.000Z",
      bought_for: 2520
    }),
    createShareEntity({
      depot_id: ids.depots.emre,
      symbol: "SAP",
      units: 14,
      bought_at: "2025-09-13T09:30:00.000Z",
      bought_for: 2184
    })
  ],
  budgets: [
    createBudgetEntity({
      user_id: ids.users.anna,
      category: "food",
      target_amount: 350,
      current_amount: 142.5,
      reset_date: "2026-03-01T00:00:00.000Z",
      created_at: createdAt
    }),
    createBudgetEntity({
      user_id: ids.users.ben,
      category: "travel",
      target_amount: 250,
      current_amount: 183,
      reset_date: "2026-03-01T00:00:00.000Z",
      created_at: createdAt
    }),
    createBudgetEntity({
      user_id: ids.users.clara,
      category: "tech",
      target_amount: 500,
      current_amount: 420,
      reset_date: "2026-03-01T00:00:00.000Z",
      created_at: createdAt
    })
  ]
};

const collectionOrder = [
  "users",
  "groups",
  "group_members",
  "bank_accounts",
  "depots",
  "private_expenses",
  "group_activities",
  "group_funding",
  "funding_participants",
  "group_expenses",
  "income",
  "requests",
  "transactions",
  "shares",
  "budgets"
];

async function assertSchemaIsUpToDate(db) {
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const byName = new Map(collections.map((collection) => [collection.name, collection]));

  const missing = collectionOrder.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    const details = missing.map((name) => `- Missing collection "${name}"`).join("\n");
    throw new Error(
      `Database schema is not compatible with this seed file.\n${details}\nRun "npm run schema:setup:v4" and retry.`
    );
  }

  const tx = byName.get("transactions");
  const txOneOf = tx?.options?.validator?.$jsonSchema?.oneOf;
  if (!Array.isArray(txOneOf) || txOneOf.length < 5) {
    throw new Error(
      "Database schema is not compatible with this seed file. Transactions validator does not enforce the v4 source one-of rule."
    );
  }
}

async function clearCollections(db) {
  for (const name of [...collectionOrder].reverse()) {
    const result = await db.collection(name).deleteMany({});
    console.log(`Deleted ${result.deletedCount} docs from ${dbName}.${name}`);
  }
}

async function insertCollections(db) {
  for (const name of collectionOrder) {
    const docs = data[name] ?? [];
    if (docs.length === 0) {
      continue;
    }

    const result = await db.collection(name).insertMany(docs, { ordered: true });
    console.log(`Inserted ${result.insertedCount} docs into ${dbName}.${name}`);
  }
}

async function run() {
  try {
    await withDb(async (db) => {
      console.log("Checking schema compatibility for v4...");
      await assertSchemaIsUpToDate(db);
      console.log("Schema check passed.");

      await clearCollections(db);
      await insertCollections(db);
    });

    console.log(`Seed reset finished for database "${dbName}".`);
  } catch (err) {
    console.error("Seed reset failed:", err);
    process.exitCode = 1;
  }
}

run();
