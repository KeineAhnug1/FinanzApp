import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MongoClient, Decimal128, ObjectId } from "mongodb";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 3000);
const BASE_DB_NAME = process.env.MONGODB_DB || "finanzapp";
const DB_NAME = process.env.MONGODB_DB_V2 || `${BASE_DB_NAME}_v2`;
const MONGO_URI = process.env.MONGODB_URI;
const VERIFICATION_TTL_MINUTES = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15);
const DEV_EXPOSE_VERIFICATION_CODE = process.env.DEV_EXPOSE_VERIFICATION_CODE === "true";
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 180);
const SESSION_COOKIE_NAME = "finanzapp_session";
const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_API_KEY = String(process.env.TWELVE_DATA_API_KEY || process.env.TWELVE_API_KEY || "").trim();
const PASSWORD_HASH_PREFIX = "scrypt$";
const PASSWORD_HASH_SHA256_PREFIX = "sha256$";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEYLEN = 64;

if (!MONGO_URI) {
  throw new Error("MONGODB_URI is not set in the environment");
}

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const PRESET_INCOME_CATEGORY_KEYS = new Set(["salary", "freelance", "bonus", "refund", "investment", "other"]);
const PRESET_EXPENSE_CATEGORY_KEYS = new Set(["rent", "groceries", "utilities", "transport", "health", "entertainment", "other"]);

const COLLECTIONS = {
  users: "users",
  emailVerifications: "email_verifications",
  incomeEntries: "income_entries",
  expenseEntries: "private_expenses",
  userCategories: "user_categories",
  groups: "groups",
  groupMembers: "group_members",
  groupActivities: "group_activities",
  groupFunding: "group_funding",
  groupExpenses: "group_expenses",
  fundingParticipants: "funding_participants",
  transactions: "transactions",
  bankAccounts: "bank_accounts",
  shares: "shares"
};

const MIME_BY_EXT = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const client = new MongoClient(MONGO_URI);
let db;
let mailTransporter;

const sessions = new Map();

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  const out = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("=") || "");
  }
  return out;
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function isScryptPasswordHash(value) {
  return typeof value === "string" && value.startsWith(PASSWORD_HASH_PREFIX);
}

function isSha256PasswordHash(value) {
  return typeof value === "string" && value.startsWith(PASSWORD_HASH_SHA256_PREFIX);
}

function hashPassword(plainPassword) {
  const password = String(plainPassword || "");
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derived = scryptSync(password, salt, PASSWORD_KEYLEN).toString("hex");
  return `${PASSWORD_HASH_PREFIX}${salt}$${derived}`;
}

function verifyPassword(plainPassword, storedPassword) {
  const plain = String(plainPassword || "");
  const stored = String(storedPassword || "");

  if (!stored) return false;

  if (isScryptPasswordHash(stored)) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;

    const salt = parts[1];
    const expectedHex = parts[2];

    try {
      const expected = Buffer.from(expectedHex, "hex");
      const actual = scryptSync(plain, salt, expected.length);
      if (actual.length !== expected.length) return false;
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  if (isSha256PasswordHash(stored)) {
    const expectedHash = stored.slice(PASSWORD_HASH_SHA256_PREFIX.length);
    return hashValue(plain) === expectedHash;
  }

  // Legacy-Fallback: Klartext-Passwort (wird nach erfolgreichem Login migriert).
  return plain === stored;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseIncome(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(numeric.toFixed(2));
}

function parsePositiveAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const normalized = Number(numeric.toFixed(2));
  if (normalized <= 0) return null;
  return normalized;
}

function toDecimal(value) {
  return Decimal128.fromString(Number(value).toFixed(2));
}

function parseObjectId(value) {
  if (!value) return null;
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value.toString === "function") return Number(value.toString());
  return Number(value);
}

function normalizeRecurrence(value) {
  const normalized = String(value || "once").trim().toLowerCase();
  if (normalized === "weekly" || normalized === "monthly" || normalized === "once") return normalized;
  return null;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function normalizeCategoryValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function categoryKey(value) {
  return normalizeCategoryValue(value).toLowerCase();
}

function uniqueCategoryList(values) {
  const map = new Map();
  for (const value of values || []) {
    const normalized = normalizeCategoryValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "de"));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createSessionToken() {
  return randomBytes(32).toString("hex");
}

function sessionExpiresAt() {
  return Date.now() + SESSION_TTL_MINUTES * 60 * 1000;
}

function createSession(userId) {
  const token = createSessionToken();
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
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_MINUTES * 60}`
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

function clearSessionCookie() {
  const attrs = [`${SESSION_COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  const rec = getSessionRecord(token);
  if (!rec) return null;

  const user = await db.collection(COLLECTIONS.users).findOne(
    { _id: parseObjectId(rec.userId) },
    { projection: { _id: 1, username: 1, email: 1, first_name: 1, last_name: 1, income: 1 } }
  );

  if (!user) {
    destroySession(token);
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
      income: toNumber(user.income)
    }
  };
}

async function requireSessionUser(req, res) {
  const session = await getSessionUser(req);
  if (!session) {
    sendJson(res, 401, { ok: false, message: "Session abgelaufen oder nicht vorhanden" });
    return null;
  }
  return session;
}

function serializeIncomeEntry(entry) {
  return {
    id: String(entry._id),
    user_id: String(entry.user_id),
    source: entry.source,
    category: entry.category || "",
    amount: toNumber(entry.amount),
    recurrence: entry.recurrence || "once",
    is_active: typeof entry.is_active === "boolean" ? entry.is_active : true,
    received_at: entry.received_at instanceof Date ? entry.received_at.toISOString() : null,
    note: entry.note || "",
    created_at: entry.created_at instanceof Date ? entry.created_at.toISOString() : null,
    updated_at: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : null
  };
}

function serializeExpenseEntry(entry) {
  const spentAtDate =
    entry.spent_at instanceof Date
      ? entry.spent_at
      : entry.due_date instanceof Date
        ? entry.due_date
        : entry.created_at instanceof Date
          ? entry.created_at
          : null;

  return {
    id: String(entry._id),
    user_id: String(entry.user_id),
    source: entry.source || entry.info || "",
    category: entry.category || "other",
    amount: toNumber(entry.amount),
    recurrence: entry.recurrence || "once",
    is_active: typeof entry.is_active === "boolean" ? entry.is_active : entry.state !== "paused",
    spent_at: spentAtDate ? spentAtDate.toISOString() : null,
    note: entry.note || "",
    created_at: entry.created_at instanceof Date ? entry.created_at.toISOString() : null,
    updated_at: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : null
  };
}

function getMailer() {
  if (!SMTP_HOST || !SMTP_FROM) return null;
  if (!mailTransporter) {
    const auth = SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined;
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth
    });
  }
  return mailTransporter;
}

function createVerificationCode() {
  return String(randomInt(100000, 999999));
}

async function sendVerificationEmail(toEmail, firstName, code) {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(`[verification] SMTP not configured. Code for ${toEmail}: ${code}`);
    return false;
  }

  const greetingName = firstName || "Nutzer";
  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: "FinanzApp - Dein Verifizierungscode",
    text: `Hallo ${greetingName}, dein Verifizierungscode lautet: ${code}. Der Code ist ${VERIFICATION_TTL_MINUTES} Minuten gueltig.`,
    html: `<p>Hallo ${greetingName},</p><p>dein Verifizierungscode lautet:</p><p style=\"font-size:24px;font-weight:700;letter-spacing:2px;\">${code}</p><p>Der Code ist ${VERIFICATION_TTL_MINUTES} Minuten gueltig.</p>`
  });
  return true;
}

async function migrateLegacyExpenseEntriesToV2() {
  const legacyCollectionName = "expense_entries";
  const legacyExists = await db.listCollections({ name: legacyCollectionName }, { nameOnly: true }).hasNext();
  if (!legacyExists) return;

  const legacyEntries = await db.collection(legacyCollectionName).find({}).toArray();
  if (!legacyEntries.length) return;

  const operations = [];
  for (const legacyEntry of legacyEntries) {
    if (!legacyEntry.user_id) continue;

    const amount = toNumber(legacyEntry.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const normalizedRecurrence = normalizeRecurrence(legacyEntry.recurrence) || "once";
    const isActive = parseBoolean(legacyEntry.is_active, true);
    const normalizedCategory = normalizeCategoryValue(legacyEntry.category) || "other";
    const source = String(legacyEntry.source || legacyEntry.info || "Legacy-Ausgabe").trim();
    const note = String(legacyEntry.note || "").trim();
    const spentAt =
      legacyEntry.spent_at instanceof Date
        ? legacyEntry.spent_at
        : legacyEntry.created_at instanceof Date
          ? legacyEntry.created_at
          : new Date();
    const legacyId = String(legacyEntry._id);

    operations.push({
      updateOne: {
        filter: { legacy_expense_entry_id: legacyId },
        update: {
          $setOnInsert: {
            user_id: legacyEntry.user_id,
            source,
            category: normalizedCategory,
            amount: toDecimal(amount),
            theo_amount: toDecimal(amount),
            spent_at: spentAt,
            due_date: spentAt,
            info: source || note || null,
            state: normalizedRecurrence === "once" ? "open" : (isActive ? "open" : "paused"),
            note,
            recurrence: normalizedRecurrence,
            is_active: normalizedRecurrence === "once" ? true : isActive,
            legacy_expense_entry_id: legacyId,
            created_at: legacyEntry.created_at instanceof Date ? legacyEntry.created_at : new Date(),
            updated_at: new Date()
          }
        },
        upsert: true
      }
    });
  }

  if (!operations.length) return;
  const migrationResult = await db.collection(COLLECTIONS.expenseEntries).bulkWrite(operations, { ordered: false });
  if (migrationResult.upsertedCount > 0) {
    console.log(`[migration] ${migrationResult.upsertedCount} legacy expense entries in private_expenses uebernommen.`);
  }
}

async function migratePlaintextPasswords() {
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
      nextPassword = hashPassword(password);
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
      { $set: { password: hashPassword(password) } }
    );
    migratedVerifications += 1;
  }

  if (migratedUsers > 0 || migratedVerifications > 0) {
    console.log(`[migration] Passwort-Migration abgeschlossen: users=${migratedUsers}, verifications=${migratedVerifications}.`);
  }
}

async function rememberUserCategory(userId, kind, categoryValue) {
  const normalized = normalizeCategoryValue(categoryValue);
  if (!normalized) return;
  const key = categoryKey(normalized);
  await db.collection(COLLECTIONS.userCategories).updateOne(
    { user_id: userId, kind, key },
    {
      $setOnInsert: { user_id: userId, kind, key, created_at: new Date() },
      $set: { value: normalized, updated_at: new Date() }
    },
    { upsert: true }
  );
}

async function handleLogin(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!email || !password) {
    return sendJson(res, 400, { ok: false, message: "Email und Passwort sind Pflichtfelder" });
  }

  const user = await db.collection(COLLECTIONS.users).findOne(
    { email },
    { projection: { username: 1, email: 1, password: 1, hashed_passwort: 1, first_name: 1, last_name: 1, income: 1 } }
  );

  if (!user) {
    return sendJson(res, 401, { ok: false, message: "E-Mail oder Passwort falsch" });
  }

  let isValid = verifyPassword(password, user.password);
  if (!isValid && typeof user.hashed_passwort === "string" && user.hashed_passwort) {
    isValid = hashValue(password) === user.hashed_passwort;
  }

  if (!isValid) return sendJson(res, 401, { ok: false, message: "E-Mail oder Passwort falsch" });

  // Erfolgreiche Logins migrieren alte Passwortformate sofort auf scrypt.
  if (!isScryptPasswordHash(user.password)) {
    await db.collection(COLLECTIONS.users).updateOne(
      { _id: user._id },
      {
        $set: { password: hashPassword(password) },
        $unset: { hashed_passwort: "" }
      }
    );
  }

  const token = createSession(user._id);
  return sendJson(
    res,
    200,
    {
      ok: true,
      user: {
        id: String(user._id),
        username: user.username,
        email: user.email,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        income: toNumber(user.income)
      }
    },
    { "Set-Cookie": buildSessionCookie(token) }
  );
}

async function handleSession(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const session = await getSessionUser(req);
  if (!session) {
    return sendJson(res, 401, { ok: false, message: "Session abgelaufen oder nicht vorhanden" }, { "Set-Cookie": clearSessionCookie() });
  }

  return sendJson(res, 200, { ok: true, session_user: session.user });
}

async function handleLogout(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const cookies = parseCookies(req);
  destroySession(cookies[SESSION_COOKIE_NAME]);
  return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}

async function handleRegister(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const username = String(payload.username || "").trim().toLowerCase();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const firstName = String(payload.first_name || "").trim();
  const lastName = String(payload.last_name || "").trim();
  const income = parseIncome(payload.income ?? 0);

  if (!username || !email || !password || !firstName || !lastName) {
    return sendJson(res, 400, {
      ok: false,
      message: "Username, Vorname, Nachname, E-Mail und Passwort sind Pflichtfelder"
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { ok: false, message: "Bitte eine gueltige E-Mail-Adresse angeben" });
  }
  if (password.length < 6) {
    return sendJson(res, 400, { ok: false, message: "Passwort muss mindestens 6 Zeichen haben" });
  }
  if (income == null) {
    return sendJson(res, 400, { ok: false, message: "Income muss eine Zahl >= 0 sein" });
  }

  const existingUser = await db.collection(COLLECTIONS.users).findOne({ $or: [{ email }, { username }] }, { projection: { _id: 1 } });
  if (existingUser) return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });

  const code = createVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
  const passwordHash = hashPassword(password);

  await db.collection(COLLECTIONS.emailVerifications).updateOne(
    { email },
    {
      $set: {
        email,
        username,
        password: passwordHash,
        first_name: firstName,
        last_name: lastName,
        income,
        code_hash: hashValue(code),
        attempts: 0,
        created_at: now,
        expires_at: expiresAt
      }
    },
    { upsert: true }
  );

  let delivered = false;
  try {
    delivered = await sendVerificationEmail(email, firstName, code);
  } catch (error) {
    console.error("Verification email sending failed:", error);
    return sendJson(res, 502, { ok: false, message: "E-Mail konnte nicht versendet werden. Bitte SMTP-Konfiguration pruefen." });
  }

  const response = {
    ok: true,
    pending_email: email,
    message: delivered ? "Verifizierungscode wurde per E-Mail versendet" : "SMTP nicht konfiguriert. Der Code wurde im Server-Log ausgegeben."
  };
  if (!delivered && DEV_EXPOSE_VERIFICATION_CODE) response.debug_code = code;
  return sendJson(res, 200, response);
}

async function handleRegisterVerify(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const email = normalizeEmail(payload.email);
  const code = String(payload.code || "").trim();
  if (!email || !code) return sendJson(res, 400, { ok: false, message: "E-Mail und Code sind Pflichtfelder" });

  const verification = await db.collection(COLLECTIONS.emailVerifications).findOne({ email });
  if (!verification) return sendJson(res, 404, { ok: false, message: "Keine offene Verifizierung fuer diese E-Mail" });

  if (verification.expires_at && new Date(verification.expires_at).getTime() < Date.now()) {
    await db.collection(COLLECTIONS.emailVerifications).deleteOne({ email });
    return sendJson(res, 410, { ok: false, message: "Code abgelaufen. Bitte erneut registrieren." });
  }
  if ((verification.attempts || 0) >= 5) {
    return sendJson(res, 429, { ok: false, message: "Zu viele Fehlversuche. Bitte erneut registrieren." });
  }

  if (hashValue(code) !== verification.code_hash) {
    await db.collection(COLLECTIONS.emailVerifications).updateOne({ email }, { $inc: { attempts: 1 } });
    return sendJson(res, 400, { ok: false, message: "Verifizierungscode ist ungueltig" });
  }

  const passwordHash = isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)
    ? verification.password
    : hashPassword(verification.password);

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

async function handleCategories(req, res, session) {
  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  if (req.method === "GET") {
    const [stored, incomeDistinct, expenseDistinct] = await Promise.all([
      db.collection(COLLECTIONS.userCategories).find({ user_id: userId }).project({ _id: 0, kind: 1, value: 1 }).toArray(),
      db.collection(COLLECTIONS.incomeEntries).distinct("category", { user_id: userId }),
      db.collection(COLLECTIONS.expenseEntries).distinct("category", { user_id: userId })
    ]);

    const incomeValues = [];
    const expenseValues = [];
    for (const entry of stored) {
      if (entry.kind === "income") incomeValues.push(entry.value);
      if (entry.kind === "expense") expenseValues.push(entry.value);
    }

    return sendJson(res, 200, {
      ok: true,
      income: uniqueCategoryList(incomeValues.concat(incomeDistinct)),
      expense: uniqueCategoryList(expenseValues.concat(expenseDistinct))
    });
  }

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "GET, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const kind = String(payload.kind || "").trim().toLowerCase();
  if (kind !== "income" && kind !== "expense") {
    return sendJson(res, 400, { ok: false, message: "kind muss income oder expense sein" });
  }

  const category = normalizeCategoryValue(payload.category);
  if (!category) return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });

  const presetSet = kind === "income" ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
  if (presetSet.has(category.toLowerCase())) {
    return sendJson(res, 400, { ok: false, message: "Standardkategorien koennen nicht geloescht werden" });
  }

  const fallbackCategory = normalizeCategoryValue(payload.replace_with || "other");
  if (!fallbackCategory) return sendJson(res, 400, { ok: false, message: "replace_with ist ungueltig" });

  const collectionName = kind === "income" ? COLLECTIONS.incomeEntries : COLLECTIONS.expenseEntries;
  const updateResult = await db.collection(collectionName).updateMany(
    { user_id: userId, category: new RegExp(`^${escapeRegex(category)}$`, "i") },
    { $set: { category: fallbackCategory, updated_at: new Date() } }
  );

  await db.collection(COLLECTIONS.userCategories).deleteOne({ user_id: userId, kind, key: categoryKey(category) });
  if (!presetSet.has(fallbackCategory.toLowerCase())) {
    await rememberUserCategory(userId, kind, fallbackCategory);
  }

  return sendJson(res, 200, {
    ok: true,
    message: "Kategorie geloescht",
    kind,
    deleted_category: category,
    replaced_with: fallbackCategory,
    updated_entries: updateResult.modifiedCount
  });
}

async function handleIncomeEntries(req, res, session) {
  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  if (req.method === "GET") {
    const entries = await db.collection(COLLECTIONS.incomeEntries)
      .find({ user_id: userId })
      .sort({ received_at: -1, created_at: -1 })
      .limit(200)
      .toArray();

    return sendJson(res, 200, { ok: true, entries: entries.map(serializeIncomeEntry) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = Number(payload.amount);
  const receivedAt = payload.received_at ? new Date(payload.received_at) : new Date();
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  if (!category) return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  if (Number.isNaN(receivedAt.getTime())) return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  if (!recurrence) return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });

  await rememberUserCategory(userId, "income", category);

  const doc = {
    user_id: userId,
    source,
    category,
    amount: toDecimal(amountNumber),
    received_at: receivedAt,
    note,
    recurrence,
    is_active: recurrence === "once" ? true : isActive,
    created_at: new Date(),
    updated_at: new Date()
  };

  const insert = await db.collection(COLLECTIONS.incomeEntries).insertOne(doc);
  const inserted = await db.collection(COLLECTIONS.incomeEntries).findOne({ _id: insert.insertedId });
  return sendJson(res, 201, { ok: true, entry: serializeIncomeEntry(inserted) });
}

async function handleIncomeEntryById(req, res, entryIdRaw, session) {
  const entryId = parseObjectId(entryIdRaw);
  if (!entryId) return sendJson(res, 400, { ok: false, message: "entry_id ist ungueltig" });

  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  if (req.method === "DELETE") {
    const deletion = await db.collection(COLLECTIONS.incomeEntries).deleteOne({ _id: entryId, user_id: userId });
    if (!deletion || deletion.deletedCount !== 1) return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
    return sendJson(res, 200, { ok: true, message: "Eintrag geloescht" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = Number(payload.amount);
  const receivedAt = payload.received_at ? new Date(payload.received_at) : null;
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  if (!category) return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  if (!receivedAt || Number.isNaN(receivedAt.getTime())) return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  if (!recurrence) return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });

  await rememberUserCategory(userId, "income", category);

  const updated = await db.collection(COLLECTIONS.incomeEntries).findOneAndUpdate(
    { _id: entryId, user_id: userId },
    {
      $set: {
        source,
        category,
        note,
        amount: toDecimal(amountNumber),
        received_at: receivedAt,
        recurrence,
        is_active: recurrence === "once" ? true : isActive,
        updated_at: new Date()
      }
    },
    { returnDocument: "after" }
  );

  if (!updated) return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
  return sendJson(res, 200, { ok: true, entry: serializeIncomeEntry(updated) });
}

async function handleExpenseEntries(req, res, session) {
  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  if (req.method === "GET") {
    const entries = await db.collection(COLLECTIONS.expenseEntries)
      .find({ user_id: userId })
      .sort({ spent_at: -1, due_date: -1, created_at: -1 })
      .limit(200)
      .toArray();

    return sendJson(res, 200, { ok: true, entries: entries.map(serializeExpenseEntry) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = parsePositiveAmount(payload.amount);
  const spentAt = payload.spent_at ? new Date(payload.spent_at) : new Date();
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  if (!category) return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  if (amountNumber == null) return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  if (Number.isNaN(spentAt.getTime())) return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  if (!recurrence) return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });

  await rememberUserCategory(userId, "expense", category);

  const doc = {
    user_id: userId,
    source,
    category,
    amount: toDecimal(amountNumber),
    theo_amount: toDecimal(amountNumber),
    spent_at: spentAt,
    due_date: spentAt,
    info: source || note || null,
    state: recurrence === "once" ? "open" : (isActive ? "open" : "paused"),
    note,
    recurrence,
    is_active: recurrence === "once" ? true : isActive,
    created_at: new Date(),
    updated_at: new Date()
  };

  const insert = await db.collection(COLLECTIONS.expenseEntries).insertOne(doc);
  const inserted = await db.collection(COLLECTIONS.expenseEntries).findOne({ _id: insert.insertedId });
  return sendJson(res, 201, { ok: true, entry: serializeExpenseEntry(inserted) });
}

async function handleExpenseEntryById(req, res, entryIdRaw, session) {
  const entryId = parseObjectId(entryIdRaw);
  if (!entryId) return sendJson(res, 400, { ok: false, message: "entry_id ist ungueltig" });

  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  if (req.method === "DELETE") {
    const deletion = await db.collection(COLLECTIONS.expenseEntries).deleteOne({ _id: entryId, user_id: userId });
    if (!deletion || deletion.deletedCount !== 1) return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
    return sendJson(res, 200, { ok: true, message: "Eintrag geloescht" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = parsePositiveAmount(payload.amount);
  const spentAt = payload.spent_at ? new Date(payload.spent_at) : null;
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  if (!category) return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  if (amountNumber == null) return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  if (!spentAt || Number.isNaN(spentAt.getTime())) return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  if (!recurrence) return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });

  await rememberUserCategory(userId, "expense", category);

  const updated = await db.collection(COLLECTIONS.expenseEntries).findOneAndUpdate(
    { _id: entryId, user_id: userId },
    {
      $set: {
        source,
        category,
        note,
        amount: toDecimal(amountNumber),
        theo_amount: toDecimal(amountNumber),
        spent_at: spentAt,
        due_date: spentAt,
        info: source || note || null,
        state: recurrence === "once" ? "open" : (isActive ? "open" : "paused"),
        recurrence,
        is_active: recurrence === "once" ? true : isActive,
        updated_at: new Date()
      }
    },
    { returnDocument: "after" }
  );

  if (!updated) return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
  return sendJson(res, 200, { ok: true, entry: serializeExpenseEntry(updated) });
}

async function handleUserIncome(req, res, session) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const userId = parseObjectId(session.user.id);
  const income = parseIncome(payload.income);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });
  if (income == null) return sendJson(res, 400, { ok: false, message: "Monatliche Einnahme muss eine Zahl >= 0 sein" });

  const updated = await db.collection(COLLECTIONS.users).findOneAndUpdate(
    { _id: userId },
    { $set: { income: toDecimal(income) } },
    {
      projection: { _id: 1, username: 1, email: 1, first_name: 1, last_name: 1, income: 1 },
      returnDocument: "after"
    }
  );

  if (!updated) return sendJson(res, 404, { ok: false, message: "User nicht gefunden" });

  return sendJson(res, 200, {
    ok: true,
    user: {
      id: String(updated._id),
      username: updated.username,
      email: updated.email,
      first_name: updated.first_name || null,
      last_name: updated.last_name || null,
      income: toNumber(updated.income)
    }
  });
}

function activeMembershipFilter() {
  return {
    $or: [
      { status: "accepted" },
      { status: "active" },
      { status: null },
      { status: { $exists: false } }
    ]
  };
}

function visibleMembershipFilter() {
  return {
    $or: [
      { status: "accepted" },
      { status: "invited" },
      { status: "active" },
      { status: null },
      { status: { $exists: false } }
    ]
  };
}

function toNullableDate(value) {
  if (value == null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toNullableNumber(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getGroupContext(groupIdRaw, sessionUserId) {
  const groupId = parseObjectId(groupIdRaw);
  if (!groupId) return { ok: false, status: 400, message: "Invalid group id" };

  const userObjectId = parseObjectId(sessionUserId);
  if (!userObjectId) return { ok: false, status: 401, message: "Session user invalid" };

  const user = await db.collection(COLLECTIONS.users).findOne(
    { _id: userObjectId },
    { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } }
  );
  if (!user) return { ok: false, status: 404, message: "Session user not found" };

  const group = await db.collection(COLLECTIONS.groups).findOne({ _id: groupId });
  if (!group) return { ok: false, status: 404, message: "Group not found" };

  const membership = await db.collection(COLLECTIONS.groupMembers).findOne({ group_id: groupId, user_id: user._id, ...activeMembershipFilter() });
  if (!membership) return { ok: false, status: 403, message: "You are not a participant of this group" };

  return { ok: true, groupId, user, group, membership };
}

async function handleGroupDetail(req, res, groupIdRaw, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

  const members = await db.collection(COLLECTIONS.groupMembers).aggregate([
    { $match: { group_id: context.groupId, ...visibleMembershipFilter() } },
    { $lookup: { from: COLLECTIONS.users, localField: "user_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $sort: { "user.username": 1 } },
    {
      $project: {
        _id: 0,
        user_id: "$user._id",
        username: "$user.username",
        first_name: "$user.first_name",
        last_name: "$user.last_name",
        role: "$role",
        status: "$status"
      }
    }
  ]).toArray();

  const activities = await db.collection(COLLECTIONS.groupActivities)
    .find({ group_id: context.groupId }, { projection: { _id: 1, info: 1, date: 1, created_at: 1 } })
    .sort({ date: -1, created_at: -1 })
    .toArray();

  const fundings = await db.collection(COLLECTIONS.groupFunding)
    .find({ group_id: context.groupId }, { projection: { _id: 1, group_activity_id: 1, amount: 1, info: 1, created_at: 1 } })
    .sort({ created_at: -1 })
    .toArray();

  const activityById = new Map(activities.map((activity) => [String(activity._id), activity]));
  const fundingIds = fundings.map((funding) => funding._id);

  let participants = [];
  let expenses = [];
  let transactions = [];
  if (fundingIds.length) {
    participants = await db.collection(COLLECTIONS.fundingParticipants).aggregate([
      { $match: { group_funding_id: { $in: fundingIds } } },
      { $lookup: { from: COLLECTIONS.groupMembers, localField: "group_member_id", foreignField: "_id", as: "member" } },
      { $unwind: "$member" },
      { $match: { "member.group_id": context.groupId } },
      { $lookup: { from: COLLECTIONS.users, localField: "member.user_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $sort: { created_at: -1 } },
      {
        $project: {
          _id: 0,
          group_funding_id: 1,
          amount: 1,
          created_at: 1,
          user_id: "$user._id",
          username: "$user.username",
          first_name: "$user.first_name",
          last_name: "$user.last_name"
        }
      }
    ]).toArray();

    expenses = await db.collection(COLLECTIONS.groupExpenses)
      .find(
        { group_funding_id: { $in: fundingIds } },
        { projection: { _id: 1, group_funding_id: 1, amount: 1, info: 1, state: 1, due_date: 1, created_at: 1 } }
      )
      .sort({ created_at: -1 })
      .toArray();

    const expenseIds = expenses.map((expense) => expense._id);
    if (expenseIds.length) {
      transactions = await db.collection(COLLECTIONS.transactions)
        .find(
          { group_expense_id: { $in: expenseIds } },
          { projection: { _id: 1, group_expense_id: 1, amount: 1, created_at: 1 } }
        )
        .sort({ created_at: -1 })
        .toArray();
    }
  }

  const participantsByFunding = new Map();
  for (const participant of participants) {
    const fundingKey = String(participant.group_funding_id);
    if (!participantsByFunding.has(fundingKey)) participantsByFunding.set(fundingKey, []);
    participantsByFunding.get(fundingKey).push(participant);
  }

  const expensesById = new Map(expenses.map((expense) => [String(expense._id), expense]));
  const fundingById = new Map(fundings.map((funding) => [String(funding._id), funding]));

  return sendJson(res, 200, {
    ok: true,
    group: {
      group_id: String(context.group._id),
      name: context.group.name,
      address: context.group.address ?? null,
      created_at: context.group.created_at ?? null
    },
    is_admin: context.membership.role === "admin",
    session_user_id: String(context.user._id),
    members: members.map((member) => ({
      user_id: String(member.user_id),
      username: member.username,
      first_name: member.first_name ?? null,
      last_name: member.last_name ?? null,
      role: member.role,
      status: member.status ?? null
    })),
    activities: activities.map((activity) => ({
      activity_id: String(activity._id),
      info: activity.info ?? null,
      date: activity.date ?? null,
      created_at: activity.created_at ?? null
    })),
    fundings: fundings.map((funding) => {
      const linkedActivity = funding.group_activity_id ? activityById.get(String(funding.group_activity_id)) : null;
      const contributions = participantsByFunding.get(String(funding._id)) ?? [];
      return {
        funding_id: String(funding._id),
        group_activity_id: funding.group_activity_id ? String(funding.group_activity_id) : null,
        amount: toNullableNumber(funding.amount),
        info: funding.info ?? null,
        created_at: funding.created_at ?? null,
        contributions: contributions.map((entry) => ({
          user_id: String(entry.user_id),
          username: entry.username,
          first_name: entry.first_name ?? null,
          last_name: entry.last_name ?? null,
          amount: toNullableNumber(entry.amount),
          created_at: entry.created_at ?? null
        })),
        total_donated: Number(contributions.reduce((sum, entry) => sum + (toNullableNumber(entry.amount) ?? 0), 0).toFixed(2)),
        linked_activity: linkedActivity
          ? {
            activity_id: String(linkedActivity._id),
            info: linkedActivity.info ?? null,
            date: linkedActivity.date ?? null
          }
          : null
      };
    }),
    expenses: expenses.map((expense) => {
      const funding = fundingById.get(String(expense.group_funding_id));
      return {
        group_expense_id: String(expense._id),
        group_funding_id: String(expense.group_funding_id),
        funding_info: funding?.info ?? null,
        amount: toNullableNumber(expense.amount),
        info: expense.info ?? null,
        state: expense.state ?? null,
        due_date: expense.due_date ?? null,
        created_at: expense.created_at ?? null
      };
    }),
    funding_transactions: transactions.map((transaction) => {
      const expense = expensesById.get(String(transaction.group_expense_id));
      const funding = expense ? fundingById.get(String(expense.group_funding_id)) : null;
      return {
        transaction_id: String(transaction._id),
        group_expense_id: String(transaction.group_expense_id),
        group_funding_id: expense ? String(expense.group_funding_id) : null,
        amount: toNullableNumber(transaction.amount),
        created_at: transaction.created_at ?? null,
        expense_info: expense?.info ?? null,
        funding_info: funding?.info ?? null
      };
    })
  });
}

async function handleCreateGroupActivity(req, res, groupIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const info = String(payload.info || "").trim();
  if (!info) return sendJson(res, 400, { ok: false, message: "Activity info is required" });

  const date = toNullableDate(payload.date);
  if (payload.date && !date) return sendJson(res, 400, { ok: false, message: "Activity date is invalid" });

  const createdAt = new Date();
  const insertResult = await db.collection(COLLECTIONS.groupActivities).insertOne({ group_id: context.groupId, info, date, created_at: createdAt });

  return sendJson(res, 201, {
    ok: true,
    activity: { activity_id: String(insertResult.insertedId), info, date, created_at: createdAt }
  });
}

async function handleCreateGroupFunding(req, res, groupIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const info = String(payload.info || "").trim() || null;

  let groupActivityId = null;
  const activityIdRaw = String(payload.group_activity_id || "").trim();
  if (activityIdRaw) {
    groupActivityId = parseObjectId(activityIdRaw);
    if (!groupActivityId) return sendJson(res, 400, { ok: false, message: "Invalid linked activity id" });
    const linkedActivity = await db.collection(COLLECTIONS.groupActivities).findOne({ _id: groupActivityId, group_id: context.groupId });
    if (!linkedActivity) return sendJson(res, 400, { ok: false, message: "Linked activity does not exist in this group" });
  }

  if (!info && !groupActivityId) {
    return sendJson(res, 400, { ok: false, message: "Funding needs info or a linked activity" });
  }

  const createdAt = new Date();
  const amount = Decimal128.fromString("0.00");
  const insertResult = await db.collection(COLLECTIONS.groupFunding).insertOne({
    group_id: context.groupId,
    group_activity_id: groupActivityId,
    amount,
    info,
    created_at: createdAt
  });

  return sendJson(res, 201, {
    ok: true,
    funding: {
      funding_id: String(insertResult.insertedId),
      group_activity_id: groupActivityId ? String(groupActivityId) : null,
      amount: 0,
      info,
      created_at: createdAt
    }
  });
}

async function handleDonateToFunding(req, res, groupIdRaw, fundingIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

  const fundingId = parseObjectId(fundingIdRaw);
  if (!fundingId) return sendJson(res, 400, { ok: false, message: "Invalid funding id" });

  const funding = await db.collection(COLLECTIONS.groupFunding).findOne(
    { _id: fundingId, group_id: context.groupId },
    { projection: { _id: 1, amount: 1 } }
  );
  if (!funding) return sendJson(res, 404, { ok: false, message: "Funding not found for this group" });

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const normalizedAmount = parsePositiveAmount(payload.amount);
  if (normalizedAmount == null) {
    return sendJson(res, 400, { ok: false, message: "Donation amount must be a positive number" });
  }
  const amount = toDecimal(normalizedAmount);

  const bankAccounts = await db.collection(COLLECTIONS.bankAccounts)
    .find({ user_id: context.user._id }, { projection: { _id: 1, balance: 1 } })
    .toArray();

  let bankAccount = null;
  let currentBalance = null;
  for (const account of bankAccounts) {
    const balance = toNullableNumber(account.balance);
    if (balance == null) continue;
    if (bankAccount == null || balance > currentBalance) {
      bankAccount = account;
      currentBalance = balance;
    }
  }

  if (currentBalance != null && normalizedAmount > currentBalance) {
    return sendJson(res, 400, { ok: false, message: "Not enough money on your bank account for this donation" });
  }

  const existingParticipant = await db.collection(COLLECTIONS.fundingParticipants).findOne({
    group_funding_id: fundingId,
    group_member_id: context.membership._id
  });

  if (existingParticipant) {
    const currentAmount = toNullableNumber(existingParticipant.amount) ?? 0;
    const nextAmount = Number((currentAmount + normalizedAmount).toFixed(2));
    await db.collection(COLLECTIONS.fundingParticipants).updateOne(
      { _id: existingParticipant._id },
      { $set: { amount: toDecimal(nextAmount) } }
    );
  } else {
    await db.collection(COLLECTIONS.fundingParticipants).insertOne({
      group_funding_id: fundingId,
      group_member_id: context.membership._id,
      amount,
      created_at: new Date()
    });
  }

  const currentFundingAmount = toNullableNumber(funding.amount) ?? 0;
  const updatedFundingAmount = Number((currentFundingAmount + normalizedAmount).toFixed(2));
  await db.collection(COLLECTIONS.groupFunding).updateOne(
    { _id: fundingId },
    { $set: { amount: toDecimal(updatedFundingAmount) } }
  );

  let updatedBankBalance = null;
  if (bankAccount && currentBalance != null) {
    updatedBankBalance = Number((currentBalance - normalizedAmount).toFixed(2));
    await db.collection(COLLECTIONS.bankAccounts).updateOne(
      { _id: bankAccount._id },
      { $set: { balance: toDecimal(updatedBankBalance) } }
    );
  }

  return sendJson(res, 201, {
    ok: true,
    donation: {
      funding_id: String(fundingId),
      amount: normalizedAmount,
      funding_total: updatedFundingAmount,
      bank_balance: updatedBankBalance
    }
  });
}

async function handleCreateGroupExpense(req, res, groupIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
  if (context.membership.role !== "admin") return sendJson(res, 403, { ok: false, message: "Only admins can create group expenses" });

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const fundingId = parseObjectId(payload.group_funding_id);
  if (!fundingId) return sendJson(res, 400, { ok: false, message: "A valid funding is required" });

  const funding = await db.collection(COLLECTIONS.groupFunding).findOne(
    { _id: fundingId, group_id: context.groupId },
    { projection: { _id: 1, amount: 1 } }
  );
  if (!funding) return sendJson(res, 404, { ok: false, message: "Funding not found in this group" });

  const normalizedAmount = parsePositiveAmount(payload.amount);
  if (normalizedAmount == null) return sendJson(res, 400, { ok: false, message: "Expense amount must be a positive number" });

  const dueDate = toNullableDate(payload.due_date);
  if (payload.due_date && !dueDate) return sendJson(res, 400, { ok: false, message: "Expense due date is invalid" });

  const info = String(payload.info || "").trim() || null;
  const fundingBalance = toNullableNumber(funding.amount) ?? 0;
  if (normalizedAmount > fundingBalance) return sendJson(res, 400, { ok: false, message: "Funding balance is too low for this expense" });

  const createdAt = new Date();
  const amountDecimal = toDecimal(normalizedAmount);
  const expenseResult = await db.collection(COLLECTIONS.groupExpenses).insertOne({
    group_funding_id: fundingId,
    amount: amountDecimal,
    info,
    state: "paid",
    due_date: dueDate,
    created_at: createdAt
  });

  await db.collection(COLLECTIONS.transactions).insertOne({
    group_expense_id: expenseResult.insertedId,
    amount: amountDecimal,
    created_at: createdAt
  });

  const updatedFundingBalance = Number((fundingBalance - normalizedAmount).toFixed(2));
  await db.collection(COLLECTIONS.groupFunding).updateOne(
    { _id: fundingId },
    { $set: { amount: toDecimal(updatedFundingBalance) } }
  );

  return sendJson(res, 201, {
    ok: true,
    expense: {
      group_expense_id: String(expenseResult.insertedId),
      group_funding_id: String(fundingId),
      amount: normalizedAmount,
      info,
      state: "paid",
      due_date: dueDate,
      created_at: createdAt,
      funding_balance: updatedFundingBalance
    }
  });
}

async function handleInviteUser(req, res, groupIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
  if (context.membership.role !== "admin") return sendJson(res, 403, { ok: false, message: "Only admins can invite users" });

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const username = String(payload.username || "").trim().toLowerCase();
  if (!username) return sendJson(res, 400, { ok: false, message: "Username is required" });

  const inviteUser = await db.collection(COLLECTIONS.users).findOne(
    { username },
    { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } }
  );
  if (!inviteUser) return sendJson(res, 404, { ok: false, message: "User not found" });

  const existingMembership = await db.collection(COLLECTIONS.groupMembers).findOne({ group_id: context.groupId, user_id: inviteUser._id });
  if (existingMembership) {
    if (existingMembership.status === "denied") {
      await db.collection(COLLECTIONS.groupMembers).updateOne({ _id: existingMembership._id }, { $set: { role: "member", status: "invited" } });
      return sendJson(res, 200, {
        ok: true,
        member: {
          user_id: String(inviteUser._id),
          username: inviteUser.username,
          first_name: inviteUser.first_name ?? null,
          last_name: inviteUser.last_name ?? null,
          role: "member",
          status: "invited"
        }
      });
    }

    if (existingMembership.status === "invited") {
      return sendJson(res, 409, { ok: false, message: "User already has a pending invitation" });
    }

    return sendJson(res, 409, { ok: false, message: "User is already in this group" });
  }

  await db.collection(COLLECTIONS.groupMembers).insertOne({ group_id: context.groupId, user_id: inviteUser._id, role: "member", status: "invited" });

  return sendJson(res, 201, {
    ok: true,
    member: {
      user_id: String(inviteUser._id),
      username: inviteUser.username,
      first_name: inviteUser.first_name ?? null,
      last_name: inviteUser.last_name ?? null,
      role: "member",
      status: "invited"
    }
  });
}

async function handleGetInvitations(req, res, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  const invitations = await db.collection(COLLECTIONS.groupMembers).aggregate([
    { $match: { user_id: userId, status: "invited" } },
    { $lookup: { from: COLLECTIONS.groups, localField: "group_id", foreignField: "_id", as: "group" } },
    { $unwind: "$group" },
    { $sort: { "group.created_at": -1 } },
    {
      $project: {
        _id: 0,
        group_id: "$group._id",
        group_name: "$group.name",
        group_address: "$group.address",
        group_created_at: "$group.created_at",
        role: "$role",
        status: "$status"
      }
    }
  ]).toArray();

  return sendJson(res, 200, {
    ok: true,
    invitations: invitations.map((entry) => ({
      group_id: String(entry.group_id),
      group_name: entry.group_name,
      group_address: entry.group_address ?? null,
      group_created_at: entry.group_created_at ?? null,
      role: entry.role,
      status: entry.status
    }))
  });
}

async function handleInvitationDecision(req, res, groupIdRaw, decision, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (decision !== "accept" && decision !== "deny") {
    return sendJson(res, 400, { ok: false, message: "Invalid invitation decision" });
  }

  const groupId = parseObjectId(groupIdRaw);
  if (!groupId) return sendJson(res, 400, { ok: false, message: "Invalid group id" });

  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  const targetStatus = decision === "accept" ? "accepted" : "denied";
  const result = await db.collection(COLLECTIONS.groupMembers).updateOne(
    { group_id: groupId, user_id: userId, status: "invited" },
    { $set: { status: targetStatus } }
  );

  if (result.matchedCount === 0) {
    return sendJson(res, 404, { ok: false, message: "Invitation not found or already handled" });
  }

  return sendJson(res, 200, { ok: true, status: targetStatus });
}

async function handleRemoveMember(req, res, groupIdRaw, userIdRaw, session) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
  if (context.membership.role !== "admin") return sendJson(res, 403, { ok: false, message: "Only admins can remove participants" });

  const targetUserId = parseObjectId(userIdRaw);
  if (!targetUserId) return sendJson(res, 400, { ok: false, message: "Invalid user id" });
  if (String(targetUserId) === String(context.user._id)) {
    return sendJson(res, 400, { ok: false, message: "You can only remove other participants" });
  }

  const deleteResult = await db.collection(COLLECTIONS.groupMembers).deleteOne({ group_id: context.groupId, user_id: targetUserId });
  if (deleteResult.deletedCount === 0) {
    return sendJson(res, 404, { ok: false, message: "Participant not found in this group" });
  }

  return sendJson(res, 200, { ok: true });
}

async function handlePromoteMemberToAdmin(req, res, groupIdRaw, userIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
  if (context.membership.role !== "admin") return sendJson(res, 403, { ok: false, message: "Only admins can assign admin role" });

  const targetUserId = parseObjectId(userIdRaw);
  if (!targetUserId) return sendJson(res, 400, { ok: false, message: "Invalid user id" });
  if (String(targetUserId) === String(context.user._id)) return sendJson(res, 400, { ok: false, message: "You are already an admin" });

  const targetMembership = await db.collection(COLLECTIONS.groupMembers).findOne({
    group_id: context.groupId,
    user_id: targetUserId,
    ...activeMembershipFilter()
  });
  if (!targetMembership) return sendJson(res, 404, { ok: false, message: "Participant not found in this group" });
  if (targetMembership.role === "admin") return sendJson(res, 409, { ok: false, message: "User is already admin" });

  await db.collection(COLLECTIONS.groupMembers).updateOne(
    { _id: targetMembership._id },
    { $set: { role: "admin" } }
  );

  return sendJson(res, 200, { ok: true, role: "admin" });
}

async function deleteGroupCascade(groupId) {
  const groupFunding = await db.collection(COLLECTIONS.groupFunding).find({ group_id: groupId }, { projection: { _id: 1 } }).toArray();
  const fundingIds = groupFunding.map((funding) => funding._id);

  let groupExpenseIds = [];
  if (fundingIds.length) {
    const groupExpenses = await db.collection(COLLECTIONS.groupExpenses).find({ group_funding_id: { $in: fundingIds } }, { projection: { _id: 1 } }).toArray();
    groupExpenseIds = groupExpenses.map((expense) => expense._id);
  }

  if (groupExpenseIds.length) {
    await db.collection(COLLECTIONS.transactions).deleteMany({ group_expense_id: { $in: groupExpenseIds } });
    await db.collection(COLLECTIONS.groupExpenses).deleteMany({ _id: { $in: groupExpenseIds } });
  }
  if (fundingIds.length) {
    await db.collection(COLLECTIONS.fundingParticipants).deleteMany({ group_funding_id: { $in: fundingIds } });
    await db.collection(COLLECTIONS.groupFunding).deleteMany({ _id: { $in: fundingIds } });
  }

  await db.collection(COLLECTIONS.groupActivities).deleteMany({ group_id: groupId });
  await db.collection(COLLECTIONS.groupMembers).deleteMany({ group_id: groupId });
  await db.collection(COLLECTIONS.groups).deleteOne({ _id: groupId });
}

async function handleLeaveGroup(req, res, groupIdRaw, session) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

  const leaveResult = await db.collection(COLLECTIONS.groupMembers).deleteOne({ _id: context.membership._id });
  if (leaveResult.deletedCount === 0) {
    return sendJson(res, 404, { ok: false, message: "Membership not found" });
  }

  if (context.membership.role === "admin") {
    const activeAdmins = await db.collection(COLLECTIONS.groupMembers).countDocuments({
      group_id: context.groupId,
      role: "admin",
      ...activeMembershipFilter()
    });

    if (activeAdmins === 0) {
      const replacementAdmin = await db.collection(COLLECTIONS.groupMembers).findOne(
        { group_id: context.groupId, ...activeMembershipFilter() },
        { sort: { _id: 1 } }
      );
      if (replacementAdmin) {
        await db.collection(COLLECTIONS.groupMembers).updateOne(
          { _id: replacementAdmin._id },
          { $set: { role: "admin" } }
        );
      }
    }
  }

  const remainingMembers = await db.collection(COLLECTIONS.groupMembers).countDocuments({
    group_id: context.groupId,
    ...activeMembershipFilter()
  });

  if (remainingMembers === 0) {
    await deleteGroupCascade(context.groupId);
    return sendJson(res, 200, { ok: true, left: true, deleted_group: true });
  }

  return sendJson(res, 200, { ok: true, left: true, deleted_group: false });
}

async function handleDeleteGroup(req, res, groupIdRaw, session) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw, session.user.id);
  if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
  if (context.membership.role !== "admin") return sendJson(res, 403, { ok: false, message: "Only admins can delete groups" });

  await deleteGroupCascade(context.groupId);

  return sendJson(res, 200, { ok: true });
}

async function handleGroups(req, res, session) {
  const userId = parseObjectId(session.user.id);
  if (!userId) return sendJson(res, 401, { ok: false, message: "Session user invalid" });

  if (req.method === "GET") {
    const memberships = await db.collection(COLLECTIONS.groupMembers).aggregate([
      { $match: { user_id: userId, ...activeMembershipFilter() } },
      { $lookup: { from: COLLECTIONS.groups, localField: "group_id", foreignField: "_id", as: "group" } },
      { $unwind: "$group" },
      { $sort: { "group.created_at": -1 } },
      {
        $project: {
          _id: 0,
          group_id: "$group._id",
          name: "$group.name",
          address: "$group.address",
          created_at: "$group.created_at",
          role: "$role",
          status: "$status"
        }
      }
    ]).toArray();

    return sendJson(res, 200, {
      ok: true,
      session_username: session.user.username,
      groups: memberships.map((entry) => ({
        group_id: String(entry.group_id),
        name: entry.name,
        address: entry.address ?? null,
        created_at: entry.created_at ?? null,
        role: entry.role,
        status: entry.status ?? null
      }))
    });
  }

  if (req.method === "POST") {
    let payload;
    try {
      payload = await readBody(req);
    } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
    }

    const name = String(payload.name || "").trim();
    const address = String(payload.address || "").trim();
    if (!name) return sendJson(res, 400, { ok: false, message: "Group name is required" });

    const now = new Date();
    const groupResult = await db.collection(COLLECTIONS.groups).insertOne({ name, address: address || null, created_at: now });

    await db.collection(COLLECTIONS.groupMembers).insertOne({
      group_id: groupResult.insertedId,
      user_id: userId,
      role: "admin",
      status: "accepted"
    });

    return sendJson(res, 201, {
      ok: true,
      group: {
        group_id: String(groupResult.insertedId),
        name,
        address: address || null,
        role: "admin",
        status: "accepted",
        created_at: now
      }
    });
  }

  res.setHeader("Allow", "GET, POST");
  return sendJson(res, 405, { ok: false, message: "Method not allowed" });
}

async function loadUserBankAccounts(userId) {
  const userObjectId = parseObjectId(userId);
  if (!userObjectId) return [];

  const accounts = await db.collection(COLLECTIONS.bankAccounts)
    .find({ user_id: userObjectId })
    .project({ _id: 1, created_at: 1 })
    .sort({ created_at: 1 })
    .toArray();

  return accounts.map((account, index) => ({ id: String(account._id), label: `Konto ${index + 1}` }));
}

async function loadUserPositions(userId, bankAccountIdRaw = "") {
  const userObjectId = parseObjectId(userId);
  if (!userObjectId) return [];

  const accountFilter = { user_id: userObjectId };
  const selectedAccountId = parseObjectId(bankAccountIdRaw);
  if (bankAccountIdRaw && !selectedAccountId) return [];
  if (selectedAccountId) accountFilter._id = selectedAccountId;

  const bankAccounts = await db.collection(COLLECTIONS.bankAccounts).find(accountFilter).project({ _id: 1 }).toArray();
  if (!bankAccounts.length) return [];

  const accountIds = bankAccounts.map((acc) => acc._id);
  const shares = await db.collection(COLLECTIONS.shares)
    .find({ bank_account_id: { $in: accountIds } })
    .sort({ bought_at: 1 })
    .limit(500)
    .toArray();

  return shares
    .map((share) => {
      const symbol = String(share?.symbol || "").trim().toUpperCase();
      const amount = toNumber(share?.units);
      const boughtFor = toNumber(share?.bought_for);
      const boughtAtMs = share?.bought_at instanceof Date ? share.bought_at.getTime() : Date.parse(String(share?.bought_at || ""));
      const createdAt = Number.isFinite(boughtAtMs) ? Math.floor(boughtAtMs / 1000) : Number.NaN;
      const worthWhenBought = Number.isFinite(amount) && amount > 0 && Number.isFinite(boughtFor) ? boughtFor / amount : Number.NaN;

      if (!symbol) return null;
      if (!Number.isFinite(amount) || amount <= 0) return null;
      if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
      if (!Number.isFinite(worthWhenBought) || worthWhenBought <= 0) return null;

      return {
        symbol,
        amount: Number(amount.toFixed(4)),
        created_at: createdAt,
        worthwhenbought: Number(worthWhenBought.toFixed(4))
      };
    })
    .filter(Boolean);
}

async function handlePositions(req, res, url, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const bankAccountId = String(url.searchParams.get("bank_account_id") || "").trim();
  const positions = await loadUserPositions(session.user.id, bankAccountId);
  return sendJson(res, 200, positions);
}

async function handleBankAccounts(req, res, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const accounts = await loadUserBankAccounts(session.user.id);
  return sendJson(res, 200, { accounts });
}

async function handleDebugPositions(req, res, url, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const bankAccountId = String(url.searchParams.get("bank_account_id") || "").trim();
  const accounts = await loadUserBankAccounts(session.user.id);
  const positions = await loadUserPositions(session.user.id, bankAccountId);

  return sendJson(res, 200, {
    ok: true,
    user_id: session.user.id,
    selected_bank_account_id: bankAccountId || null,
    visible_accounts: accounts,
    positions_count: positions.length
  });
}

async function handleTwelveDataProxy(req, res, pathname, requestUrl, session) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (!TWELVE_DATA_API_KEY) {
    return sendJson(res, 500, { status: "error", message: "TWELVE_DATA_API_KEY fehlt im Backend." });
  }

  const tdPathRaw = pathname.slice("/api/twelvedata".length) || "/";
  const tdPath = tdPathRaw.startsWith("/") ? tdPathRaw : `/${tdPathRaw}`;
  const tdUrl = new URL(tdPath, TWELVE_DATA_BASE_URL);

  requestUrl.searchParams.forEach((value, key) => {
    if (key.toLowerCase() === "apikey" || key.toLowerCase() === "api_key") return;
    tdUrl.searchParams.set(key, value);
  });
  tdUrl.searchParams.set("apikey", TWELVE_DATA_API_KEY);

  try {
    const upstreamResponse = await fetch(tdUrl.toString(), { headers: { Accept: "application/json" } });
    const body = await upstreamResponse.text();
    res.writeHead(upstreamResponse.status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch (error) {
    return sendJson(res, 502, {
      status: "error",
      message: "Twelve Data Proxy Anfrage fehlgeschlagen.",
      detail: String(error?.message || error)
    });
  }
}

function resolveStaticPath(pathname) {
  if (pathname === "/") return path.join(PROJECT_ROOT, "uebersicht", "index.html");
  if (pathname === "/dashboard.html") return path.join(PROJECT_ROOT, "uebersicht", "dashboard.html");
  if (pathname === "/dashboard.css") return path.join(PROJECT_ROOT, "uebersicht", "dashboard.css");
  if (pathname === "/style.css") return path.join(PROJECT_ROOT, "uebersicht", "style.css");
  if (pathname === "/script.js") return path.join(PROJECT_ROOT, "uebersicht", "script.js");
  if (pathname.startsWith("/js/")) {
    return path.join(PROJECT_ROOT, "uebersicht", pathname.slice(1));
  }

  if (pathname === "/groups/") return path.join(PROJECT_ROOT, "groups", "index.html");
  if (pathname.startsWith("/groups/")) {
    const relative = pathname.replace(/^\/groups\//, "");
    return path.join(PROJECT_ROOT, "groups", relative);
  }

  if (pathname === "/aktien/") return path.join(PROJECT_ROOT, "aktien", "ShareView.html");
  if (pathname.startsWith("/aktien/")) {
    const relative = pathname.replace(/^\/aktien\//, "");
    return path.join(PROJECT_ROOT, "aktien", relative);
  }

  return path.join(PROJECT_ROOT, pathname.slice(1));
}

async function handleStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/" : decodeURIComponent(pathname);
  const normalized = path.normalize(requestPath).replace(/^([/\\])+/, "");
  const filePath = resolveStaticPath(`/${normalized}`);

  if (!filePath.startsWith(PROJECT_ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 500;
    res.end("Internal server error");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    gcSessions();

    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    const pathname = url.pathname;

    if (pathname === "/api/login") return await handleLogin(req, res);
    if (pathname === "/api/register") return await handleRegister(req, res);
    if (pathname === "/api/register/verify") return await handleRegisterVerify(req, res);
    if (pathname === "/api/session") return await handleSession(req, res);
    if (pathname === "/api/logout") return await handleLogout(req, res);

    const isProtectedUiPath =
      pathname === "/dashboard.html" ||
      pathname === "/groups" ||
      pathname.startsWith("/groups/") ||
      pathname === "/aktien" ||
      pathname.startsWith("/aktien/") ||
      pathname.startsWith("/js/dashboard/");

    if (isProtectedUiPath) {
      const session = await getSessionUser(req);
      if (!session) {
        res.writeHead(302, { Location: "/" });
        res.end();
        return;
      }
    }

    if (pathname === "/groups") {
      res.writeHead(302, { Location: "/groups/" });
      res.end();
      return;
    }
    if (pathname === "/aktien") {
      res.writeHead(302, { Location: "/aktien/" });
      res.end();
      return;
    }

    if (pathname.startsWith("/api/")) {
      const session = await requireSessionUser(req, res);
      if (!session) return;

      if (pathname === "/api/categories") return await handleCategories(req, res, session);
      if (pathname === "/api/income-entries") return await handleIncomeEntries(req, res, session);
      if (pathname.startsWith("/api/income-entries/")) {
        const entryId = decodeURIComponent(pathname.replace("/api/income-entries/", ""));
        return await handleIncomeEntryById(req, res, entryId, session);
      }
      if (pathname === "/api/expense-entries") return await handleExpenseEntries(req, res, session);
      if (pathname.startsWith("/api/expense-entries/")) {
        const entryId = decodeURIComponent(pathname.replace("/api/expense-entries/", ""));
        return await handleExpenseEntryById(req, res, entryId, session);
      }
      if (pathname === "/api/user-income") return await handleUserIncome(req, res, session);

      if (pathname === "/api/groups") return await handleGroups(req, res, session);
      if (pathname === "/api/inbox/invitations") return await handleGetInvitations(req, res, session);

      const invitationDecisionMatch = pathname.match(/^\/api\/inbox\/invitations\/([^/]+)\/(accept|deny)$/);
      if (invitationDecisionMatch) {
        return await handleInvitationDecision(req, res, invitationDecisionMatch[1], invitationDecisionMatch[2], session);
      }

      const inviteMatch = pathname.match(/^\/api\/groups\/([^/]+)\/invite$/);
      if (inviteMatch) return await handleInviteUser(req, res, inviteMatch[1], session);

      const createActivityMatch = pathname.match(/^\/api\/groups\/([^/]+)\/activities$/);
      if (createActivityMatch) return await handleCreateGroupActivity(req, res, createActivityMatch[1], session);

      const createFundingMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding$/);
      if (createFundingMatch) return await handleCreateGroupFunding(req, res, createFundingMatch[1], session);

      const donateMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding\/([^/]+)\/donate$/);
      if (donateMatch) return await handleDonateToFunding(req, res, donateMatch[1], donateMatch[2], session);

      const createExpenseMatch = pathname.match(/^\/api\/groups\/([^/]+)\/expenses$/);
      if (createExpenseMatch) return await handleCreateGroupExpense(req, res, createExpenseMatch[1], session);

      const promoteAdminMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)\/promote-admin$/);
      if (promoteAdminMatch) return await handlePromoteMemberToAdmin(req, res, promoteAdminMatch[1], promoteAdminMatch[2], session);

      const leaveGroupMatch = pathname.match(/^\/api\/groups\/([^/]+)\/leave$/);
      if (leaveGroupMatch) return await handleLeaveGroup(req, res, leaveGroupMatch[1], session);

      const removeMemberMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
      if (removeMemberMatch) return await handleRemoveMember(req, res, removeMemberMatch[1], removeMemberMatch[2], session);

      const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
      if (groupMatch) {
        if (req.method === "GET") return await handleGroupDetail(req, res, groupMatch[1], session);
        if (req.method === "DELETE") return await handleDeleteGroup(req, res, groupMatch[1], session);
        res.setHeader("Allow", "GET, DELETE");
        return sendJson(res, 405, { ok: false, message: "Method not allowed" });
      }

      if (pathname === "/api/positions") return await handlePositions(req, res, url, session);
      if (pathname === "/api/bank-accounts") return await handleBankAccounts(req, res, session);
      if (pathname === "/api/debug/positions") return await handleDebugPositions(req, res, url, session);
      if (pathname.startsWith("/api/twelvedata")) return await handleTwelveDataProxy(req, res, pathname, url, session);

      return sendJson(res, 404, { ok: false, message: "API route not found" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, POST, PATCH, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    return await handleStatic(req, res, pathname);
  } catch (error) {
    console.error("Request failed:", error);
    return sendJson(res, 500, { ok: false, message: "Internal server error" });
  }
});

async function ensureIndexes() {
  await db.collection(COLLECTIONS.emailVerifications).createIndex(
    { email: 1 },
    { unique: true, name: "email_verifications_email_unique" }
  );
  await db.collection(COLLECTIONS.emailVerifications).createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0, name: "email_verifications_expires_ttl" }
  );
  await db.collection(COLLECTIONS.incomeEntries).createIndex(
    { user_id: 1, received_at: -1 },
    { name: "income_entries_user_date_idx" }
  );
  await db.collection(COLLECTIONS.incomeEntries).createIndex(
    { user_id: 1, recurrence: 1, is_active: 1 },
    { name: "income_entries_user_recurrence_idx" }
  );
  await db.collection(COLLECTIONS.expenseEntries).createIndex(
    { user_id: 1, spent_at: -1, due_date: -1 },
    { name: "private_expenses_dashboard_user_date_idx" }
  );
  await db.collection(COLLECTIONS.expenseEntries).createIndex(
    { user_id: 1, recurrence: 1, is_active: 1 },
    { name: "private_expenses_dashboard_user_recurrence_idx" }
  );
  await db.collection(COLLECTIONS.expenseEntries).createIndex(
    { legacy_expense_entry_id: 1 },
    { unique: true, sparse: true, name: "private_expenses_legacy_expense_entry_unique" }
  );
  await db.collection(COLLECTIONS.userCategories).createIndex(
    { user_id: 1, kind: 1, key: 1 },
    { unique: true, name: "user_categories_user_kind_key_unique" }
  );
}

async function start() {
  await client.connect();
  db = client.db(DB_NAME);

  await migratePlaintextPasswords();
  await migrateLegacyExpenseEntriesToV2();
  await ensureIndexes();

  server.listen(PORT, () => {
    console.log(`FinanzApp backend running on http://localhost:${PORT}`);
    console.log(`Login: http://localhost:${PORT}/`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard.html`);
    console.log(`Groups: http://localhost:${PORT}/groups`);
    console.log(`Aktien: http://localhost:${PORT}/aktien`);
  });
}

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await client.close();
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

start().catch(async (error) => {
  console.error("Server startup failed:", error);
  await client.close();
  process.exit(1);
});
