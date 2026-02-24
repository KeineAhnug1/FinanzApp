# Uebersicht Modul 📊🏠✨

Frontend fuer Login/Registrierung + Dashboard.

## Enthaltene Features ✅
- Login + Registrierung + E-Mail-Verifizierung 🔐📧
- Profilmenü mit Logout 👤
- Einstellungen (Währung, Locale, Startbereich, Wiederholungen) ⚙️
- Einnahmen/Ausgaben CRUD 💸
- Wiederholungen (`once`, `weekly`, `monthly`) 🔁
- Kategorien (Preset + eigene) 🏷️
- Listenansicht `Jahr -> Monat -> Tag` 📅
- Cashflow-Chart (Einnahmen/Ausgaben/Ersparnis) 📈

## Starten ▶️
Vom Projekt-Root:
```bash
npm run web:start
```

App:
- `http://localhost:3000/`
- `http://localhost:3000/dashboard.html`

DB:
- Standard: `MONGODB_DB_V4` oder `${MONGODB_DB}_v4` 🗄️

## Wichtige Dateien 📁
- `backend/server.mjs`
- `uebersicht/index.html`
- `uebersicht/script.js`
- `uebersicht/dashboard.html`
- `uebersicht/dashboard.css`
- `uebersicht/js/dashboard/bootstrap.js`

## Script-Reihenfolge in `dashboard.html` 🧠
Zuerst shared:
1. `/shared/js/theme-utils.js`
2. `/shared/js/session-utils.js`
3. `/shared/js/language-utils.js`
4. `/shared/js/currency-utils.js`

Dann Dashboard:
1. `core/state.js`
2. `core/runtime.js`
3. `ui/helpers.js`
4. `categories/categories-controls.js`
5. `overview/overview-cashflow.js`
6. `profile/profile-menu.js`
7. `settings/settings-menu.js`
8. `api/api-client.js`
9. `interactions/modal.js`
10. `interactions/income.js`
11. `interactions/expense.js`
12. `interactions/categories-search.js`
13. `bootstrap.js`

## Datenstruktur (aktueller Stand) 🧭🗂️
![Aktuelle Datenstruktur](../Datastructure.png)
