const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set in the environment");
}

const baseDbName = process.env.MONGODB_DB || "finanzapp";
const dbName = process.env.MONGODB_DB_V3 || `${baseDbName}_v3`;
const client = new MongoClient(uri);

const sourceFields = [
  "request_id",
  "private_expense_id",
  "group_expense_id",
  "funding_participant_id",
  "income_id"
];

const transactionOneOf = sourceFields.map((field) => ({
  required: [field],
  not: {
    anyOf: sourceFields.filter((name) => name !== field).map((name) => ({ required: [name] }))
  },
  properties: {
    [field]: { bsonType: "objectId" }
  }
}));

const collections = [
  {
    name: "users",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["username", "email", "password", "first_name", "last_name", "created_at"],
        properties: {
          username: { bsonType: "string", minLength: 1 },
          email: { bsonType: "string", minLength: 5 },
          password: { bsonType: "string", minLength: 1 },
          first_name: { bsonType: "string", minLength: 1 },
          last_name: { bsonType: "string", minLength: 1 },
          age: { bsonType: ["int", "null"], minimum: 0 },
          verification_code: { bsonType: ["int", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { username: 1 }, options: { unique: true, name: "users_username_unique" } },
      { key: { email: 1 }, options: { unique: true, name: "users_email_unique" } }
    ]
  },
  {
    name: "income",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["bank_account_id", "amount", "created_at"],
        properties: {
          bank_account_id: { bsonType: "objectId" },
          amount: { bsonType: "decimal", minimum: 0 },
          info: { bsonType: ["string", "null"] },
          state: { bsonType: ["string", "null"] },
          cycle: { bsonType: ["string", "null"] },
          pay_date: { bsonType: ["date", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { bank_account_id: 1, created_at: -1 }, options: { name: "income_bank_account_created_idx" } },
      { key: { state: 1 }, options: { name: "income_state_idx" } },
      { key: { pay_date: 1 }, options: { name: "income_pay_date_idx" } }
    ]
  },
  {
    name: "depots",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["user_id"],
        properties: {
          user_id: { bsonType: "objectId" },
          created_at: { bsonType: ["date", "null"] }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { user_id: 1 }, options: { name: "depots_user_idx" } }
    ]
  },
  {
    name: "groups",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["name", "created_at"],
        properties: {
          name: { bsonType: "string", minLength: 1 },
          info: { bsonType: ["string", "null"] },
          address: { bsonType: ["string", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [{ key: { name: 1 }, options: { name: "groups_name_idx" } }]
  },
  {
    name: "group_members",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["group_id", "user_id", "role"],
        properties: {
          group_id: { bsonType: "objectId" },
          user_id: { bsonType: "objectId" },
          role: { bsonType: "string", minLength: 1 },
          status: { bsonType: ["string", "null"] }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { group_id: 1, user_id: 1 }, options: { unique: true, name: "group_members_unique_pair" } },
      { key: { group_id: 1, status: 1 }, options: { name: "group_members_group_status_idx" } },
      { key: { user_id: 1 }, options: { name: "group_members_user_idx" } }
    ]
  },
  {
    name: "bank_accounts",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["user_id", "balance", "created_at"],
        properties: {
          user_id: { bsonType: "objectId" },
          balance: { bsonType: "decimal", minimum: 0 },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [{ key: { user_id: 1 }, options: { name: "bank_accounts_user_idx" } }]
  },
  {
    name: "private_expenses",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["bank_account_id", "amount", "theo_amount", "created_at"],
        properties: {
          bank_account_id: { bsonType: "objectId" },
          amount: { bsonType: "decimal", minimum: 0 },
          theo_amount: { bsonType: "decimal", minimum: 0 },
          info: { bsonType: ["string", "null"] },
          state: { bsonType: ["string", "null"] },
          cycle: { bsonType: ["string", "null"] },
          pay_date: { bsonType: ["date", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { bank_account_id: 1, pay_date: 1 }, options: { name: "private_expenses_bank_pay_idx" } },
      { key: { state: 1 }, options: { name: "private_expenses_state_idx" } },
      { key: { cycle: 1 }, options: { name: "private_expenses_cycle_idx" } }
    ]
  },
  {
    name: "group_activities",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["group_id", "created_at"],
        properties: {
          group_id: { bsonType: "objectId" },
          info: { bsonType: ["string", "null"] },
          date: { bsonType: ["date", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { group_id: 1, date: -1 }, options: { name: "group_activities_group_date_idx" } },
      { key: { created_at: -1 }, options: { name: "group_activities_created_at_idx" } }
    ]
  },
  {
    name: "group_funding",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["group_id", "group_activity_id", "created_at"],
        properties: {
          group_id: { bsonType: "objectId" },
          group_activity_id: { bsonType: "objectId" },
          amount: { bsonType: ["decimal", "null"], minimum: 0 },
          info: { bsonType: ["string", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { group_id: 1, created_at: -1 }, options: { name: "group_funding_group_created_idx" } },
      { key: { group_activity_id: 1 }, options: { name: "group_funding_activity_idx" } }
    ]
  },
  {
    name: "funding_participants",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["bank_account_id", "group_funding_id", "created_at"],
        properties: {
          bank_account_id: { bsonType: "objectId" },
          group_funding_id: { bsonType: "objectId" },
          amount: { bsonType: ["decimal", "null"], minimum: 0 },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      {
        key: { group_funding_id: 1, bank_account_id: 1 },
        options: { unique: true, name: "funding_participants_unique_pair" }
      },
      { key: { bank_account_id: 1 }, options: { name: "funding_participants_bank_idx" } }
    ]
  },
  {
    name: "group_expenses",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["group_funding_id", "amount", "created_at"],
        properties: {
          group_funding_id: { bsonType: "objectId" },
          amount: { bsonType: "decimal", minimum: 0 },
          info: { bsonType: ["string", "null"] },
          state: { bsonType: ["string", "null"] },
          cycle: { bsonType: ["string", "null"] },
          pay_date: { bsonType: ["date", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { group_funding_id: 1, pay_date: 1 }, options: { name: "group_expenses_funding_pay_idx" } },
      { key: { state: 1 }, options: { name: "group_expenses_state_idx" } },
      { key: { cycle: 1 }, options: { name: "group_expenses_cycle_idx" } }
    ]
  },
  {
    name: "requests",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["from_bank_account_id", "to_bank_account_id", "amount", "status", "created_at"],
        properties: {
          from_bank_account_id: { bsonType: "objectId" },
          to_bank_account_id: { bsonType: "objectId" },
          private_expense_id: { bsonType: ["objectId", "null"] },
          amount: { bsonType: "decimal", minimum: 0 },
          due_date: { bsonType: ["date", "null"] },
          info: { bsonType: ["string", "null"] },
          category: { bsonType: ["string", "null"] },
          status: { bsonType: "string", minLength: 1 },
          cycle: { bsonType: ["string", "null"] },
          pay_date: { bsonType: ["date", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      {
        key: { from_bank_account_id: 1, to_bank_account_id: 1, status: 1 },
        options: { name: "requests_from_to_status_idx" }
      },
      { key: { private_expense_id: 1 }, options: { name: "requests_private_expense_idx" } },
      { key: { due_date: 1, status: 1 }, options: { name: "requests_due_status_idx" } },
      { key: { pay_date: 1 }, options: { name: "requests_pay_date_idx" } }
    ]
  },
  {
    name: "transactions",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["created_at"],
        properties: {
          request_id: { bsonType: ["objectId", "null"] },
          private_expense_id: { bsonType: ["objectId", "null"] },
          group_expense_id: { bsonType: ["objectId", "null"] },
          funding_participant_id: { bsonType: ["objectId", "null"] },
          income_id: { bsonType: ["objectId", "null"] },
          created_at: { bsonType: "date" }
        },
        oneOf: transactionOneOf,
        additionalProperties: true
      }
    },
    indexes: [
      { key: { request_id: 1 }, options: { name: "transactions_request_idx" } },
      { key: { private_expense_id: 1 }, options: { name: "transactions_private_expense_idx" } },
      { key: { group_expense_id: 1 }, options: { name: "transactions_group_expense_idx" } },
      { key: { funding_participant_id: 1 }, options: { name: "transactions_funding_participant_idx" } },
      { key: { income_id: 1 }, options: { name: "transactions_income_idx" } },
      { key: { created_at: -1 }, options: { name: "transactions_created_at_idx" } }
    ]
  },
  {
    name: "shares",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["depot_id", "symbol", "units", "bought_at", "bought_for"],
        properties: {
          depot_id: { bsonType: "objectId" },
          symbol: { bsonType: "string", minLength: 1 },
          units: { bsonType: "decimal", minimum: 0 },
          bought_at: { bsonType: "date" },
          bought_for: { bsonType: "decimal", minimum: 0 }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { depot_id: 1 }, options: { name: "shares_depot_idx" } },
      { key: { symbol: 1 }, options: { name: "shares_symbol_idx" } }
    ]
  },
  {
    name: "budgets",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["user_id", "target_amount", "current_amount", "created_at"],
        properties: {
          user_id: { bsonType: "objectId" },
          category: { bsonType: ["string", "null"] },
          target_amount: { bsonType: "decimal", minimum: 0 },
          current_amount: { bsonType: "decimal", minimum: 0 },
          reset_date: { bsonType: ["date", "null"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { user_id: 1, category: 1 }, options: { name: "budgets_user_category_idx" } },
      { key: { reset_date: 1 }, options: { name: "budgets_reset_date_idx" } }
    ]
  }
];

async function ensureCollection(db, config) {
  const exists = await db.listCollections({ name: config.name }, { nameOnly: true }).hasNext();

  if (!exists) {
    await db.createCollection(config.name, {
      validator: config.validator,
      validationLevel: "strict",
      validationAction: "error"
    });
    console.log(`Created collection ${config.name}`);
  } else {
    await db.command({
      collMod: config.name,
      validator: config.validator,
      validationLevel: "strict",
      validationAction: "error"
    });
    console.log(`Updated validator for ${config.name}`);
  }

  for (const index of config.indexes) {
    await db.collection(config.name).createIndex(index.key, index.options);
  }
  console.log(`Ensured indexes for ${config.name}`);
}

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");

    const db = client.db(dbName);
    for (const config of collections) {
      await ensureCollection(db, config);
    }

    console.log(`Schema setup finished for database "${dbName}"`);
  } catch (err) {
    console.error("Schema setup failed:", err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
