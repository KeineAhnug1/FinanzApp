import { randomBytes } from "node:crypto";

export function createSessionStore({ cookieName, ttlMinutes }) {
  let pool = null;

  async function init(db) {
    pool = db;
  }

  function sessionExpiresAt() {
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  async function createSession(userId) {
    const token = randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, NOW())`,
      [token, userId, sessionExpiresAt()]
    );
    return token;
  }

  async function destroySession(token) {
    if (!token) return;
    await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }

  async function getSessionRecord(token) {
    if (!token) return null;
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

  function gcSessions() {}

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
