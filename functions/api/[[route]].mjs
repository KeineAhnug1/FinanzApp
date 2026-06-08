// @ts-check
// Cloudflare Pages Functions entry point for all /api/* routes
import pg from "pg";
import { handleApiRequest } from "../../backend/router.mjs";

const { Pool } = pg;

export async function onRequest({ request, env }) {
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!connectionString) {
    return new Response(JSON.stringify({ ok: false, message: "DATABASE_URL ist nicht gesetzt" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    return await handleApiRequest(request, pool, env);
  } catch (error) {
    console.error("Request failed:", error);
    return new Response(JSON.stringify({ ok: false, message: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  } finally {
    await pool.end().catch(() => {});
  }
}
