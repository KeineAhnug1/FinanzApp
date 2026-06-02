// @ts-check
import { parseId } from "../utils/data.mjs";
import { parseBody, sendJson, parseCookies } from "../utils/http.mjs";
import { badRequest, unauthorized } from "../helpers/responses.mjs";
import { hashPassword, verifyPassword } from "../utils/password.mjs";
import { checkRateLimit } from "../utils/rate-limit.mjs";
import { SESSION_COOKIE_NAME } from "../config/runtime.mjs";

/**
 * @param {{ pool: Pool; destroySession: (token: string | undefined) => Promise<void>; clearSessionCookie: () => string }} opts
 */
export function createUserHandlers({ pool, destroySession, clearSessionCookie }) {

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {{ user: { id: string } }} session
   */
  async function handleDeleteUserAccount(req, res, session) {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", "DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    await Promise.all([
      pool.query(`DELETE FROM income WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = $1)`, [userId]),
      pool.query(`DELETE FROM private_expenses WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = $1)`, [userId]),
      pool.query(`DELETE FROM user_categories WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM bank_accounts WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM share_accounts WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM transactions WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM group_members WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM question_likes WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM answer_likes WHERE user_id = $1`, [userId]),
      pool.query(`DELETE FROM email_verifications WHERE email IN (SELECT email FROM users WHERE id = $1)`, [userId])
    ]);

    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

    await destroySession(parseCookies(req)[SESSION_COOKIE_NAME]);

    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {{ user: { id: string } }} session
   */
  async function handlePasswordChange(req, res, session) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 5, windowMs: 60_000, group: "password-change" })) return;

    const payload = await parseBody(req, res);
    if (!payload) return;

    const currentPassword = String(payload.current_password || "");
    const newPassword = String(payload.new_password || "");

    if (!currentPassword || !newPassword) return badRequest(res, "Aktuelles und neues Passwort sind Pflichtfelder");
    if (newPassword.length < 8) return badRequest(res, "Neues Passwort muss mindestens 8 Zeichen haben");

    const userId = parseId(session.user.id);
    const { rows } = await pool.query(`SELECT password FROM users WHERE id = $1`, [userId]);
    if (rows.length === 0) return unauthorized(res, "Benutzer nicht gefunden");

    const isValid = await verifyPassword(currentPassword, rows[0].password);
    if (!isValid) return sendJson(res, 400, { ok: false, code: "wrong_password", message: "Aktuelles Passwort ist falsch" });

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [await hashPassword(newPassword), userId]);

    return sendJson(res, 200, { ok: true, message: "Passwort erfolgreich geändert" });
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {{ user: { id: string } }} session
   */
  async function handleProfileImageUpload(req, res, session) {
    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 10, windowMs: 60_000, group: "profile-image" })) return;

    const payload = await parseBody(req, res, { maxBytes: 210_000, tooLargeMessage: "Bild ist zu groß (max. 200 KB)" });
    if (!payload) return;

    const profileImage = payload.profileImage;
    if (!profileImage || typeof profileImage !== "string") return badRequest(res, "profileImage ist ein Pflichtfeld");

    const dataUrlMatch = profileImage.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
    if (!dataUrlMatch) return badRequest(res, "Nur JPEG, PNG und WebP sind erlaubt");

    const base64Data = profileImage.slice(profileImage.indexOf(",") + 1);
    const approxBytes = Math.ceil(base64Data.length * 0.75);
    if (approxBytes > 210_000) return sendJson(res, 413, { ok: false, message: "Bild ist zu groß (max. 200 KB)" });

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    await pool.query(`UPDATE users SET "profileImage" = $1 WHERE id = $2`, [profileImage, userId]);

    return sendJson(res, 200, { ok: true, message: "Profilbild gespeichert" });
  }

  return { handleDeleteUserAccount, handlePasswordChange, handleProfileImageUpload };
}
