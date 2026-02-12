const http = require("http");
const path = require("path");
const { readFile } = require("fs/promises");
const { createHash, randomInt } = require("crypto");
const { MongoClient, Decimal128, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.MONGODB_DB || "finanzapp";
const MONGO_URI = process.env.MONGODB_URI;
const STATIC_ROOT = __dirname;
const VERIFICATION_TTL_MINUTES = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15);
const DEV_EXPOSE_VERIFICATION_CODE = process.env.DEV_EXPOSE_VERIFICATION_CODE === "true";

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

const client = new MongoClient(MONGO_URI);
let db;
let mailTransporter;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  return "application/octet-stream";
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

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseIncome(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Number(numeric.toFixed(2));
}

function parsePositiveAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Number(numeric.toFixed(2));
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
  if (normalized === "weekly" || normalized === "monthly" || normalized === "once") {
    return normalized;
  }
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

async function rememberUserCategory(userId, kind, categoryValue) {
  const normalized = normalizeCategoryValue(categoryValue);
  if (!normalized) return;
  const key = categoryKey(normalized);
  await db.collection("user_categories").updateOne(
    { user_id: userId, kind, key },
    {
      $setOnInsert: {
        user_id: userId,
        kind,
        key,
        created_at: new Date()
      },
      $set: {
        value: normalized,
        updated_at: new Date()
      }
    },
    { upsert: true }
  );
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
  return {
    id: String(entry._id),
    user_id: String(entry.user_id),
    source: entry.source || "",
    category: entry.category,
    amount: toNumber(entry.amount),
    recurrence: entry.recurrence || "once",
    is_active: typeof entry.is_active === "boolean" ? entry.is_active : true,
    spent_at: entry.spent_at instanceof Date ? entry.spent_at.toISOString() : null,
    note: entry.note || "",
    created_at: entry.created_at instanceof Date ? entry.created_at.toISOString() : null,
    updated_at: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : null
  };
}

function getMailer() {
  if (!SMTP_HOST || !SMTP_FROM) {
    return null;
  }
  if (!mailTransporter) {
    const auth =
      SMTP_USER && SMTP_PASS
        ? {
            user: SMTP_USER,
            pass: SMTP_PASS
          }
        : undefined;
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
    html: `<p>Hallo ${greetingName},</p><p>dein Verifizierungscode lautet:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p><p>Der Code ist ${VERIFICATION_TTL_MINUTES} Minuten gueltig.</p>`
  });
  return true;
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
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!email || !password) {
    return sendJson(res, 400, { ok: false, message: "Email und Passwort sind Pflichtfelder" });
  }

  const user = await db.collection("users").findOne(
    { email },
    { projection: { username: 1, email: 1, password: 1, first_name: 1, last_name: 1, income: 1 } }
  );

  if (!user || user.password !== password) {
    return sendJson(res, 401, { ok: false, message: "E-Mail oder Passwort falsch" });
  }

  const income = user?.income && typeof user.income.toString === "function"
    ? Number(user.income.toString())
    : null;

  return sendJson(res, 200, {
    ok: true,
    user: {
      id: String(user._id),
      username: user.username,
      email: user.email,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      income
    }
  });
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
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
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

  const existingUser = await db.collection("users").findOne(
    { $or: [{ email }, { username }] },
    { projection: { _id: 1 } }
  );
  if (existingUser) {
    return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });
  }

  const code = createVerificationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);

  await db.collection("email_verifications").updateOne(
    { email },
    {
      $set: {
        email,
        username,
        password,
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
    return sendJson(res, 502, {
      ok: false,
      message: "E-Mail konnte nicht versendet werden. Bitte SMTP-Konfiguration pruefen."
    });
  }
  const response = {
    ok: true,
    pending_email: email,
    message: delivered
      ? "Verifizierungscode wurde per E-Mail versendet"
      : "SMTP nicht konfiguriert. Der Code wurde im Server-Log ausgegeben."
  };

  if (!delivered && DEV_EXPOSE_VERIFICATION_CODE) {
    response.debug_code = code;
  }

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
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const email = normalizeEmail(payload.email);
  const code = String(payload.code || "").trim();

  if (!email || !code) {
    return sendJson(res, 400, { ok: false, message: "E-Mail und Code sind Pflichtfelder" });
  }

  const verification = await db.collection("email_verifications").findOne({ email });
  if (!verification) {
    return sendJson(res, 404, { ok: false, message: "Keine offene Verifizierung fuer diese E-Mail" });
  }

  if (verification.expires_at && new Date(verification.expires_at).getTime() < Date.now()) {
    await db.collection("email_verifications").deleteOne({ email });
    return sendJson(res, 410, { ok: false, message: "Code abgelaufen. Bitte erneut registrieren." });
  }

  if ((verification.attempts || 0) >= 5) {
    return sendJson(res, 429, { ok: false, message: "Zu viele Fehlversuche. Bitte erneut registrieren." });
  }

  const codeHash = hashValue(code);
  if (codeHash !== verification.code_hash) {
    await db.collection("email_verifications").updateOne(
      { email },
      { $inc: { attempts: 1 } }
    );
    return sendJson(res, 400, { ok: false, message: "Verifizierungscode ist ungueltig" });
  }

  const userDoc = {
    username: verification.username,
    email: verification.email,
    password: verification.password,
    hashed_passwort: hashValue(verification.password),
    first_name: verification.first_name,
    last_name: verification.last_name,
    age: null,
    income: toDecimal(verification.income),
    created_at: new Date()
  };

  try {
    const insert = await db.collection("users").insertOne(userDoc);
    await db.collection("email_verifications").deleteOne({ email });
    return sendJson(res, 201, {
      ok: true,
      message: "E-Mail verifiziert und Konto erstellt",
      user: {
        id: String(insert.insertedId),
        username: userDoc.username,
        email: userDoc.email
      }
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return sendJson(res, 409, { ok: false, message: "Username oder E-Mail existiert bereits" });
    }
    throw error;
  }
}

async function handleCategories(req, res, url) {
  if (req.method === "GET") {
    const userId = parseObjectId(url.searchParams.get("user_id"));
    if (!userId) {
      return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
    }

    const [stored, incomeDistinct, expenseDistinct] = await Promise.all([
      db.collection("user_categories")
        .find({ user_id: userId })
        .project({ _id: 0, kind: 1, value: 1 })
        .toArray(),
      db.collection("income_entries").distinct("category", { user_id: userId }),
      db.collection("expense_entries").distinct("category", { user_id: userId })
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
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const userId = parseObjectId(payload.user_id);
  if (!userId) {
    return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
  }
  const kind = String(payload.kind || "").trim().toLowerCase();
  if (kind !== "income" && kind !== "expense") {
    return sendJson(res, 400, { ok: false, message: "kind muss income oder expense sein" });
  }

  const category = normalizeCategoryValue(payload.category);
  if (!category) {
    return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  }

  const presetSet = kind === "income" ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
  if (presetSet.has(category.toLowerCase())) {
    return sendJson(res, 400, { ok: false, message: "Standardkategorien koennen nicht geloescht werden" });
  }

  const fallbackCategory = normalizeCategoryValue(payload.replace_with || "other");
  if (!fallbackCategory) {
    return sendJson(res, 400, { ok: false, message: "replace_with ist ungueltig" });
  }

  const collectionName = kind === "income" ? "income_entries" : "expense_entries";
  const updateResult = await db.collection(collectionName).updateMany(
    {
      user_id: userId,
      category: new RegExp(`^${escapeRegex(category)}$`, "i")
    },
    {
      $set: {
        category: fallbackCategory,
        updated_at: new Date()
      }
    }
  );

  await db.collection("user_categories").deleteOne({
    user_id: userId,
    kind,
    key: categoryKey(category)
  });

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

async function handleIncomeEntries(req, res, url) {
  if (req.method === "GET") {
    const userId = parseObjectId(url.searchParams.get("user_id"));
    if (!userId) {
      return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
    }

    const entries = await db.collection("income_entries")
      .find({ user_id: userId })
      .sort({ received_at: -1, created_at: -1 })
      .limit(200)
      .toArray();

    return sendJson(res, 200, {
      ok: true,
      entries: entries.map(serializeIncomeEntry)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const userId = parseObjectId(payload.user_id);
  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = Number(payload.amount);
  const receivedAt = payload.received_at ? new Date(payload.received_at) : new Date();
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!userId) {
    return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
  }
  if (!source) {
    return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  }
  if (!category) {
    return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  }
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  }
  if (Number.isNaN(receivedAt.getTime())) {
    return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  }
  if (!recurrence) {
    return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });
  }

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

  const insert = await db.collection("income_entries").insertOne(doc);
  const inserted = await db.collection("income_entries").findOne({ _id: insert.insertedId });

  return sendJson(res, 201, {
    ok: true,
    entry: serializeIncomeEntry(inserted)
  });
}

async function handleIncomeEntryById(req, res, url, entryIdRaw) {
  const entryId = parseObjectId(entryIdRaw);
  if (!entryId) {
    return sendJson(res, 400, { ok: false, message: "entry_id ist ungueltig" });
  }

  const userId = parseObjectId(url.searchParams.get("user_id"));
  if (!userId) {
    return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
  }

  if (req.method === "DELETE") {
    const deletion = await db.collection("income_entries").deleteOne({
      _id: entryId,
      user_id: userId
    });
    if (!deletion || deletion.deletedCount !== 1) {
      return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
    }
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
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = Number(payload.amount);
  const receivedAt = payload.received_at ? new Date(payload.received_at) : null;
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) {
    return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  }
  if (!category) {
    return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  }
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  }
  if (!receivedAt || Number.isNaN(receivedAt.getTime())) {
    return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  }
  if (!recurrence) {
    return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });
  }

  await rememberUserCategory(userId, "income", category);

  const updated = await db.collection("income_entries").findOneAndUpdate(
    {
      _id: entryId,
      user_id: userId
    },
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

  if (!updated) {
    return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
  }

  return sendJson(res, 200, {
    ok: true,
    entry: serializeIncomeEntry(updated)
  });
}

async function handleExpenseEntries(req, res, url) {
  if (req.method === "GET") {
    const userId = parseObjectId(url.searchParams.get("user_id"));
    if (!userId) {
      return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
    }

    const entries = await db.collection("expense_entries")
      .find({ user_id: userId })
      .sort({ spent_at: -1, created_at: -1 })
      .limit(200)
      .toArray();

    return sendJson(res, 200, {
      ok: true,
      entries: entries.map(serializeExpenseEntry)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const userId = parseObjectId(payload.user_id);
  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = parsePositiveAmount(payload.amount);
  const spentAt = payload.spent_at ? new Date(payload.spent_at) : new Date();
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!userId) {
    return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
  }
  if (!source) {
    return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  }
  if (!category) {
    return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  }
  if (amountNumber == null) {
    return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  }
  if (Number.isNaN(spentAt.getTime())) {
    return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  }
  if (!recurrence) {
    return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });
  }

  await rememberUserCategory(userId, "expense", category);

  const doc = {
    user_id: userId,
    source,
    category,
    amount: toDecimal(amountNumber),
    spent_at: spentAt,
    note,
    recurrence,
    is_active: recurrence === "once" ? true : isActive,
    created_at: new Date(),
    updated_at: new Date()
  };

  const insert = await db.collection("expense_entries").insertOne(doc);
  const inserted = await db.collection("expense_entries").findOne({ _id: insert.insertedId });

  return sendJson(res, 201, {
    ok: true,
    entry: serializeExpenseEntry(inserted)
  });
}

async function handleExpenseEntryById(req, res, url, entryIdRaw) {
  const entryId = parseObjectId(entryIdRaw);
  if (!entryId) {
    return sendJson(res, 400, { ok: false, message: "entry_id ist ungueltig" });
  }

  const userId = parseObjectId(url.searchParams.get("user_id"));
  if (!userId) {
    return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
  }

  if (req.method === "DELETE") {
    const deletion = await db.collection("expense_entries").deleteOne({
      _id: entryId,
      user_id: userId
    });
    if (!deletion || deletion.deletedCount !== 1) {
      return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
    }
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
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const source = String(payload.source || "").trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note || "").trim();
  const amountNumber = parsePositiveAmount(payload.amount);
  const spentAt = payload.spent_at ? new Date(payload.spent_at) : null;
  const recurrence = normalizeRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) {
    return sendJson(res, 400, { ok: false, message: "Quelle ist ein Pflichtfeld" });
  }
  if (!category) {
    return sendJson(res, 400, { ok: false, message: "Kategorie ist ein Pflichtfeld" });
  }
  if (amountNumber == null) {
    return sendJson(res, 400, { ok: false, message: "Betrag muss groesser 0 sein" });
  }
  if (!spentAt || Number.isNaN(spentAt.getTime())) {
    return sendJson(res, 400, { ok: false, message: "Datum ist ungueltig" });
  }
  if (!recurrence) {
    return sendJson(res, 400, { ok: false, message: "Wiederholung muss once, weekly oder monthly sein" });
  }

  await rememberUserCategory(userId, "expense", category);

  const updated = await db.collection("expense_entries").findOneAndUpdate(
    {
      _id: entryId,
      user_id: userId
    },
    {
      $set: {
        source,
        category,
        note,
        amount: toDecimal(amountNumber),
        spent_at: spentAt,
        recurrence,
        is_active: recurrence === "once" ? true : isActive,
        updated_at: new Date()
      }
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    return sendJson(res, 404, { ok: false, message: "Eintrag wurde nicht gefunden" });
  }

  return sendJson(res, 200, {
    ok: true,
    entry: serializeExpenseEntry(updated)
  });
}

async function handleUserIncome(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const userId = parseObjectId(payload.user_id);
  const income = parseIncome(payload.income);
  if (!userId) {
    return sendJson(res, 400, { ok: false, message: "user_id ist ungueltig" });
  }
  if (income == null) {
    return sendJson(res, 400, { ok: false, message: "Monatliche Einnahme muss eine Zahl >= 0 sein" });
  }

  const updated = await db.collection("users").findOneAndUpdate(
    { _id: userId },
    {
      $set: {
        income: toDecimal(income)
      }
    },
    {
      projection: {
        _id: 1,
        username: 1,
        email: 1,
        first_name: 1,
        last_name: 1,
        income: 1
      },
      returnDocument: "after"
    }
  );

  if (!updated) {
    return sendJson(res, 404, { ok: false, message: "User nicht gefunden" });
  }

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

async function handleStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const safeRelative = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(STATIC_ROOT, safeRelative);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
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
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);

    if (url.pathname === "/api/login") {
      return await handleLogin(req, res);
    }
    if (url.pathname === "/api/register") {
      return await handleRegister(req, res);
    }
    if (url.pathname === "/api/register/verify") {
      return await handleRegisterVerify(req, res);
    }
    if (url.pathname === "/api/categories") {
      return await handleCategories(req, res, url);
    }
    if (url.pathname === "/api/income-entries") {
      return await handleIncomeEntries(req, res, url);
    }
    if (url.pathname.startsWith("/api/income-entries/")) {
      const entryId = decodeURIComponent(url.pathname.replace("/api/income-entries/", ""));
      return await handleIncomeEntryById(req, res, url, entryId);
    }
    if (url.pathname === "/api/expense-entries") {
      return await handleExpenseEntries(req, res, url);
    }
    if (url.pathname.startsWith("/api/expense-entries/")) {
      const entryId = decodeURIComponent(url.pathname.replace("/api/expense-entries/", ""));
      return await handleExpenseEntryById(req, res, url, entryId);
    }
    if (url.pathname === "/api/user-income") {
      return await handleUserIncome(req, res);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, POST, PATCH, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    return await handleStatic(req, res, url.pathname);
  } catch (error) {
    console.error("Request failed:", error);
    return sendJson(res, 500, { ok: false, message: "Internal server error" });
  }
});

async function start() {
  await client.connect();
  db = client.db(DB_NAME);

  await db.collection("email_verifications").createIndex(
    { email: 1 },
    { unique: true, name: "email_verifications_email_unique" }
  );
  await db.collection("email_verifications").createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0, name: "email_verifications_expires_ttl" }
  );
  await db.collection("income_entries").createIndex(
    { user_id: 1, received_at: -1 },
    { name: "income_entries_user_date_idx" }
  );
  await db.collection("income_entries").createIndex(
    { user_id: 1, recurrence: 1, is_active: 1 },
    { name: "income_entries_user_recurrence_idx" }
  );
  await db.collection("expense_entries").createIndex(
    { user_id: 1, spent_at: -1 },
    { name: "expense_entries_user_date_idx" }
  );
  await db.collection("expense_entries").createIndex(
    { user_id: 1, recurrence: 1, is_active: 1 },
    { name: "expense_entries_user_recurrence_idx" }
  );
  await db.collection("user_categories").createIndex(
    { user_id: 1, kind: 1, key: 1 },
    { unique: true, name: "user_categories_user_kind_key_unique" }
  );
  await db.collection("user_categories").createIndex(
    { user_id: 1, kind: 1, value: 1 },
    { name: "user_categories_user_kind_value_idx" }
  );

  server.listen(PORT, () => {
    console.log(`Login app running on http://localhost:${PORT}`);
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
