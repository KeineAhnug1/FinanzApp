import { randomBytes } from "node:crypto";

/**
 * MongoDB-backed session store.
 *
 * Sessions are persisted in the `sessions` collection so they survive
 * server restarts and tab/browser closes.  The TTL index on `expiresAt`
 * lets MongoDB clean up expired documents automatically.
 *
 * Call `init(db)` once after the database connection is ready.
 */
export function createSessionStore({ cookieName, ttlMinutes }) {
  let col = null;

  /** Must be called once the MongoDB connection is established. */
  async function init(db) {
    col = db.collection("sessions");
    // TTL index — MongoDB removes expired documents automatically
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await col.createIndex({ token: 1 }, { unique: true });
  }

  function sessionExpiresAt() {
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  async function createSession(userId) {
    const token = randomBytes(32).toString("hex");
    await col.insertOne({
      token,
      userId: String(userId),
      expiresAt: sessionExpiresAt(),
      createdAt: new Date()
    });
    return token;
  }

  async function destroySession(token) {
    if (!token) return;
    await col.deleteOne({ token });
  }

  async function getSessionRecord(token) {
    if (!token) return null;
    const rec = await col.findOne({ token });
    if (!rec) return null;
    if (rec.expiresAt <= new Date()) {
      await col.deleteOne({ token });
      return null;
    }
    // Sliding expiry: update expiresAt on each access
    await col.updateOne({ token }, { $set: { expiresAt: sessionExpiresAt() } });
    return { userId: rec.userId };
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

  // gcSessions is kept for API compatibility but is a no-op —
  // MongoDB's TTL index handles cleanup.
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
