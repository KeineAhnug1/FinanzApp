# FEHLEND.md — Lückenanalyse für Bewertung

Basierend auf einer vollständigen Code-Review des Projekts. Status: ✅ vorhanden · ⚠️ teilweise · ❌ fehlt

---

## UI / HTML (bis 1 Punkt)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Korrekte HTML-Semantik | ✅ | `<header>`, `<main>`, `<section>`, `<nav>`, `<footer>`, `<article>`, `<aside>` werden genutzt |
| HTML5-Landmark-Elemente | ✅ | Durchgehend in allen Seiten vorhanden |
| **Punkteabzug-Risiko** | — | Kein dediziertes `<aside>` für sekundäre Inhalte auf Dashboard; keine `<figure>`/`<figcaption>` bei Charts |

**Empfehlung:** Charts (`Chart.js`) in `<figure>` mit `<figcaption>` wrappen.

---

## A11y (bis 2 Punkte)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Semantische HTML-Elemente | ✅ | Vollständig |
| Korrekte Headline-Hierarchie (h1–h6) | ⚠️ | Muss geprüft werden — mehrere Seiten könnten fehlendes `<h1>` oder übersprungene Ebenen haben |
| Lighthouse-Fehler | ⚠️ | **Nicht getestet** — kein Nachweis vorhanden |
| Lesbarkeit (Font-Size, Kontrast) | ✅ | High-Contrast-Modus + CSS-Variablen; trotzdem Lighthouse-Check notwendig |
| `aria-*` Attribute | ✅ | `role="dialog"`, `aria-modal`, `aria-label`, `aria-live="polite"`, `aria-current`, `aria-expanded` vorhanden |
| Tabbing-Navigation | ⚠️ | CSS vorhanden (`focus-visible`), aber keine durchgängige manuelle Prüfung belegt |
| Vollständige Keyboard-Bedienung | ⚠️ | Modals, Dropdowns, Custom-Tabs müssen per Keyboard schließbar/bedienbar sein (Enter, Escape, Pfeiltasten) |

**❌ FEHLEND / TODO:**
1. **Lighthouse-Audit auf jeder Seite durchführen** und Screenshots als Nachweis speichern
2. Jede Seite manuell auf fehlende `<h1>` prüfen (besonders `dashboard.html`, `stocks/index.html`)
3. Keyboard-Navigation vollständig testen: alle Modals per `Escape` schließbar, alle interaktiven Elemente per `Tab` erreichbar und per `Enter`/`Space` auslösbar
4. `aria-describedby` für Formularfelder mit Fehlermeldungen ergänzen

---

## Design (bis 3 Punkte)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Verständliches Design | ✅ | KPI-Cards, klare Navigation, konsistentes Layout |
| Verlinkungen ersichtlich | ✅ | Topbar-Navigation mit Icons + Labels |
| Interaktive Elemente mit Hover-Hint | ✅ | CSS hover-states vorhanden; Tooltips partiell |
| Bekannte Design-Muster | ✅ | Dashboard, Modal, Tabs, Cards — alle etablierte Muster |
| **Design Files (Figma o.ä.)** | ❌ | **FEHLT KOMPLETT** |
| Herausstechendes Design | ✅ | Glassmorphism, Dark Mode, Outfit-Font, konsistente Farbpalette |

**❌ FEHLEND / TODO:**
1. **Figma-File oder äquivalente Design-Dokumentation erstellen** (mindestens Farbpalette, Komponenten-Übersicht, ggf. Screenshots in einem `/design/`-Ordner)
   - Alternativ: Exportierte PNG/SVG Mockups in `/design/mockups/` ablegen
   - Minimal: Ein Figma-Link in der README + ein paar Screenshots

---

## Umsetzung (bis 3 Punkte)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Zielumsetzung allgemein | ✅ | Finance-App vollständig funktional |
| Grobe Funktionalität umgesetzt (POC+) | ✅ | Income/Expenses, Stocks, Groups, Q&A, Settings — weit über POC |
| Mehr als erwartet | ✅ | KI-Forum, Stocks-API, Gruppen-Chat, Kategorien, Budget-Alerts |
| Abgerundetes Produkt ("Clean") | ⚠️ | Kein Custom 404-HTML, keine Offline-Seite, manche Edge Cases unklar |

**❌ FEHLEND / TODO:**
1. **Dedizierte 404-Seite** (`frontend/pages/404/index.html`) erstellen — bei unbekannten Routen anzeigen
2. Leere Zustände (Empty States) prüfen: Was sieht der User, wenn er sich frisch registriert und noch keine Daten hat? Placeholder-Inhalte oder Onboarding-Hinweise fehlen ggf.

---

## Diverses UI (je 1 Punkt)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Animationen | ✅ | `reveal-up`, `toast-in/out`, `sheet-in`, `modal-card-in`, Homepage-Animationen |
| **404 / Error-Seiten** | ❌ | **FEHLT** — nur JSON-Response vom Backend; keine HTML-Fehlerseite |
| Fehlerzustände in Eingaben | ✅ | Inline-Validierung in Formularen vorhanden |
| Originalität der App-Idee | ✅ | Kombination aus Finance-Tracker + Stocks + Gruppen + KI-Forum ist originell |

**❌ FEHLEND / TODO:**
1. **HTML 404-Seite** bauen (1 Seite, ~30 Minuten Aufwand, 1 ganzer Punkt)

---

## CSS (bis 2 Punkte)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Keine CSS-Anomalien (Junior) | ✅ | |
| Flexbox / CSS-Grid (Intermediate) | ✅ | Durchgehend genutzt |
| CSS-Variablen (Intermediate) | ✅ | Umfangreiches Design-Token-System in `unified-ui.css` |
| SCSS o.ä. | ❌ | Nur plain CSS — kein SCSS/LESS/PostCSS |

**⚠️ Hinweis:** SCSS fehlt, aber das ist kein Pflichtkriterium für Intermediate-Punkte — CSS-Variablen + Grid/Flex reichen.

---

## JavaScript Frontend (bis 3 Punkte)

| Kriterium | Status | Anmerkung |
|---|---|---|
| JavaScript vorhanden (Junior) | ✅ | |
| Struktur erkennbar (Intermediate) | ✅ | Modulare Dateistruktur, klare Trennung |
| Wiederverwendbare Funktionen in eigener Datei (Intermediate) | ✅ | `api-client.js`, `currency-utils.js`, `html-utils.js`, `theme-utils.js` etc. |
| Senior-Level Code | ⚠️ | Code ist strukturiert und sauber, aber kein Framework, keine State-Management-Architektur |

**⚠️ Empfehlung:** Code ist Intermediate-bis-Senior-Niveau für Vanilla JS. Kein Risiko hier, aber Framework-Nutzung (React/Vue) würde einen Extrapunkt geben (siehe Diverses).

---

## Backend (bis 3 Punkte)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Simples Backend (Junior) | ✅ | |
| Validierung + Fehlermeldungen (Intermediate) | ✅ | `data.mjs`, `responses.mjs`, HTTP-Statuscodes |
| Komplexes System + Festigkeit (Senior) | ✅ | CSRF, Scrypt-Passwörter, Rate-Limiting, Sessions, Email-Verification |

**Kein Handlungsbedarf — Backend ist stark.**

---

## Diverses Code (je 1 Punkt)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Bibliothek (React / Vue / Angular) | ❌ | **FEHLT** — Vanilla JS; Chart.js zählt nicht als Framework |
| Browser-API: Canvas | ✅ | Settings-Avatar-Upload + Chart.js |
| Browser-API: localStorage | ✅ | Theme, Sprache, Präferenzen |
| Projekt lokal startbar (nach README) | ✅ | `npm run dev` dokumentiert |
| **Docker** | ❌ | **FEHLT** — kein Dockerfile, kein docker-compose |
| **TypeScript** | ✅ | `tsconfig.json` strict mode, JSDoc-Types im Frontend |
| **Linter/Formatter** | ❌ | **FEHLT** — kein ESLint, kein Prettier |
| Testing | ❌ | **FEHLT** — keine Unit- / Integration- / E2E-Tests |
| Mobil nutzbar | ⚠️ | Responsive CSS vorhanden, aber nicht explizit getestet/dokumentiert |

**❌ FEHLEND / TODO (nach Aufwand sortiert):**

1. **ESLint + Prettier einrichten** (~30 Min, 1 Punkt)
   ```bash
   npm install -D eslint prettier eslint-config-prettier
   # .eslintrc.json + .prettierrc anlegen
   ```

2. **Docker** (~1–2 Std, 1 Punkt)
   - `Dockerfile` für Backend + `docker-compose.yml` für Backend + PostgreSQL
   - README-Eintrag: `docker-compose up`

3. **React/Vue** — hoher Aufwand, bestehende Seiten umschreiben — **nur wenn Zeit vorhanden**

4. **Tests** — mindestens 2–3 Smoke-Tests mit Vitest für Backend-Utilities (`data.mjs`, `password.mjs`) würden zeigen, dass Testing verstanden wurde

---

## Sonstiges (je 1 Punkt)

| Kriterium | Status | Anmerkung |
|---|---|---|
| Extra-Punkt Ästhetik | ✅ | Dark Mode, Glassmorphism, Outfit-Font, konsistente Tokens — stark |
| Originalität | ✅ | KI-Integration + Finance ist originell |

---

## Zusammenfassung: Offene Quick-Wins

Sortiert nach **Aufwand vs. Ertrag:**

| Priorität | Aufgabe | Aufwand | Punkte-Risiko |
|---|---|---|---|
| 🔴 Hoch | Figma / Design-Mockups erstellen | 1–2 Std | 1 Punkt Design |
| 🔴 Hoch | HTML 404-Seite bauen | 30 Min | 1 Punkt Diverses |
| 🔴 Hoch | Lighthouse-Audit durchführen (alle Seiten) | 30 Min | bis 1 Punkt A11y |
| 🟡 Mittel | ESLint + Prettier konfigurieren | 30 Min | 1 Punkt Diverses |
| 🟡 Mittel | Docker (Dockerfile + docker-compose) | 1–2 Std | 1 Punkt Diverses |
| 🟡 Mittel | Keyboard-Navigation vollständig testen | 1 Std | bis 1 Punkt A11y |
| 🟢 Niedrig | Charts in `<figure>` wrappen | 10 Min | HTML-Qualität |
| 🟢 Niedrig | Leere Zustände / Onboarding-Hinweise | 1–2 Std | "Clean"-Eindruck |
| 🟢 Niedrig | 2–3 Vitest Unit-Tests für Backend | 1 Std | Testing-Punkt |
