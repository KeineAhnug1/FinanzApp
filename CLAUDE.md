# CLAUDE.md — FBM FinanzApp

This file provides guidance to Claude Code when working in this repository.
All instructions here are **mandatory** and override default behavior.

---

## Developer Profile

You are working with an experienced full-stack developer who is fully fluent in TypeScript, React, and distributed systems. Do not over-explain language basics or framework fundamentals. Skip beginner-level caveats. Assume the developer understands trade-offs and wants direct, precise answers.

This project is also **monitored by Codex** (automated code review pipeline). Every commit is inspected for:
- Security vulnerabilities (injection, XSS, CSRF bypass, session leakage)
- Logic correctness (data isolation between users, correct state management)
- Code quality (no dead code, no premature abstractions, no unnecessary comments)
- TypeScript strictness (zero `any` unless unavoidable and explicitly annotated)

Write every change as if it will be reviewed by a senior engineer in a production code review. There is no tolerance for sloppy quick-fixes.

---

## Project Overview

**FBM FinanzApp** is a personal finance management app with:
- Real-time stock tracking
- Income/expense management with category breakdowns
- Group finances and shared funding goals
- Forum (questions & answers)
- Multi-account support

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript strict |
| Styling | Single CSS file (`frontend/src/styles/globals.css`) — no CSS modules, no Tailwind |
| State | Zustand (`app-store`, `ui-store`) + TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Backend | Cloudflare Workers (Hono framework) |
| Database | Supabase (PostgreSQL via Hyperdrive) |
| Auth | Session cookies + CSRF double-submit pattern |

### Ports

| Service | Port |
|---------|------|
| Frontend (Next.js) | 4000 |
| Backend (Wrangler) | 8787 |

### Directory Structure

```
finanzapp/
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── (app)/          # Authenticated pages — dashboard, accounts, etc.
│       │   ├── (auth)/         # Login / register / verify
│       │   └── (public)/       # Homepage
│       ├── components/
│       │   ├── layout/         # Topbar, SideNav, BottomNav
│       │   └── ui/             # Modal, Toast, Button, etc.
│       ├── lib/                # api-client.ts, session.ts, theme.ts
│       ├── stores/             # app-store.ts, ui-store.ts
│       ├── styles/             # globals.css (single file, ~9000+ lines)
│       └── types/              # db.ts, api.ts, index.ts
└── backend/
    └── src/
        ├── routes/             # auth, finance, budgets, groups, questions, stocks, users
        └── lib/helpers/        # finance.ts, session helpers, etc.
```

---

## Commands

```bash
# Start both services (from repo root)
npm start                         # or: npm run dev

# Individual
npm run dev --prefix frontend     # Next.js on :4000
npm run dev --prefix backend      # Wrangler on :8787

# Type checking
cd frontend && node_modules/.bin/tsc --noEmit
cd backend  && node_modules/.bin/tsc --noEmit
npm run type-check                # both

# Build frontend
npm run build
```

> **Before starting:** If port 8787 is already in use, kill the stale process:
> `lsof -ti :8787 | xargs kill -9`

---

## Coding Conventions

### General

- **No comments** unless the WHY is non-obvious — a hidden constraint, a workaround for a specific bug, a subtle invariant. Never describe WHAT the code does.
- **No feature flags**, backwards-compat shims, or dead code. Delete cleanly.
- **Minimal surface area** — only change what the task requires. No refactoring side-quests.
- **No `any`** without an `// eslint-disable-next-line` annotation explaining why.
- Prefer editing existing files over creating new ones.

### Frontend

- **API calls** — use the raw `fetch(apiUrl(...), { credentials: 'include' })` pattern as used throughout the existing pages (not the `requestJson` wrapper, which is available but not consistently used in pages).
- **CSRF** — all mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`) must include `'x-csrf-token': getCsrfToken()` from `@/lib/api-client`.
- **Forms** — React Hook Form + Zod. Schemas defined at file top. `useForm` with `zodResolver`.
- **Data fetching** — TanStack Query with `useQuery` / `useMutation`. `queryClient.invalidateQueries()` after mutations.
- **Session isolation** — On logout, always call `queryClient.clear()` and `useAppStore.getState().clearSession()` before navigating to `/login`. On login success, clear cache before navigating to `/dashboard`.
- **CSS** — add styles to `globals.css` using the existing BEM-like class naming. No inline styles for layout; inline styles only for dynamic values (colors, widths computed at runtime).
- **Responsive** — breakpoint at `960px`. Mobile uses `BottomNav`; desktop uses `SideNav`. The `body.has-shared-sidebar` class is applied by the app layout.

### Backend

- **Auth guard** — all protected routes call `requireAuth(c)` first. Check the return value before proceeding.
- **CSRF check** — all mutating routes call `checkCsrf(c.req.raw)` immediately after auth.
- **Balance updates** — use `incrementBankAccountBalance(db, accountId, delta)` from `lib/helpers/finance.ts`. Never update `balance` directly.
- **Amounts** — always pass through `toFixedAmount()` before persisting or returning.
- **Error responses** — use `badRequest()`, `notFound()`, `unauthorized()` helpers. Never construct raw `Response` objects for errors.

### TypeScript

- Strict mode is enabled (`"strict": true` in both tsconfigs). No implicit `any`.
- Path alias `@/` maps to `frontend/src/`.
- Run `node_modules/.bin/tsc --noEmit` after every change. Zero errors required.

---

## Security Requirements (Codex-enforced)

These rules are non-negotiable. Violations will be flagged automatically:

1. **Session isolation** — User A must never see User B's data. The QueryClient cache must be fully cleared (`queryClient.clear()`) on logout and on login.
2. **CSRF** — Every state-mutating API call must send `x-csrf-token`. The backend must call `checkCsrf()` for every `POST`/`PATCH`/`PUT`/`DELETE` route.
3. **No sensitive data in localStorage** — Do not store tokens, session data, or PII in `localStorage`. Theme and UI preferences only.
4. **No SQL injection** — Always use parameterized queries through the Supabase client. Never interpolate user input into query strings.
5. **No XSS** — Do not use `dangerouslySetInnerHTML`. User-controlled strings must not be set as HTML.
6. **Auth on every backend route** — No route may return user data without first calling `requireAuth(c)` and verifying the result.

---

## Key Patterns

### Adding a new dashboard widget / data source

1. Add a `useQuery` in the relevant page component with a descriptive `queryKey`.
2. Add `queryClient.invalidateQueries({ queryKey: [...] })` in the `invalidate` callback.
3. Backend: new route in the appropriate `routes/` file, with `requireAuth` + `checkCsrf` (if mutating).

### Adding a new form

1. Define a Zod schema at the top of the file.
2. Use `useForm<T>({ resolver: zodResolver(schema) })`.
3. All mutating submits must pass `'x-csrf-token': getCsrfToken()`.

### CSS — adding a new component

- Name classes after the component: `.my-component`, `.my-component-title`, `.my-component--modifier`.
- Add at the bottom of the relevant section in `globals.css`, before the next component block.
- Add dark mode variant under `[data-theme="dark"] .my-component { ... }` immediately after.

---

## Branch

Active development branch: `feat/nextjs-migration`
Main branch for PRs: `main`
