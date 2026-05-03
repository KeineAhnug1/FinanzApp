import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createGroupHandlers } from "../../backend/handlers/groups.mjs";

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
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
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
  emitter.url = "/api/groups";
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

describe("handleGroups", () => {
  it("returns 405 for unsupported method", async () => {
    const db = makeDb();
    const { handleGroups } = createGroupHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleGroups(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with groups array on GET", async () => {
    const db = makeDb({ group_members: makeCollection() });
    const { handleGroups } = createGroupHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleGroups(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
    expect(Array.isArray(getResponseBody(res).groups)).toBe(true);
  });

  it("returns 400 when name is missing on POST", async () => {
    const db = makeDb();
    const { handleGroups } = createGroupHandlers(db);
    const req = makeReq("POST", {});
    const res = makeRes();
    await handleGroups(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/Gruppenname/);
  });
});

describe("handleGroupDetail", () => {
  it("returns 400 for invalid group id", async () => {
    const db = makeDb();
    const { handleGroupDetail } = createGroupHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleGroupDetail(req, res, "not-a-valid-id", fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 404 when group is not found", async () => {
    const db = makeDb({ group_members: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handleGroupDetail } = createGroupHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleGroupDetail(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(404);
  });
});

describe("handleGetInvitations", () => {
  it("returns 405 for non-GET", async () => {
    const db = makeDb();
    const { handleGetInvitations } = createGroupHandlers(db);
    const req = makeReq("POST");
    const res = makeRes();
    await handleGetInvitations(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with invitations on GET", async () => {
    const db = makeDb({ group_members: makeCollection() });
    const { handleGetInvitations } = createGroupHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleGetInvitations(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleInviteUser", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleInviteUser } = createGroupHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleInviteUser(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 for invalid group id", async () => {
    const db = makeDb();
    const { handleInviteUser } = createGroupHandlers(db);
    const req = makeReq("POST", { username: "testuser" });
    const res = makeRes();
    await handleInviteUser(req, res, "bad-id", fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });
});
