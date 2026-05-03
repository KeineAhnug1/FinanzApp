import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createFinanceHandlers } from "../../backend/handlers/finance.mjs";

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
    distinct: vi.fn().mockResolvedValue([]),
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

function makeReq(method, body = null, urlStr = "/api/something") {
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

describe("handleBankAccounts", () => {
  it("returns 405 for unsupported methods", async () => {
    const db = makeDb();
    const { handleBankAccounts } = createFinanceHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleBankAccounts(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with accounts on GET", async () => {
    const db = makeDb({ bank_accounts: makeCollection() });
    const { handleBankAccounts } = createFinanceHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleBankAccounts(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
    expect(Array.isArray(getResponseBody(res).accounts)).toBe(true);
  });

  it("returns 400 when label is missing on POST", async () => {
    const db = makeDb({ bank_accounts: makeCollection() });
    const { handleBankAccounts } = createFinanceHandlers(db);
    const req = makeReq("POST", {});
    const res = makeRes();
    await handleBankAccounts(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
    expect(getResponseBody(res).message).toMatch(/erforderlich/);
  });

  it("returns 201 when creating a bank account with a label", async () => {
    const db = makeDb({ bank_accounts: makeCollection({ insertOne: vi.fn().mockResolvedValue({ insertedId: "new-id" }) }) });
    const { handleBankAccounts } = createFinanceHandlers(db);
    const req = makeReq("POST", { label: "Mein Konto" });
    const res = makeRes();
    await handleBankAccounts(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(201);
    expect(getResponseBody(res).ok).toBe(true);
  });
});

describe("handleIncomeEntries", () => {
  it("returns 405 for unsupported methods", async () => {
    const db = makeDb();
    const { handleIncomeEntries } = createFinanceHandlers(db);
    const req = makeReq("DELETE");
    const res = makeRes();
    await handleIncomeEntries(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with empty list on GET when no accounts", async () => {
    const db = makeDb({ bank_accounts: makeCollection() });
    const { handleIncomeEntries } = createFinanceHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleIncomeEntries(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });

  it("returns 400 when source is missing on POST", async () => {
    const db = makeDb({ bank_accounts: makeCollection() });
    const { handleIncomeEntries } = createFinanceHandlers(db);
    const req = makeReq("POST", { amount: 1000 });
    const res = makeRes();
    await handleIncomeEntries(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });
});

describe("handleExpenseEntries", () => {
  it("returns 405 for unsupported methods", async () => {
    const db = makeDb();
    const { handleExpenseEntries } = createFinanceHandlers(db);
    const req = makeReq("PUT");
    const res = makeRes();
    await handleExpenseEntries(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with empty list on GET when no accounts", async () => {
    const db = makeDb({ bank_accounts: makeCollection() });
    const { handleExpenseEntries } = createFinanceHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleExpenseEntries(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
  });
});

describe("handleCategories", () => {
  it("returns 405 for unsupported methods", async () => {
    const db = makeDb();
    const { handleCategories } = createFinanceHandlers(db);
    const req = makeReq("PUT");
    const res = makeRes();
    await handleCategories(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(405);
  });

  it("returns 200 with categories on GET", async () => {
    const db = makeDb({
      bank_accounts: makeCollection(),
      user_categories: makeCollection({ find: vi.fn().mockReturnValue(makeFindResult([])) }),
      income: makeCollection({ distinct: vi.fn().mockResolvedValue([]) }),
      private_expenses: makeCollection({ distinct: vi.fn().mockResolvedValue([]) })
    });
    const { handleCategories } = createFinanceHandlers(db);
    const req = makeReq("GET");
    const res = makeRes();
    await handleCategories(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(200);
    expect(getResponseBody(res).ok).toBe(true);
  });

  it("returns 400 when kind is missing on DELETE", async () => {
    const db = makeDb({ bank_accounts: makeCollection() });
    const { handleCategories } = createFinanceHandlers(db);
    const req = makeReq("DELETE", {});
    const res = makeRes();
    await handleCategories(req, res, fakeSession);
    expect(getStatusCode(res)).toBe(400);
  });
});
