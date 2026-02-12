import { checkDatabaseConnection } from "./db-client.mjs";

async function run() {
  const status = await checkDatabaseConnection();
  console.log(JSON.stringify(status, null, 2));
  process.exitCode = status.ok ? 0 : 1;
}

run();
