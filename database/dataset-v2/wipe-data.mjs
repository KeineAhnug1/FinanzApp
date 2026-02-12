import { withDb, dbName } from "./db-client.mjs";

async function run() {
  try {
    const result = await withDb(async (db) => {
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      const names = collections
        .map((collection) => collection.name)
        .filter((name) => !name.startsWith("system."));

      let totalDeleted = 0;
      for (const name of names) {
        const deletion = await db.collection(name).deleteMany({});
        totalDeleted += deletion.deletedCount ?? 0;
        console.log(`Deleted ${deletion.deletedCount} docs from ${dbName}.${name}`);
      }

      return { totalDeleted, collectionCount: names.length };
    });

    console.log(
      `Database wipe complete. Cleared ${result.totalDeleted} documents from ${result.collectionCount} collections in "${dbName}".`
    );
  } catch (err) {
    console.error("Database wipe failed:", err);
    process.exitCode = 1;
  }
}

run();
