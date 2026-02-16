import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Missing MONGODB_URI env var.");
}

const baseDbName = process.env.MONGODB_DB || "finanzapp";
const dbName = process.env.MONGODB_DB_V3 || `${baseDbName}_v3`;

let client;

export async function withDb(work) {
  client ??= new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    return await work(db);
  } finally {
    await client.close();
    client = null;
  }
}

export async function checkDatabaseConnection() {
  try {
    const result = await withDb(async (db) => {
      const ping = await db.command({ ping: 1 });
      return {
        ok: ping?.ok === 1,
        database: db.databaseName
      };
    });

    return {
      ...result,
      checked_at: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      database: dbName,
      checked_at: new Date().toISOString(),
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? "Unknown connection error"
      }
    };
  }
}

export { dbName };
