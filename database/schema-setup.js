const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set in the environment");
}

const dbName = process.env.MONGODB_DB || "finanzapp";
const client = new MongoClient(uri);

const collections = [
  {
    name: "users",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["username", "email", "password", "firstname", "lastname", "age", "created_at"],
        properties: {
          username: { bsonType: "string", minLength: 1 },
          email: { bsonType: "string", minLength: 5 },
          password: { bsonType: "string", minLength: 1 },
          firstname: { bsonType: "string", minLength: 1 },
          lastname: { bsonType: "string", minLength: 1 },
          age: { bsonType: "int", minimum: 0 },
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
    name: "wgs",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["name", "adress", "created_at"],
        properties: {
          name: { bsonType: "string", minLength: 1 },
          adress: { bsonType: "string", minLength: 1 },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [{ key: { name: 1 }, options: { name: "wgs_name_idx" } }]
  },
  {
    name: "wg_members",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["wg_id", "user_id", "role", "joined_at"],
        properties: {
          wg_id: { bsonType: "objectId" },
          user_id: { bsonType: "objectId" },
          role: { bsonType: "string", minLength: 1 },
          joined_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { wg_id: 1, user_id: 1 }, options: { unique: true, name: "wg_members_unique_pair" } },
      { key: { user_id: 1 }, options: { name: "wg_members_user_id_idx" } }
    ]
  },
  {
    name: "bank_accounts",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["user_id", "balance", "currency", "created_at"],
        properties: {
          user_id: { bsonType: "objectId" },
          balance: { bsonType: "int" },
          currency: { bsonType: "string", minLength: 3, maxLength: 3 },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      {
        key: { user_id: 1 },
        options: { unique: true, name: "bank_accounts_user_unique" }
      }
    ]
  },
  {
    name: "transactions",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["amount", "currency", "created_at"],
        properties: {
          amount: { bsonType: "int" },
          currency: { bsonType: "string", minLength: 3, maxLength: 3 },
          request_id: { bsonType: ["objectId", "null"] },
          expense_shares_id: { bsonType: ["objectId", "null"] },
          created_at: { bsonType: "date" }
        },
        anyOf: [
          { required: ["request_id"] },
          { required: ["expense_shares_id"] }
        ],
        additionalProperties: true
      }
    },
    indexes: [
      { key: { created_at: -1 }, options: { name: "transactions_created_at_idx" } },
      { key: { request_id: 1 }, options: { name: "transactions_request_id_idx" } },
      { key: { expense_shares_id: 1 }, options: { name: "transactions_expense_share_id_idx" } }
    ]
  },
  {
    name: "requests",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["from_user_id", "to_user_id", "amount", "currency", "due_date", "status", "created_at"],
        properties: {
          from_user_id: { bsonType: "objectId" },
          to_user_id: { bsonType: "objectId" },
          amount: { bsonType: "int" },
          currency: { bsonType: "string", minLength: 3, maxLength: 3 },
          due_date: { bsonType: "date" },
          status: { bsonType: "string", enum: ["pending", "accepted", "rejected", "paid"] },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      {
        key: { from_user_id: 1, to_user_id: 1, status: 1 },
        options: { name: "requests_from_to_status_idx" }
      },
      { key: { due_date: 1, status: 1 }, options: { name: "requests_due_status_idx" } }
    ]
  },
  {
    name: "expenses",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["amount", "currency", "info", "category", "due_date", "created_at"],
        properties: {
          amount: { bsonType: "int" },
          currency: { bsonType: "string", minLength: 3, maxLength: 3 },
          info: { bsonType: "string" },
          category: { bsonType: "string" },
          due_date: { bsonType: "date" },
          created_at: { bsonType: "date" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { category: 1, due_date: 1 }, options: { name: "expenses_category_due_date_idx" } },
      { key: { created_at: -1 }, options: { name: "expenses_created_at_idx" } }
    ]
  },
  {
    name: "expense_shares",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["expense_id", "user_id", "amount", "is_settled"],
        properties: {
          expense_id: { bsonType: "objectId" },
          user_id: { bsonType: "objectId" },
          amount: { bsonType: "int" },
          is_settled: { bsonType: "bool" },
          settled_at: { bsonType: ["date", "null"] }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { expense_id: 1, user_id: 1 }, options: { unique: true, name: "expense_shares_unique_pair" } },
      { key: { user_id: 1, is_settled: 1 }, options: { name: "expense_shares_user_settled_idx" } }
    ]
  },
  {
    name: "shares",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["bank_id", "shares", "amount"],
        properties: {
          bank_id: { bsonType: "objectId" },
          shares: { bsonType: "string", minLength: 1 },
          amount: { bsonType: "int" }
        },
        additionalProperties: true
      }
    },
    indexes: [
      { key: { bank_id: 1 }, options: { name: "shares_bank_id_idx" } },
      { key: { shares: 1 }, options: { name: "shares_symbol_idx" } }
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
