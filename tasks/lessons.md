# Lessons

## Grading-criteria sweep (2026-06-25)

**Lesson:** Before adding A11y attributes like `aria-invalid` and `aria-describedby` to form fields, audit which fields actually render visible error UI. Blanket-adding ARIA to every input clutters AT output (the field gets announced as invalid even when no error message exists) and creates dangling `aria-describedby` IDs that point to nothing.

**Pattern:**
```tsx
aria-invalid={errors.field ? true : undefined}
aria-describedby={errors.field ? 'field-error-id' : undefined}
```
Using `undefined` (not `false`) lets React omit the attribute when there's no error.

**Why:** `aria-invalid="false"` is a valid value that asserts the field is valid — but if the user hasn't tried to submit yet, the field's state is "untouched", which is different from "valid". Omitting the attribute matches that semantic.

**How to apply:** When fixing form A11y, walk through the existing JSX and only touch inputs that already have an inline error message in the same block. Don't introduce new error rendering.

## 2026-06-29 — Group module expansion

**Pattern: Immutable transfers via tagged audit rows.** Created `transfers` table for the audit/identity record, with `private_expenses.transfer_id` and `income.transfer_id` back-links on the per-account ledger rows. PATCH/DELETE on ledger rows must check `transfer_id IS NOT NULL` and refuse. This is the cleanest model for "you can't change history" without copying data.

**Pattern: Atomic "all-accepted gate" via PG RPC.** For the postpaid shared-expense flow, the "release reservations when all members have accepted" gate is wrapped in a single PL/pgSQL function `release_period_reservations`. Doing this in JS would race when two members accept simultaneously; the FOR UPDATE inside PL/pgSQL serializes correctly.

**Pattern: Pure netting function with rounding-safe epsilon.** `netSettlements` in `backend/src/lib/helpers/group-shared.ts` is a pure function, unit-tested. Uses `Math.round(x * 100) / 100` everywhere and an EPS = 0.01 threshold to avoid 1-cent settlements caused by float drift.

**Lesson: Backfill nullable references in the same migration.** `users.default_bank_account_id` defaults to NULL in DDL but the migration immediately backfills to the user's oldest account. Without this, Unit 3's peer-transfer endpoint would error on every existing user.

**Lesson: Isolated worktrees + duplicate type declarations.** When parallelizing via worktrees, multiple units may add the same TypeScript field (e.g., `User.default_bank_account_id`). This produces a merge conflict, NOT a silent override. Accept the conflict and merge manually — the alternative (one shared "types" PR that everything depends on) defeats the parallelism.

**Lesson: Hard cap via RPC, not application logic.** `contribute_to_funding(p_funding_id, p_amount)` does the clamping inside a single `UPDATE ... FOR UPDATE` transaction in Postgres. Returns the actual amount applied. Application code is just `actual = await db.rpc(...)`. No race window.
