# Uebersicht Modul

Dieser Ordner enthaelt das Frontend und den Server fuer Login/Registrierung und das Finanz-Dashboard.

## Handover (Current State)

Wenn ein neuer Chat aufgesetzt wird, sind diese Punkte bereits umgesetzt:

- Login + Registrierung + E-Mail-Verifizierung (Code per Mail) ueber `server.js`
- Dashboard-Frontend in klar getrennte Bereiche aufgeteilt (kein Monolith)
- Profil-Menue mit Abmelden
- Einstellungs-Menue (Waehrung, Locale, Startbereich, Default-Wiederholung)
- Einnahmen/Ausgaben CRUD inkl. Bearbeiten und Loeschen
- Wiederholungen (`once`, `weekly`, `monthly`) inkl. aktiv/pausiert
- Kategorien: Presets + eigene Kategorien + persistente Speicherung + Loeschen
- Listenansicht mit Suche und Hierarchie `Jahr -> Monat -> Tag`
- Cashflow-Chart als Liniengraph:
  - Einnahmen, Ausgaben, Erspartes
  - horizontales Scrollen innerhalb des Chart-Blocks
  - Y-Achse mit Geldskala
  - Hover-Tooltip mit Monatswerten

Wichtige Einstiegsdateien fuer neue Chats:

- `uebersicht/server.js` (Backend/API)
- `uebersicht/dashboard.html` (Dashboard Layout + Script-Reihenfolge)
- `uebersicht/dashboard.css` (Dashboard Design)
- `uebersicht/js/dashboard/bootstrap.js` (Startup-Ablauf)

## Starten

```bash
npm run web:start
```

Danach ist die App unter `http://localhost:3000` erreichbar.

## Struktur

```text
uebersicht/
├── server.js                  # HTTP-Server + API-Endpunkte + statische Dateien
├── index.html                 # Login/Registrierung
├── script.js                  # Login/Registrierung Logik
├── style.css                  # Login/Registrierung Styles
├── dashboard.html             # Dashboard Seite (nach Login)
├── dashboard.css              # Dashboard Styles
└── js/
    └── dashboard/
        ├── core/
        │   ├── state.js       # Globaler State + Konstanten
        │   └── runtime.js     # Theme, View, Session, Settings-Storage
        ├── ui/
        │   └── helpers.js     # Formatter + kleine DOM-Helfer
        ├── categories/
        │   └── categories-controls.js # Kategorien-Logik + Auswahl-Rendering
        ├── overview/
        │   └── overview-cashflow.js   # KPI, Verlauf, Chart, Listen-Rendering
        ├── profile/
        │   └── profile-menu.js # Profilmenu + Abmelden
        ├── settings/
        │   └── settings-menu.js # Einstellungsmenue
        ├── api/
        │   └── api-client.js   # API-Aufrufe + Form-Mode Helper
        ├── interactions/
        │   ├── modal.js       # Bestaetigungsdialog
        │   ├── income.js      # Einnahmen-Interaktionen
        │   ├── expense.js     # Ausgaben-Interaktionen
        │   └── categories-search.js # Kategorie-Loeschen + Suche
        └── bootstrap.js       # Initialisierung / Startup-Reihenfolge
```

## Dashboard Lade-Reihenfolge

`dashboard.html` bindet die Dateien in dieser festen Reihenfolge ein:

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

Diese Reihenfolge darf nicht geaendert werden, ohne Abhaengigkeiten mitzudenken.

## Entwicklungsregeln

1. Neue Dashboard-Logik immer im passenden Bereich ablegen:
   `interactions/income.js`, `interactions/expense.js`, `profile/profile-menu.js`,
   `settings/settings-menu.js`, `overview/overview-cashflow.js`,
   `categories/categories-controls.js`, `api/api-client.js`, `core/*`.
2. Beim Hinzufuegen neuer Features `uebersicht/README.md` im selben Commit aktualisieren.
3. Wenn neue API-Endpunkte in `server.js` entstehen, hier kurz dokumentieren.
4. Wenn du neue Dateien/Ordner hinzufuegst, die Struktur oben im README sofort erweitern.

## Letzte Aenderung

- Dateinamen im Dashboard sind jetzt eindeutig (keine mehrfachen `module.js` mehr).
- Cashflow-Graph ist interaktiv:
  Hover auf Monatsbereich zeigt Tooltip mit `Einnahmen`, `Ausgaben` und `Erspart`.
