// @ts-check
import { randomInt } from "node:crypto";
import {
  VERIFICATION_TTL_MINUTES,
  SESSION_TTL_MINUTES,
  SESSION_COOKIE_NAME,
} from "../config/runtime.mjs";
import { detectBlockedRegistrationName } from "../config/blocked-names.mjs";
import { normalizeEmail } from "../utils/data.mjs";
import { jsonResponse, parseBody, parseCookies } from "../utils/http.mjs";
import {
  hashCode,
  hashPassword,
  isSha256PasswordHash,
  isScryptPasswordHash,
  verifyCode,
  verifyPassword,
} from "../utils/password.mjs";
import { checkRateLimit } from "../utils/rate-limit.mjs";
import { badRequest, unauthorized } from "../helpers/responses.mjs";
import { ensureUserFinanceRoots } from "../helpers/finance-db.mjs";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email.mjs";

function createVerificationCode() {
  return String(randomInt(100000, 999999));
}

/** @param {Pool} pool */
export async function migratePlaintextPasswords(pool) {
  const { rows: users } = await pool.query(`SELECT id, password FROM users`);
  let migratedUsers = 0;
  for (const user of users) {
    const password = typeof user.password === "string" ? user.password : "";
    let nextPassword = null;
    if (isScryptPasswordHash(password) || isSha256PasswordHash(password)) {
      nextPassword = password;
    } else if (password) {
      nextPassword = await hashPassword(password);
    }
    if (!nextPassword || password === nextPassword) continue;
    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [nextPassword, user.id]);
    migratedUsers++;
  }

  const { rows: verifications } = await pool.query(`SELECT id, password FROM email_verifications`);
  let migratedVerifications = 0;
  for (const v of verifications) {
    if (isScryptPasswordHash(v.password) || isSha256PasswordHash(v.password)) continue;
    const pw = String(v.password || "");
    if (!pw) continue;
    await pool.query(`UPDATE email_verifications SET password = $1 WHERE id = $2`, [
      await hashPassword(pw),
      v.id,
    ]);
    migratedVerifications++;
  }

  if (migratedUsers > 0 || migratedVerifications > 0) {
    console.log(
      `[migration] Passwort-Migration: users=${migratedUsers}, verifications=${migratedVerifications}.`
    );
  }
}

/**
 * @param {{
 *   pool: Pool;
 *   kv: KVNamespace;
 *   buildSessionCookie: (token: string) => string;
 *   clearSessionCookie: () => string;
 *   createSession: (userId: string | number, kv: KVNamespace) => Promise<string>;
 *   destroySession: (token: string | undefined, kv: KVNamespace) => Promise<void>;
 *   getSessionRecord: (token: string | undefined, kv: KVNamespace) => Promise<{ userId: string } | null>;
 *   env: Record<string, string | undefined>;
 * }} opts
 */
export function createAuthHandlers({
  pool,
  kv,
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionRecord,
  env,
}) {
  const isSecure = env.NODE_ENV === "production" || env.SESSION_SECURE_COOKIE === "true";

  /** @param {Request} request */
  async function getSessionUser(request) {
    const cookies = parseCookies(request);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return null;

    const rec = await getSessionRecord(token, kv);
    if (!rec) return null;

    const { rows } = await pool.query(
      `SELECT id, username, email, first_name, last_name, created_at, "profileImage" FROM users WHERE id = $1`,
      [rec.userId]
    );
    if (rows.length === 0) return null;
    const u = rows[0];
    return {
      token,
      user: {
        id: String(u.id),
        username: u.username,
        email: u.email,
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        created_at: u.created_at instanceof Date ? u.created_at.toISOString() : null,
        profileImage: u.profileImage || null,
      },
    };
  }

  /** @param {Request} request */
  async function requireSessionUser(request) {
    const session = await getSessionUser(request);
    if (!session) return unauthorized("Session abgelaufen oder nicht vorhanden");
    return session;
  }

  /** @param {Request} request */
  async function handleLogin(request) {
    if (request.method !== "POST")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const rl = checkRateLimit(request, { maxAttempts: 5, windowMs: 60_000, group: "login" });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");
    if (!email || !password) return badRequest("Email und Passwort sind Pflichtfelder");

    const { rows } = await pool.query(
      `SELECT id, username, email, password, first_name, last_name, created_at FROM users WHERE email = $1`,
      [email]
    );
    if (rows.length === 0) return unauthorized("E-Mail oder Passwort falsch");
    const user = rows[0];

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) return unauthorized("E-Mail oder Passwort falsch");

    if (!isScryptPasswordHash(user.password)) {
      await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [
        await hashPassword(password),
        user.id,
      ]);
    }

    const token = await createSession(user.id, kv);
    return jsonResponse(
      {
        ok: true,
        user: {
          id: String(user.id),
          username: user.username,
          email: user.email,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
          created_at: user.created_at instanceof Date ? user.created_at.toISOString() : null,
        },
      },
      200,
      { "Set-Cookie": buildSessionCookie(token) }
    );
  }

  /** @param {Request} request */
  async function handleSession(request) {
    if (request.method !== "GET")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });

    const session = await getSessionUser(request);
    const cookies = parseCookies(request);
    const extraHeaders = /** @type {Record<string, string>} */ ({});
    let csrf = cookies["csrf_token"];
    if (!csrf) {
      csrf = String(randomInt(1e9, 9e9));
      extraHeaders["Set-Cookie"] =
        `csrf_token=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;
    }
    return jsonResponse({ ok: true, session_user: session?.user ?? null, csrf }, 200, extraHeaders);
  }

  /** @param {Request} request */
  async function handleLogout(request) {
    if (request.method !== "POST")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const cookies = parseCookies(request);
    await destroySession(cookies[SESSION_COOKIE_NAME], kv);
    const secureSuffix = isSecure ? "; Secure" : "";
    const setCookies = [
      clearSessionCookie(),
      `csrf_token=; Max-Age=0; Path=/; SameSite=Lax${secureSuffix}`,
    ];
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": setCookies });
  }

  /** @param {Request} request */
  async function handleRegister(request) {
    if (request.method !== "POST")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const rl = checkRateLimit(request, { maxAttempts: 3, windowMs: 60_000, group: "register" });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const username = String(payload.username || "")
      .trim()
      .toLowerCase();
    const email = normalizeEmail(payload.email);
    const password = String(payload.password || "");
    const firstName = String(payload.first_name || "").trim();
    const lastName = String(payload.last_name || "").trim();

    if (!username || !email || !password || !firstName || !lastName)
      return badRequest("Username, Vorname, Nachname, E-Mail und Passwort sind Pflichtfelder");
    if (detectBlockedRegistrationName({ username, firstName, lastName }))
      return jsonResponse(
        {
          ok: false,
          code: "forbidden_name",
          message: "Der angegebene Name ist verboten und kann nicht verwendet werden.",
        },
        400
      );
    if (username.length > 50) return badRequest("Username zu lang (max. 50 Zeichen)");
    if (firstName.length > 100) return badRequest("Vorname zu lang (max. 100 Zeichen)");
    if (lastName.length > 100) return badRequest("Nachname zu lang (max. 100 Zeichen)");
    if (email.length > 254) return badRequest("E-Mail zu lang");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return badRequest("Bitte eine gueltige E-Mail-Adresse angeben");
    if (password.length < 8) return badRequest("Passwort muss mindestens 8 Zeichen haben");

    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );
    if (existing.length > 0)
      return jsonResponse({ ok: false, message: "Username oder E-Mail existiert bereits" }, 409);

    const code = createVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
    const passwordHash = await hashPassword(password);

    await pool.query(
      `INSERT INTO email_verifications (email, username, password, first_name, last_name, code_hash, attempts, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
       ON CONFLICT (email) DO UPDATE SET username=$2, password=$3, first_name=$4, last_name=$5, code_hash=$6, attempts=0, created_at=$7, expires_at=$8`,
      [email, username, passwordHash, firstName, lastName, hashCode(code), now, expiresAt]
    );

    let delivered;
    try {
      delivered = await sendVerificationEmail(email, firstName, code, env);
    } catch (error) {
      console.error("Verification email failed:", error);
      return jsonResponse({ ok: false, message: "E-Mail konnte nicht versendet werden." }, 502);
    }

    return jsonResponse(
      {
        ok: true,
        pending_email: email,
        expires_in_seconds: VERIFICATION_TTL_MINUTES * 60,
        message: delivered
          ? "Verifizierungscode wurde per E-Mail versendet"
          : "E-Mail-Service nicht konfiguriert.",
      },
      200
    );
  }

  /** @param {Request} request */
  async function handleRegisterVerify(request) {
    if (request.method !== "POST")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const rl = checkRateLimit(request, {
      maxAttempts: 5,
      windowMs: 60_000,
      group: "register-verify",
    });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const email = normalizeEmail(payload.email);
    const code = String(payload.code || "").trim();
    if (!email || !code) return badRequest("E-Mail und Code sind Pflichtfelder");

    const { rows: verifications } = await pool.query(
      `SELECT * FROM email_verifications WHERE email = $1`,
      [email]
    );
    if (verifications.length === 0)
      return jsonResponse(
        { ok: false, message: "Keine offene Verifizierung fuer diese E-Mail" },
        404
      );
    const verification = verifications[0];

    if (
      detectBlockedRegistrationName({
        username: verification.username,
        firstName: verification.first_name,
        lastName: verification.last_name,
      })
    ) {
      await pool.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
      return jsonResponse(
        { ok: false, code: "forbidden_name", message: "Der angegebene Name ist verboten." },
        400
      );
    }
    if (verification.expires_at && new Date(verification.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
      return jsonResponse(
        { ok: false, message: "Code abgelaufen. Bitte erneut registrieren." },
        410
      );
    }
    if ((verification.attempts || 0) >= 5) {
      return jsonResponse(
        { ok: false, message: "Zu viele Fehlversuche. Bitte erneut registrieren." },
        429
      );
    }
    if (!verifyCode(code, verification.code_hash)) {
      await pool.query(`UPDATE email_verifications SET attempts = attempts + 1 WHERE email = $1`, [
        email,
      ]);
      return badRequest("Verifizierungscode ist ungueltig");
    }

    const passwordHash =
      isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)
        ? verification.password
        : await hashPassword(verification.password);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: inserted } = await client.query(
        `INSERT INTO users (username, email, password, first_name, last_name, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
        [
          verification.username,
          verification.email,
          passwordHash,
          verification.first_name,
          verification.last_name,
        ]
      );
      const userId = inserted[0].id;
      await ensureUserFinanceRoots(client, userId);
      await client.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
      await client.query("COMMIT");
      return jsonResponse(
        {
          ok: true,
          message: "E-Mail verifiziert und Konto erstellt",
          user: { id: String(userId), username: verification.username, email: verification.email },
        },
        201
      );
    } catch (/** @type {unknown} */ err) {
      await client.query("ROLLBACK").catch(() => {});
      const error = /** @type {{ code?: string }} */ (err);
      if (error?.code === "23505")
        return jsonResponse({ ok: false, message: "Username oder E-Mail existiert bereits" }, 409);
      throw err;
    } finally {
      client.release();
    }
  }

  /** @param {Request} request */
  async function handlePasswordForgot(request) {
    if (request.method !== "POST")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const rl = checkRateLimit(request, {
      maxAttempts: 2,
      windowMs: 60_000,
      group: "password-forgot",
    });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const email = normalizeEmail(payload.email);
    if (!email) return badRequest("E-Mail ist ein Pflichtfeld");

    const { rows } = await pool.query(`SELECT id, first_name, email FROM users WHERE email = $1`, [
      email,
    ]);
    const minDelay = new Promise((resolve) => setTimeout(resolve, 400));

    if (rows.length > 0) {
      const user = rows[0];
      const code = createVerificationCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
      await pool.query(
        `INSERT INTO password_resets (email, user_id, code_hash, attempts, created_at, expires_at)
         VALUES ($1, $2, $3, 0, $4, $5)
         ON CONFLICT (email) DO UPDATE SET user_id=$2, code_hash=$3, attempts=0, created_at=$4, expires_at=$5`,
        [email, user.id, hashCode(code), now, expiresAt]
      );
      try {
        await sendPasswordResetEmail(email, user.first_name, code, env);
      } catch (error) {
        console.error("Password reset email failed:", error);
      }
    }

    await minDelay;
    return jsonResponse(
      {
        ok: true,
        expires_in_seconds: VERIFICATION_TTL_MINUTES * 60,
        message: "Falls ein Konto mit dieser E-Mail existiert, wurde ein Code versendet.",
      },
      200
    );
  }

  /** @param {Request} request */
  async function handlePasswordReset(request) {
    if (request.method !== "POST")
      return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "POST" });
    const rl = checkRateLimit(request, {
      maxAttempts: 3,
      windowMs: 60_000,
      group: "password-reset",
    });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const email = normalizeEmail(payload.email);
    const code = String(payload.code || "").trim();
    const newPassword = String(payload.new_password || "");

    if (!email || !code || !newPassword)
      return badRequest("E-Mail, Code und neues Passwort sind Pflichtfelder");
    if (newPassword.length < 8) return badRequest("Neues Passwort muss mindestens 8 Zeichen haben");

    const { rows: resets } = await pool.query(`SELECT * FROM password_resets WHERE email = $1`, [
      email,
    ]);
    if (resets.length === 0) return badRequest("Kein aktiver Reset-Code für diese E-Mail");
    const reset = resets[0];

    if (reset.expires_at && new Date(reset.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
      return jsonResponse({ ok: false, message: "Code abgelaufen. Bitte erneut anfordern." }, 410);
    }
    if ((reset.attempts || 0) >= 5) {
      return jsonResponse(
        { ok: false, message: "Zu viele Fehlversuche. Bitte erneut anfordern." },
        429
      );
    }
    if (!verifyCode(code, reset.code_hash)) {
      await pool.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE email = $1`, [
        email,
      ]);
      return badRequest("Code ist ungültig");
    }

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [
      await hashPassword(newPassword),
      reset.user_id,
    ]);
    await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);

    return jsonResponse({ ok: true, message: "Passwort erfolgreich zurückgesetzt" }, 200);
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
    handlePasswordReset,
  };
}
