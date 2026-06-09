// @ts-check
// Node.js HTTP server — adapts Web Fetch API responses from the CF-compatible router
import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import pg from "pg";
import { DATABASE_URL, MIME_BY_EXT, PORT } from "./config/runtime.mjs";
import { handleApiRequest } from "./router.mjs";
import { migratePlaintextPasswords } from "./handlers/auth.mjs";
import {
  isProtectedUiPath,
  redirectUiRoot,
  resolveStaticPath,
  resolve404Path,
} from "./routes/ui-routes.mjs";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

if (!DATABASE_URL) throw new Error("DATABASE_URL is not set in the environment");
if (!PORT || !Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`PORT is invalid: "${process.env.PORT}"`);
}

const DB_SSL_MODE = String(process.env.DB_SSL_MODE || "prefer").toLowerCase();
const sslConfig =
  DB_SSL_MODE === "disable" ? false : { rejectUnauthorized: DB_SSL_MODE === "require" };
const pool = new Pool({ connectionString: DATABASE_URL, ssl: sslConfig });

/**
 * Convert a Node.js IncomingMessage into a Web Fetch API Request.
 * @param {http.IncomingMessage} req
 * @returns {Promise<Request>}
 */
async function nodeReqToWebRequest(req) {
  const base = `http://localhost:${PORT}`;
  const url = new URL(req.url || "/", base);

  const headers = new Headers();
  const rawHeaders = req.headers;
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value) {
      headers.set(key, value);
    }
  }

  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  if (hasBody) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    return new Request(url.toString(), { method, headers, body });
  }

  return new Request(url.toString(), { method, headers });
}

/**
 * Write a Web Fetch API Response to a Node.js ServerResponse.
 * @param {Response} webResponse
 * @param {http.ServerResponse} res
 */
async function webResponseToNodeRes(webResponse, res) {
  const headers = {};
  for (const [key, value] of webResponse.headers.entries()) {
    // Node http allows multiple Set-Cookie via array
    if (key.toLowerCase() === "set-cookie") {
      const existing = headers["set-cookie"];
      if (existing) {
        headers["set-cookie"] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        headers["set-cookie"] = value;
      }
    } else {
      headers[key] = value;
    }
  }

  res.writeHead(webResponse.status, headers);

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

/**
 * Serve static files from frontend/dist.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
async function handleStatic(req, res, pathname) {
  let requestPath;
  try {
    requestPath = pathname === "/" ? "/" : decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }
  if (pathname.length > 2048 || pathname.includes("\0")) {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }
  const normalized = path.normalize(requestPath).replace(/^([/\\])+/, "");
  const filePath = resolveStaticPath(PROJECT_ROOT, `/${normalized}`);
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isHashed = filePath.includes(`${path.sep}assets${path.sep}`);
    const csp =
      ext === ".html"
        ? "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none';"
        : "default-src 'none'";
    res.writeHead(200, {
      "Content-Type":
        /** @type {Record<string,string>} */ (MIME_BY_EXT)[ext] || "application/octet-stream",
      "Cache-Control": isHashed ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": csp,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(file);
  } catch (/** @type {unknown} */ err) {
    const error = /** @type {NodeJS.ErrnoException} */ (err);
    if (error.code === "ENOENT") {
      try {
        const notFoundHtml = await readFile(resolve404Path(PROJECT_ROOT));
        res.writeHead(404, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy":
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none';",
        });
        res.end(notFoundHtml);
      } catch {
        res.statusCode = 404;
        res.end("Not found");
      }
      return;
    }
    res.statusCode = 500;
    res.end("Internal server error");
  }
}

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("[db] PostgreSQL connection established.");
  } catch (/** @type {unknown} */ err) {
    const error = /** @type {Error & { message: string; code?: string }} */ (err);
    console.error("[db] Connection error:", error.message, error.code);
    throw new Error(`PostgreSQL connection failed: ${error.message}`, { cause: err });
  }

  await migratePlaintextPasswords(pool);
  const memKv = new Map();
  const localKv = {
    get: async (key) => memKv.get(key) ?? null,
    put: async (key, value, _opts) => {
      memKv.set(key, value);
    },
    delete: async (key) => {
      memKv.delete(key);
    },
  };

  const env = {
    ...process.env,
    SESSIONS: localKv,
    NODE_ENV: process.env.NODE_ENV || "development",
  };

  const server = http.createServer(async (req, res) => {
    const logEnabled = process.env.REQUEST_LOG === "true" || process.env.NODE_ENV !== "production";
    const startedAt = Date.now();

    try {
      const urlObj = new URL(req.url || "/", `http://localhost:${PORT}`);
      const pathname = urlObj.pathname;

      // Protected UI paths: check session via a quick KV lookup using a fake web request
      if (isProtectedUiPath(pathname)) {
        const checkReq = await nodeReqToWebRequest(req);
        // Build a minimal GET /api/session to verify auth
        const sessionCheckReq = new Request(`http://localhost:${PORT}/api/session`, {
          method: "GET",
          headers: checkReq.headers,
        });
        const sessionResp = await handleApiRequest(sessionCheckReq, pool, /** @type {any} */ (env));
        const sessionData = await sessionResp.json().catch(() => ({}));
        if (!sessionData?.session_user) {
          res.writeHead(302, { Location: "/" });
          res.end();
          return;
        }
      }

      if (redirectUiRoot(pathname, res)) return;

      if (pathname.startsWith("/api/")) {
        const webReq = await nodeReqToWebRequest(req);
        const webResp = await handleApiRequest(webReq, pool, /** @type {any} */ (env));
        if (logEnabled) {
          const ms = Date.now() - startedAt;
          console.log(`${req.method} ${pathname} -> ${webResp.status} ${ms}ms`);
        }
        await webResponseToNodeRes(webResp, res);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" });
        res.end(JSON.stringify({ ok: false, message: "Method not allowed" }));
        return;
      }

      await handleStatic(req, res, pathname);
    } catch (error) {
      console.error("Request failed:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "Internal server error" }));
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`FinanzApp läuft auf http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  };
  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });
}

start().catch(async (error) => {
  console.error("Server startup failed:", error);
  await pool.end();
  process.exit(1);
});
