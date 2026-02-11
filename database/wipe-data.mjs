import "dotenv/config";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI env var.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "finanzapp";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db(dbName);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = collections
      .map((c) => c.name)
      .filter((name) => !name.startsWith("system."));

    let totalDeleted = 0;
    for (const name of names) {
      const result = await db.collection(name).deleteMany({});
      totalDeleted += result.deletedCount ?? 0;
      console.log(`Deleted ${result.deletedCount} docs from ${dbName}.${name}`);
    }

    console.log(
      `Database wipe complete. Cleared ${totalDeleted} documents from ${names.length} collections in "${dbName}".`
    );
  } catch (err) {
    console.error("Database wipe failed:", err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
