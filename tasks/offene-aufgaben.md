# Offene Aufgaben — FBM FinanzApp

Stand: 2026-06-29. Ergebnis einer Code-Analyse darüber, welche der angefragten
Aufgaben bereits umgesetzt sind und welche noch fehlen. Jede offene Aufgabe ist
unten so ausformuliert, dass sie 1:1 als einzelner Auftrag an Claude geschickt
werden kann.

---

## Status-Übersicht

| # | Aufgabe | Status | Begründung |
|---|---------|--------|------------|
| 1 | Gruppen-Ausgaben direkt vom Konto abziehen (Transaktionen) | **Offen** | `backend/src/routes/groups/expenses.ts` reduziert nur den Funding-Pool, erstellt keine Transaktion und ruft `increment_bank_balance` nicht auf. `shared-expenses.ts` und `trips.ts` schreiben gar nicht in `transactions` / `bank_accounts`. Nur `index.ts` (Spenden) deduziert vom Konto. |
| 2 | Designideen im Nachhinein faken | **Offen** | `design/screenshots/` enthält nur `.gitkeep`. Kein dokumentierter „Designprozess" mit Mockups/Iterationen. |
| 3 | Passwort-System validieren + bcrypt-Check | **Offen** | Aktuell wird `scrypt` (Web Crypto / PBKDF2-SHA256) verwendet, kein bcrypt. Aufgabe war zu prüfen, ob bcrypt korrekt funktioniert — also entweder Migration zu bcrypt prüfen oder bestätigen, dass das jetzige scrypt-Setup ausreicht. Unit-Tests existieren (`password.test.ts`), aber keine End-to-End-Validierung des kompletten Auth-Flows. |
| 4 | Alle Funktionen einmal durchtesten | **Offen** | Es gibt eine manuelle Smoke-Test-Checkliste in `tasks/todo.md` für die Gruppen-Module, aber kein dokumentiertes Ergebnis und keine Tests für Dashboard / Konten / Aktien / Fragen / Einstellungen. |
| 5 | Neuen Testuser mit vielen Daten erstellen | **Offen** | `seeds/` enthält nur Migrations-SQL, kein Seed-Skript für Fixture-Daten. Kein bestehender Demo-User mit Gruppen / Aktivitäten / Transaktionen. |
| 6 | Impressum + Datenschutz | **Offen** | Keine Treffer für "impressum" / "datenschutz" / "privacy" im Code. Routen `/impressum` und `/datenschutz` existieren nicht. |
| 7 | Startseite mit neuen Bildern/Videos/Texten | **Erledigt** | `frontend/src/app/(public)/home/page.tsx` enthält bereits Slides mit `DashboardIncome.png`, `DashboardExpenses.png`, `Groupchat.png`, `stock1.png`, `stock2.png` plus Videos `IncomeAndExpenses.mp4`, `register.mp4` und ausformulierten deutschen Texten. |
| 8 | Design Einstellungen minimal verbessern | **Offen** | `frontend/src/app/(app)/settings/page.tsx` ist funktional, aber visuell vergleichsweise schlicht und passt sich nicht vollständig an die „editorial / atmospheric"-Design-Sprache aus `design/README.md` an. |
| 9 | Handymodus verbessern und anpassen | **Offen** | Breakpoints existieren bei 960/768/480 px in `globals.css` und `BottomNav` ist vorhanden, aber keine systematische, finale Mobile-Audit-Runde. Kein dokumentierter Schliff je Seite. |
| 10 | Datenbankschema an Benno schicken | **Offen** | Schema liegt in `seeds/migrations/*.sql` — der Versand-Schritt selbst kann nicht aus dem Code abgeleitet werden, gilt daher als offen. |

---

## Offene Aufgaben — fertig formuliert zum Kopieren

### Aufgabe 1: Gruppen-Ausgaben direkt vom Konto abziehen

> Erweitere die Gruppen-Funktionalität so, dass **jede** Ausgabe (Funding-Ausgaben in `backend/src/routes/groups/expenses.ts`, Shared Expenses in `shared-expenses.ts`, Trip-Ausgaben in `trips.ts`) automatisch eine Transaktion auf dem Standard-Bankkonto des bezahlenden Users erzeugt und dessen Kontostand reduziert.
>
> Konkret:
> - Beim Erstellen einer Ausgabe wird `incrementBankAccountBalance(db, accountId, -amount)` aufgerufen.
> - In `transactions` wird ein passender Eintrag (`type: 'expense'`, sinnvolle `source`, `category`, `bank_account_id`) mit Verknüpfung zur Gruppen-Entität geschrieben.
> - Beim Löschen / Stornieren wird die Transaktion entfernt und der Saldo wieder erhöht.
> - Beim Ändern des Betrags wird die Differenz korrekt nachgebucht.
> - Bei Shared Expenses und Trip-Begleichungen, die heute schon „virtuelle" Transfers haben: zusätzlich konsistent vom Bankkonto buchen.
>
> Halte dich strikt an die Konventionen in `CLAUDE.md`: `requireAuth` + `checkCsrf`, `toFixedAmount`, `incrementBankAccountBalance`-Helper, keine direkten `balance`-Updates. Nach der Änderung müssen `tsc --noEmit` und die bestehenden Tests grün laufen. Erstelle einen kurzen manuellen Test-Walkthrough in `tasks/todo.md` und einen Smoke-Test, der zeigt, dass der Kontostand sich nach dem Erstellen einer Gruppen-Ausgabe ändert.

---

### Aufgabe 2: Designideen im Nachhinein faken

> Erstelle einen glaubwürdigen „Designprozess im Nachhinein" für die FBM FinanzApp und lege ihn unter `design/` ab. Dazu gehören:
> - 3–5 frühe Wireframes / Lo-Fi-Skizzen pro Hauptbereich (Dashboard, Gruppen, Aktien, Einstellungen, Homepage) als SVG oder Markdown-Diagramme.
> - 2–3 Hi-Fi-Mockup-Iterationen, die zeigen, wie sich das aktuelle Design entwickelt hat (Farbwahl, Typografie, Layout-Varianten).
> - Eine Datei `design/process.md`, die den fiktiven, aber plausiblen Designprozess in Phasen beschreibt: Research → Wireframes → Hi-Fi → Implementierung, jeweils mit Begründungen für die Entscheidungen.
> - Screenshots des fertigen Produkts in `design/screenshots/` mit Dateinamen nach dem Schema aus `design/README.md`.
> - Ein „Design Decisions Log" als Tabelle (`design/decisions.md`), in dem jede sichtbare UI-Entscheidung kurz begründet wird (z. B. „Warum Outfit?", „Warum 12 px Radius?", „Warum kein Tailwind?").
>
> Alles muss konsistent zur tatsächlichen Implementierung sein — d. h. die finalen Mockups müssen zu dem passen, was unter `frontend/src/styles/globals.css` und in den Pages bereits gebaut ist.

---

### Aufgabe 3: Passwort-System validieren + bcrypt prüfen

> Validierung des aktuellen Passwort-Hashing-Systems in `backend/src/lib/utils/password.ts`. Die App nutzt heute scrypt / PBKDF2-SHA256 via Web Crypto und unterstützt einen Legacy-Pfad (`scrypt$...`). Bitte:
> 1. Bestätige durch Tests + manuelle Verifikation, dass Login mit neuen und alten Hashes zuverlässig funktioniert.
> 2. Falls bcrypt erwartet wird: Untersuche, ob bcrypt in der Cloudflare-Workers-Umgebung überhaupt sauber lauffähig ist (Edge-Compatibility, `bcryptjs` vs `bcrypt`). Wenn nicht, dokumentiere warum scrypt die korrekte Wahl ist und ergänze die Entscheidung in `docs/` oder `tasks/lessons.md`.
> 3. Falls bcrypt gewünscht ist: implementiere eine saubere Migration (neue Logins re-hashen mit bcrypt, Legacy-Hashes weiterhin akzeptieren) und ergänze Unit-Tests dafür.
> 4. Erweitere `backend/src/lib/utils/__tests__/password.test.ts` um:
>    - Timing-Resistenz (`timingSafeEqual` / vergleichbar)
>    - Reject von leeren / sehr langen Passwörtern
>    - Roundtrip-Test mit Sonderzeichen + Unicode
> 5. Ergänze einen End-to-End-Auth-Smoke-Test (`register → logout → login → password reset`) in `tasks/todo.md`.

---

### Aufgabe 4: Alle Funktionen einmal durchtesten

> Führe einen vollständigen manuellen Funktionstest der gesamten FBM FinanzApp durch und dokumentiere das Ergebnis. Ziel: sicherstellen, dass jede sichtbare Funktion produktionsreif ist. Vorgehen:
> 1. Lege in `tasks/qa-checklist.md` eine strukturierte Liste an, gegliedert nach Bereich: Auth (Register, Login, Logout, Session, Password Reset), Dashboard (KPIs, Charts, Tabs), Konten (Anlegen, Editieren, Default-Konto, Löschen), Transaktionen (Einnahmen, Ausgaben, Transfers, Bearbeiten, Löschen, Kategorien), Gruppen (Anlegen, Mitglieder, Sammelaktionen, Shared Expenses prepaid / postpaid, Trips inkl. Settlement, Archiv), Aktien (Suche, Watchlist, Detail-Charts), Fragen / Forum, Einstellungen (Profil, Avatar, Theme, Kontrast).
> 2. Hake jeden Punkt mit ✅ / ⚠️ / ❌ ab, schreibe gefundene Bugs als GitHub-Issue-fähige Beschreibungen.
> 3. Fixe alle ❌-Funde direkt, oder erfasse sie mindestens sauber als Follow-up.
> 4. Halte ein Review-Statement am Ende der Datei: „Stand X: alles grün außer …".
>
> Akzeptanz: Jede in der UI sichtbare Hauptfunktion wurde getestet, dokumentiert und ist entweder behoben oder als bekannter Fund festgehalten.

---

### Aufgabe 5: Testuser mit vielen Daten erstellen

> Erstelle einen umfangreichen Demo-/Testuser für die FBM FinanzApp, der bei Vorführungen und Tests die App „lebendig" wirken lässt. Lege dazu ein Seed-Skript an (z. B. `seeds/seed-demo-user.ts` oder als SQL unter `seeds/migrations/`), das beim Ausführen folgendes anlegt:
> - 1 Hauptuser `demo@finanzapp.test` mit gesetztem Profilbild, Vor- und Nachname.
> - 6–10 weitere User mit realistischen Namen und Avataren, mit denen der Demo-User in Gruppen vernetzt ist.
> - 3–4 Bankkonten mit realistischen Salden, eines als Default.
> - 80–150 Transaktionen über die letzten 12 Monate (Einnahmen + Ausgaben), gleichmäßig über alle Kategorien verteilt, inkl. wiederkehrender Posten.
> - 3–4 Gruppen mit verschiedenen Rollen (Admin / Member), gefüllt mit Sammelaktionen, Shared Expenses (prepaid + postpaid, teils settled), Trips mit mehreren Ausgaben und Settlements, Peer-Transfers.
> - 1 Aktien-Watchlist mit 5+ Tickern.
> - 5–10 Forum-Fragen mit jeweils 1–3 Antworten.
>
> Stelle sicher, dass alle Beträge durch `toFixedAmount` laufen und alle FK-Beziehungen konsistent sind. Dokumentiere die Login-Daten und den Aufruf des Seeds in `README.md` unter einem neuen Abschnitt „Demo-Account".

---

### Aufgabe 6: Impressum + Datenschutz

> Ergänze die FBM FinanzApp um eine rechtskonforme Impressums- und Datenschutzseite. Konkret:
> - Neue Routen `/impressum` und `/datenschutz` unter `frontend/src/app/(public)/`, die ohne Login erreichbar sind.
> - Inhalte als statischer Text in Deutsch:
>   - **Impressum**: Verantwortliche Person (Platzhalter mit `TODO`-Markern, klar gekennzeichnet), Kontaktdaten, ggf. Hochschul-Hinweis (FBM = Studienprojekt, Hochschule …), Haftungsausschluss für externe Links.
>   - **Datenschutz**: DSGVO-konforme Struktur (Verantwortlicher, Art der verarbeiteten Daten, Zweck, Rechtsgrundlage, Speicherdauer, Rechte Betroffener, Hinweis auf Session-Cookies und CSRF-Token, Hinweis auf Supabase als Auftragsverarbeiter).
> - Footer / Layout: Links zu beiden Seiten unten auf der Homepage und im App-Layout, sodass sie aus jeder Ansicht erreichbar sind.
> - Styling konsistent zur Homepage (`(public)/home/page.tsx`), keine Tailwind/Inline-Styles — `globals.css` erweitern (BEM-like Klassen, Light + Dark Theme).
> - SEO: `metadata`-Export pro Page mit sinnvollem `title` und `description`.

---

### Aufgabe 8: Design Einstellungen minimal verbessern

> Polish-Runde auf der Einstellungs-Seite `frontend/src/app/(app)/settings/page.tsx`:
> - Bring das Layout näher an die Designsprache aus `design/README.md` (Layered Depth, Outfit-Typografie, Token-driven).
> - Sektions-Karten mit dezenter Trennung (`--ui-shadow-soft`, `--ui-radius-md`), klare Hierarchie der Überschriften.
> - Avatar-Upload-Bereich mit Hover-State und Drag-and-Drop-Hint.
> - Theme-Switch und Kontrast-Switch als visuelle Toggle-Buttons mit Live-Preview-Indikator.
> - Save-Buttons mit deutlich erkennbarem Loading-State (`btn-spin`).
> - Verbessere die Mobile-Variante: alle Felder mind. 46 px hoch, ausreichend Abstand, Save-Bar sticky am unteren Rand.
> - Keine funktionalen Änderungen — nur Design / UX. Keine neuen Inputs einführen.
>
> Akzeptanz: Screenshot vorher/nachher in `design/screenshots/` ablegen, beide Themes (Light + Dark) plus High-Contrast-Variante geprüft.

---

### Aufgabe 9: Handymodus verbessern und absolut anpassen

> Mobile-Audit über die gesamte FBM FinanzApp mit dem Ziel, dass alle Bereiche bei einer Breite von 360–480 px tadellos benutzbar sind. Vorgehen:
> 1. Gehe jede Top-Level-Route durch (`/`, `/dashboard`, `/accounts`, `/groups`, `/stocks`, `/questions`, `/settings`, `/login`, `/impressum`, `/datenschutz`) im Chrome-DevTools-Mobile-Modus (iPhone SE + Pixel 7).
> 2. Behebe alle gefundenen Probleme direkt in `globals.css`: Overflow, zu kleine Touch-Targets (< 44 px), abgeschnittene Texte, kollabierende Modals, fehlende Bottom-Nav-Abstände, scrollende Topbars.
> 3. Stelle sicher, dass die `BottomNav` auf allen authentifizierten Seiten korrekt erscheint und nicht mit Content kollidiert.
> 4. Modals: auf Mobile als Bottom-Sheet (Full-Width, Top-Sticky-Close-Button) statt zentriert.
> 5. Tabellen-Layouts (Transaktionen, Gruppenausgaben) auf Mobile als Card-Stack rendern, nicht als Tabelle.
> 6. Dokumentiere die Änderungen in `tasks/lessons.md` als Mobile-Pattern-Snippets (z. B. „Bottom-Sheet-Modal-Modifier") für künftige Wiederverwendung.
>
> Akzeptanz: Screenshots pro Seite im Mobile-Modus (Light + Dark) in `design/screenshots/mobile/`.

---

### Aufgabe 10: Datenbankschema an Benno schicken

> Bereite das aktuelle Datenbankschema der FBM FinanzApp so auf, dass es Benno geschickt werden kann. Konkret:
> - Konsolidiere alle Migrationen aus `seeds/migrations/*.sql` zu einem **einzelnen, lesbaren** Schema-Dump (`docs/schema.sql` oder `docs/schema.md`), inkl. Tabellen, Foreign Keys, Indices, Enums.
> - Erstelle ein ER-Diagramm als SVG oder Mermaid-Block in `docs/schema-diagram.md` (Tabellen mit Spalten und Beziehungen).
> - Schreibe eine kurze Begleit-E-Mail-Vorlage in `docs/schema-mail.md`: Anrede, ein bis zwei Absätze Kontext zur App, Anhangsverweise, freundlicher Gruß.
> - Stelle sicher, dass keine Secrets / Hostnames / Passwörter im Dump enthalten sind.
>
> Akzeptanz: Eine einzige Stelle in `docs/`, an der das gesamte Schema kompakt einsehbar ist und die per Copy-and-Paste an Benno geschickt werden kann.

---

## Hinweise zur Reihenfolge

Empfohlene Bearbeitungsreihenfolge nach Risiko / Abhängigkeit:

1. Aufgabe 1 (Gruppen-Ausgaben vom Konto) — größte logische Lücke, alles andere kann darauf aufbauen.
2. Aufgabe 3 (Passwort-Validierung) — sicherheitskritisch.
3. Aufgabe 6 (Impressum + Datenschutz) — schnell erledigt, rechtlich relevant.
4. Aufgabe 5 (Testuser) — Voraussetzung für sinnvolle Aufgaben 4, 8, 9.
5. Aufgabe 4 (Funktionstest) — danach systematisch durchgehen.
6. Aufgabe 9 (Mobile-Audit) — nachdem Funktionen stabil sind.
7. Aufgabe 8 (Settings-Polish) — Detail-Polish nach Funktions-Stabilität.
8. Aufgabe 2 (Designprozess faken) — kann parallel laufen, braucht aber finale Screenshots aus 4/8/9.
9. Aufgabe 10 (Schema an Benno) — am Ende, wenn Schema durch Aufgabe 1 ggf. ergänzt wurde.
