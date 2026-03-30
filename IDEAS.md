# FinanzApp – Erweiterungsideen

## Finanzen & Tracking

### Budgetplaner
Monatliche Budgetobergrenzen pro Kategorie setzen. Visuelle Warnung wenn 80 % / 100 % erreicht wird.
Die `budgets`-Collection ist im Datenbankschema bereits angelegt — es fehlen API-Endpunkte und UI.

### Wiederkehrende Transaktionen automatisch buchen
Einträge mit `cycle: "monthly"` oder `cycle: "weekly"` sind aktuell nur markiert, werden aber nicht automatisch ausgeführt. Ein serverseitiger Cron-Job könnte fällige Einträge eigenständig als reale Transaktionen buchen.

### Finanzprognose / Forecast
Basierend auf bestehenden monatlichen Einnahmen und Ausgaben eine 3-, 6- oder 12-Monats-Prognose anzeigen — inklusive projiziertem Kontostand.

### Kategorien-Statistiken
Aufschlüsselung der Ausgaben nach Kategorie als Donut-Chart. Aktuell gibt es nur den Cashflow-Überblick, aber keine Kategorienansicht.

### CSV / PDF Export
Einnahmen und Ausgaben als CSV oder PDF exportieren — nützlich für Steuererklärungen und persönliche Archivierung.

---

## Konto & Banking

### Mehrere Bankkonten im Gesamtüberblick
Eine aggregierte Übersicht aller Konten mit Gesamtsaldo auf dem Dashboard. Aktuell werden Konten nur separat verwaltet.

### Überweisungen zwischen eigenen Konten
Geld zwischen eigenen Bankkonten transferieren mit Transaktionsprotokoll.

### Kontoauszug-Ansicht
Chronologische Liste aller Transaktionen eines Kontos — ähnlich einem echten Kontoauszug.

---

## Aktien & Investments

### Portfolio-Performance
Gesamtrendite in % und € anzeigen (Kaufwert vs. aktueller Wert). Aktuell werden Positionen gelistet, aber keine aggregierte Performance berechnet.

### Kurs-Alerts
Benachrichtigung per E-Mail oder In-App, wenn ein Kurs einen definierten Schwellenwert über- oder unterschreitet.

### Dividendentracking
Dividenden als eigene Einnahmequelle erfassen und automatisch mit dem zugehörigen Depot verknüpfen.

### Watchlist
Aktien beobachten ohne sie zu besitzen — mit aktuellem Kurs, Tagesveränderung und persönlichen Notizen.

---

## Gruppen

### Schulden-Ausgleich / Abrechnung
Anzeigen wer wem wie viel schuldet innerhalb einer Gruppe ("Marco schuldet Test 12,50 €") — ähnlich wie Splitwise. Die Datenstruktur für Funding und Participants ist bereits vorhanden.

### Gruppen-Budget
Monatliches Budget pro Gruppe setzen, analog zum persönlichen Budgetplaner.

### Abstimmungen / Polls
Innerhalb einer Gruppe über geplante Ausgaben abstimmen lassen, bevor sie angelegt werden.

---

## Soziales & Community

### Direktnachrichten (DM)
Die `private_messages`-Collection ist im Datenbankschema vorhanden, es fehlen aber alle API-Endpunkte und die gesamte UI.

### In-App-Benachrichtigungen
Benachrichtigungen für: Gruppen-Einladungen, neue Nachrichten, beantwortete Fragen, Kursalarme. Aktuell gibt es nur den Posteingang für Einladungen.

### Nutzerprofilseite
Öffentliches Profil mit anzeigbaren Statistiken (Anzahl Fragen/Antworten, Mitglied seit, etc.).

---

## Sicherheit & Account

### Passwort ändern
Aktuell gibt es keinen Endpunkt zum Ändern des Passworts. Nutzer können ihr Passwort nur über einen Reset-Flow aktualisieren — der ebenfalls noch fehlt.

### Passwort vergessen / Reset per E-Mail
Der E-Mail-Versand via Nodemailer existiert bereits für Verifizierungscodes — ein Reset-Flow wäre damit schnell umsetzbar.

### Account löschen
Kein Endpunkt zur Account-Löschung vorhanden. Relevant für DSGVO-Konformität.

### 2-Faktor-Authentifizierung (2FA)
TOTP per Authenticator-App (z. B. Google Authenticator oder Authy). Besonders sinnvoll für eine Finanz-App.

### Login-Verlauf
Anzeige der letzten Logins mit IP-Adresse, Gerät und Zeitstempel.

---

## Technisch / Infrastruktur

### Rate Limiting auf Login-Endpoint
Aktuell keine Brute-Force-Absicherung vorhanden. Exponentielles Backoff oder Account-Sperrung nach N Fehlversuchen.

### Async Passwort-Hashing
`scryptSync` blockiert den Node.js Event Loop. Sollte auf die asynchrone `scrypt`-Variante umgestellt werden.

### Redis Session Store
Der aktuelle Session-Store ist ein In-Memory `Map` — bei Serverneustart gehen alle aktiven Sessions verloren. Redis würde Persistenz und horizontale Skalierbarkeit ermöglichen.

### Private Messages API
Die Collection ist in der DB angelegt, es fehlen jedoch alle Endpunkte und die UI vollständig.
