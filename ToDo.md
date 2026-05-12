# ToDo

## Unified Transactions Endpoint

Create a dedicated `GET /api/transactions` endpoint that returns incomes and expenses combined in one chronological list.

### Why

- The frontend currently fetches `/api/income` and `/api/expense` separately and merges them client-side for the cash-flow chart.
- A unified endpoint simplifies the frontend, enables a full activity feed, CSV export, and cross-type filtering (e.g. "show everything in category X" regardless of direction).

### Implementation

1. **Backend** — New handler `handleTransactions` that runs a `UNION ALL` over the `income` and `expense` tables, adding a `type: "income" | "expense"` discriminator column. Apply cursor-based pagination (same pattern as the individual endpoints). Session-gated as usual.
2. **Route** — `GET /api/transactions?limit=50&cursor=<id>&category=<cat>` in a new dispatch file or added to the finance dispatcher.
3. **Frontend** — Replace the dual-fetch logic in `overview-cashflow.js` with a single call to `/api/transactions`. Use the `type` field to color/group entries.
