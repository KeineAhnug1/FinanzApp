# FinanzApp 🚀💸📊

Willkommen zur aktuellen Projekt-README 🎯  
Ein zentraler Server steuert alle Module 🧠⚙️

## Module (aktuell) 🧩
- Login: `/` 🔐
- Dashboard: `/dashboard.html` 📈
- Gruppen: `/groups/` 👥
- Aktien: `/aktien/` 📉
- Fragen: `/fragen/` ❓
- Konten: `/konten/` 🏦

## Voraussetzungen ✅
1. Node.js 18+ 🟢
2. Laufende MongoDB (lokal oder Atlas) 🍃
3. `.env` im Projekt-Root 📄

## Installation 📦
```bash
npm install
```

## `.env` Beispiel 🔧
```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster-host>/?appName=FinanzApp"
MONGODB_DB="finanzapp"
MONGODB_DB_V4="finanzapp_v4"

SESSION_TTL_MINUTES="180"
TWELVE_DATA_API_KEY="<dein_key>"
EXCHANGE_RATE_API_KEY="<dein_key>"

SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
EMAIL_CODE_TTL_MINUTES="15"
DEV_EXPOSE_VERIFICATION_CODE="true"
```

## Datenbank vorbereiten 🗄️
```bash
npm run schema:setup
npm run seed:reset
```

Optional:
```bash
npm run seed:family-demo
```

## Starten ▶️
```bash
npm run backend:start
```

Danach:
- `http://localhost:3000/` 🔐
- `http://localhost:3000/dashboard.html` 📊
- `http://localhost:3000/groups/` 👥
- `http://localhost:3000/aktien/` 📉
- `http://localhost:3000/fragen/` ❓
- `http://localhost:3000/konten/` 🏦

## Nützliche Skripte 🛠️
- `npm run backend:start` (zentraler Server) ⚡
- `npm run schema:setup` / `npm run seed:reset` (v4 Standard) 🧱
- `npm run db:check` / `npm run db:wipe` / `npm run data:prepare` 🧪
- Versionierte Datensätze: `*:v2`, `*:v3`, `*:v4` 🧬

## Aktueller Datenstruktur-Stand 🧭🗂️
![Aktuelle Datenstruktur](./Datastructure.png)

## Relevante Struktur 📁
```text
FinanzApp/
  backend/server.mjs
  uebersicht/
  groups/
  aktien/
  fragen/
  konten/
  shared/
  database/
    dataset-v2/
    dataset-v3/
    dataset-v4/
  Datastructure.png
```

## Hinweise 💡
- Standard-Runtime läuft auf **Dataset v4** (`MONGODB_DB_V4` oder `${MONGODB_DB}_v4`) 🧠
- Session-Cookie: `finanzapp_session` 🍪
- Ohne Session Redirect zurück auf `/` 🔁

## Stock API (FastAPI) Dokumentation 📚

Diese API liefert Aktiendetails und historische Kursdaten (via TwelveData) aus einer SQLite-Datenbank.

### Basis-URL
- Produktions-IP: `http://3.225.21.161`

### Authentifizierung
- Header erforderlich: `x-api-key: <STOCK_API_KEY>`
- Bei ungültigem Key: `401 Unauthorized`

### Relevante Umgebungsvariablen
```env
STOCK_API_KEY="<api_key_for_clients>"
TWELVE_API_KEY_1="<twelvedata_key_primary>"
TWELVE_API_KEY_2="<twelvedata_key_secondary>"
```

Hinweise:
- In der gezeigten Implementierung ist der Datenbankpfad fest auf `/home/ubuntu/data/stocks.db` gesetzt.
- Der in Nachrichten geteilte Server-Login/Passwort-Text sollte nicht in Repository-Dateien versioniert werden.

### Endpunkte

1. Healthcheck
- `GET /`
- Antwort:
```json
{"status":"running"}
```

2. Stock Lookup
- `GET /stock/{query}?exchange={EXCHANGE}`
- Beispiel:
```bash
curl -H "x-api-key: <STOCK_API_KEY>" \
  "http://3.225.21.161/stock/AAPL?exchange=NASDAQ"
```
- Verhalten:
  - Sucht Aktie über `symbol + exchange` in `stocks`-Tabelle.
  - Lädt historische Tagesdaten (`1day`, aufsteigend) von TwelveData.
  - Nutzt zwei API Keys als Fallback bei Quota/Fehlern.

3. Suche
- `GET /search?q={TEXT}&exchange={EXCHANGE}`
- Beispiel:
```bash
curl -H "x-api-key: <STOCK_API_KEY>" \
  "http://3.225.21.161/search?q=Apple&exchange=NASDAQ"
```
- Antwort: Liste von Treffern mit `symbol`, `name`, `exchange`, `country` (max. 20).

### Typische Fehlerantworten
- `401`: Ungültiger oder fehlender API Key
- `{"error":"stock symbol ... not found on exchange ..."}`: Symbol nicht vorhanden
- `{"error":"historical price data unavailable"}`: Keine Historie von TwelveData verfügbar

### Beispielstruktur einer erfolgreichen `/stock`-Antwort
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc",
  "exchange": "NASDAQ",
  "currency": "USD",
  "data_available": true,
  "historical": [
    {
      "date": "2026-02-20",
      "open": 182.11,
      "high": 184.02,
      "low": 181.55,
      "close": 183.76,
      "volume": 51234567
    }
  ]
}
```
