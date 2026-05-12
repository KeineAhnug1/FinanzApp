import { parseId, parsePositiveAmount, normalizeCategoryValue } from "../utils/data.mjs";
import { parseBody, sendJson } from "../utils/http.mjs";
import { badRequest, notFound, unauthorized } from "../helpers/responses.mjs";
import { listUserBankAccounts } from "../helpers/finance-db.mjs";

export function createBudgetHandlers(pool) {

  async function handleBudgets(req, res, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT id, category, target_amount, current_amount, reset_date, created_at FROM budgets WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return sendJson(res, 200, {
        ok: true,
        budgets: rows.map((b) => ({
          id: String(b.id),
          category: b.category || "",
          target_amount: Number(Number(b.target_amount).toFixed(2)),
          current_amount: Number(Number(b.current_amount).toFixed(2)),
          reset_date: b.reset_date instanceof Date ? b.reset_date.toISOString() : null,
          created_at: b.created_at instanceof Date ? b.created_at.toISOString() : null
        }))
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const category = normalizeCategoryValue(payload.category);
    const targetAmount = parsePositiveAmount(payload.target_amount);
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (targetAmount == null) return badRequest(res, "Zielbetrag muss groesser 0 sein");

    const { rows: existing } = await pool.query(
      `SELECT id FROM budgets WHERE user_id = $1 AND LOWER(category) = LOWER($2)`,
      [userId, category]
    );
    if (existing.length > 0) return sendJson(res, 409, { ok: false, message: "Budget fuer diese Kategorie existiert bereits" });

    const { rows } = await pool.query(
      `INSERT INTO budgets (user_id, category, target_amount, current_amount, created_at)
       VALUES ($1, $2, $3, 0, NOW()) RETURNING id, category, target_amount, current_amount, reset_date, created_at`,
      [userId, category, targetAmount]
    );

    const b = rows[0];
    return sendJson(res, 201, {
      ok: true,
      budget: {
        id: String(b.id),
        category: b.category || "",
        target_amount: Number(Number(b.target_amount).toFixed(2)),
        current_amount: 0,
        reset_date: null,
        created_at: b.created_at instanceof Date ? b.created_at.toISOString() : null
      }
    });
  }

  async function handleBudgetById(req, res, budgetIdRaw, session) {
    const budgetId = parseId(budgetIdRaw);
    if (!budgetId) return badRequest(res, "budget_id ist ungueltig");

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "PATCH") {
      const payload = await parseBody(req, res);
      if (!payload) return;

      const category = payload.category !== undefined ? normalizeCategoryValue(payload.category) : null;
      const targetAmount = payload.target_amount !== undefined ? parsePositiveAmount(payload.target_amount) : null;

      if (payload.category !== undefined && !category) return badRequest(res, "Kategorie darf nicht leer sein");
      if (payload.target_amount !== undefined && targetAmount == null) return badRequest(res, "Zielbetrag muss groesser 0 sein");

      const sets = [];
      const params = [];
      let paramIndex = 1;

      if (category) {
        sets.push(`category = $${paramIndex}`);
        params.push(category);
        paramIndex++;
      }
      if (targetAmount != null) {
        sets.push(`target_amount = $${paramIndex}`);
        params.push(targetAmount);
        paramIndex++;
      }

      if (sets.length === 0) return badRequest(res, "Keine Aenderung angegeben");

      params.push(budgetId, userId);
      const { rows } = await pool.query(
        `UPDATE budgets SET ${sets.join(", ")} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING id, category, target_amount, current_amount, reset_date, created_at`,
        params
      );
      if (rows.length === 0) return notFound(res, "Budget nicht gefunden");

      const b = rows[0];
      return sendJson(res, 200, {
        ok: true,
        budget: {
          id: String(b.id),
          category: b.category || "",
          target_amount: Number(Number(b.target_amount).toFixed(2)),
          current_amount: Number(Number(b.current_amount).toFixed(2)),
          reset_date: b.reset_date instanceof Date ? b.reset_date.toISOString() : null,
          created_at: b.created_at instanceof Date ? b.created_at.toISOString() : null
        }
      });
    }

    if (req.method === "DELETE") {
      const { rowCount } = await pool.query(
        `DELETE FROM budgets WHERE id = $1 AND user_id = $2`,
        [budgetId, userId]
      );
      if (rowCount === 0) return notFound(res, "Budget nicht gefunden");
      return sendJson(res, 200, { ok: true, message: "Budget geloescht" });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  async function handleBudgetStatus(req, res, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    const { rows: budgets } = await pool.query(
      `SELECT id, category, target_amount FROM budgets WHERE user_id = $1`,
      [userId]
    );

    if (budgets.length === 0) {
      return sendJson(res, 200, { ok: true, alerts: [] });
    }

    const accounts = await listUserBankAccounts(pool, userId);
    const accountIds = accounts.map((a) => a.id);

    let expensesByCategory = new Map();
    if (accountIds.length > 0) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { rows: expenses } = await pool.query(
        `SELECT LOWER(category) AS cat, SUM(amount) AS total
         FROM private_expenses
         WHERE bank_account_id = ANY($1)
           AND spent_at >= $2
           AND category IS NOT NULL
         GROUP BY LOWER(category)`,
        [accountIds, monthStart]
      );
      for (const row of expenses) {
        expensesByCategory.set(row.cat, Number(Number(row.total).toFixed(2)));
      }
    }

    const alerts = budgets.map((b) => {
      const target = Number(Number(b.target_amount).toFixed(2));
      const spent = expensesByCategory.get((b.category || "").toLowerCase()) || 0;
      const percentage = target > 0 ? Math.round((spent / target) * 100) : 0;
      return {
        budget_id: String(b.id),
        category: b.category || "",
        target,
        spent,
        percentage,
        exceeded: spent > target
      };
    });

    return sendJson(res, 200, { ok: true, alerts });
  }

  return { handleBudgets, handleBudgetById, handleBudgetStatus };
}
