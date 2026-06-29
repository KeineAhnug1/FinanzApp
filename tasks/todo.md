# Group Module Expansion — Tasks

## Done (delivered as PRs in this batch)

- [x] Unit 1: DB migration SQL + TypeScript types
- [x] Unit 2: Default bank account user setting
- [x] Unit 3: Peer-to-peer transfers
- [x] Unit 4: Group shared expenses backend
- [x] Unit 5: Group shared expenses frontend + tab navigation
- [x] Unit 6: Trips backend + min-cash-flow netting
- [x] Unit 7: Trips frontend
- [x] Unit 8: Group transfers archive tab
- [x] Unit 9: Sammelaktion cap + status + Archive tab
- [x] Unit 10: Documentation + smoke test

## Manual steps required by user

1. **Apply database migration:**
   - Open Supabase SQL editor
   - Run `seeds/migrations/2026-06-29_groups_expansion.sql`
   - Verify all new tables exist and existing fundings still load
2. **Verify default accounts populated:**
   - `SELECT count(*) FROM users WHERE default_bank_account_id IS NULL` should be 0 (or only users without any bank account)
3. **Run type checks locally:**
   - `cd backend && npm run type-check`
   - `cd frontend && npm run type-check`
4. **Manual smoke test** — see ## Smoke Test below.

## Smoke Test (manual walkthrough)

Requires two browser sessions (User A admin, User B member of a shared group).

### Setup
1. Both users registered. Both have at least one bank account with non-zero balance. Both have set a default account (Unit 2 UI on `/accounts`).
2. User A creates a group, invites User B, B accepts.

### Test 1: Peer transfer (Unit 3)
1. A opens `/dashboard` → click "→ Überweisung".
2. Recipient: B's username. Amount: 10€. Reason: "Test". Submit.
3. Verify in A's transactions: a "Test" expense appears, locked (no edit/delete buttons), badge "Überweisung".
4. B refreshes `/dashboard` → income "Test" appears, same lock.
5. Both balances updated correctly.

### Test 2: Shared expense — prepaid (Units 4+5)
1. A opens group, switches to "Ausgaben" tab.
2. "Neue Gruppenausgabe" → Title: "Miete", Total: 300€, Mode: prepaid, Cycle: once, Participants: [A, B]. Submit.
3. A sees the expense pending. A's own share is auto-accepted (creator).
4. B refreshes, switches to "Ausgaben" tab → sees pending request with Akzeptieren / Ablehnen.
5. B clicks Akzeptieren. Expense becomes "active". B's 150€ share is transferred to A's default account.
6. Verify in "Überweisungen" tab: one transfer appears, source badge "Ausgabe".

### Test 3: Shared expense — postpaid (Units 4+5)
1. A creates another expense, mode: postpaid, participants [A, B]. Submit.
2. B accepts. The transfer does NOT execute yet (B's reservation is held; A is creator already accepted).
3. Wait, since all 2 participants accepted, the reservation should release immediately. Verify B's balance decreased by share, A's balance increased.

### Test 4: Shared expense — reject (Units 4+5)
1. A creates expense, prepaid, participants [A, B]. B clicks "Ablehnen".
2. Verify expense moves to status "cancelled" — no money moved.

### Test 5: Trip (Units 6+7)
1. A opens group → "Ausflüge" tab → "Neuer Ausflug".
2. Name: "Wochenende", participants: [A, B]. Submit.
3. Click into trip → "+ Ausgabe" → Payer: A, Description: "Pizza", Amount: 30€, Participants: [A, B]. Submit.
4. Verify settlement appears: B owes A 15€.
5. B opens trip → sees "Ich schulde A 15€" → click Begleichen.
6. Verify: transfer 15€ B → A, settlement marked paid, balance is now 0.
7. Admin A → "Ausflug schließen" → works because all settlements paid.

### Test 6: Sammelaktion cap (Unit 9)
1. A creates a funding: title "Wasserkocher", target 50€.
2. A donates 30€. Progress: 30/50.
3. A tries to donate 100€. Toast: "Nur 20€ wurden angenommen". Status flips to completed.
4. A clicks "Als fertig markieren". Funding disappears from active list.
5. Switch to "Archiv" tab → funding appears in archive.

### Test 7: Transfer immutability (Unit 3 invariant)
1. In dashboard, try to edit/delete a transfer-tagged entry. Should be impossible (UI disabled, backend rejects with 400).

## Review

(To be filled in by user after running the smoke test.)
- Notes:
- Issues found:
- Follow-ups:
