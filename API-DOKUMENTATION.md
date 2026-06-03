# FinanzApp - API Dokumentation

## Inhaltsverzeichnis

1. [Allgemein](#allgemein)
2. [Authentifizierung & Session](#authentifizierung--session)
3. [Einnahmen & Ausgaben](#einnahmen--ausgaben)
4. [Kategorien](#kategorien)
5. [Bankkonten](#bankkonten)
6. [Depotkonten](#depotkonten)
7. [Aktien & Marktdaten](#aktien--marktdaten)
8. [Budgets](#budgets)
9. [Gruppen](#gruppen)
10. [Fragen & Antworten](#fragen--antworten)
11. [Benutzereinstellungen](#benutzereinstellungen)

---

## Allgemein

### Basis-URL

Alle API-Aufrufe erfolgen relativ zur Basis-URL des Servers (Standard: `http://localhost:3000`).

### Authentifizierung

Alle Routen (außer Login, Register, Passwort vergessen) erfordern eine aktive Session. Die Authentifizierung erfolgt über Session-Cookies (`credentials: "same-origin"`).

### Standard-Antwortformat

```json
{
  "ok": true | false,
  "message": "Optionale Fehlermeldung"
}
```

### API-Client (Frontend)

Zentrale Datei: `apps/web/src/shared/js/api-client.js`

Stellt zwei Named-Exports bereit:
- `requestJson(url, options)` — Gibt `{ ok, status, responseOk, retryAfter, data }` zurück
- `requestJsonMerged(url, options)` — Gibt zusammengeführte Daten mit `ok`, `status`, `responseOk` zurück

---

## Authentifizierung & Session

### Login

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/login` |
| **Frontend** | `apps/web/src/pages/dashboard/script.js` |

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response (Erfolg):**
```json
{
  "ok": true,
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "created_at": "ISO8601"
  }
}
```

**Response (Fehler):**
```json
{
  "ok": false,
  "message": "Invalid credentials"
}
```

---

### Registrierung

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/register` |
| **Frontend** | `apps/web/src/pages/dashboard/script.js` |

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "first_name": "string (optional)",
  "last_name": "string (optional)"
}
```

**Response (Erfolg):**
```json
{
  "ok": true
}
```

**Response (Fehler):**
```json
{
  "ok": false,
  "message": "Username already exists"
}
```

---

### Registrierung verifizieren

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/register/verify` |
| **Frontend** | `apps/web/src/pages/dashboard/script.js` |

**Request Body:**
```json
{
  "email": "string",
  "code": "string"
}
```

**Response:**
```json
{
  "ok": true,
  "user": {
    "id": "string",
    "username": "string",
    "email": "string"
  }
}
```

---

### Session prüfen

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/session` |
| **Frontend** | `apps/web/src/shared/js/session-utils.js` → `fetchSessionUser()` |

**Response (eingeloggt):**
```json
{
  "ok": true,
  "session_user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "profileImage": "string",
    "created_at": "ISO8601"
  }
}
```

**Response (nicht eingeloggt):**
```json
{
  "ok": false
}
```

---

### Logout

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/logout` |
| **Frontend** | `apps/web/src/shared/js/session-utils.js` → `logoutAndRedirect()` |

**Response:**
```json
{
  "ok": true
}
```

---

### Passwort vergessen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/password/forgot` |
| **Frontend** | `apps/web/src/pages/dashboard/script.js` |

**Request Body:**
```json
{
  "email": "string"
}
```

**Response:**
```json
{
  "ok": true,
  "expires_in_seconds": 900,
  "message": "Falls ein Konto mit dieser E-Mail existiert, wurde ein Code versendet."
}
```

---

### Passwort zurücksetzen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/password/reset` |
| **Frontend** | `apps/web/src/pages/dashboard/script.js` |

**Request Body:**
```json
{
  "email": "string",
  "code": "string",
  "new_password": "string"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Passwort erfolgreich zurückgesetzt"
}
```

---

## Einnahmen & Ausgaben

### Einnahmen laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/income-entries` |
| **Query-Parameter** | `?bank_account_id=<id>` (optional) |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `loadIncomeEntries()` |

**Response:**
```json
{
  "ok": true,
  "entries": [
    {
      "id": "string",
      "user_id": "string",
      "bank_account_id": "string",
      "source": "string",
      "amount": 1500.00,
      "category": "Gehalt",
      "recurrence": "monthly",
      "is_active": true,
      "received_at": "2026-01-15T00:00:00.000Z",
      "created_at": "2026-01-01T12:00:00.000Z",
      "note": "string (optional)"
    }
  ]
}
```

---

### Einnahme erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/income-entries` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleCreateIncome()` |

**Request Body:**
```json
{
  "source": "string",
  "amount": 1500.00,
  "category": "Gehalt",
  "recurrence": "monthly",
  "is_active": true,
  "received_at": "2026-01-15T00:00:00.000Z (optional)",
  "note": "string (optional)",
  "bank_account_id": "string (optional)"
}
```

**Response:**
```json
{
  "ok": true,
  "entry": { "...Einnahme-Objekt..." }
}
```

---

### Einnahme bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/income-entries/:id` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleUpdateIncome()` |

**Request Body (nur geänderte Felder):**
```json
{
  "source": "string",
  "amount": 2000.00,
  "category": "Freelance"
}
```

**Response:**
```json
{
  "ok": true,
  "entry": { "...aktualisiertes Einnahme-Objekt..." }
}
```

---

### Einnahme löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/income-entries/:id` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleDeleteIncome()` |

**Response:**
```json
{
  "ok": true
}
```

---

### Ausgaben laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/expense-entries` |
| **Query-Parameter** | `?bank_account_id=<id>` (optional) |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `loadExpenseEntries()` |

**Response:**
```json
{
  "ok": true,
  "entries": [
    {
      "id": "string",
      "user_id": "string",
      "bank_account_id": "string",
      "source": "string",
      "amount": 50.00,
      "category": "Lebensmittel",
      "recurrence": "once",
      "is_active": true,
      "spent_at": "2026-01-20T00:00:00.000Z",
      "created_at": "2026-01-20T12:00:00.000Z",
      "note": "string (optional)"
    }
  ]
}
```

---

### Ausgabe erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/expense-entries` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleCreateExpense()` |

**Request Body:**
```json
{
  "source": "string",
  "amount": 50.00,
  "category": "Lebensmittel",
  "recurrence": "once",
  "is_active": true,
  "spent_at": "2026-01-20T00:00:00.000Z (optional)",
  "note": "string (optional)",
  "bank_account_id": "string (optional)"
}
```

**Response:**
```json
{
  "ok": true,
  "entry": { "...Ausgabe-Objekt..." }
}
```

---

### Ausgabe bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/expense-entries/:id` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleUpdateExpense()` |

**Request Body (nur geänderte Felder):**
```json
{
  "amount": 75.00,
  "note": "Wocheneinkauf"
}
```

**Response:**
```json
{
  "ok": true,
  "entry": { "...aktualisiertes Ausgabe-Objekt..." }
}
```

---

### Ausgabe löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/expense-entries/:id` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleDeleteExpense()` |

**Response:**
```json
{
  "ok": true
}
```

---

### Transaktionen laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/transactions` |
| **Query-Parameter** | `?bank_account_id=<id>` (optional), `?limit=<n>` (optional, Standard 50, max 200), `?cursor=<opaque>` (optional, für Pagination), `?category=<string>` (optional, case-insensitiv) |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `loadTransactions()` |

Gibt kombinierte Transaktionen des Nutzers (Einnahmen und Ausgaben) chronologisch sortiert zurück.

**Response:**
```json
{
  "ok": true,
  "entries": [
    {
      "type": "income",
      "id": "string",
      "source": "Gehalt",
      "category": "salary",
      "amount": 3500.00,
      "recurrence": "monthly",
      "is_active": true,
      "note": "",
      "received_at": "2026-05-01T08:00:00.000Z"
    },
    {
      "type": "expense",
      "id": "string",
      "source": "Miete",
      "category": "rent",
      "amount": 1200.00,
      "recurrence": "monthly",
      "is_active": true,
      "note": "",
      "spent_at": "2026-05-03T08:00:00.000Z"
    }
  ],
  "next_cursor": "string (optional, für nächste Seite)"
}
```

---

## Kategorien

### Kategorien laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/categories` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `loadUserCategories()` |

**Response:**
```json
{
  "ok": true,
  "income": [
    { "category": "Gehalt", "count": 5 }
  ],
  "expense": [
    { "category": "Lebensmittel", "count": 12 }
  ]
}
```

---

### Kategorie löschen (mit Ersetzung)

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/categories` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `handleDeleteCategory()` |

**Request Body:**
```json
{
  "kind": "income | expense",
  "category": "Alte Kategorie",
  "replace_with": "Neue Kategorie"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Bankkonten

### Alle Bankkonten laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/bank-accounts` |
| **Frontend** | `apps/web/src/pages/accounts/app.js`, `apps/web/src/pages/dashboard/dashboard-api.js` |

**Response:**
```json
{
  "ok": true,
  "accounts": [
    {
      "id": "string",
      "user_id": "string",
      "label": "Girokonto",
      "balance": 5000.00,
      "created_at": "ISO8601"
    }
  ]
}
```

---

### Bankkonto erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/bank-accounts` |
| **Frontend** | `apps/web/src/pages/accounts/app.js` |

**Request Body:**
```json
{
  "label": "Sparkonto"
}
```

**Response:**
```json
{
  "ok": true,
  "account": {
    "id": "string",
    "user_id": "string",
    "label": "Sparkonto",
    "balance": 0,
    "created_at": "ISO8601"
  }
}
```

---

### Bankkonto bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/bank-accounts/:id` |
| **Frontend** | `apps/web/src/pages/accounts/app.js` |

**Request Body:**
```json
{
  "label": "Neuer Name (optional)",
  "balance": 10000.00
}
```

**Response:**
```json
{
  "ok": true,
  "account": { "...aktualisiertes Konto-Objekt..." }
}
```

---

### Bankkonto löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/bank-accounts/:id` |
| **Frontend** | `apps/web/src/pages/accounts/app.js` |

**Request Body (optional):**
```json
{
  "transfer_to_id": "string (ID eines anderen Kontos zum Übertragen der Einträge)"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

## Depotkonten

### Alle Depotkonten laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/share-accounts` |
| **Frontend** | `apps/web/src/pages/stocks/state-api.js`, `apps/web/src/pages/accounts/app.js` |

**Response:**
```json
{
  "ok": true,
  "accounts": [
    {
      "id": "string",
      "user_id": "string",
      "label": "Trade Republic",
      "created_at": "ISO8601"
    }
  ]
}
```

---

### Depotkonto erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/share-accounts` |
| **Frontend** | `apps/web/src/pages/accounts/app.js` |

**Request Body:**
```json
{
  "label": "Scalable Capital"
}
```

**Response:**
```json
{
  "ok": true,
  "account": { "...Depotkonto-Objekt..." }
}
```

---

### Depotkonto bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/share-accounts/:id` |
| **Frontend** | `apps/web/src/pages/accounts/app.js` |

**Request Body:**
```json
{
  "label": "Neuer Name"
}
```

**Response:**
```json
{
  "ok": true,
  "account": { "...aktualisiertes Depotkonto-Objekt..." }
}
```

---

### Depotkonto löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/share-accounts/:id` |
| **Frontend** | `apps/web/src/pages/accounts/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Positionen laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/positions` |
| **Query-Parameter** | `?share_account_id=<id>` (optional) |
| **Frontend** | `apps/web/src/pages/stocks/state-api.js` → `fnLoadPositions()` |

**Response:**
```json
{
  "ok": true,
  "positions": [
    {
      "symbol": "AAPL",
      "amount": 10,
      "created_at": "ISO8601",
      "worth_when_bought": 1500.00
    }
  ]
}
```

---

## Aktien & Marktdaten

### Aktien suchen

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/stocks/search` |
| **Query-Parameter** | `?q=<Suchbegriff>&exchange=<Börse>&asset_class=<stock|etf>&limit=<Anzahl>` |
| **Frontend** | `apps/web/src/pages/stocks/state-api.js` → `fnSearchStocksViaBackend()` |

**Response:**
```json
{
  "ok": true,
  "results": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "exchange": "NASDAQ",
      "country": "US",
      "currency": "USD"
    }
  ]
}
```

---

### Aktien-Logo abrufen

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/stocks/logo` |
| **Query-Parameter** | `?symbol=<Symbol>&exchange=<Börse>&theme=<light|dark>&size=<Pixel>` |
| **Frontend** | `apps/web/src/pages/stocks/state-api.js` → `fnBuildStockLogoUrl()` |

**Response:** Binärdatei (PNG/SVG Logo)

---

### Twelve Data Proxy

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/twelvedata/*` |
| **Frontend** | `apps/web/src/pages/stocks/state-api.js` → `fnTdFetch()` |

Leitet Anfragen an die Twelve Data API weiter. Alle Twelve Data Endpunkte sind über diesen Proxy erreichbar (z.B. `/api/twelvedata/time_series`, `/api/twelvedata/quote`).

**Response:** Direkte Weiterleitung der Twelve Data API-Antwort.

---

## Budgets

### Alle Budgets laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/budgets` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` |

**Response:**
```json
{
  "ok": true,
  "budgets": [
    {
      "id": "string",
      "category": "Lebensmittel",
      "target_amount": 500.00,
      "current_amount": 120.00,
      "reset_date": "ISO8601 | null",
      "created_at": "ISO8601"
    }
  ]
}
```

---

### Budget erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/budgets` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` |

**Request Body:**
```json
{
  "category": "Lebensmittel",
  "target_amount": 500.00
}
```

**Response (Erfolg, HTTP 201):**
```json
{
  "ok": true,
  "budget": {
    "id": "string",
    "category": "Lebensmittel",
    "target_amount": 500.00,
    "current_amount": 0,
    "reset_date": null,
    "created_at": "ISO8601"
  }
}
```

**Response (Fehler — Kategorie bereits vorhanden, HTTP 409):**
```json
{
  "ok": false,
  "message": "Budget fuer diese Kategorie existiert bereits"
}
```

---

### Budget bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/budgets/:id` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` |

**Request Body (nur geänderte Felder):**
```json
{
  "category": "Neue Kategorie (optional)",
  "target_amount": 600.00
}
```

**Response:**
```json
{
  "ok": true,
  "budget": { "...aktualisiertes Budget-Objekt..." }
}
```

---

### Budget löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/budgets/:id` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Budget-Status laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/budgets/status` |
| **Frontend** | `apps/web/src/pages/dashboard/dashboard-api.js` → `loadBudgetStatus()` |

Gibt für jedes Budget des Nutzers den aktuellen Verbrauch des laufenden Monats zurück.

**Response:**
```json
{
  "ok": true,
  "alerts": [
    {
      "budget_id": "string",
      "category": "Lebensmittel",
      "target": 500.00,
      "spent": 420.00,
      "percentage": 84,
      "exceeded": false
    }
  ]
}
```

---

## Gruppen

### Alle Gruppen laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/groups` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true,
  "groups": [
    {
      "id": "string",
      "name": "WG Finanzen",
      "address": "Musterstraße 1",
      "created_by": "string",
      "created_at": "ISO8601",
      "members": [
        { "user_id": "string", "username": "string", "role": "admin" }
      ]
    }
  ]
}
```

---

### Gruppe erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "name": "WG Finanzen",
  "address": "Musterstraße 1 (optional)"
}
```

**Response:**
```json
{
  "ok": true,
  "group": { "...Gruppen-Objekt..." }
}
```

---

### Einzelne Gruppe laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/groups/:groupId` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true,
  "group": { "...vollständiges Gruppen-Objekt mit Mitgliedern, Aktivitäten, etc..." }
}
```

---

### Gruppe löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/groups/:groupId` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Benutzer einladen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/invite` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "username": "string"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Gruppe verlassen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/leave` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Mitglied entfernen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/groups/:groupId/members/:userId` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Mitglied zum Admin befördern

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/members/:userId/promote-admin` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Einladungen abrufen (Inbox)

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/inbox/invitations` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true,
  "invitations": [
    {
      "group_id": "string",
      "group_name": "string",
      "invited_by": "string",
      "invited_at": "ISO8601"
    }
  ]
}
```

---

### Einladung annehmen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/inbox/invitations/:groupId/accept` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Einladung ablehnen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/inbox/invitations/:groupId/deny` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Gruppenaktivität erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/activities` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "info": "Gemeinsamer Einkauf",
  "date": "2026-02-01T00:00:00.000Z (optional)"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Funding erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/funding` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "info": "Sammelkasse (optional)",
  "group_activity_id": "string (optional)"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Spende zu Funding hinzufügen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/funding/:fundingId/donate` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "amount": 25.00
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Gruppenausgabe erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/expenses` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "group_funding_id": "string (optional)",
  "amount": 100.00,
  "info": "Pizza für alle (optional)",
  "due_date": "2026-02-15T00:00:00.000Z (optional)"
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Gruppen-Nachrichten laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/groups/:groupId/messages` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true,
  "messages": [
    {
      "id": "string",
      "user_id": "string",
      "username": "string",
      "message": "Hallo zusammen!",
      "created_at": "ISO8601"
    }
  ]
}
```

---

### Gruppen-Nachricht senden

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/groups/:groupId/messages` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Request Body:**
```json
{
  "message": "Hallo zusammen!"
}
```

**Response:**
```json
{
  "ok": true,
  "message": { "...Nachrichten-Objekt..." }
}
```

---

### Gruppen-Nachricht löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/groups/:groupId/messages/:messageId` |
| **Frontend** | `apps/web/src/pages/groups/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

## Fragen & Antworten

### Alle Fragen laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/questions` |
| **Query-Parameter** | `?search=<Suchbegriff>` (optional) |
| **Frontend** | `apps/web/src/pages/questions/app.js` → `loadQuestions()` |

**Response:**
```json
{
  "ok": true,
  "questions": [
    {
      "id": "string",
      "thema": "ETF Sparplan",
      "message": "Welchen ETF empfehlt ihr?",
      "author_username": "string",
      "created_at": "ISO8601",
      "answers_count": 3,
      "liked_by_me": false,
      "likes_count": 5,
      "can_edit": true
    }
  ]
}
```

---

### Frage erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/questions` |
| **Frontend** | `apps/web/src/pages/questions/app.js` → `handleQuestionSubmit()` |

**Request Body:**
```json
{
  "thema": "ETF Sparplan",
  "message": "Welchen ETF empfehlt ihr für langfristiges Investieren?"
}
```

**Response:**
```json
{
  "ok": true,
  "question": { "...Frage-Objekt..." }
}
```

---

### Einzelne Frage laden (mit Antworten)

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/questions/:questionId` |
| **Frontend** | `apps/web/src/pages/questions/question.js` → `refreshQuestion()` |

**Response:**
```json
{
  "ok": true,
  "question": {
    "id": "string",
    "thema": "ETF Sparplan",
    "message": "Welchen ETF empfehlt ihr?",
    "author_username": "string",
    "created_at": "ISO8601",
    "likes_count": 5,
    "can_edit": true,
    "answers": [
      {
        "id": "string",
        "message": "MSCI World ist ein guter Anfang.",
        "author_username": "string",
        "likes_count": 2,
        "can_edit": false,
        "created_at": "ISO8601"
      }
    ]
  }
}
```

---

### Frage bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/questions/:questionId` |
| **Frontend** | `apps/web/src/pages/questions/app.js` → `handleQuestionSubmit()` |

**Request Body:**
```json
{
  "thema": "Neues Thema (optional)",
  "message": "Aktualisierte Frage (optional)"
}
```

**Response:**
```json
{
  "ok": true,
  "question": { "...aktualisiertes Frage-Objekt..." }
}
```

---

### Frage löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/questions/:questionId` |
| **Frontend** | `apps/web/src/pages/questions/app.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Frage liken

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/questions/:questionId/like` |
| **Frontend** | `apps/web/src/pages/questions/question.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Antwort erstellen

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/questions/:questionId/answers` |
| **Frontend** | `apps/web/src/pages/questions/question.js` → `handleAnswerSubmit()` |

**Request Body:**
```json
{
  "message": "MSCI World ist ein guter Anfang."
}
```

**Response:**
```json
{
  "ok": true,
  "answer": { "...Antwort-Objekt..." }
}
```

---

### Einzelne Antwort laden

| | |
|---|---|
| **Methode** | `GET` |
| **URL** | `/api/answers/:answerId` |
| **Frontend** | `apps/web/src/pages/questions/question.js` |

**Response:**
```json
{
  "ok": true,
  "answer": {
    "id": "string",
    "message": "string",
    "author_username": "string",
    "likes_count": 2,
    "can_edit": true,
    "created_at": "ISO8601"
  }
}
```

---

### Antwort bearbeiten

| | |
|---|---|
| **Methode** | `PATCH` |
| **URL** | `/api/answers/:answerId` |
| **Frontend** | `apps/web/src/pages/questions/question.js` |

**Request Body:**
```json
{
  "message": "Aktualisierte Antwort"
}
```

**Response:**
```json
{
  "ok": true,
  "answer": { "...aktualisiertes Antwort-Objekt..." }
}
```

---

### Antwort löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/answers/:answerId` |
| **Frontend** | `apps/web/src/pages/questions/question.js` |

**Response:**
```json
{
  "ok": true
}
```

---

### Antwort liken

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/answers/:answerId/like` |
| **Frontend** | `apps/web/src/pages/questions/question.js` |

**Response:**
```json
{
  "ok": true
}
```

---

## Benutzereinstellungen

### Passwort ändern

| | |
|---|---|
| **Methode** | `POST` |
| **URL** | `/api/password/change` |
| **Frontend** | `apps/web/src/pages/settings/app.js` → `initPasswordChange()` |

**Request Body:**
```json
{
  "current_password": "string",
  "new_password": "string"
}
```

**Response (Erfolg):**
```json
{
  "ok": true
}
```

**Response (Fehler):**
```json
{
  "ok": false,
  "message": "Current password is incorrect"
}
```

---

### Profilbild ändern

| | |
|---|---|
| **Methode** | `PUT` |
| **URL** | `/api/user/profile-image` |
| **Frontend** | `apps/web/src/pages/settings/app.js` → `initProfileImageUpload()` |

**Request Body:**
```json
{
  "profileImage": "data:image/png;base64,..."
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### Account löschen

| | |
|---|---|
| **Methode** | `DELETE` |
| **URL** | `/api/user/account` |
| **Frontend** | `apps/web/src/pages/settings/app.js` → `initDeleteAccount()` |

**Response:**
```json
{
  "ok": true
}
```

---

## Übersicht: Frontend-Module und ihre API-Dateien

| Frontend-Modul | Hauptdatei für API-Aufrufe | Beschreibung |
|---|---|---|
| Homepage | `apps/web/src/pages/homepage/app.js` | Startseite |
| Auth (Login/Register/Passwort) | `apps/web/src/pages/dashboard/script.js` | Login, Registrierung, Verifizierung, Passwort vergessen/zurücksetzen |
| Shared (Session) | `apps/web/src/shared/js/session-utils.js` | Session-Check, Logout |
| Dashboard | `apps/web/src/pages/dashboard/dashboard-api.js` | Einnahmen, Ausgaben, Transaktionen, Kategorien, Budgets |
| Aktien | `apps/web/src/pages/stocks/state-api.js` | Positionen, Aktiendaten, Depots |
| Gruppen | `apps/web/src/pages/groups/app.js` | Gruppenverwaltung, Chat, Funding |
| Fragen | `apps/web/src/pages/questions/app.js`, `question.js` | Q&A Forum |
| Konten | `apps/web/src/pages/accounts/app.js` | Bank-/Depotkontoverwaltung |
| Einstellungen | `apps/web/src/pages/settings/app.js` | Passwort ändern, Profilbild, Account löschen |
