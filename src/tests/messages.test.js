import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createMessageHandlers } from "../../backend/handlers/messages.mjs";

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
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    aggregate: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    countDocuments: vi.fn().mockResolvedValue(0),
    ...overrides
  };
}

function makeDb(perCollection = {}) {
  return { collection: vi.fn((name) => perCollection[name] ?? makeCollection()) };
}

function makeRes() {
  return { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
}

function makeReq(method, body = null, urlStr = "/api/messages") {
  const emitter = new EventEmitter();
  emitter.method = method;
  emitter.url = urlStr;
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

const fakeSession = { user: { id: "507f1f77bcf86cd799439011" } };

afterEach(() => vi.clearAllMocks());

describe("handleGetConversations", () => {
  it("returns 405 for non-GET", async () => {
    const db = makeDb();
    const { handleGetConversations } = createMessageHandlers(db);
    const req = makeReq("POST");
    const res = makeRes();
    await handleGetConversations(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with conversations list on GET", async () => {
    const db = makeDb({ private_messages: makeCollection({ aggregate: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }) });
    const { handleGetConversations } = createMessageHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleGetConversations(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
    expect(Array.isArray(getResponseBody(res).conversations)).toBe(true);
  });
});

describe("handleSendMessage", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleSendMessage } = createMessageHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleSendMessage(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 when recipientId is missing", async () => {
    const db = makeDb();
    const { handleSendMessage } = createMessageHandlers(db);
    const req = makeReq("POST", { content: "Hallo" });
    const res = makeRes();
    await handleSendMessage(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/recipientId/);
  });

  it("returns 400 when content is empty", async () => {
    const db = makeDb();
    const { handleSendMessage } = createMessageHandlers(db);
    const req = makeReq("POST", { recipientId: "507f1f77bcf86cd799439022", content: "" });
    const res = makeRes();
    await handleSendMessage(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/leer/);
  });

  it("returns 400 when sending to self", async () => {
    const db = makeDb();
    const { handleSendMessage } = createMessageHandlers(db);
    const req = makeReq("POST", { recipientId: fakeSession.user.id, content: "Selbstnachricht" });
    const res = makeRes();
    await handleSendMessage(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });
});

describe("handleDeletePrivateMessage", () => {
  it("returns 405 for non-DELETE", async () => {
    const db = makeDb();
    const { handleDeletePrivateMessage } = createMessageHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleDeletePrivateMessage(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 404 when message not found", async () => {
    const db = makeDb({ private_messages: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handleDeletePrivateMessage } = createMessageHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleDeletePrivateMessage(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(404);
  });

  it("returns 403 when user is not the sender", async () => {
    const existingMsg = { _id: "507f1f77bcf86cd799439011", sender_id: "507f1f77bcf86cd799439099", deleted_at: null };
    const db = makeDb({ private_messages: makeCollection({ findOne: vi.fn().mockResolvedValue(existingMsg) }) });
    const { handleDeletePrivateMessage } = createMessageHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleDeletePrivateMessage(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(403);
  });

  it("returns 200 when message is deleted successfully", async () => {
    const existingMsg = { _id: "507f1f77bcf86cd799439011", sender_id: "507f1f77bcf86cd799439011", deleted_at: null };
    const db = makeDb({ private_messages: makeCollection({ findOne: vi.fn().mockResolvedValue(existingMsg) }) });
    const { handleDeletePrivateMessage } = createMessageHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleDeletePrivateMessage(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleUnreadCount", () => {
  it("returns 405 for non-GET", async () => {
    const db = makeDb();
    const { handleUnreadCount } = createMessageHandlers(db);
    const req = makeReq("POST");
    const res = makeRes();
    await handleUnreadCount(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with unread count on GET", async () => {
    const db = makeDb({ private_messages: makeCollection({ countDocuments: vi.fn().mockResolvedValue(3) }) });
    const { handleUnreadCount } = createMessageHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleUnreadCount(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).count).toBe(3);
  });
});

describe("handleUserSearch", () => {
  it("returns 405 for non-GET", async () => {
    const db = makeDb();
    const { handleUserSearch } = createMessageHandlers(db);
    const req = makeReq("POST");
    const url = new URL("http://localhost/api/users/search");
    const res = makeRes();
    await handleUserSearch(req, res, url, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns empty list when no query param", async () => {
    const db = makeDb();
    const { handleUserSearch } = createMessageHandlers(db);
    const req = makeReq("GET");
    const url = new URL("http://localhost/api/users/search");
    const res = makeRes();
    await handleUserSearch(req, res, url, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).users).toEqual([]);
  });
});
