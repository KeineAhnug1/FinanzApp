import { MongoClient } from "mongodb";
import { EJSON } from "bson";
import { readFile } from "node:fs/promises";
import path from "node:path";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI env var. Example: MONGODB_URI=\"mongodb+srv://USER:PASS@cluster...\"");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "mydb";
const baseDir = path.resolve("/Users/I767817/Documents/DHBW/Semester1/Projekt Management/FinanzApp/testdata");

const collections = [
  { name: "users", file: "users.json" },
  { name: "accounts", file: "accounts.json" },
  { name: "transactions", file: "transactions.json" },
  { name: "budgets", file: "budgets.json" }
];

const client = new MongoClient(uri);

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  // Parse Extended JSON ($oid, $date, etc.) into BSON types
  return EJSON.parse(raw);
}

async function run() {
  try {
    await client.connect();
    const db = client.db(dbName);

    for (const { name, file } of collections) {
      const fullPath = path.join(baseDir, file);
      const docs = await loadJson(fullPath);

      if (!Array.isArray(docs)) {
        throw new Error(`${file} must contain a JSON array`);
      }

      const result = await db.collection(name).insertMany(docs, { ordered: true });
      console.log(`Inserted ${result.insertedCount} docs into ${dbName}.${name}`);
    }
  } catch (err) {
    console.error("Import failed:", err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
