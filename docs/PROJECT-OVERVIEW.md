# FinanzApp — Project Overview

> Stand: 2026-06-29
> Aktiver Branch: `fix/audit-money-safety` · Integrations-Branch für PRs: `main`
> Diese Datei ist die zentrale, gepflegte Architekturübersicht des Repos. Jede Behauptung ist mit Dateipfad belegt und sollte beim Modifizieren der entsprechenden Stelle aktualisiert werden.

---

## 1. Projekt-Summary

**FBM FinanzApp** ist eine Personal-Finance-Webanwendung mit:

- Mehrkonten-Verwaltung (privates Banking + Stock-Depots)
- Einnahmen/Ausgaben mit Kategorien, Recurrence, Budget-Alerts
- Stock-Portfolio mit Live-Kursen (Finnhub) und Logos (logo.dev)
- Gruppen mit geteilten Ausgaben (Splitwise-Stil), Trips (mit Min-Cash-Flow-Settlement), Sammelaktionen
- Peer-Transfers zwischen Usern (manipulationssicher als Audit-Rows)
- Forum (Fragen & Antworten) mit AI-Assistenz (OpenRouter)
- Sessions per HttpOnly-Cookie + CSRF-Double-Submit

Stack-Kurzfassung: **Next.js 15 / React 19 / TS strict** (Frontend, Cloudflare Pages) gegen **Hono auf Cloudflare Workers** (Backend) auf **Supabase Postgres** über Hyperdrive.

---

## 2. Tech-Stack at a Glance

| Layer | Technologie | Zweck |
|---|---|---|
| **Frontend Framework** | Next.js 15.3.3 (App Router, standalone output) | Routing, SSR, Edge-fähiger Build |
| **UI Runtime** | React 19.1.0 | Komponenten |
| **Sprache** | TypeScript 5.9.3 (`strict: true`) | Statische Typprüfung beidseitig |
| **Client State** | Zustand 5.0.5 | `app-store` (User, Bank Accounts), `ui-store` (Modals, Nav) |
| **Server State** | TanStack Query 5.80.7 | Caching, Invalidierung, Refetch |
| **Formulare** | React Hook Form 7.56.4 + Zod 3.25.51 (`@hookform/resolvers 5.4.0`) | Validierung |
| **Charts** | Recharts 2.15.3 | Pie + Drilldown Cashflow |
| **Styling** | Single-File CSS (`globals.css`, 12.106 Zeilen) | Custom Properties + BEM-ähnliche Klassen + Dark/High-Contrast |
| **Backend Framework** | Hono ^4.6.0 | Routing-Layer auf Workers |
| **Backend Runtime** | Cloudflare Workers (V8 Isolates) | Edge-Serverless |
| **DB-Client** | `postgres` 3.4.9 + `@supabase/supabase-js` 2.49.8 | Dual-Strategie (Hyperdrive in Prod, Supabase REST in Local) |
| **DB** | Supabase (PostgreSQL) über Cloudflare Hyperdrive | Daten + Custom RPCs (`increment_bank_balance`, `release_period_reservations`, …) |
| **Sessions** | Cloudflare KV (`SESSIONS` binding) | Token-Storage mit TTL |
| **E-Mail** | Resend 4.6.0 | Verifizierungs- und Reset-Codes |
| **Stock-Quotes** | Finnhub (REST) | Suche, Quote, Profile |
| **Logos** | logo.dev | Firmen-/Ticker-Logos |
| **AI** | OpenRouter (`openai/gpt-oss-20b:free` als Default) | Forum-AI-Chat (Finzbro) |
| **Testing** | Vitest 4.1.9 + Testing Library 16.3.2 + jsdom 29.1.1 | Frontend & Backend Unit-Tests |
| **Lint/Format** | ESLint 9 (FE: `eslint-config-next`, BE: `typescript-eslint`) + Prettier 3.8.4 | 100-char-Width, 2-Space, trailing commas |
| **Build (Edge)** | `@cloudflare/next-on-pages` 1.13.12 | Next.js → Pages-Functions-Bundle |
| **Wrangler** | 4.0.0 | Workers-Deploy / Dev-Server |
| **Monorepo-Runner** | `concurrently` 10.0.3 (root) | Startet FE + BE parallel |
| **Container** | `docker-compose.yml` (nur Frontend) | Multi-Stage Build ~150 MB; Backend läuft auf Host via Wrangler |

---

## 3. Repository Layout

```
FinanzApp/
├── package.json                     # Root-Workspace (concurrently runner)
├── README.md                        # Setup (DE), Features, Deploy-Schritte
├── CLAUDE.md                        # Coding-Standards, Security-Rules, Patterns
├── docker-compose.yml               # Frontend-only Compose Stack
├── .env.example / .dev.vars         # Env-Templates
├── .prettierrc.json / .prettierignore
│
├── docs/
│   ├── DOCKER.md                    # Warum nur Frontend containerisiert
│   ├── REFACTOR-DASHBOARD.md        # Refactor-Plan (873-Zeilen-Dashboard splitten)
│   └── PROJECT-OVERVIEW.md          # ← diese Datei
│
├── design/
│   ├── README.md                    # Design-Language (Outfit-Font, Layered Depth, Tokens)
│   ├── design-tokens.md             # CSS-Variablen-Referenz für 4 Themes
│   └── screenshots/                 # PNGs aller Hauptseiten
│
├── tasks/
│   ├── todo.md                      # Group-Module-Expansion Units 1–10 (alle delivered) + Smoke Tests
│   └── lessons.md                   # Patterns: Audit-Rows, atomare RPCs, pure Netting, Worktree-Konflikte
│
├── seeds/
│   └── migrations/
│       └── 2026-06-29_groups_expansion.sql   # Idempotente Migration (Peer-Transfers, Trips, Funding-Status)
│
├── frontend/                        # Next.js App
│   ├── package.json
│   ├── next.config.ts               # output: "standalone"
│   ├── tsconfig.json                # strict, paths "@/*" → src/*
│   ├── .eslintrc.json
│   ├── vitest.config.ts             # jsdom, Tests in src/**/__tests__/
│   ├── vitest.setup.ts
│   └── src/
│       ├── app/                     # App Router
│       │   ├── (app)/               # Authenticated
│       │   ├── (auth)/              # Login/Register/Verify
│       │   ├── (public)/            # Homepage
│       │   ├── layout.tsx           # Root Layout, Theme-Init Script
│       │   ├── page.tsx             # Root-Redirect
│       │   ├── error.tsx / global-error.tsx / not-found.tsx
│       ├── components/              # layout/ ui/ dashboard/ accounts/ stocks/ groups/
│       ├── lib/                     # api-client.ts, session.ts, finance-mutations.ts
│       ├── stores/                  # app-store.ts, ui-store.ts
│       ├── types/                   # db.ts, api.ts, index.ts
│       ├── hooks/                   # useFinnhubWs.ts
│       └── styles/globals.css       # 12.106 Zeilen
│
└── backend/                         # Hono auf Cloudflare Workers
    ├── package.json
    ├── wrangler.toml                # bindings (Hyperdrive, KV), vars
    ├── tsconfig.json                # strict
    ├── eslint.config.js             # Flat Config, typescript-eslint
    ├── vitest.config.ts             # Node-Environment
    └── src/
        ├── index.ts                 # Hono-App, CORS + Security-Headers, Route-Mounting
        ├── types.ts                 # Env-Bindings (HYPERDRIVE, SESSIONS, …)
        ├── lib/
        │   ├── session.ts           # KV-Sessions, Token-Gen, Cookie-Builder
        │   ├── config.ts            # Env → Config-Loader
        │   ├── db.ts                # createDb() Factory + QueryBuilder
        │   ├── email.ts             # Resend-Adapter
        │   ├── config/blocked-names.ts
        │   ├── helpers/             # auth.ts, finance.ts, group-shared.ts, fuzzy-search.ts
        │   └── utils/               # csrf.ts, password.ts, http.ts, rate-limit.ts, responses.ts, image.ts, data.ts
        └── routes/
            ├── auth/index.ts
            ├── users/index.ts + default-account.ts
            ├── finance/index.ts + bank-account-history.ts + share-accounts.ts + peer-transfers.ts
            ├── budgets/index.ts
            ├── groups/index.ts + _shared.ts + members.ts + activities.ts + expenses.ts +
            │           shared-expenses.ts + trips.ts + expenses-participants.ts
            ├── stocks/index.ts
            ├── questions/index.ts
            └── tests/*.test.ts
```

---

## 4. Frontend-Architektur

### 4.1 Abhängigkeiten

#### Produktion (`frontend/package.json`)

| Paket | Version | Zweck |
|---|---|---|
| `next` | 15.3.3 | App-Router, SSR, Standalone-Output |
| `react` | 19.1.0 | UI |
| `react-dom` | 19.1.0 | DOM-Renderer |
| `typescript` | 5.9.3 | Typprüfung (`strict`) |
| `@tanstack/react-query` | 5.80.7 | Server-State (`useQuery`, `useMutation`, `QueryClient`) |
| `react-hook-form` | 7.56.4 | Form-State |
| `zod` | 3.25.51 | Schema-Validierung |
| `@hookform/resolvers` | 5.4.0 | RHF-Zod-Bridge |
| `zustand` | 5.0.5 | Client-State (User, UI) |
| `recharts` | 2.15.3 | Pie + Drilldown Cashflow |
| `@cloudflare/next-on-pages` | 1.13.12 | Pages-Adapter |

#### Dev

| Paket | Version | Zweck |
|---|---|---|
| `vitest` | 4.1.9 | Test-Runner |
| `@vitejs/plugin-react` | 6.0.3 | Vite-React-Plugin |
| `@testing-library/react` | 16.3.2 | Component-Tests |
| `@testing-library/user-event` | 14.6.1 | Interaktionen |
| `@testing-library/jest-dom` | 6.9.1 | DOM-Matcher |
| `jsdom` | 29.1.1 | DOM in Tests |
| `eslint` | 9.28.0 | Linting |
| `eslint-config-next` | 15.3.3 | Next-Regeln |
| `@types/node` | 22.15.24 | Node-Typen |
| `@types/react`, `@types/react-dom` | 19.1.6 | React-Typen |

### 4.2 Routing (App Router)

| Route | Datei | Zweck |
|---|---|---|
| `/` (public) | `app/(public)/home/page.tsx` | Landing Page |
| `/` (root redirect) | `app/page.tsx` | Redirect-Logik |
| `/login` | `app/(auth)/login/page.tsx` | Login + Registration |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Overview / Income / Expense / Recurring / Transfers Tabs |
| `/accounts` | `app/(app)/accounts/page.tsx` | Konto-Übersicht & Verwaltung |
| `/accounts/[id]` | `app/(app)/accounts/[id]/page.tsx` | Konto-Detail + Verlauf |
| `/stocks` | `app/(app)/stocks/page.tsx` | Aktien-Portfolio |
| `/groups` | `app/(app)/groups/page.tsx` | Gruppen-Liste/-Detail |
| `/questions` | `app/(app)/questions/page.tsx` | Forum |
| `/questions/ask` | `app/(app)/questions/ask/page.tsx` | Frage stellen |
| `/questions/chat` | `app/(app)/questions/chat/page.tsx` | Chat mit Finzbro AI |
| `/settings` | `app/(app)/settings/page.tsx` | Profil, Theme, Passwort |
| 4xx / 5xx | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` | Fehlerseiten |

Layouts:
- `(public)/layout.tsx` — schlank, marketing-orientiert
- `(auth)/layout.tsx` — zentrierte Karten-Layout
- `(app)/layout.tsx` — SideNav + TopBar + (mobil) BottomNav; setzt `body.has-shared-sidebar`

### 4.3 Komponenten

#### Layout (`src/components/layout/`)

| Komponente | Zweck |
|---|---|
| `SideNav.tsx` | Linke Sidebar (Desktop), Collapse, Profil-Menü |
| `Topbar.tsx` | Sticky Header, Breadcrumb, Theme-Switch |
| `BottomNav.tsx` | Mobile-Bottom-Nav (≤ 960 px) |

#### UI-Primitives (`src/components/ui/`)

| Komponente | Zweck |
|---|---|
| `Modal.tsx` | Accessible Dialog: Focus-Trap, ESC, Portal |
| `Toast.tsx` | Toast-System (success / error / warning / info) |

#### Dashboard (`src/components/dashboard/`)

| Komponente | Zweck |
|---|---|
| `EntriesList.tsx` | Transaktionsliste, gruppiert, Recurring-Expansion |
| `ExpenseForm.tsx` | Ausgabe-Form (RHF + Zod) |
| `IncomeForm.tsx` | Einnahme-Form (RHF + Zod) |
| `CategoryPieChart.tsx` | Recharts Pie pro Kategorie |
| `DrilldownCashflowChart.tsx` | Interaktiver Drilldown nach Kategorie |
| `BudgetAlerts.tsx` | Überzieh-Warnungen |
| `RecurringList.tsx` | Aktive Wiederholungen |
| `TransfersList.tsx` | Peer-Transfer-Historie |
| `PeerTransferModal.tsx` | Modal: User-zu-User-Transfer |
| `recurring.ts` | Pure-Funktionen zur Expansion |
| `types.ts` | Lokale Typen |

#### Accounts (`src/components/accounts/`)

| Komponente | Zweck |
|---|---|
| `DefaultAccountSelector.tsx` | Default-Empfangskonto setzen |
| `BankAccountHistoryModal.tsx` | Konto-Verlauf-Modal |
| `ShareAccountHistoryModal.tsx` | Stock-Depot-Verlauf-Modal |
| `ShareAccountsSection.tsx` | Stock-Depot-Verwaltung |

#### Stocks (`src/components/stocks/`)

| Komponente | Zweck |
|---|---|
| `ShareAccountSwitcher.tsx` | Depot-Tabs |
| `StockDetailDrawer.tsx` | Detail-Panel pro Position |

#### Groups (`src/components/groups/`)

| Komponente | Zweck |
|---|---|
| `ActivitiesSection.tsx` | Gruppen-Aktivitätenliste |
| `AddTripExpenseModal.tsx` | Trip-Ausgabe hinzufügen |
| `ChatMessageItem.tsx` | Chat-Message-Item |
| `CreateSharedExpenseModal.tsx` | Splitwise-Stil Shared Expense |
| `CreateTripModal.tsx` | Trip anlegen |
| `ExpensesSection.tsx` | Ausgaben-Anzeige |
| `FundingBalance.tsx` | Sammelaktions-Stand |
| `GroupArchiveSection.tsx` | Archivierte Gruppen |
| `GroupTransfersSection.tsx` | Group-Peer-Transfers |
| `MembersAdminSection.tsx` | Mitglieder-Admin |
| `SharedExpensesSection.tsx` | Shared-Expense-Tab |
| `TripDetailView.tsx` | Trip-Detail mit Settlement |
| `TripsSection.tsx` | Trip-Liste |
| `api.ts` | Group-spezifische API-Helper |
| `types.ts` | Group-Typen |

#### Providers (`src/components/Providers.tsx`)

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      gcTime: 5 * 60_000,
    },
  },
})
```

### 4.4 State Management

#### `src/stores/app-store.ts` (Zustand)

```ts
interface AppState {
  user: User | null;
  bankAccounts: BankAccount[];
  setUser(user: User | null): void;
  setBankAccounts(accounts: BankAccount[]): void;
  updateUser(patch: Partial<User>): void;
  clearSession(): void;        // wird auf Logout aufgerufen
}
```

#### `src/stores/ui-store.ts` (Zustand)

```ts
interface UiState {
  openModal: string | null;
  sideNavCollapsed: boolean;
  sideNavMobileOpen: boolean;
  openModal_(id: string): void;
  closeModal(): void;
  toggleSideNavCollapsed(): void;
  setSideNavMobileOpen(open: boolean): void;
}
```

### 4.5 Data-Fetching-Pattern (TanStack Query)

```ts
const { data: accounts = [] } = useQuery<BankAccount[]>({
  queryKey: ['bank-accounts'],
  queryFn: () => apiFetch('/api/finance/bank-accounts').then(d => d.accounts ?? []),
});

const { data: transactions } = useQuery({
  queryKey: ['transactions', accountFilter],
  queryFn: () => apiFetch(`/api/finance/transactions${accountParam}`).then(/* … split by type … */),
});
```

Invalidation nach Mutation per `useFinanceInvalidator()` (`src/lib/finance-mutations.ts`) — invalidiert `['transactions']`, `['bank-accounts']`, `['budget-alerts']`, `['bank-account-history']`.

### 4.6 Forms-Pattern (RHF + Zod)

```ts
const expenseSchema = z.object({
  source: z.string().min(1, 'Bezeichnung erforderlich'),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  category: z.string().min(1),
  cycle: z.string().min(1),
  spent_at: z.string().min(1),
  bank_account_id: z.string().min(1, 'Konto erforderlich'),
  note: z.string().optional(),
  recurrence: z.union([z.string(), z.number()]).optional(),
});
type ExpenseFormData = z.infer<typeof expenseSchema>;

const { register, handleSubmit, control, formState: { errors, isSubmitting } } =
  useForm<ExpenseFormData>({ resolver: zodResolver(expenseSchema), defaultValues: { … } });

const onSubmit = async (data: ExpenseFormData) => {
  const res = await fetch(apiUrl(url), {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
    body: JSON.stringify(body),
  });
  …
};
```

Datei: `frontend/src/components/dashboard/ExpenseForm.tsx`.

### 4.7 API-Client / Lib-Utilities

#### `src/lib/api-client.ts`

```ts
apiUrl(path: string): string                 // → process.env.NEXT_PUBLIC_API_URL + path
getCsrfToken(): string                       // liest csrf_token-Cookie
invalidateCsrfCache(): void
```

#### `src/lib/session.ts`

```ts
interface ClientUser { id, username, email, first_name, last_name, profile_image?, income?, age? }
getStoredUser(): ClientUser | null              // sessionStorage('finanzapp.currentUser')
storeUser(u: Partial<ClientUser>): ClientUser
clearUser(): void
fetchSessionUser(): Promise<ClientUser>          // GET /api/auth/session
logoutAndRedirect(): Promise<void>                // POST /api/auth/logout + redirect '/'
```

#### `src/lib/finance-mutations.ts`

```ts
useFinanceInvalidator(): () => void
```

### 4.8 TypeScript-Typen

#### `src/types/db.ts` (Database Rows)

Auth & User: `User`, `UserClient`, `Session`, `EmailVerification`, `PasswordReset`
Konten: `BankAccount`, `ShareAccount` / `Depot`, `Share`
Transaktionen: `Income`, `Expense`, `Transfer`
Gruppen: `Group`, `GroupMember`, `GroupActivity`, `GroupFunding`, `FundingParticipant`, `GroupExpense`
Shared/Trips: `GroupSharedExpense`, `GroupSharedExpenseShare`, `GroupTrip`, `GroupTripExpense`, `GroupTripSettlement`
Sonstige: `UserCategory`, `Budget`, `PaymentRequest`, `GroupMessage`, `Question`, `Answer`, `QuestionLike`, `AnswerLike`

#### `src/types/api.ts` (DTOs)

```ts
interface ApiResponse<T> { ok: boolean; data?: T; error?: string; status: number }
interface PaginatedResponse<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }
```

Request/Response-DTOs (Auszug): `LoginRequest`, `RegisterRequest`, `VerifyEmailRequest`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `CreateBankAccountRequest`, `UpdateBankAccountRequest`, `CreateShareRequest`, `CreateExpenseRequest`, `CreateIncomeRequest`, `CreateGroupRequest`, `CreateGroupActivityRequest`, `CreateGroupFundingRequest`, `CreateGroupSharedExpenseRequest`, `DecideSharedExpenseRequest`, `CreateGroupTripRequest`, `AddTripExpenseRequest`, `CreatePeerTransferRequest`.

### 4.9 Styling

**Datei:** `frontend/src/styles/globals.css` — **12.106 Zeilen** (Stand 2026-06-29).

- **Custom Properties**: `--ui-space-*`, `--ui-radius-*`, `--ui-bg-*`, `--ui-text-*`, `--ui-primary`, semantische Aliases (`--bg-c1: var(--ui-bg-c1)`)
- **Themes**: 4 Varianten via Data-Attribute am `:root`
  - Light (Default)
  - Dark: `:root[data-theme="dark"]`
  - High-Contrast: `:root[data-contrast="high"]`
  - High-Contrast-Dark: Kombination beider
- **BEM-ähnliche Klassen**: `.app-side-nav`, `.app-nav-link`, `.modal`, `.toast`, `.btn-primary`, `.kpi-card`, `.transaction-item`, `.position-row`, `.group-card`, …
- **Glassmorphism**: `backdrop-filter: blur(20px)` auf Topbar / SideNav
- **Animationen**: `toast-in`, `auth-fade-up`, `typing-bounce`, `btn-spin`
- **Breakpoints**: 960 px, 768 px, 640 px, 480 px
- **A11y**: `.sr-only`, `.skip-link`, Focus-States, `prefers-reduced-motion`

**Wichtig**: Keine CSS-Modules, kein Tailwind, kein CSS-in-JS. Alle Styles leben in dieser einen Datei.

### 4.10 Theme & A11y

- `localStorage.finanzapp.themeMode` (`light` / `dark` / `auto`)
- `localStorage.finanzapp.contrast` (`high` / `normal`)
- Init-Script in `app/layout.tsx` läuft **vor** React-Hydration, um Flash zu vermeiden
- Sämtliche User-Strings: deutsch (`de-DE`), `Intl`-API für Zahlen/Datum

### 4.11 Frontend-Konfiguration

#### `frontend/next.config.ts`
```ts
const nextConfig: NextConfig = { output: "standalone", experimental: {} };
```

#### `frontend/tsconfig.json`
- `target: ES2022`, `strict: true`, `moduleResolution: bundler`
- `paths: { "@/*": ["./src/*"] }`

#### `frontend/.eslintrc.json`
- `extends: ["next/core-web-vitals", "next/typescript"]`
- Unused-Vars-Pattern `^_` whitelisten

#### `frontend/vitest.config.ts`
- `environment: 'jsdom'`, `include: ['src/**/__tests__/**/*.test.{ts,tsx}']`

#### `frontend/package.json` Scripts
```jsonc
"dev":        "next dev --port 4000",
"build":      "next build",
"start":      "next start",
"lint":       "next lint",
"type-check": "tsc --noEmit",
"test":       "vitest run",
"test:watch": "vitest",
"pages:build":"npx @cloudflare/next-on-pages",
"preview":    "npx wrangler pages dev",
"deploy":     "npm run pages:build && npx wrangler pages deploy"
```

---

## 5. Backend-Architektur

### 5.1 Abhängigkeiten

#### Produktion (`backend/package.json`)

| Paket | Version | Zweck |
|---|---|---|
| `hono` | ^4.6.0 | Routing-Layer für Workers |
| `postgres` | ^3.4.9 | Postgres-Client (für Hyperdrive) |
| `@supabase/supabase-js` | ^2.49.8 | Supabase-REST (Local-Dev-Fallback) |
| `resend` | ^4.6.0 | E-Mail-Versand |

#### Dev

| Paket | Version | Zweck |
|---|---|---|
| `@cloudflare/workers-types` | ^4.20241022.0 | Workers-Typen |
| `wrangler` | ^4.0.0 | Dev-Server + Deploy |
| `typescript` | ^5.9.3 | Compiler |
| `typescript-eslint` | ^8.62.0 | TS-ESLint-Regeln |
| `eslint` | ^9.39.4 | Linter |
| `vitest` | ^4.1.9 | Test-Runner |
| `@types/node` | ^22.15.24 | Node-Typen |

### 5.2 Runtime

- **Cloudflare Workers** (V8 Isolates, kein Node-Host)
- **`compatibility_flags = ["nodejs_compat"]`** in `wrangler.toml` → Node-APIs verfügbar wo nötig
- **Compatibility-Date:** `2024-09-23`

### 5.3 Verzeichnisstruktur (`backend/src/`)

```
index.ts                  # Hono-App, CORS + Security-Headers, Route-Mount-Punkte
types.ts                  # Env-Bindings (HYPERDRIVE, SESSIONS, FRONTEND_ORIGIN, …)
lib/
  session.ts              # KV-Token-Lifecycle, Cookie-Builder
  config.ts               # Env → Config-Objekt
  db.ts                   # createDb() Factory, QueryBuilder API
  email.ts                # Resend-Adapter
  config/blocked-names.ts # Reservierte Usernames
  helpers/
    auth.ts               # requireAuth(c) → AuthContext | Response
    finance.ts            # toFixedAmount, incrementBankAccountBalance, createPeerTransfer, …
    group-shared.ts       # Min-Cash-Flow Netting, Debt-Settlement
    fuzzy-search.ts       # Forum-Suche
  utils/
    csrf.ts               # Double-Submit Validation, generateCsrfToken
    password.ts           # scrypt + Legacy-SHA256 + Code-Hash
    http.ts               # parseBody, isSecure
    rate-limit.ts         # In-Memory Token-Bucket pro Gruppe
    responses.ts          # badRequest / notFound / unauthorized helper
    image.ts              # Base64-Profil-Bild-Validierung
    data.ts               # E-Mail-Normalisierung etc.
routes/
  auth/index.ts
  users/index.ts + default-account.ts
  finance/index.ts + bank-account-history.ts + share-accounts.ts + peer-transfers.ts
  budgets/index.ts
  groups/index.ts + _shared.ts + members.ts + activities.ts +
          expenses.ts + shared-expenses.ts + trips.ts + expenses-participants.ts
  stocks/index.ts
  questions/index.ts
  tests/*.test.ts
```

### 5.4 Komplette API-Endpoint-Inventur

Konventionen:
- **Auth = ✓** ⇒ `requireAuth(c)` zwingend
- **CSRF = ✓** ⇒ `checkCsrf(c.req.raw)` zwingend (alle mutierenden Routen)
- Pfad-Präfix `/api` ist in `index.ts` gemountet

#### 5.4.1 Auth — `/api/auth`

| Method | Pfad | Auth | CSRF | Body | Response | Zweck |
|---|---|---|---|---|---|---|
| POST | `/login` | ✗ | ✗ | `{ email, password }` | `{ ok, csrf, user, profileImage }` + Set-Cookie | Login + Session erzeugen |
| POST | `/logout` | ✓ | ✓ | — | `{ ok }` + Clear-Cookie | Logout |
| POST | `/register` | ✗ | ✗ | `{ username, email, password, first_name, last_name }` | `{ ok, pending_email, expires_in_seconds }` | Registrierung starten (Code per Mail) |
| POST | `/verify` | ✗ | ✗ | `{ email, code }` | `{ ok, user }` | Registrierungs-Code prüfen |
| POST | `/forgot-password` | ✗ | ✗ | `{ email }` | `{ ok, expires_in_seconds }` | Passwort-Reset-Code anfordern |
| POST | `/reset-password` | ✗ | ✗ | `{ email, code, new_password }` | `{ ok }` | Passwort zurücksetzen |
| GET | `/session` | ✗ | ✗ | — | `{ ok, session_user, csrf }` + Set-Cookie | Aktuelle Session + CSRF holen |

Rate-Limits: Login 5/min · Register 3/min · Verify 5/min · Forgot 2/min · Reset 3/min.

#### 5.4.2 Users — `/api/users`

| Method | Pfad | Auth | CSRF | Body | Response | Zweck |
|---|---|---|---|---|---|---|
| GET | `/me` | ✓ | ✗ | — | `{ ok, user }` | Eigenes Profil |
| PATCH | `/me` | ✓ | ✓ | `{ first_name?, last_name?, income?, age? }` | `{ ok }` | Profil-Update |
| DELETE | `/me` | ✓ | ✓ | — | `{ ok }` | Account löschen (kaskadiert) |
| POST | `/me/password` | ✓ | ✓ | `{ current_password, new_password }` | `{ ok }` + neues Session-Cookie | Passwort ändern (invalidiert andere Sessions) |
| PUT | `/me/profile-image` | ✓ | ✓ | `{ profileImage: "data:image/...;base64,..." }` | `{ ok }` | Avatar setzen |
| GET | `/me/default-account` | ✓ | ✗ | — | `{ ok, default_bank_account_id }` | Standardkonto lesen |
| PUT | `/me/default-account` | ✓ | ✓ | `{ bank_account_id }` | `{ ok }` | Standardkonto setzen |

Rate-Limits: Profilbild 10/min · Passwort-Change 5/min.

#### 5.4.3 Finance — `/api/finance`

**Bank-Accounts**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/bank-accounts` | ✓ | ✗ | Liste Konten |
| POST | `/bank-accounts` | ✓ | ✓ | Konto anlegen `{ label, initial_balance? }` |
| PATCH | `/bank-accounts/:id` | ✓ | ✓ | Label ändern |
| DELETE | `/bank-accounts/:id` | ✓ | ✓ | Konto löschen; 409 wenn Restbetrag → `requires_transfer: true, transfer_options[]` |

**Income / Expenses**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/income` | ✓ | ✗ | Liste mit Cursor-Paginierung |
| POST | `/income` | ✓ | ✓ | Erstellen |
| PATCH | `/income/:id` | ✓ | ✓ | Update |
| DELETE | `/income/:id` | ✓ | ✓ | Löschen (Soft, wenn referenziert) |
| GET | `/expenses` | ✓ | ✗ | Liste |
| POST | `/expenses` | ✓ | ✓ | Erstellen |
| PATCH | `/expenses/:id` | ✓ | ✓ | Update |
| DELETE | `/expenses/:id` | ✓ | ✓ | Löschen |

Income/Expense-Felder: `source, category, amount, received_at|spent_at, cycle, recurrence?, is_active?, note?, bank_account_id?`

**Transfers / Transactions**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| POST | `/transfers` | ✓ | ✓ | Transfer **zwischen eigenen** Konten (atomar: Expense + Income) |
| POST | `/peer-transfers` | ✓ | ✓ | Transfer an **anderen User** (manipulationssichere Audit-Rows) |
| GET | `/transactions` | ✓ | ✗ | Kombinierter Feed (Income + Expenses), `?bank_account_id`, `?category`, Cursor |

**Categories & History**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/categories` | ✓ | ✗ | Preset + custom Kategorien |
| DELETE | `/categories` | ✓ | ✓ | Custom-Kategorie löschen + ersetzen |
| GET | `/bank-accounts/:id/history` | ✓ | ✗ | Vollständige Verlaufsliste eines Kontos |

Preset-Kategorien:
- Income: `salary`, `freelance`, `bonus`, `refund`, `investment`, `transfer`, `opening`, `other`
- Expense: `rent`, `groceries`, `utilities`, `transport`, `health`, `entertainment`, `transfer`, `other`

Rate-Limits: Bank Create/Update/Delete 30/min · Finance-Write 60/min · Peer-Transfer 30/min.

#### 5.4.4 Budgets — `/api/budgets`

| Method | Pfad | Auth | CSRF | Body | Zweck |
|---|---|---|---|---|---|
| GET | `/` | ✓ | ✗ | — | Alle Budgets |
| POST | `/` | ✓ | ✓ | `{ category, target_amount }` | Budget anlegen |
| PATCH | `/:id` | ✓ | ✓ | `{ category?, target_amount? }` | Update |
| DELETE | `/:id` | ✓ | ✓ | — | Löschen |
| GET | `/status` | ✓ | ✗ | — | Alerts: `{ category, target, spent, percentage, exceeded }[]` |

#### 5.4.5 Groups — `/api/groups`

**Gruppen-Management**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/` | ✓ | ✗ | Eigene Gruppen |
| POST | `/` | ✓ | ✓ | `{ name, info?, address? }` → Creator wird `admin` |
| GET | `/invitations` | ✓ | ✗ | Offene Einladungen |
| PATCH | `/:id` | ✓ | ✓ | Update |
| DELETE | `/:id` | ✓ | ✓ | Löschen (admin only) |
| POST | `/:id/join-invite` | ✓ | ✓ | `{ action: 'accept' \| 'decline' }` |
| POST | `/:id/leave` | ✓ | ✓ | Gruppe verlassen |
| POST | `/:id/invite-user` | ✓ | ✓ | `{ username, role: 'admin' \| 'member' }` |

**Mitglieder**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/:id/members` | ✓ | ✗ | Liste |
| PATCH | `/:id/members/:userId` | ✓ | ✓ | Rolle ändern (admin only) |
| DELETE | `/:id/members/:userId` | ✓ | ✓ | Entfernen (admin only) |

**Shared Expenses (Splitwise-Stil)**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/:id/shared-expenses` | ✓ | ✗ | Liste |
| POST | `/:id/shared-expenses` | ✓ | ✓ | Anlegen `{ description, amount, paid_by_user_id, participants[], date? }` |
| PATCH | `/:id/shared-expenses/:expenseId` | ✓ | ✓ | Update |
| DELETE | `/:id/shared-expenses/:expenseId` | ✓ | ✓ | Löschen |

**Trips**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/:id/trips` | ✓ | ✗ | Liste |
| POST | `/:id/trips` | ✓ | ✓ | Anlegen |
| PATCH | `/:id/trips/:tripId` | ✓ | ✓ | Update |
| DELETE | `/:id/trips/:tripId` | ✓ | ✓ | Löschen |
| GET | `/:id/trips/:tripId/expenses` | ✓ | ✗ | Trip-Ausgaben |
| POST | `/:id/trips/:tripId/expenses` | ✓ | ✓ | Trip-Ausgabe hinzufügen |
| GET | `/:id/trips/:tripId/settlement` | ✓ | ✗ | Min-Cash-Flow Schulden-Netting |

**Activities & Funding**

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/:id/activities` | ✓ | ✗ | Activity-Log |
| POST | `/:id/funding` | ✓ | ✓ | Beitrag in Sammelaktion `{ amount, from_bank_account_id }` |
| GET | `/:id/funding` | ✓ | ✗ | Status `{ target, collected, participants[] }` |

Rate-Limits: Groups-Create 5/min · Groups-Mutate 20/min.

#### 5.4.6 Stocks — `/api/stocks`

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/search?q=` | ✓ | ✗ | Finnhub-Suche |
| GET | `/logo?ticker=` oder `?domain=` | ✓ | ✗ | logo.dev-URL |
| GET | `/positions?share_account_id=` | ✓ | ✗ | Positionen |
| POST | `/positions/buy` | ✓ | ✓ | Kauf `{ symbol, shares, bank_account_id, share_account_id? }` |
| POST | `/positions/sell` | ✓ | ✓ | Verkauf `{ symbol, shares, bank_account_id }` |
| GET | `/positions/:symbol/price-chart?period=` | ✓ | ✗ | OHLC-Daten (1d / 5d / 1mo / 1y / max) |

Rate-Limits: Suche 30/min · Logo 60/min · Trading 30/min.

#### 5.4.7 Questions (Forum) — `/api/questions`

| Method | Pfad | Auth | CSRF | Zweck |
|---|---|---|---|---|
| GET | `/?search=` | ✓ | ✗ | Liste mit fuzzy search, eigene Likes mit |
| POST | `/` | ✓ | ✓ | Frage stellen `{ thema (≤80), message (≤4000) }` |
| PATCH | `/:id` | ✓ | ✓ | Eigene Frage editieren |
| DELETE | `/:id` | ✓ | ✓ | Eigene Frage löschen |
| POST | `/:id/like` | ✓ | ✓ | Like/Unlike `{ liked: bool }` |
| GET | `/:id/answers` | ✓ | ✗ | Antworten |
| POST | `/:id/answers` | ✓ | ✓ | Antworten `{ message (≤4000) }` |
| PATCH | `/:id/answers/:answerId` | ✓ | ✓ | Eigene Antwort editieren |
| DELETE | `/:id/answers/:answerId` | ✓ | ✓ | Eigene Antwort löschen |
| POST | `/:id/answers/:answerId/like` | ✓ | ✓ | Antwort liken |

Finzbro-AI-Antworten werden als spezieller User (`FINZBRO_BOT_EMAIL`) gepostet.

### 5.5 Backend-Helpers

#### `lib/helpers/auth.ts`
- `requireAuth(c)` — gibt `{ user, db, env }` oder 401-Response

#### `lib/helpers/finance.ts`
- `toFixedAmount(value)` — sichere 2-Nachkomma-Zahl
- `normalizeCategoryValue` / `uniqueCategoryList`
- `parseRecurrence`, `normalizeCycle` (`once|weekly|monthly|yearly`), `parseBoolean`
- `resolveEntryState(cycle, recurrence, isActive)`
- `serializeIncomeEntry`, `serializeExpenseEntry`
- `parsePaginationCursor`
- `resolveRequestedBankAccountFilter`
- `getUserBankAccounts(db, userId)`
- `assertDateAfterAccountOpening(db, accountId, date)`
- `ensureUserFinanceRoots(db, userId)` — Default Bank- + Share-Account anlegen
- `incrementBankAccountBalance(db, accountId, delta)` — RPC-Aufruf (atomar)
- `createPeerTransfer(db, fromUserId, toUserId, …)` — atomares Expense/Income-Paar
- `rememberUserCategory(db, userId, kind, value)`

#### `lib/helpers/group-shared.ts`
- Min-Cash-Flow-Algorithmus für Trip-Settlement
- Period-Release-Logik (`release_period_reservations` RPC)

#### `lib/utils/csrf.ts`
- `checkCsrf(req)` — timing-safe Vergleich
- `generateCsrfToken()`, `buildCsrfCookie()`, `getCsrfTokenFromCookies()`

#### `lib/utils/password.ts`
- `hashPassword(pw)` — scrypt + Salt
- `verifyPassword(pw, hash)` — Legacy-SHA256 auto-upgrade
- `hashCode(code)` / `verifyCode(code, hash)` — 6-stellige Codes

#### `lib/utils/rate-limit.ts`
- `checkRateLimit(req, options)` — In-Memory Token-Bucket pro Gruppe + IP

#### `lib/utils/responses.ts`
- `badRequest(message?)`, `notFound(message?)`, `unauthorized(message?)` — typsichere Response-Builder

#### `lib/session.ts`
- `createSession(env, userId)` — 32-Byte Hex-Token in KV
- `getSessionRecord(env, token)`
- `destroySession(env, token)`
- `invalidateAllUserSessions(env, userId)` — setzt `pw-changed:${userId}`-Marker
- `buildSessionCookie`, `clearSessionCookie`, `getSessionToken`

### 5.6 Datenbank-Zugriff (`lib/db.ts`)

Dual-Strategie:

1. **Produktion** — Hyperdrive-Binding (`HYPERDRIVE`) → `postgres`-Driver
2. **Lokal** — Supabase REST (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`); Fallback auf `DATABASE_URL`

```ts
interface DbClient {
  from<T>(table): QueryBuilder<T>;
  rpc(name, params): Promise<{ data, error }>;
}
```

**QueryBuilder-API** (Supabase-kompatibel):
- Ops: `.select(cols)` · `.insert(data)` · `.update(data)` · `.delete()` · `.upsert(data, { onConflict })`
- Filter: `.eq` · `.neq` · `.in` · `.is` · `.gte` · `.gt` · `.lte` · `.lt` · `.ilike` · `.not` · `.or`
- Modifier: `.order(col, opts)` · `.limit(n)` · `.range(from, to)`
- Terminator: `.single()` · `.maybeSingle()` · `await` (implizit many)

### 5.7 Sessions & CSRF

**Session-Flow:**
1. Login → 32-Byte Hex-Token, KV-Eintrag `session:${token} = { userId, issuedAt }`, TTL 180 min (default)
2. Cookie `finanzapp_session` (HttpOnly, SameSite=Lax/None, Secure in Prod)
3. Auf jedem Request: `requireAuth` liest Cookie, lädt KV-Eintrag, prüft `pw-changed:${userId}`-Marker
4. Logout: KV-Eintrag löschen + Cookie clearen
5. Passwort-Change: alle Sessions invalidieren via Marker

**CSRF-Flow (Double-Submit):**
- Cookie `csrf_token` (nicht HttpOnly, JS-lesbar)
- Header `x-csrf-token` muss vom Frontend gesetzt werden
- Backend vergleicht beide timing-safe (HMAC-SHA256)
- Erforderlich auf jedem POST / PATCH / PUT / DELETE

### 5.8 Rate Limits (Gesamtübersicht)

| Gruppe | Limit | Bereich |
|---|---|---|
| `login` | 5 / min | Auth |
| `register` | 3 / min | Auth |
| `register-verify` | 5 / min | Auth |
| `password-forgot` | 2 / min | Auth |
| `password-reset` | 3 / min | Auth |
| `password-change` | 5 / min | Users |
| `profile-image` | 10 / min | Users |
| `bank-create` / `bank-update` / `bank-delete` | 30 / min each | Finance |
| `finance-write` | 60 / min | Finance |
| `peer-transfer` | 30 / min | Finance |
| `groups-create` | 5 / min | Groups |
| `groups-mutate` | 20 / min | Groups |
| `stocks-trade` | 30 / min | Stocks |
| `finnhub` | 30 / min | Stocks Search/Quote |
| `stock-logo` | 60 / min | Stocks Logos |

### 5.9 Security-Headers (auf jeder Response)

```
X-Content-Type-Options:      nosniff
X-Frame-Options:             DENY
Referrer-Policy:             strict-origin-when-cross-origin
Strict-Transport-Security:   max-age=31536000; includeSubDomains
Cross-Origin-Opener-Policy:  same-origin
Cross-Origin-Resource-Policy: cross-origin
Permissions-Policy:          camera=(), microphone=(), geolocation=(), payment=()
```

### 5.10 CORS

- Origins: `localhost:4000` (Dev) + `FRONTEND_ORIGIN` (kommagetrennt erlaubt)
- `Access-Control-Allow-Credentials: true`
- Methoden: GET, POST, PATCH, PUT, DELETE, OPTIONS
- Header: `Content-Type`, `x-csrf-token`
- Max-Age: 86400 s

### 5.11 Backend-Konfiguration

#### `backend/wrangler.toml` (Auszug)

```toml
name = "finanzapp-backend"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

kv_namespaces = [
  { binding = "SESSIONS", id = "<SESSIONS_KV_NAMESPACE_ID>", preview_id = "<SESSIONS_KV_PREVIEW_ID>" }
]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<HYPERDRIVE_ID>"

[vars]
NODE_ENV                       = "production"
SESSION_COOKIE_NAME            = "finanzapp_session"
SESSION_TTL_MINUTES            = "180"
EMAIL_CODE_TTL_MINUTES         = "15"
OPENROUTER_MODEL               = "openai/gpt-oss-20b:free"
OPENROUTER_APP_NAME            = "FinanzApp"
STOCK_SEARCH_DEFAULT_EXCHANGE  = "NASDAQ"
TRUST_PROXY                    = "true"
FRONTEND_ORIGIN                = "https://finanzapp.pages.dev"
```

#### Sensitive Env-Vars (via `.dev.vars` lokal oder `wrangler secret put` produktiv)

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres-Connection (Local-Dev-Fallback) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase REST (Local-Dev) |
| `RESEND_API_KEY` | E-Mail |
| `EMAIL_FROM` | `FinanzApp <noreply@…>` |
| `FINNHUB_API_KEY` | Stocks |
| `LOGO_DEV_API_KEY` | Logos |
| `OPENROUTER_API_KEY`, `OPENROUTER_API_KEY_2` | AI (primary + fallback) |
| `OPENROUTER_SITE_URL` | User-Agent / Referrer |
| `TWELVE_DATA_API_KEY` | Reserve-Stock-API (derzeit ungenutzt) |
| `CODE_HMAC_SECRET` | (reserviert) |
| `FINZBRO_BOT_EMAIL` | E-Mail des AI-Bots (Default `finzbro@finanzapp.local`) |

#### Scripts (`backend/package.json`)

```jsonc
"dev":        "wrangler dev --port 8787",
"build":      "wrangler deploy --dry-run --outdir dist",
"deploy":     "wrangler deploy",
"type-check": "tsc --noEmit",
"lint":       "eslint .",
"test":       "vitest run",
"test:watch": "vitest"
```

---

## 6. Datenbankschema (aus Code abgeleitet)

### 6.1 Auth / User

| Tabelle | Spalten |
|---|---|
| `users` | `id`, `username`, `email`, `password`, `first_name`, `last_name`, `created_at`, `profileImage`, `income`, `age`, `default_bank_account_id` |
| `email_verifications` | `email` (PK on-conflict), `username`, `password`, `first_name`, `last_name`, `code_hash`, `attempts`, `created_at`, `expires_at` |
| `password_resets` | `email`, `user_id`, `code_hash`, `attempts`, `created_at`, `expires_at` |

### 6.2 Konten & Transaktionen

| Tabelle | Spalten |
|---|---|
| `bank_accounts` | `id`, `user_id`, `label`, `balance`, `created_at` |
| `income` | `id`, `bank_account_id`, `source`, `category`, `amount`, `received_at`, `pay_date`, `note`, `info`, `recurrence`, `cycle`, `is_active`, `state`, `created_at`, `updated_at`, `transfer_id`, `group_id` |
| `private_expenses` | analog zu `income`, mit `spent_at` / `due_date` statt `received_at`, plus `theo_amount` |
| `user_categories` | `user_id`, `kind ('income'|'expense')`, `key`, `value` |
| `budgets` | `id`, `user_id`, `category`, `target_amount`, `current_amount`, `reset_date`, `created_at` |
| `transfers` | `id`, `from_user_id`, `to_user_id`, `from_bank_account_id`, `to_bank_account_id`, `amount`, `reason`, `group_id`, `group_expense_share_id`, `trip_settlement_id`, `status='completed'`, `completed_at` |

### 6.3 Stocks

| Tabelle | Spalten |
|---|---|
| `share_accounts` | `id`, `user_id`, `label`, `created_at` |
| `shares` | `id`, `share_account_id` / `depot_id`, `symbol`, `units`, `bought_for`, `bought_at` |

### 6.4 Groups

| Tabelle | Spalten |
|---|---|
| `groups` | `id`, `name`, `info`, `address`, `created_at`, `archived_at?` |
| `group_members` | `id`, `group_id`, `user_id`, `role ('admin'|'member')`, `status ('accepted'|'invited'|'pending_admin')` |
| `group_shared_expenses` | `id`, `group_id`, `description`, `amount`, `paid_by_user_id`, `date`, `created_at` |
| `group_shared_expense_shares` | `id`, `group_expense_id`, `user_id`, `amount` |
| `group_shared_expense_periods` | `id`, `group_id`, `period_start`, `period_end` |
| `group_shared_expense_period_transfers` | `id`, `period_id`, `from_user_id`, `to_user_id`, `amount`, `reason`, `status`, `completed_at` |
| `group_trips` | `id`, `group_id`, `name`, `description`, `start_date`, `end_date`, `status`, `created_at` |
| `group_trip_participants` | `id`, `trip_id`, `user_id` |
| `group_trip_expenses` | `id`, `trip_id`, `description`, `amount`, `paid_by_user_id`, `date`, `created_at` |
| `group_trip_expense_participants` | `id`, `trip_expense_id`, `user_id`, `amount` |
| `group_trip_settlements` | `id`, `trip_id`, `from_user_id`, `to_user_id`, `amount`, `reason`, `status`, `completed_at` |
| `group_funding` | `id`, `group_id`, `description`, `target_amount`, `collected_amount` / `total_donated`, `status`, `created_at` |
| `funding_participants` | `id`, `funding_id`, `bank_account_id`, `amount` |
| `group_activities` | `id`, `group_id`, `action`, `created_at` |
| `group_message` | Gruppen-Chat-Messages |

### 6.5 Forum

| Tabelle | Spalten |
|---|---|
| `global_questions` | `id`, `from_user_id`, `thema`, `message`, `answered`, `edited`, `created_at`, `updated_at` |
| `global_answers` | `id`, `question_id`, `from_user_id`, `message`, `edited`, `created_at`, `updated_at` |
| `question_likes` | `user_id`, `question_id` |
| `answer_likes` | `user_id`, `answer_id` |

### 6.6 Custom Postgres-Funktionen (RPC)

| RPC | Zweck |
|---|---|
| `increment_bank_balance(account_id, delta)` | Atomare Balance-Änderung |
| `release_period_reservations(period_id)` | Settlement-Period freigeben |
| `contribute_to_funding(funding_id, …)` | Beitrag mit Hard-Cap |

Migration: `seeds/migrations/2026-06-29_groups_expansion.sql`.

---

## 7. Externe Integrationen

### 7.1 Resend (E-Mail)

- Endpoint: `POST https://api.resend.com/emails`
- Auth: `Authorization: Bearer ${RESEND_API_KEY}`
- From: `EMAIL_FROM` (default `FinanzApp <noreply@finanzapp.local>`)
- Use-Cases: Registrierungs-Code, Password-Reset-Code
- Code-TTL: 15 min (`EMAIL_CODE_TTL_MINUTES`), 6 Stellen, max 5 Versuche

### 7.2 Finnhub (Stocks)

- Base: `https://finnhub.io/api/v1/`
- Endpoints:
  - `/search?q=…`
  - `/quote?symbol=…`
  - `/stock/profile2?symbol=…`
- Auth: Query-Param `token=${FINNHUB_API_KEY}`
- Profile-Cache: In-Memory, TTL 1 h, LRU max 500 Einträge

### 7.3 logo.dev

- Base: `https://img.logo.dev/`
- Endpoints: `/ticker/{symbol}`, `/{domain}`
- Auth: `token=${LOGO_DEV_API_KEY}` Query-Param
- Format: PNG 64 px

### 7.4 OpenRouter (AI-Forum-Chat)

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Headers: `Authorization: Bearer …`, `HTTP-Referer: ${OPENROUTER_SITE_URL}`, `X-Title: ${OPENROUTER_APP_NAME}`
- Default-Model: `openai/gpt-oss-20b:free`
- Fallback-Key: `OPENROUTER_API_KEY_2`
- User-Identität in DB: spezieller User mit `email = FINZBRO_BOT_EMAIL`

### 7.5 Twelve Data

- Konfigurierter Reserve-Provider (`TWELVE_DATA_API_KEY`), aktuell **nicht aktiv genutzt**.

### 7.6 Finnhub WebSocket

- Frontend-Hook `frontend/src/hooks/useFinnhubWs.ts` öffnet Realtime-Verbindung für Live-Kurse auf `/stocks`.

---

## 8. Features-Inventur

| Feature | Frontend-Route | Backend-Endpoint(s) | Status |
|---|---|---|---|
| Registrierung | `/login` | `POST /api/auth/register` + `POST /api/auth/verify` | Aktiv |
| Login | `/login` | `POST /api/auth/login` | Aktiv |
| Passwort-Reset | `/login` | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | Aktiv |
| Logout | überall | `POST /api/auth/logout` | Aktiv |
| Dashboard-Übersicht | `/dashboard` | `GET /api/finance/transactions`, `GET /api/budgets/status` | Aktiv |
| Einnahme erfassen | `/dashboard` Tab | `POST /api/finance/income` | Aktiv |
| Ausgabe erfassen | `/dashboard` Tab | `POST /api/finance/expenses` | Aktiv |
| Recurring-Anzeige | `/dashboard` Tab | derselbe Feed, FE expandiert | Aktiv |
| Bank-Konten | `/accounts`, `/accounts/[id]` | `/api/finance/bank-accounts*` | Aktiv |
| Standardkonto | `/accounts` | `PUT /api/users/me/default-account` | Aktiv |
| Konto-Verlauf | `/accounts/[id]` | `GET /api/finance/bank-accounts/:id/history` | Aktiv |
| Konto-zu-Konto-Transfer | `/dashboard` | `POST /api/finance/transfers` | Aktiv |
| Peer-Transfer | `/dashboard` Tab | `POST /api/finance/peer-transfers` | Aktiv (Unit 3) |
| Stock-Portfolio | `/stocks` | `/api/stocks/*` | Aktiv |
| Stock-Suche / Buy / Sell | `/stocks` | `/api/stocks/search`, `/positions/buy`, `/positions/sell` | Aktiv |
| Realtime-Kurse | `/stocks` | Finnhub WS (FE) | Aktiv |
| Gruppen-Übersicht | `/groups` | `GET /api/groups`, `GET /invitations` | Aktiv |
| Gruppe anlegen | `/groups` | `POST /api/groups` | Aktiv |
| Member-Verwaltung | `/groups` | `/api/groups/:id/members*`, `invite-user`, `join-invite`, `leave` | Aktiv |
| Shared-Expenses (Splitwise) | `/groups` Tab | `/api/groups/:id/shared-expenses*` | Aktiv (Unit 4) |
| Shared-Expense Decide | `/groups` Modal | `PATCH /api/groups/:id/shared-expenses/:id` | Aktiv (Unit 5) |
| Trips | `/groups` Tab | `/api/groups/:id/trips*` | Aktiv (Unit 7) |
| Trip-Settlement (Min-Cash-Flow) | `/groups` Trip-View | `GET /api/groups/:id/trips/:tripId/settlement` | Aktiv (Unit 7) |
| Sammelaktion (Funding) | `/groups` Tab | `/api/groups/:id/funding*` | Aktiv (Unit 9) |
| Archiv | `/groups` Tab | Archive-Section (FE-Filter) | Aktiv |
| Forum (Liste) | `/questions` | `GET /api/questions` | Aktiv |
| Frage stellen | `/questions/ask` | `POST /api/questions` | Aktiv |
| AI-Chat (Finzbro) | `/questions/chat` | OpenRouter via `POST /api/questions/:id/answers` (Bot) | Aktiv |
| Antworten + Likes | `/questions` | `/api/questions/:id/answers*`, `/like` | Aktiv |
| Profil + Avatar | `/settings` | `/api/users/me*` | Aktiv |
| Theme | überall | LocalStorage, kein Backend | Aktiv |
| Public-Landingpage | `/home` | — | Aktiv |

---

## 9. Security-Modell

| Anforderung | Implementierung |
|---|---|
| Session-Isolation | Auf Logout/Login: `queryClient.clear()` + `useAppStore.getState().clearSession()` + `clearUser()` |
| Auth-Guard | `requireAuth(c)` auf **jeder** geschützten Route (Pflicht laut CLAUDE.md) |
| CSRF | Double-Submit (Cookie `csrf_token` + Header `x-csrf-token`), HMAC-SHA256 timing-safe |
| Passwort-Hashing | scrypt + Salt; Legacy-SHA256 wird beim Login auto-upgraded |
| Code-Hashing | SHA256 für 6-stellige Codes (15 min TTL, max 5 Versuche) |
| Soft-Delete | Income/Expenses-Rows mit Transfer-Referenz werden `is_active=false, state='completed'` statt physisch gelöscht |
| Money-Mutation | Nur via `incrementBankAccountBalance` (RPC); nie direktes `UPDATE balance = balance + …` |
| Money-Floats | Immer durch `toFixedAmount()` vor Persist/Response |
| Sensitive Daten | **Nicht** in `localStorage` (nur Theme/UI-Prefs); Sessions ausschließlich in HttpOnly-Cookies |
| SQL-Injection | Parameterisiert über Supabase-Client / `postgres`-Tagged-Templates |
| XSS | Kein `dangerouslySetInnerHTML`; React eskapiert automatisch |
| Headers | Vollständiger Security-Header-Block auf jeder Response |
| Permissions-Policy | Camera, Microphone, Geolocation, Payment alle deaktiviert |
| Rate-Limiting | Per-Route Token-Bucket (in-memory), IP-basiert |

---

## 10. Deployment

| Layer | Hosting | Deploy |
|---|---|---|
| Frontend | **Cloudflare Pages** (via `@cloudflare/next-on-pages`) — alternativ Vercel | `npm run deploy` (build + `wrangler pages deploy`) |
| Backend | **Cloudflare Workers** | `npx wrangler deploy` aus `backend/` |
| DB | **Supabase** PostgreSQL via Hyperdrive | Migrationen aus `seeds/migrations/` manuell ausführen |
| Sessions | **Cloudflare KV** (`SESSIONS` binding) | Beim Workers-Deploy automatisch verbunden |
| E-Mail | **Resend** | API-Key über `wrangler secret put RESEND_API_KEY` |
| AI | **OpenRouter** | `OPENROUTER_API_KEY` Secret |
| Stock-Daten | **Finnhub** | `FINNHUB_API_KEY` Secret |
| Logos | **logo.dev** | `LOGO_DEV_API_KEY` Secret |

`docker-compose.yml` containerisiert nur das Frontend (Multi-Stage Build, ~150 MB). Das Backend läuft im Workers-Sandbox-Modell und wird **nicht** in einen Container verpackt (siehe `docs/DOCKER.md` für die Begründung).

---

## 11. Development Workflow

### 11.1 Root-Scripts (`package.json`)

```jsonc
"start":        "concurrently --names \"backend,frontend\" --prefix-colors \"cyan,magenta\" \"npm run dev --prefix backend\" \"npm run dev --prefix frontend\"",
"dev":          "npm run start",
"install:all":  "npm install --prefix backend && npm install --prefix frontend",
"type-check":   "npm run type-check --prefix backend && npm run type-check --prefix frontend",
"lint":         "npm run lint --prefix frontend",
"build":        "npm run build --prefix frontend && npm run build --prefix backend",
"format":       "prettier --write \"**/*.{ts,tsx,js,mjs,cjs,json,md}\"",
"format:check": "prettier --check \"**/*.{ts,tsx,js,mjs,cjs,json,md}\""
```

### 11.2 Ports

| Service | Port |
|---|---|
| Next.js Dev | `4000` |
| Wrangler Dev | `8787` |

Falls 8787 belegt: `lsof -ti :8787 | xargs kill -9`

### 11.3 Workflow

```bash
# Initial
npm run install:all

# Dev (beides parallel)
npm start

# Vor Commit
npm run type-check         # beide Pakete, MUSS 0 Fehler liefern
npm run lint               # Frontend
npm run format:check       # alle Dateien
cd frontend && npm test    # vitest
cd backend  && npm test    # vitest
```

### 11.4 Prettier-Regeln (`.prettierrc.json`)

- printWidth: 100
- tabWidth: 2
- trailingComma: all
- singleQuote: false (default für TS)
- semi: true (default)
- endOfLine: lf

---

## 12. Dokumentations-Index

| Datei | Inhalt |
|---|---|
| `README.md` | Setup-Anleitung (DE), Feature-Übersicht, Deploy-Schritte |
| `CLAUDE.md` | Verbindliche Coding-Standards, Security-Anforderungen (Codex-enforced), Patterns, Branch-Info |
| `docs/PROJECT-OVERVIEW.md` | **Diese Datei** — vollständige Architektur-Referenz |
| `docs/DOCKER.md` | Begründung: nur Frontend containerisiert |
| `docs/REFACTOR-DASHBOARD.md` | Geplanter Refactor: 873-Zeilen-Dashboard in modulare Komponenten splitten |
| `design/README.md` | Design-Language: Layered Depth, Outfit-Typeface, Token-getriebenes Theming |
| `design/design-tokens.md` | Vollständige CSS-Variablen-Referenz für 4 Themes |
| `design/screenshots/` | Visuelle Captures aller Hauptseiten |
| `tasks/todo.md` | Group-Module-Expansion Units 1–10 + Smoke-Test-Walkthrough |
| `tasks/lessons.md` | Patterns: immutable Audit-Rows, atomare PG-RPCs, pure Netting-Funktionen, Worktree-Konflikte, Hard-Caps via RPC |
| `seeds/migrations/2026-06-29_groups_expansion.sql` | Idempotente Migration: Peer-Transfers, Group-Expenses, Trips, Default-Accounts, Funding-Status |

---

## 13. Git & Branches

- **Aktiver Branch** (Snapshot 2026-06-29): `fix/audit-money-safety`
- **Default-Branch für PRs**: `main`
- **Commit-Konvention**:
  - Merge-Commits in `main`: `Merge: feat(scope) Unit N — Beschreibung` oder `Merge: fix(scope) Unit N — …`
  - Feature-Branches: `feat/<scope>-<unit>`, `fix/<scope>-<problem>`, `refactor/<scope>`, `perf/<scope>`, `test/<scope>`
- **Worktree-Branches**: `agent-<hash>` (parallelisierte Entwicklung; viele bereits gemergt, einige zur Aufräumung übrig)
- **Letzte 5 Commits in main** (Stand jetzt):
  ```
  5437f6f Merge: feat(groups) Unit 3 — trip modals redesign + creation bug fix
  32c16ab Merge: feat(groups) Unit 1 — shared-expense modal redesign
  c3fb5ea Merge: feat(dashboard) Unit 4 — transfers tab + header reorg
  827e962 Merge: fix(groups) Unit 2 — backend shared-expense validation
  c7a8671 Merge: fix(groups) Unit 5 — funding current_amount uses total_donated
  ```

---

## 14. Bekannte Lücken / Tech-Debt

| Bereich | Status |
|---|---|
| **CI/CD** | Kein `.github/workflows/`, kein CircleCI; alle Checks lokal |
| **Test-Coverage** | Vitest-Infrastruktur vorhanden (FE + BE), aber niedrige Coverage |
| **E2E-Tests** | Kein Playwright / Cypress |
| **Containerisierung Backend** | Bewusst nicht — Workers-Modell (siehe `docs/DOCKER.md`) |
| **Dashboard-Komponente** | 873-Zeilen-Datei wartet auf Split (Plan in `docs/REFACTOR-DASHBOARD.md`) |
| **`nextapp/`-Legacy** | Alter Next.js-Code, nicht entfernt — Migration nach `frontend/` abgeschlossen |
| **Twelve-Data-Integration** | Konfiguriert, aber inaktiv |
| **Worktree-Branches** | Mehrere `agent-*`-Branches verbleiben nach Parallelisierung |

---

## 15. Schlüssel-Architektur-Entscheidungen

1. **Single CSS-Datei** — bewusst kein CSS-Modules / Tailwind / CSS-in-JS. Alles in `frontend/src/styles/globals.css`, BEM-ähnliche Namen, Theme-Vars per `[data-theme]`.
2. **Kein API-Wrapper** — raw `fetch(apiUrl(...), { credentials: 'include' })` direkt in Pages/Komponenten (ein `requestJson`-Wrapper existiert, wird aber nicht durchgängig genutzt).
3. **Zustand für Client-State, TanStack Query für Server-State** — strikte Trennung.
4. **Cloudflare-Serverless-Backend** — kein Node-Host, V8-Isolates am Edge, KV für Sessions, Hyperdrive für DB.
5. **Immutable Transfers** — `transfers`-Tabelle ist Audit-Trail; referenzierte Income/Expense-Rows können nicht physisch gelöscht/editiert werden (siehe `tasks/lessons.md`).
6. **Atomare PL/pgSQL-Funktionen** — Mehrschritt-Operationen (Settlement, Funding-Cap, Balance-Inkrement) in DB-Funktionen, um Race Conditions zu vermeiden.
7. **App Router only** — kein Pages-Router, alle Routen als Verzeichnisstruktur mit `page.tsx`.
8. **CSRF Double-Submit** — keine Library, eigene `checkCsrf`-Implementierung in `backend/src/lib/utils/csrf.ts`.
9. **Dual-DB-Strategie** — `lib/db.ts` wählt Hyperdrive (prod) oder Supabase-REST (lokal) automatisch.
10. **Codex-Review-Pipeline** — jeder Commit wird automatisch auf Security, Datenisolation, Code-Qualität, TS-Strictness geprüft (siehe `CLAUDE.md`).

---

*Diese Datei wurde durch tiefe Code-Exploration am 2026-06-29 erzeugt. Bitte beim Modifizieren des Codes mit aktualisieren, damit sie als zuverlässige Architektur-Referenz erhalten bleibt.*
