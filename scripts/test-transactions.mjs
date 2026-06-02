import { createFinanceHandlers } from "../backend/handlers/finance.mjs";

function makeReq(url) {
  return { method: "GET", url };
}

function makeRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = headers || {}; };
  res.end = (body) => { res.body = String(body || ""); };
  return res;
}

const fakePool = {
  async query(sql, params) {
    const text = String(sql);
    // For ensureUserFinanceRoots / list accounts
    if (/FROM\s+bank_accounts/i.test(text)) {
      return { rows: [{ id: 1, label: "Bankkonto 1", balance: 0, created_at: new Date() }] };
    }
    // Unified union query
    if (text.includes("UNION ALL") && text.includes("FROM (")) {
      // Provide 2 rows: one income, one expense
      const now = new Date();
      const earlier = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return {
        rows: [
          {
            id: 101,
            bank_account_id: 1,
            source: "Gehalt",
            category: "salary",
            amount: 3500,
            cycle: "once",
            recurrence: null,
            is_active: true,
            note: "",
            state: "open",
            created_at: earlier,
            updated_at: earlier,
            sort_at: earlier,
            type: "income",
            received_at: earlier,
            pay_date: earlier,
            spent_at: null,
            due_date: null
          },
          {
            id: 202,
            bank_account_id: 1,
            source: "Miete",
            category: "rent",
            amount: 1200,
            cycle: "monthly",
            recurrence: null,
            is_active: true,
            note: "",
            state: "open",
            created_at: now,
            updated_at: now,
            sort_at: now,
            type: "expense",
            received_at: null,
            pay_date: now,
            spent_at: now,
            due_date: null
          }
        ]
      };
    }
    console.error("Unexpected SQL in fakePool:", text, params);
    return { rows: [] };
  }
};

async function run() {
  const handlers = createFinanceHandlers(fakePool);
  const session = { user: { id: 999 } };
  const req = makeReq("/api/transactions?limit=2&bank_account_id=1");
  const res = makeRes();
  await handlers.handleTransactions(req, res, session);
  if (res.statusCode !== 200) {
    console.error("Handler returned status", res.statusCode, res.body);
    process.exit(1);
  }
  const payload = JSON.parse(res.body || "{}\n");
  if (!payload.ok) {
    console.error("Payload not ok", payload);
    process.exit(1);
  }
  if (!Array.isArray(payload.entries) || payload.entries.length !== 2) {
    console.error("Unexpected entries length", payload.entries?.length, payload.entries);
    process.exit(1);
  }
  const hasIncome = payload.entries.some((e) => e.type === "income");
  const hasExpense = payload.entries.some((e) => e.type === "expense");
  if (!hasIncome || !hasExpense) {
    console.error("Missing income/expense types", payload.entries);
    process.exit(1);
  }
  console.log("transactions.test: ok");
}

run().catch((e) => { console.error(e); process.exit(1); });

