// @ts-check
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL env var.");
}

// Parse pg's `numeric` columns as JavaScript floats instead of strings
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val) => parseFloat(val));

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

export async function getClient() {
  return await pool.connect();
}

export async function checkDatabaseConnection() {
  try {
    const result = await pool.query("SELECT 1 AS ok");
    return {
      ok: result.rows[0]?.ok === 1,
      database: "supabase",
      checked_at: new Date().toISOString()
    };
  } catch (/** @type {unknown} */ err) {
    const error = /** @type {Error & { code?: string }} */ (err);
    return {
      ok: false,
      database: "supabase",
      checked_at: new Date().toISOString(),
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? "Unknown connection error"
      }
    };
  }
}

export { pool };
