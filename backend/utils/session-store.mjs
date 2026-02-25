import { randomBytes } from "node:crypto";

export function createSessionStore({ cookieName, ttlMinutes }) {
  const sessions = new Map();

  function sessionExpiresAt() {
    return Date.now() + ttlMinutes * 60 * 1000;
  }

  function createSession(userId) {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { userId: String(userId), expiresAt: sessionExpiresAt() });
    return token;
  }

  function destroySession(token) {
    if (!token) return;
    sessions.delete(token);
  }

  function getSessionRecord(token) {
    if (!token) return null;
    const rec = sessions.get(token);
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    rec.expiresAt = sessionExpiresAt();
    return rec;
  }

  function gcSessions() {
    const now = Date.now();
    for (const [token, rec] of sessions.entries()) {
      if (!rec || rec.expiresAt <= now) sessions.delete(token);
    }
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

  return {
    buildSessionCookie,
    clearSessionCookie,
    createSession,
    destroySession,
    gcSessions,
    getSessionRecord
  };
}
