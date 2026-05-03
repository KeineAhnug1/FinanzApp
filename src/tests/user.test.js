import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createUserHandlers } from "../../backend/handlers/user.mjs";

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
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    ...overrides
  };
}

function makeDb(perCollection = {}) {
  return { collection: vi.fn((name) => perCollection[name] ?? makeCollection()) };
}

function makeRes() {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
}

function makeReq(method, body = null, cookieHeader = "") {
  const emitter = new EventEmitter();
  emitter.method = method;
  emitter.socket = { remoteAddress: "127.0.0.1" };
  const bodyStr = body !== null ? JSON.stringify(body) : null;
  emitter.headers = {
    "content-type": "application/json",
    "cookie": cookieHeader,
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

const fakeSession = { user: { id: "507f1f77bcf86cd799439011" } };

afterEach(() => vi.clearAllMocks());

describe("handlePasswordChange", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handlePasswordChange } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("GET");
    const res = makeRes();
    await handlePasswordChange(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 when current_password or new_password is missing", async () => {
    const db = makeDb();
    const { handlePasswordChange } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("POST", { current_password: "old" });
    const res = makeRes();
    await handlePasswordChange(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/Pflichtfelder/);
  });

  it("returns 400 when new password is too short", async () => {
    const db = makeDb();
    const { handlePasswordChange } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("POST", { current_password: "oldpassword", new_password: "short" });
    const res = makeRes();
    await handlePasswordChange(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/8 Zeichen/);
  });

  it("returns 401 when user is not found in db", async () => {
    const db = makeDb({ users: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handlePasswordChange } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("POST", { current_password: "oldpassword", new_password: "newpassword123" });
    const res = makeRes();
    await handlePasswordChange(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(401);
  });

  it("returns 400 with wrong_password code when current password is wrong", async () => {
    const { hashPassword } = await import("../../backend/utils/password.mjs");
    const hashed = await hashPassword("correctpassword");
    const fakeUser = { _id: "507f1f77bcf86cd799439011", password: hashed };
    const db = makeDb({ users: makeCollection({ findOne: vi.fn().mockResolvedValue(fakeUser) }) });
    const { handlePasswordChange } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("POST", { current_password: "wrongpassword", new_password: "newpassword123" });
    const res = makeRes();
    await handlePasswordChange(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).code).toBe("wrong_password");
  });

  it("returns 200 when password is changed successfully", async () => {
    const { hashPassword } = await import("../../backend/utils/password.mjs");
    const hashed = await hashPassword("correctpassword");
    const fakeUser = { _id: "507f1f77bcf86cd799439011", password: hashed };
    const db = makeDb({ users: makeCollection({ findOne: vi.fn().mockResolvedValue(fakeUser) }) });
    const { handlePasswordChange } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("POST", { current_password: "correctpassword", new_password: "newpassword123" });
    const res = makeRes();
    await handlePasswordChange(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleDeleteUserAccount", () => {
  it("returns 405 for non-DELETE", async () => {
    const db = makeDb();
    const { handleDeleteUserAccount } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn().mockReturnValue("") });
    const req = makeReq("POST");
    const res = makeRes();
    await handleDeleteUserAccount(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 and deletes all user data", async () => {
    const db = makeDb();
    const destroySession = vi.fn().mockResolvedValue(undefined);
    const clearSessionCookie = vi.fn().mockReturnValue("session=; Max-Age=0");
    const { handleDeleteUserAccount } = createUserHandlers({ db, destroySession, clearSessionCookie });
    const req = makeReq("DELETE", null, "finanzapp_session=abc");
    const res = makeRes();
    await handleDeleteUserAccount(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleProfileImageUpload", () => {
  it("returns 405 for non-PUT", async () => {
    const db = makeDb();
    const { handleProfileImageUpload } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("POST");
    const res = makeRes();
    await handleProfileImageUpload(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 when profileImage is missing", async () => {
    const db = makeDb();
    const { handleProfileImageUpload } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("PUT", {});
    const res = makeRes();
    await handleProfileImageUpload(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 400 for invalid data URL format", async () => {
    const db = makeDb();
    const { handleProfileImageUpload } = createUserHandlers({ db, destroySession: vi.fn(), clearSessionCookie: vi.fn() });
    const req = makeReq("PUT", { profileImage: "not-a-data-url" });
    const res = makeRes();
    await handleProfileImageUpload(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/JPEG|PNG|WebP/i);
  });
});
