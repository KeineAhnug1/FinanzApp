import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createAuthHandlers } from "../../backend/handlers/auth.mjs";

function makeFindResult(resolvedValue = []) {
  const cursor = { sort: vi.fn(), limit: vi.fn(), project: vi.fn(), toArray: vi.fn().mockResolvedValue(resolvedValue) };
  cursor.sort.mockReturnValue(cursor);
  cursor.limit.mockReturnValue(cursor);
  cursor.project.mockReturnValue(cursor);
  return cursor;
}

function makeCollection(overrides = {}) {
  return {
    find: vi.fn().mockReturnValue(makeFindResult()),
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({ insertedId: "mock-id" }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    ...overrides
  };
}

function makeDb(perCollection = {}) {
  return { collection: vi.fn((name) => perCollection[name] ?? makeCollection()) };
}

function makeRes() {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
}

function makeReq(method, body = null) {
  const emitter = new EventEmitter();
  emitter.method = method;
  emitter.socket = { remoteAddress: "127.0.0.1" };
  const bodyStr = body !== null ? JSON.stringify(body) : null;
  emitter.headers = {
    "content-type": "application/json",
    "cookie": "",
    ...(bodyStr ? { "content-length": String(Buffer.byteLength(bodyStr)) } : {})
  };
  process.nextTick(() => {
    if (bodyStr) emitter.emit("data", Buffer.from(bodyStr));
    emitter.emit("end");
  });
  return emitter;
}

function getResponseBody(res) {
  const call = res.end.mock.calls[0];
  if (!call || !call[0]) return null;
  try { return JSON.parse(call[0]); } catch { return null; }
}

function getStatusCode(res) {
  const call = res.writeHead.mock.calls[0];
  return call ? call[0] : null;
}

const mockDeps = {
  buildSessionCookie: vi.fn().mockReturnValue("session=abc"),
  clearSessionCookie: vi.fn().mockReturnValue("session=; Max-Age=0"),
  createSession: vi.fn().mockResolvedValue("mock-token"),
  destroySession: vi.fn().mockResolvedValue(undefined),
  getSessionRecord: vi.fn().mockResolvedValue(null),
  SESSION_COOKIE_NAME: "finanzapp_session"
};

afterEach(() => vi.clearAllMocks());

describe("handleLogin", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleLogin } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("GET");
    const res = makeRes();
    await handleLogin(req, res);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 when email and password are missing", async () => {
    const db = makeDb();
    const { handleLogin } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", {});
    const res = makeRes();
    await handleLogin(req, res);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).ok).toBe(false);
  });

  it("returns 401 when user not found", async () => {
    const db = makeDb({ users: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handleLogin } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "test@example.com", password: "password123" });
    const res = makeRes();
    await handleLogin(req, res);
    expect(getStatusCode(res)).toBe(401);
  });

  it("returns 200 on successful login", async () => {
    const { hashPassword } = await import("../../backend/utils/password.mjs");
    const hashed = await hashPassword("password123");
    const fakeUser = { _id: "507f1f77bcf86cd799439011", username: "testuser", email: "test@example.com", password: hashed, first_name: "Test", last_name: "User", income: 3000, created_at: new Date() };
    const db = makeDb({ users: makeCollection({ findOne: vi.fn().mockResolvedValue(fakeUser) }) });
    const { handleLogin } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "test@example.com", password: "password123" });
    const res = makeRes();
    await handleLogin(req, res);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleLogout", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleLogout } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("GET");
    const res = makeRes();
    await handleLogout(req, res);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 and clears cookie on POST", async () => {
    const db = makeDb();
    const { handleLogout } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST");
    req.headers.cookie = "finanzapp_session=abc";
    const res = makeRes();
    await handleLogout(req, res);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleSession", () => {
  it("returns 405 for non-GET", async () => {
    const db = makeDb();
    const { handleSession } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST");
    const res = makeRes();
    await handleSession(req, res);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 401 when no valid session", async () => {
    const db = makeDb();
    const { handleSession } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("GET");
    const res = makeRes();
    await handleSession(req, res);
    expect(getStatusCode(res)).toBe(401);
  });
});

describe("handleRegister", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleRegister } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("GET");
    const res = makeRes();
    await handleRegister(req, res);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 when required fields are missing", async () => {
    const db = makeDb();
    const { handleRegister } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "test@example.com" });
    const res = makeRes();
    await handleRegister(req, res);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const db = makeDb();
    const { handleRegister } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { username: "testuser", email: "not-an-email", password: "password123", first_name: "Test", last_name: "User" });
    const res = makeRes();
    await handleRegister(req, res);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/E-Mail/);
  });

  it("returns 400 for password too short", async () => {
    const db = makeDb();
    const { handleRegister } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { username: "testuser", email: "test@example.com", password: "short", first_name: "Test", last_name: "User" });
    const res = makeRes();
    await handleRegister(req, res);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/Passwort/);
  });
});

describe("handleRegisterVerify", () => {
  it("returns 400 when email or code are missing", async () => {
    const db = makeDb();
    const { handleRegisterVerify } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "test@example.com" });
    const res = makeRes();
    await handleRegisterVerify(req, res);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 404 when no pending verification exists", async () => {
    const db = makeDb({ email_verifications: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handleRegisterVerify } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "test@example.com", code: "123456" });
    const res = makeRes();
    await handleRegisterVerify(req, res);
    expect(getStatusCode(res)).toBe(404);
  });

  it("returns 400 for wrong code", async () => {
    const { hashValue } = await import("../../backend/utils/password.mjs");
    const verification = { email: "test@example.com", username: "testuser", password: "hashed", first_name: "Test", last_name: "User", income: 0, code_hash: hashValue("999999"), attempts: 0, expires_at: new Date(Date.now() + 60_000) };
    const db = makeDb({ email_verifications: makeCollection({ findOne: vi.fn().mockResolvedValue(verification) }) });
    const { handleRegisterVerify } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "test@example.com", code: "123456" });
    const res = makeRes();
    await handleRegisterVerify(req, res);
    expect(getStatusCode(res)).toBe(400);
  });
});

describe("handlePasswordForgot", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handlePasswordForgot } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("GET");
    const res = makeRes();
    await handlePasswordForgot(req, res);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 when email is missing", async () => {
    const db = makeDb();
    const { handlePasswordForgot } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", {});
    const res = makeRes();
    await handlePasswordForgot(req, res);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 200 even when user not found (prevents enumeration)", async () => {
    const db = makeDb({ users: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handlePasswordForgot } = createAuthHandlers({ db, ...mockDeps });
    const req = makeReq("POST", { email: "unknown@example.com" });
    const res = makeRes();
    await handlePasswordForgot(req, res);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});
