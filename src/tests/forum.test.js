import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createForumHandlers } from "../../backend/handlers/forum.mjs";

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
  emitter.url = "/api/questions";
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

describe("handleQuestions", () => {
  it("returns 405 for unsupported method", async () => {
    const db = makeDb();
    const { handleQuestions } = createForumHandlers(db);
    const req = makeReq("DELETE");
    const url = new URL("http://localhost/api/questions");
    const res = makeRes();
    await handleQuestions(req, res, fakeSession, url);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with questions array on GET", async () => {
    const db = makeDb({ global_questions: makeCollection() });
    const { handleQuestions } = createForumHandlers(db);
    const req = makeReq("GET");
    const url = new URL("http://localhost/api/questions");
    const res = makeRes();
    await handleQuestions(req, res, fakeSession, url);
    expect(getStatusCode(res)).toBe(200);
    expect(Array.isArray(getResponseBody(res).questions)).toBe(true);
  });

  it("returns 400 when thema is missing on POST", async () => {
    const db = makeDb();
    const { handleQuestions } = createForumHandlers(db);
    const req = makeReq("POST", { message: "Wie funktioniert das?" });
    const url = new URL("http://localhost/api/questions");
    const res = makeRes();
    await handleQuestions(req, res, fakeSession, url);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/Thema/);
  });

  it("returns 400 when message is missing on POST", async () => {
    const db = makeDb();
    const { handleQuestions } = createForumHandlers(db);
    const req = makeReq("POST", { thema: "Steuern" });
    const url = new URL("http://localhost/api/questions");
    const res = makeRes();
    await handleQuestions(req, res, fakeSession, url);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/Frage/);
  });
});

describe("handleQuestionById", () => {
  it("returns 400 for invalid question id", async () => {
    const db = makeDb();
    const { handleQuestionById } = createForumHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleQuestionById(req, res, "not-valid-id", fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 405 for unsupported method", async () => {
    const db = makeDb();
    const { handleQuestionById } = createForumHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleQuestionById(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 404 when question not found on GET", async () => {
    const db = makeDb({ global_questions: makeCollection() });
    const { handleQuestionById } = createForumHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleQuestionById(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(404);
  });
});

describe("handleQuestionLike", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleQuestionLike } = createForumHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleQuestionLike(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 400 for invalid question id", async () => {
    const db = makeDb();
    const { handleQuestionLike } = createForumHandlers(db);
    const req = makeReq("POST");
    const res = makeRes();
    await handleQuestionLike(req, res, "bad-id", fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });

  it("returns 404 when question does not exist", async () => {
    const db = makeDb({ global_questions: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handleQuestionLike } = createForumHandlers(db);
    const req = makeReq("POST");
    const res = makeRes();
    await handleQuestionLike(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(404);
  });
});

describe("handleQuestionAnswerCreate", () => {
  it("returns 405 for non-POST", async () => {
    const db = makeDb();
    const { handleQuestionAnswerCreate } = createForumHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleQuestionAnswerCreate(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 404 when question not found", async () => {
    const db = makeDb({ global_questions: makeCollection({ findOne: vi.fn().mockResolvedValue(null) }) });
    const { handleQuestionAnswerCreate } = createForumHandlers(db);
    const req = makeReq("POST", { message: "Eine Antwort" });
    const res = makeRes();
    await handleQuestionAnswerCreate(req, res, "507f1f77bcf86cd799439011", fakeSession);
    expect(getStatusCode(res)).toBe(404);
  });
});
