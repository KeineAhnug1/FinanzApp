import { randomBytes, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import {
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
import { normalizeEmail, parseId } from "../utils/data.mjs";
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
  const codeDigits = String(code).split("").map(d =>
    `<span style="display:inline-block;width:44px;height:56px;line-height:56px;text-align:center;background:#f5f3ef;border:1.5px solid #e4e2de;border-radius:10px;font-size:28px;font-weight:700;color:#18181b;margin:0 4px;">${d}</span>`
  ).join("");
  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: "FinanzApp – Dein Verifizierungscode",
    text: `Hallo ${greetingName},\n\ndein Verifizierungscode lautet: ${code}\n\nDer Code ist ${VERIFICATION_TTL_MINUTES} Minuten gültig.\n\nFalls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.\n\n– Das FinanzApp-Team`,
    html: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e2de;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#2563eb;padding:32px 40px 28px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">FinanzApp</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.2px;">Deine persönliche Finanzverwaltung</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 16px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Hallo ${safe},</p>
            <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
              um deine Registrierung abzuschließen, gib bitte folgenden Code ein:
            </p>

            <!-- Code Box -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr><td align="center" style="padding:24px 28px;background:#faf9f7;border:1.5px solid #e4e2de;border-radius:12px;">
                ${codeDigits}
              </td></tr>
            </table>

            <!-- Validity hint -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    ⏱ Dieser Code ist <strong>${VERIFICATION_TTL_MINUTES} Minuten</strong> gültig.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e4e2de;margin:20px 0 0;"></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 32px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
              Falls du dich nicht bei FinanzApp registriert hast, kannst du diese E-Mail einfach ignorieren.
            </p>
          </td>
        </tr>

      </table>

      <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">© ${new Date().getFullYear()} FinanzApp</p>
    </td></tr>
  </table>
</body>
</html>`
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
    text: `Hallo ${greetingName}, dein Code zum Zurücksetzen des Passworts lautet: ${code}. Er ist ${VERIFICATION_TTL_MINUTES} Minuten gültig.`,
    html: `<p>Hallo ${safe},</p><p>dein Code zum Zurücksetzen des Passworts lautet:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p><p>Er ist ${VERIFICATION_TTL_MINUTES} Minuten gültig.</p>`
  });
  return true;
}

export async function migratePlaintextPasswords(pool) {
  const { rows: users } = await pool.query(
    `SELECT id, password FROM users`
  );

  let migratedUsers = 0;
  for (const user of users) {
    const password = typeof user.password === "string" ? user.password : "";
    let nextPassword = null;

    if (isScryptPasswordHash(password) || isSha256PasswordHash(password)) {
      nextPassword = password;
    } else if (password) {
      nextPassword = await hashPassword(password);
    }

    if (!nextPassword) continue;
    if (password === nextPassword) continue;

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [nextPassword, user.id]);
    migratedUsers += 1;
  }

  const { rows: verifications } = await pool.query(
    `SELECT id, password FROM email_verifications`
  );

  let migratedVerifications = 0;
  for (const verification of verifications) {
    if (isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)) continue;
    const password = String(verification.password || "");
    if (!password) continue;
    await pool.query(
      `UPDATE email_verifications SET password = $1 WHERE id = $2`,
      [await hashPassword(password), verification.id]
    );
    migratedVerifications += 1;
  }

  if (migratedUsers > 0 || migratedVerifications > 0) {
    console.log(`[migration] Passwort-Migration abgeschlossen: users=${migratedUsers}, verifications=${migratedVerifications}.`);
  }
}

export function createAuthHandlers({ pool, buildSessionCookie, clearSessionCookie, createSession, destroySession, getSessionRecord, SESSION_COOKIE_NAME }) {

  async function getSessionUser(req) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    const rec = await getSessionRecord(token);
    if (!rec) return null;

    const { rows } = await pool.query(
      `SELECT id, username, email, first_name, last_name, created_at, "profileImage" FROM users WHERE id = $1`,
      [rec.userId]
    );

    if (rows.length === 0) {
      await destroySession(token);
      return null;
    }

    const user = rows[0];
    return {
      token,
      user: {
        id: String(user.id),
        username: user.username,
        email: user.email,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
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

    const { rows } = await pool.query(
      `SELECT id, username, email, password, first_name, last_name, created_at FROM users WHERE email = $1`,
      [email]
    );

    if (rows.length === 0) return unauthorized(res, "E-Mail oder Passwort falsch");
    const user = rows[0];

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) return unauthorized(res, "E-Mail oder Passwort falsch");

    if (!isScryptPasswordHash(user.password)) {
      await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [await hashPassword(password), user.id]);
    }

    const token = await createSession(user.id);
    return sendJson(res, 200, {
      ok: true,
      user: {
        id: String(user.id),
        username: user.username,
        email: user.email,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
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
    if (!username || !email || !password || !firstName || !lastName) {
      return badRequest(res, "Username, Vorname, Nachname, E-Mail und Passwort sind Pflichtfelder");
    }
    if (detectBlockedRegistrationName({ username, firstName, lastName })) {
      return sendJson(res, 400, { ok: false, code: "forbidden_name", message: "Der angegebene Name ist verboten und kann nicht verwendet werden." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest(res, "Bitte eine gueltige E-Mail-Adresse angeben");
    if (password.length < 8) return badRequest(res, "Passwort muss mindestens 8 Zeichen haben");


    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );
    if (existing.length > 0) return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });

    const code = createVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
    const passwordHash = await hashPassword(password);

    await pool.query(
      `INSERT INTO email_verifications (email, username, password, first_name, last_name, code_hash, attempts, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
       ON CONFLICT (email) DO UPDATE SET username=$2, password=$3, first_name=$4, last_name=$5, code_hash=$6, attempts=0, created_at=$7, expires_at=$8`,
      [email, username, passwordHash, firstName, lastName, hashValue(code), now, expiresAt]
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
      expires_in_seconds: VERIFICATION_TTL_MINUTES * 60,
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

    const { rows: verifications } = await pool.query(
      `SELECT * FROM email_verifications WHERE email = $1`,
      [email]
    );
    if (verifications.length === 0) return sendJson(res, 404, { ok: false, message: "Keine offene Verifizierung fuer diese E-Mail" });
    const verification = verifications[0];

    if (detectBlockedRegistrationName({ username: verification.username, firstName: verification.first_name, lastName: verification.last_name })) {
      await pool.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
      return sendJson(res, 400, { ok: false, code: "forbidden_name", message: "Der angegebene Name ist verboten und kann nicht verwendet werden." });
    }

    if (verification.expires_at && new Date(verification.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
      return sendJson(res, 410, { ok: false, message: "Code abgelaufen. Bitte erneut registrieren." });
    }
    if ((verification.attempts || 0) >= 5) {
      return sendJson(res, 429, { ok: false, message: "Zu viele Fehlversuche. Bitte erneut registrieren." });
    }

    if (hashValue(code) !== verification.code_hash) {
      await pool.query(`UPDATE email_verifications SET attempts = attempts + 1 WHERE email = $1`, [email]);
      return badRequest(res, "Verifizierungscode ist ungueltig");
    }

    const passwordHash = isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)
      ? verification.password
      : await hashPassword(verification.password);

    try {
      const { rows: inserted } = await pool.query(
        `INSERT INTO users (username, email, password, first_name, last_name, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
        [verification.username, verification.email, passwordHash, verification.first_name, verification.last_name]
      );
      const userId = inserted[0].id;
      await ensureUserFinanceRoots(pool, userId);
      await pool.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
      return sendJson(res, 201, {
        ok: true,
        message: "E-Mail verifiziert und Konto erstellt",
        user: { id: String(userId), username: verification.username, email: verification.email }
      });
    } catch (error) {
      if (error?.code === "23505") return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });
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

    const { rows } = await pool.query(
      `SELECT id, first_name, email FROM users WHERE email = $1`,
      [email]
    );

    if (rows.length > 0) {
      const user = rows[0];
      const code = createVerificationCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      await pool.query(
        `INSERT INTO password_resets (email, user_id, code_hash, attempts, created_at, expires_at)
         VALUES ($1, $2, $3, 0, $4, $5)
         ON CONFLICT (email) DO UPDATE SET user_id=$2, code_hash=$3, attempts=0, created_at=$4, expires_at=$5`,
        [email, user.id, hashValue(code), now, expiresAt]
      );
      try {
        await sendPasswordResetEmail(email, user.first_name, code);
      } catch (error) {
        console.error("Password reset email sending failed:", error);
      }
    }

    return sendJson(res, 200, { ok: true, expires_in_seconds: VERIFICATION_TTL_MINUTES * 60, message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Code versendet." });
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

    const { rows: resets } = await pool.query(
      `SELECT * FROM password_resets WHERE email = $1`,
      [email]
    );
    if (resets.length === 0) return badRequest(res, "Kein aktiver Reset-Code für diese E-Mail");
    const reset = resets[0];

    if (reset.expires_at && new Date(reset.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
      return sendJson(res, 410, { ok: false, message: "Code abgelaufen. Bitte erneut anfordern." });
    }
    if ((reset.attempts || 0) >= 5) {
      return sendJson(res, 429, { ok: false, message: "Zu viele Fehlversuche. Bitte erneut anfordern." });
    }

    if (hashValue(code) !== reset.code_hash) {
      await pool.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE email = $1`, [email]);
      return badRequest(res, "Code ist ungültig");
    }

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [await hashPassword(newPassword), reset.user_id]);
    await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);

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
