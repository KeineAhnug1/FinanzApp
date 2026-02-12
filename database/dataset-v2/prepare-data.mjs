import { withDb } from "./db-client.mjs";
import { getPreparedData } from "./data-service.mjs";

function readArgValue(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

async function run() {
  try {
    const username = readArgValue("--username");
    const prepared = await withDb((db) => getPreparedData(db, { username }));
    console.log(JSON.stringify(prepared, null, 2));
  } catch (err) {
    console.error("Preparing v2 data failed:", err);
    process.exitCode = 1;
  }
}

run();
