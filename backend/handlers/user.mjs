import { COLLECTIONS, SESSION_COOKIE_NAME } from "../config/runtime.mjs";
import { parseObjectId } from "../utils/data.mjs";
import { parseCookies, readBody, sendJson } from "../utils/http.mjs";
import { hashPassword, verifyPassword } from "../utils/password.mjs";
import { checkRateLimit } from "../utils/rate-limit.mjs";
import { badRequest, unauthorized, forbidden } from "../helpers/responses.mjs";

export function createUserHandlers({ db, destroySession, clearSessionCookie }) {

  async function handleDeleteUserAccount(req, res, session) {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", "DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    await Promise.all([
      db.collection(COLLECTIONS.incomeEntries).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.expenseEntries).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.userCategories).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.bankAccounts).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.shareAccounts).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.transactions).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.groupMembers).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.questionLikes).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.answerLikes).deleteMany({ user_id: userId }),
      db.collection(COLLECTIONS.emailVerifications).deleteMany({ user_id: userId })
    ]);

    await db.collection(COLLECTIONS.users).deleteOne({ _id: userId });
    await destroySession(parseCookies(req)[SESSION_COOKIE_NAME]);

    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }

  async function handlePasswordChange(req, res, session) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 5, windowMs: 60_000, group: "password-change" })) return;

    let payload;
    try {
      payload = await readBody(req);
    } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }

    const currentPassword = String(payload.current_password || "");
    const newPassword = String(payload.new_password || "");

    if (!currentPassword || !newPassword) return badRequest(res, "Aktuelles und neues Passwort sind Pflichtfelder");
    if (newPassword.length < 8) return badRequest(res, "Neues Passwort muss mindestens 8 Zeichen haben");

    const userId = parseObjectId(session.user.id);
    const user = await db.collection(COLLECTIONS.users).findOne({ _id: userId }, { projection: { password: 1 } });
    if (!user) return unauthorized(res, "Benutzer nicht gefunden");

    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) return sendJson(res, 400, { ok: false, code: "wrong_password", message: "Aktuelles Passwort ist falsch" });

    await db.collection(COLLECTIONS.users).updateOne(
      { _id: userId },
      { $set: { password: await hashPassword(newPassword) } }
    );

    return sendJson(res, 200, { ok: true, message: "Passwort erfolgreich geändert" });
  }

  async function handleProfileImageUpload(req, res, session) {
    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 10, windowMs: 60_000, group: "profile-image" })) return;

    let payload;
    try {
      payload = await readBody(req, { maxBytes: 300_000 });
    } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Bild ist zu groß (max. 200 KB)" });
      return badRequest(res, "Invalid JSON body");
    }

    const profileImage = payload.profileImage;
    if (!profileImage || typeof profileImage !== "string") return badRequest(res, "profileImage ist ein Pflichtfeld");

    const dataUrlMatch = profileImage.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
    if (!dataUrlMatch) return badRequest(res, "Nur JPEG, PNG und WebP sind erlaubt");

    const base64Data = profileImage.slice(profileImage.indexOf(",") + 1);
    const approxBytes = Math.ceil(base64Data.length * 0.75);
    if (approxBytes > 210_000) return sendJson(res, 413, { ok: false, message: "Bild ist zu groß (max. 200 KB)" });

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    await db.collection(COLLECTIONS.users).updateOne({ _id: userId }, { $set: { profileImage } });

    return sendJson(res, 200, { ok: true, message: "Profilbild gespeichert" });
  }

  return { handleDeleteUserAccount, handlePasswordChange, handleProfileImageUpload };
}
