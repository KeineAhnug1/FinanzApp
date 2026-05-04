import { randomBytes, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import {
  COLLECTIONS,
  FINZBRO_EMAIL,
  FINZBRO_USERNAME,
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  VERIFICATION_TTL_MINUTES
} from "../config/runtime.mjs";
import { detectBlockedRegistrationName } from "../config/blocked-names.mjs";
import { normalizeEmail, parseIncome, parseObjectId, toDecimal, toNumber } from "../utils/data.mjs";
import { parseBody, parseCookies, sendJson } from "../utils/http.mjs";
import {
  hashPassword,
  hashValue,
  isSha256PasswordHash,
  isScryptPasswordHash,
  PASSWORD_HASH_SHA256_PREFIX,
  verifyPassword
} from "../utils/password.mjs";
import { checkRateLimit } from "../utils/rate-limit.mjs";
import { badRequest, unauthorized } from "../helpers/responses.mjs";
import { ensureUserFinanceRoots } from "../helpers/finance-db.mjs";

let _mailerTransporter = null;

function getMailer() {
  if (!SMTP_HOST || !SMTP_FROM) return null;
  if (!_mailerTransporter) {
    const auth = SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined;
    _mailerTransporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, auth });
  }
  return _mailerTransporter;
}

function createVerificationCode() {
  return String(randomInt(100000, 999999));
}

async function sendVerificationEmail(toEmail, firstName, code) {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(`[verification] SMTP not configured. Verification code for ${toEmail} was not sent.`);
    return false;
  }
  const greetingName = firstName || "Nutzer";
  const safe = String(greetingName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: "FinanzApp - Dein Verifizierungscode",
    text: `Hallo ${greetingName}, dein Verifizierungscode lautet: ${code}. Der Code ist ${VERIFICATION_TTL_MINUTES} Minuten gueltig.`,
    html: `<p>Hallo ${safe},</p><p>dein Verifizierungscode lautet:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p><p>Der Code ist ${VERIFICATION_TTL_MINUTES} Minuten gueltig.</p>`
  });
  return true;
}

async function sendPasswordResetEmail(toEmail, firstName, code) {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(`[password-reset] SMTP not configured. Reset code for ${toEmail} was not sent.`);
    return false;
  }
  const greetingName = firstName || "Nutzer";
  const safe = String(greetingName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: "FinanzApp - Passwort zurücksetzen",
    text: `Hallo ${greetingName}, dein Code zum Zurücksetzen des Passworts lautet: ${code}. Er ist 15 Minuten gültig.`,
    html: `<p>Hallo ${safe},</p><p>dein Code zum Zurücksetzen des Passworts lautet:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p><p>Er ist 15 Minuten gültig.</p>`
  });
  return true;
}

export async function migratePlaintextPasswords(db) {
  const users = await db.collection(COLLECTIONS.users).find(
    {},
    { projection: { _id: 1, password: 1, hashed_passwort: 1 } }
  ).toArray();

  let migratedUsers = 0;
  for (const user of users) {
    const password = typeof user.password === "string" ? user.password : "";
    const legacyHash = typeof user.hashed_passwort === "string" ? user.hashed_passwort : "";
    let nextPassword = null;

    if (isScryptPasswordHash(password) || isSha256PasswordHash(password)) {
      nextPassword = password;
    } else if (password) {
      nextPassword = await hashPassword(password);
    } else if (legacyHash) {
      nextPassword = `${PASSWORD_HASH_SHA256_PREFIX}${legacyHash}`;
    }

    if (!nextPassword) continue;
    const needsPasswordWrite = password !== nextPassword;
    const needsLegacyFieldCleanup = Object.prototype.hasOwnProperty.call(user, "hashed_passwort");
    if (!needsPasswordWrite && !needsLegacyFieldCleanup) continue;

    await db.collection(COLLECTIONS.users).updateOne(
      { _id: user._id },
      {
        ...(needsPasswordWrite ? { $set: { password: nextPassword } } : {}),
        ...(needsLegacyFieldCleanup ? { $unset: { hashed_passwort: "" } } : {})
      }
    );
    migratedUsers += 1;
  }

  const verifications = await db.collection(COLLECTIONS.emailVerifications).find(
    {},
    { projection: { _id: 1, password: 1 } }
  ).toArray();

  let migratedVerifications = 0;
  for (const verification of verifications) {
    if (isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)) continue;
    const password = String(verification.password || "");
    if (!password) continue;
    await db.collection(COLLECTIONS.emailVerifications).updateOne(
      { _id: verification._id },
      { $set: { password: await hashPassword(password) } }
    );
    migratedVerifications += 1;
  }

  if (migratedUsers > 0 || migratedVerifications > 0) {
    console.log(`[migration] Passwort-Migration abgeschlossen: users=${migratedUsers}, verifications=${migratedVerifications}.`);
  }
}

export function createAuthHandlers({ db, buildSessionCookie, clearSessionCookie, createSession, destroySession, getSessionRecord, SESSION_COOKIE_NAME }) {

  async function getSessionUser(req) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    const rec = await getSessionRecord(token);
    if (!rec) return null;

    const user = await db.collection(COLLECTIONS.users).findOne(
      { _id: parseObjectId(rec.userId) },
      { projection: { _id: 1, username: 1, email: 1, first_name: 1, last_name: 1, income: 1, created_at: 1, profileImage: 1 } }
    );

    if (!user) {
      await destroySession(token);
      return null;
    }

    return {
      token,
      user: {
        id: String(user._id),
        username: user.username,
        email: user.email,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        income: toNumber(user.income),
        created_at: user.created_at instanceof Date ? user.created_at.toISOString() : null,
        profileImage: user.profileImage || null
      }
    };
  }

  async function requireSessionUser(req, res) {
    const session = await getSessionUser(req);
    if (!session) {
      unauthorized(res, "Session abgelaufen oder nicht vorhanden");
      return null;
    }
    return session;
  }

  async function handleLogin(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 10, windowMs: 60_000, group: "login" })) return;

    const payload = await parseBody(req, res);
    if (!payload) return;

    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");

    if (!email || !password) return badRequest(res, "Email und Passwort sind Pflichtfelder");

    const user = await db.collection(COLLECTIONS.users).findOne(
      { email },
      { projection: { username: 1, email: 1, password: 1, hashed_passwort: 1, first_name: 1, last_name: 1, income: 1, created_at: 1 } }
    );

    if (!user) return unauthorized(res, "E-Mail oder Passwort falsch");

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) return unauthorized(res, "E-Mail oder Passwort falsch");

    if (!isScryptPasswordHash(user.password)) {
      await db.collection(COLLECTIONS.users).updateOne(
        { _id: user._id },
        { $set: { password: await hashPassword(password) }, $unset: { hashed_passwort: "" } }
      );
    }

    const token = await createSession(user._id);
    return sendJson(res, 200, {
      ok: true,
      user: {
        id: String(user._id),
        username: user.username,
        email: user.email,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        income: toNumber(user.income),
        created_at: user.created_at instanceof Date ? user.created_at.toISOString() : null
      }
    }, { "Set-Cookie": buildSessionCookie(token) });
  }

  async function handleSession(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const session = await getSessionUser(req);
    if (!session) {
      return unauthorized(res, "Session abgelaufen oder nicht vorhanden", { "Set-Cookie": clearSessionCookie() });
    }

    return sendJson(res, 200, { ok: true, session_user: session.user });
  }

  async function handleLogout(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const cookies = parseCookies(req);
    await destroySession(cookies[SESSION_COOKIE_NAME]);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
  }

  async function handleRegister(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 5, windowMs: 60_000, group: "register" })) return;

    const payload = await parseBody(req, res);
    if (!payload) return;

    const username = String(payload.username || "").trim().toLowerCase();
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");
    const firstName = String(payload.first_name || "").trim();
    const lastName = String(payload.last_name || "").trim();
    const income = parseIncome(payload.income ?? 0);

    if (!username || !email || !password || !firstName || !lastName) {
      return badRequest(res, "Username, Vorname, Nachname, E-Mail und Passwort sind Pflichtfelder");
    }
    if (detectBlockedRegistrationName({ username, firstName, lastName })) {
      return sendJson(res, 400, { ok: false, code: "forbidden_name", message: "Der angegebene Name ist verboten und kann nicht verwendet werden." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest(res, "Bitte eine gueltige E-Mail-Adresse angeben");
    if (password.length < 8) return badRequest(res, "Passwort muss mindestens 8 Zeichen haben");
    if (income == null) return badRequest(res, "Income muss eine Zahl >= 0 sein");

    const existingUser = await db.collection(COLLECTIONS.users).findOne({ $or: [{ email }, { username }] }, { projection: { _id: 1 } });
    if (existingUser) return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });

    const code = createVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
    const passwordHash = await hashPassword(password);

    await db.collection(COLLECTIONS.emailVerifications).updateOne(
      { email },
      { $set: { email, username, password: passwordHash, first_name: firstName, last_name: lastName, income, code_hash: hashValue(code), attempts: 0, created_at: now, expires_at: expiresAt } },
      { upsert: true }
    );

    let delivered = false;
    try {
      delivered = await sendVerificationEmail(email, firstName, code);
    } catch (error) {
      console.error("Verification email sending failed:", error);
      return sendJson(res, 502, { ok: false, message: "E-Mail konnte nicht versendet werden. Bitte SMTP-Konfiguration pruefen." });
    }

    return sendJson(res, 200, {
      ok: true,
      pending_email: email,
      message: delivered ? "Verifizierungscode wurde per E-Mail versendet" : "SMTP nicht konfiguriert. Der Code wurde nicht versendet."
    });
  }

  async function handleRegisterVerify(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const email = normalizeEmail(payload.email);
    const code = String(payload.code || "").trim();
    if (!email || !code) return badRequest(res, "E-Mail und Code sind Pflichtfelder");

    const verification = await db.collection(COLLECTIONS.emailVerifications).findOne({ email });
    if (!verification) return sendJson(res, 404, { ok: false, message: "Keine offene Verifizierung fuer diese E-Mail" });

    if (detectBlockedRegistrationName({ username: verification.username, firstName: verification.first_name, lastName: verification.last_name })) {
      await db.collection(COLLECTIONS.emailVerifications).deleteOne({ email });
      return sendJson(res, 400, { ok: false, code: "forbidden_name", message: "Der angegebene Name ist verboten und kann nicht verwendet werden." });
    }

    if (verification.expires_at && new Date(verification.expires_at).getTime() < Date.now()) {
      await db.collection(COLLECTIONS.emailVerifications).deleteOne({ email });
      return sendJson(res, 410, { ok: false, message: "Code abgelaufen. Bitte erneut registrieren." });
    }
    if ((verification.attempts || 0) >= 5) {
      return sendJson(res, 429, { ok: false, message: "Zu viele Fehlversuche. Bitte erneut registrieren." });
    }

    if (hashValue(code) !== verification.code_hash) {
      await db.collection(COLLECTIONS.emailVerifications).updateOne({ email }, { $inc: { attempts: 1 } });
      return badRequest(res, "Verifizierungscode ist ungueltig");
    }

    const passwordHash = isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)
      ? verification.password
      : await hashPassword(verification.password);

    const userDoc = {
      username: verification.username,
      email: verification.email,
      password: passwordHash,
      first_name: verification.first_name,
      last_name: verification.last_name,
      age: null,
      income: toDecimal(verification.income),
      created_at: new Date()
    };

    try {
      const insert = await db.collection(COLLECTIONS.users).insertOne(userDoc);
      await ensureUserFinanceRoots(db, insert.insertedId);
      await db.collection(COLLECTIONS.emailVerifications).deleteOne({ email });
      return sendJson(res, 201, {
        ok: true,
        message: "E-Mail verifiziert und Konto erstellt",
        user: { id: String(insert.insertedId), username: userDoc.username, email: userDoc.email }
      });
    } catch (error) {
      if (error && error.code === 11000) return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });
      throw error;
    }
  }

  async function handlePasswordForgot(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 3, windowMs: 60_000, group: "password-forgot" })) return;

    const payload = await parseBody(req, res);
    if (!payload) return;

    const email = normalizeEmail(payload.email);
    if (!email) return badRequest(res, "E-Mail ist ein Pflichtfeld");

    const user = await db.collection(COLLECTIONS.users).findOne({ email }, { projection: { _id: 1, first_name: 1, email: 1 } });

    if (user) {
      const code = createVerificationCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      await db.collection(COLLECTIONS.passwordResets).updateOne(
        { email },
        { $set: { email, user_id: user._id, code_hash: hashValue(code), attempts: 0, created_at: now, expires_at: expiresAt } },
        { upsert: true }
      );
      try {
        await sendPasswordResetEmail(email, user.first_name, code);
      } catch (error) {
        console.error("Password reset email sending failed:", error);
      }
    }

    return sendJson(res, 200, { ok: true, message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Code versendet." });
  }

  async function handlePasswordReset(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (!checkRateLimit(req, res, { maxAttempts: 5, windowMs: 60_000, group: "password-reset" })) return;

    const payload = await parseBody(req, res);
    if (!payload) return;

    const email = normalizeEmail(payload.email);
    const code = String(payload.code || "").trim();
    const newPassword = String(payload.new_password || "");

    if (!email || !code || !newPassword) return badRequest(res, "E-Mail, Code und neues Passwort sind Pflichtfelder");
    if (newPassword.length < 8) return badRequest(res, "Neues Passwort muss mindestens 8 Zeichen haben");

    const reset = await db.collection(COLLECTIONS.passwordResets).findOne({ email });
    if (!reset) return badRequest(res, "Kein aktiver Reset-Code für diese E-Mail");

    if (reset.expires_at && new Date(reset.expires_at).getTime() < Date.now()) {
      await db.collection(COLLECTIONS.passwordResets).deleteOne({ email });
      return sendJson(res, 410, { ok: false, message: "Code abgelaufen. Bitte erneut anfordern." });
    }
    if ((reset.attempts || 0) >= 5) {
      return sendJson(res, 429, { ok: false, message: "Zu viele Fehlversuche. Bitte erneut anfordern." });
    }

    if (hashValue(code) !== reset.code_hash) {
      await db.collection(COLLECTIONS.passwordResets).updateOne({ email }, { $inc: { attempts: 1 } });
      return badRequest(res, "Code ist ungültig");
    }

    await db.collection(COLLECTIONS.users).updateOne(
      { _id: reset.user_id },
      { $set: { password: await hashPassword(newPassword) } }
    );
    await db.collection(COLLECTIONS.passwordResets).deleteOne({ email });

    return sendJson(res, 200, { ok: true, message: "Passwort erfolgreich zurückgesetzt" });
  }

  return {
    getSessionUser,
    requireSessionUser,
    handleLogin,
    handleSession,
    handleLogout,
    handleRegister,
    handleRegisterVerify,
    handlePasswordForgot,
    handlePasswordReset
  };
}
