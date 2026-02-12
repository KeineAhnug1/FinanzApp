const http = require("http");
const path = require("path");
const { readFile } = require("fs/promises");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.MONGODB_DB || "finanzapp";
const MONGO_URI = process.env.MONGODB_URI;
const STATIC_ROOT = __dirname;

if (!MONGO_URI) {
  throw new Error("MONGODB_URI is not set in the environment");
}

const client = new MongoClient(MONGO_URI);
let db;

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

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");

  if (!email || !password) {
    return sendJson(res, 400, { ok: false, message: "Email und Passwort sind Pflichtfelder" });
  }

  const user = await db.collection("users").findOne(
    { email },
    { projection: { username: 1, email: 1, password: 1, first_name: 1, last_name: 1 } }
  );

  if (!user || user.password !== password) {
    return sendJson(res, 401, { ok: false, message: "E-Mail oder Passwort falsch" });
  }

  return sendJson(res, 200, {
    ok: true,
    user: {
      id: String(user._id),
      username: user.username,
      email: user.email,
      first_name: user.first_name || null,
      last_name: user.last_name || null
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

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, POST");
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
