// @ts-check
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

/**
 * @param {{ cookieName: string; ttlMinutes: number }} options
 */
export function createSessionStore({ cookieName, ttlMinutes }) {
  /** @type {Pool | null} */
  let pool = null;

  /** @param {Pool} db */
  async function init(db) {
    pool = db;
  }

  function sessionExpiresAt() {
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  /** @param {string | number} userId */
  async function createSession(userId) {
    if (!pool) throw new Error("Session store not initialized");
    const token = randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, NOW())`,
      [token, userId, sessionExpiresAt()]
    );
    return token;
  }

  /** @param {string | undefined} token */
  async function destroySession(token) {
    if (!token) return;
    if (!pool) throw new Error("Session store not initialized");
    await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }

  /** @param {string | undefined} token */
  async function getSessionRecord(token) {
    if (!token) return null;
    if (!pool) throw new Error("Session store not initialized");
    const { rows } = await pool.query(
      `SELECT user_id, expires_at FROM sessions WHERE token = $1`,
      [token]
    );
    if (rows.length === 0) return null;
    const rec = rows[0];

    if (new Date(rec.expires_at) <= new Date()) {
      await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
      return null;
    }

    const halfTtlMs = ttlMinutes * 30 * 1000;
    if (new Date(rec.expires_at).getTime() - Date.now() < halfTtlMs) {
      await pool.query(
        `UPDATE sessions SET expires_at = $1 WHERE token = $2`,
        [sessionExpiresAt(), token]
      );
    }

    return { userId: String(rec.user_id) };
  }

  /** @param {string} token */
  function buildSessionCookie(token) {
    const attrs = [
      `${cookieName}=${encodeURIComponent(token)}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      `Max-Age=${ttlMinutes * 60}`
    ];
    if (process.env.NODE_ENV === "production") attrs.push("Secure");
    return attrs.join("; ");
  }

  function clearSessionCookie() {
    const attrs = [`${cookieName}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
    if (process.env.NODE_ENV === "production") attrs.push("Secure");
    return attrs.join("; ");
  }

  async function gcSessions() {
    if (!pool) return;
    await pool.query(`DELETE FROM sessions WHERE expires_at <= NOW()`);
  }

  return {
    init,
    buildSessionCookie,
    clearSessionCookie,
    createSession,
    destroySession,
    gcSessions,
    getSessionRecord
  };
}
