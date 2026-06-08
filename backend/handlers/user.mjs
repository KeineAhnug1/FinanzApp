// @ts-check
import { parseId } from "../utils/data.mjs";
import { jsonResponse, parseBody, parseCookies } from "../utils/http.mjs";
import { badRequest, unauthorized } from "../helpers/responses.mjs";
import { hashPassword, verifyPassword } from "../utils/password.mjs";
import { checkRateLimit } from "../utils/rate-limit.mjs";
import { SESSION_COOKIE_NAME } from "../config/runtime.mjs";

/**
 * @param {{
 *   pool: Pool;
 *   kv: KVNamespace;
 *   destroySession: (token: string | undefined, kv: KVNamespace) => Promise<void>;
 *   clearSessionCookie: () => string;
 * }} opts
 */
export function createUserHandlers({ pool, kv, destroySession, clearSessionCookie }) {

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleDeleteUserAccount(request, session) {
    if (request.method !== "DELETE") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "DELETE" });

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM income WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = $1)`, [userId]);
      await client.query(`DELETE FROM private_expenses WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = $1)`, [userId]);
      await client.query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_categories WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM bank_accounts WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM share_accounts WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM group_members WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM question_likes WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM answer_likes WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM email_verifications WHERE email IN (SELECT email FROM users WHERE id = $1)`, [userId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const cookies = parseCookies(request);
    await destroySession(cookies[SESSION_COOKIE_NAME], kv);

    return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handlePasswordChange(request, session) {
    if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const rl = checkRateLimit(request, { maxAttempts: 5, windowMs: 60_000, group: "password-change" });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const currentPassword = String(payload.current_password || "");
    const newPassword = String(payload.new_password || "");

    if (!currentPassword || !newPassword) return badRequest("Aktuelles und neues Passwort sind Pflichtfelder");
    if (newPassword.length < 8) return badRequest("Neues Passwort muss mindestens 8 Zeichen haben");

    const userId = parseId(session.user.id);
    const { rows } = await pool.query(`SELECT password FROM users WHERE id = $1`, [userId]);
    if (rows.length === 0) return unauthorized("Benutzer nicht gefunden");

    const isValid = await verifyPassword(currentPassword, rows[0].password);
    if (!isValid) return jsonResponse({ ok: false, code: "wrong_password", message: "Aktuelles Passwort ist falsch" }, 400);

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [await hashPassword(newPassword), userId]);
    return jsonResponse({ ok: true, message: "Passwort erfolgreich geändert" }, 200);
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleProfileImageUpload(request, session) {
    if (request.method !== "PUT") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "PUT" });
    const rl = checkRateLimit(request, { maxAttempts: 10, windowMs: 60_000, group: "profile-image" });
    if (rl) return rl;

    const payload = await parseBody(request, 210_000);
    if (!payload) return jsonResponse({ ok: false, message: "Bild ist zu groß (max. 200 KB)" }, 413);

    const profileImage = payload.profileImage;
    if (!profileImage || typeof profileImage !== "string") return badRequest("profileImage ist ein Pflichtfeld");

    const dataUrlMatch = profileImage.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
    if (!dataUrlMatch) return badRequest("Nur JPEG, PNG und WebP sind erlaubt");

    const base64Data = profileImage.slice(profileImage.indexOf(",") + 1);
    const approxBytes = Math.ceil(base64Data.length * 0.75);
    if (approxBytes > 210_000) return jsonResponse({ ok: false, message: "Bild ist zu groß (max. 200 KB)" }, 413);

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");

    await pool.query(`UPDATE users SET "profileImage" = $1 WHERE id = $2`, [profileImage, userId]);
    return jsonResponse({ ok: true, message: "Profilbild gespeichert" }, 200);
  }

  return { handleDeleteUserAccount, handlePasswordChange, handleProfileImageUpload };
}
