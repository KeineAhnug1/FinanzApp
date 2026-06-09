// @ts-check
// KV-basierter Session Store für Cloudflare Workers
import { randomBytes } from "node:crypto";

const SESSION_COOKIE_NAME_DEFAULT = "finanzapp_session";

/**
 * @param {{ ttlMinutes: number; cookieName?: string }} options
 */
export function createKvSessionStore({ ttlMinutes, cookieName = SESSION_COOKIE_NAME_DEFAULT }) {
  /**
   * @param {string | number} userId
   * @param {KVNamespace} kv
   * @returns {Promise<string>}
   */
  async function createSession(userId, kv) {
    const token = randomBytes(32).toString("hex");
    await kv.put(`session:${token}`, String(userId), { expirationTtl: ttlMinutes * 60 });
    return token;
  }

  /**
   * @param {string | undefined} token
   * @param {KVNamespace} kv
   * @returns {Promise<{ userId: string } | null>}
   */
  async function getSessionRecord(token, kv) {
    if (!token) return null;
    const userId = await kv.get(`session:${token}`);
    if (!userId) return null;
    // Slide expiry by re-putting with full TTL
    await kv.put(`session:${token}`, userId, { expirationTtl: ttlMinutes * 60 });
    return { userId };
  }

  /**
   * @param {string | undefined} token
   * @param {KVNamespace} kv
   */
  async function destroySession(token, kv) {
    if (!token) return;
    await kv.delete(`session:${token}`);
  }

  /**
   * @param {string} token
   * @param {boolean} [secure]
   */
  function buildSessionCookie(token, secure = false) {
    const attrs = [
      `${cookieName}=${encodeURIComponent(token)}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Lax",
      `Max-Age=${ttlMinutes * 60}`,
    ];
    if (secure) attrs.push("Secure");
    return attrs.join("; ");
  }

  /** @param {boolean} [secure] */
  function clearSessionCookie(secure = false) {
    const attrs = [`${cookieName}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
    if (secure) attrs.push("Secure");
    return attrs.join("; ");
  }

  return {
    createSession,
    getSessionRecord,
    destroySession,
    buildSessionCookie,
    clearSessionCookie,
  };
}
