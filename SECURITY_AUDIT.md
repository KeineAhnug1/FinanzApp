# Sicherheits-Audit: FinanzApp

> Erstellt am: 2026-04-14
> Stand: Entwicklungsphase (nicht produktiv)

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| 🔴 KRITISCH | Echtes Sicherheitsproblem – muss vor Go-Live behoben werden |
| 🟠 HOCH | Echtes Problem oder gefährliches Dev-Feature |
| 🟡 MITTEL | Sicherheitsschwäche, sollte behoben werden |
| 🟢 LOW | Kleinere Schwäche oder Best-Practice-Abweichung |
| 🔵 DEV | Bewusster Entwicklungs-Kompromiss – **muss vor Production deaktiviert sein** |

---

## Teil 1: Echte Sicherheitsprobleme

Diese Probleme existieren unabhängig vom Entwicklungsmodus und müssen behoben werden.

---

### 🔴 [KRITISCH] .env-Datei ist im Git-Repository eingecheckt

**Datei:** `.env`

Die `.env`-Datei mit allen Secrets wurde ins Repository committed. Jeder mit Zugriff auf das Repo kann diese auslesen.

**Betroffene Secrets:**
- MongoDB-Verbindungsstring inkl. Passwort: `mongodb+srv://Florain:Florian@...`
- `TWELVE_DATA_API_KEY=551db088d29044888daee527fe5da4b1`
- `EXCHANGE_RATE_API_KEY=1c5172636e42fcab56cfd5b7`
- `SMTP_PASS=tfbyicpktwkyhyuo` (Gmail App-Passwort)
- `OPENROUTER_API_KEY=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`
- `LOGO_DEV_API_KEY=pk_cc7CjsbpRVS5D0wUG3UFGQ`

**Was zu tun ist:**
1. `.env` aus dem Git-Index entfernen: `git rm --cached .env`
2. `.env` in `.gitignore` eintragen (überprüfen ob korrekt)
3. **Alle oben genannten Secrets sofort rotieren** (neue Keys generieren, Passwort ändern)
4. Git-History bereinigen (z.B. mit `git filter-repo`)

---

### 🔴 [KRITISCH] Fallback zu Plaintext-Passwortvergleich

**Datei:** `backend/utils/password.mjs`, Zeile 59

Wenn ein gespeichertes Passwort weder als Scrypt noch als SHA256 erkannt wird, wird es als Plaintext verglichen:

```javascript
return plain === stored;  // Plaintext-Vergleich!
```

**Risiko:** Falls die Datenbank kompromittiert ist, sind betroffene Passwörter sofort lesbar. Außerdem ermöglicht `===` Timing-Attacken.

**Fix:** Den Fallback komplett entfernen. Wenn ein Hash-Format unbekannt ist, sollte der Login grundsätzlich scheitern und der Benutzer sein Passwort zurücksetzen müssen.

---

### 🟠 [HOCH] Timing-Angriff beim SHA256-Passwortvergleich

**Datei:** `backend/utils/password.mjs`, Zeile 56

Der Vergleich von SHA256-Hashes verwendet `===` statt `timingSafeEqual`. Das Scrypt-Vergleich verwendet korrekt `timingSafeEqual`, der SHA256-Pfad jedoch nicht:

```javascript
return hashValue(plain) === expectedHash;  // UNSICHER: timing-sensitiv
```

**Risiko:** Ein Angreifer kann durch Messung der Antwortzeit herausfinden, wie viele Zeichen des Hashes korrekt sind.

**Fix:**
```javascript
import { timingSafeEqual } from "node:crypto";
const a = Buffer.from(hashValue(plain));
const b = Buffer.from(expectedHash);
if (a.length !== b.length) return false;
return timingSafeEqual(a, b);
```

---

### 🟠 [HOCH] Legacy SHA256-Hashes werden noch akzeptiert

**Datei:** `backend/utils/password.mjs`, Zeilen 54-56

SHA256 ist für Passwort-Hashing ungeeignet – es ist zu schnell und enthält keinen Salt. Obwohl neue Passwörter mit Scrypt gehasht werden, können sich Benutzer mit alten SHA256-Hashes noch anmelden.

**Risiko:** SHA256-Hashes sind anfällig für Rainbow-Table-Angriffe und GPU-Brute-Force.

**Fix:** Beim nächsten Login automatisch auf Scrypt migrieren (SHA256 validieren, dann mit Scrypt neu hashen und speichern). Danach Legacy-Support entfernen.

---

### 🟠 [HOCH] Fehlerdetails werden an den Client gesendet

**Datei:** `backend/server.mjs`, Zeilen ~3401 und ~3449

Bei Fehlern in den Proxy-Requests werden interne Fehlermeldungen an den Client weitergegeben:

```javascript
catch (error) {
  return sendJson(res, 502, {
    message: "Twelve Data Proxy Anfrage fehlgeschlagen.",
    detail: String(error?.message || error)  // Interne Details!
  });
}
```

Gleiches gilt für den Exchange-Rate-Endpoint.

**Risiko:** Interne Systeminformationen (Stack-Traces, Library-Namen, URLs) können für gezielte Angriffe genutzt werden.

**Fix:** `detail`-Feld in Production entfernen oder nur eine generische Fehlermeldung senden. Details nur ins Server-Log schreiben.

---

### 🟡 [MITTEL] IP-Spoofing beim Rate-Limiting möglich

**Datei:** `backend/server.mjs`, Zeilen 124-130

Wenn `TRUST_PROXY=true`, wird die IP-Adresse aus dem `X-Forwarded-For`-Header gelesen:

```javascript
if (TRUST_PROXY) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
}
```

**Risiko:** Ein Angreifer kann diesen Header manipulieren und damit das IP-basierte Rate-Limiting umgehen.

**Fix:** `TRUST_PROXY` nur aktivieren, wenn wirklich ein vertrauenswürdiger Reverse-Proxy (nginx, Caddy etc.) vorgelagert ist, der den Header setzt und fremde Werte filtert.

---

### 🟡 [MITTEL] Kein Account-Lockout nach fehlgeschlagenen Logins

**Datei:** `backend/server.mjs`, Zeilen ~462-527

Das Rate-Limiting basiert nur auf der IP-Adresse. Ein Angreifer, der verschiedene IPs nutzt (z.B. via Proxy), kann unbegrenzt Login-Versuche gegen ein bestimmtes Konto durchführen.

**Fix:** Nach N fehlgeschlagenen Versuchen das Konto temporär sperren und den Benutzer per Email benachrichtigen.

---

### 🟡 [MITTEL] Session-Timeout zu lang (180 Minuten)

**Datei:** `backend/config/runtime.mjs`, Zeile 11

```javascript
export const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 180);
```

180 Minuten ist für eine Finanz-Applikation zu lang. Eine gestohlene Session bleibt lange gültig.

**Empfehlung:** 30-60 Minuten mit automatischer Verlängerung bei Aktivität.

---

### 🟡 [MITTEL] SameSite=Lax statt Strict bei Session-Cookie

**Datei:** `backend/utils/session-store.mjs`, Zeilen 41-46

```javascript
"SameSite=Lax"  // Sollte für eine Finanz-App Strict sein
```

Mit `Lax` werden Cookies bei Top-Level-Navigation (z.B. Link-Klick von einer fremden Seite) mitgesendet. `Strict` würde das verhindern.

**Fix:** `SameSite=Strict` setzen, sofern keine Login-via-External-Redirect-Flows benötigt werden.

---

### 🟡 [MITTEL] Fehlende Security-Header

**Datei:** `backend/utils/http.mjs`

Folgende wichtige HTTP-Security-Header fehlen:

| Header | Zweck |
|--------|-------|
| `Content-Security-Policy` | Verhindert XSS durch Einschränkung von Script-Quellen |
| `Strict-Transport-Security` | Erzwingt HTTPS (HSTS) |
| `Referrer-Policy` | Verhindert Leak von URLs in Referrer-Header |
| `Permissions-Policy` | Deaktiviert ungenutzte Browser-APIs |

Bereits gesetzt (gut): `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`

---

### 🟡 [MITTEL] Keine Audit-Logs für Login-Versuche

**Datei:** Backend allgemein

Erfolgreiche und fehlgeschlagene Login-Versuche werden nicht geloggt. Im Angriffsfall gibt es keine Möglichkeit, den Vorfall zu rekonstruieren.

**Fix:** Mindestens Timestamp, IP, E-Mail und Ergebnis (Erfolg/Fehler) bei jedem Login-Versuch loggen.

---

### 🟢 [LOW] Verifikationscode hat geringe Entropie

**Datei:** `backend/server.mjs`, Zeile ~354

```javascript
function createVerificationCode() {
  return String(randomInt(100000, 999999));  // Nur 900.000 mögliche Werte
}
```

`randomInt` ist kryptographisch sicher, aber 6 Stellen ergeben nur ~900k Kombinationen. Mit dem 5-Versuchs-Limit ist Brute-Force zwar schwer, aber nicht unmöglich (besonders bei Rate-Limit-Bypass).

**Fix:** Alphanumerischen Code mit mehr Entropie verwenden, z.B. 8-stellig hex.

---

### 🟢 [LOW] Scrypt ohne explizite Parameter

**Datei:** `backend/utils/password.mjs`, Zeile ~18

`scryptSync` wird ohne explizite `N`, `r`, `p`-Parameter aufgerufen (Node.js-Defaults: N=16384, r=8, p=1). Das ist akzeptabel, aber nicht zukunftssicher.

**Empfehlung:** Parameter explizit setzen und in Konfiguration dokumentieren, um spätere Anpassungen zu erleichtern.

---

### 🟢 [LOW] Passwort-Komplexität nicht geprüft

**Datei:** `backend/server.mjs`, Zeilen ~590-591

Nur Mindestlänge (8 Zeichen) wird geprüft. Keine Anforderungen an Komplexität.

Für eine Finanz-App wäre eine Empfehlung zu stärkeren Passwörtern (oder ein Passwort-Stärke-Indikator im Frontend) sinnvoll.

---

## Teil 2: Entwicklungs-Kompromisse

Diese Features sind **bewusst** für die Entwicklung eingebaut, stellen aber **kritische Risiken** dar, wenn sie in Production aktiv sind.

---

### 🔵 [DEV] Automatischer Login ohne Credentials (`DEV_AUTO_LOGIN`)

**Datei:** `backend/server.mjs`, Zeilen ~3806-3822
**Konfiguration:** `backend/config/runtime.mjs`, Zeilen 9-10

```javascript
if (DEV_AUTO_LOGIN) {
  // Loggt automatisch einen vordefinierten Benutzer ein, ohne Passwort
}
```

**Warum es jetzt okay ist:** Beschleunigt die Entwicklung enorm – kein Login-Formular bei jedem Reload.

**Warum es gefährlich ist:** In Production könnten sich alle Benutzer als der konfigurierte Dev-User einloggen.

**Sicherung vor Production:**
- `DEV_AUTO_LOGIN=true` darf in Production-`.env` **nie** gesetzt sein
- Empfehlung: Guard im Code: `if (process.env.NODE_ENV === 'production' && DEV_AUTO_LOGIN) throw new Error("DEV_AUTO_LOGIN in production!")`

---

### 🔵 [DEV] Verifikationscode im Server-Log (`DEV_EXPOSE_VERIFICATION_CODE`)

**Datei:** `backend/server.mjs`, Zeilen ~360-361
**Konfiguration:** `backend/config/runtime.mjs`, Zeile 8

```javascript
if (DEV_EXPOSE_VERIFICATION_CODE) {
  console.warn(`[verification] Code for ${toEmail}: ${code}`);
}
```

**Warum es jetzt okay ist:** Erlaubt die Registrierung ohne echte SMTP-Konfiguration.

**Warum es gefährlich ist:** In Production würde jeder mit Zugriff auf Server-Logs alle Verifikationscodes sehen und Accounts übernehmen können.

**Sicherung:** Gleiche Guard-Logik wie bei `DEV_AUTO_LOGIN` empfohlen.

---

### 🔵 [DEV] Sessions nur im RAM gespeichert

**Datei:** `backend/utils/session-store.mjs`, Zeilen 3-38

```javascript
const sessions = new Map();  // In-Memory, geht bei Neustart verloren
```

**Warum es jetzt okay ist:** Einfach, keine externe Abhängigkeit, für Einzelserver-Dev ausreichend.

**Warum es in Production problematisch ist:**
- Alle Sessions gehen bei Server-Neustart verloren (alle Benutzer werden ausgeloggt)
- Kein Horizontal Scaling möglich (mehrere Server-Instanzen teilen keine Sessions)

**Fix für Production:** Redis oder Datenbankbasierte Sessions.

---

### 🔵 [DEV] `Secure`-Flag bei Cookies fehlt außerhalb Production

**Datei:** `backend/utils/session-store.mjs`, Zeile 48/54

```javascript
if (process.env.NODE_ENV === "production") attrs.push("Secure");
```

**Warum es jetzt okay ist:** HTTPS läuft lokal meist nicht, `Secure` würde Cookies blockieren.

**Sicherung:** Sicherstellen, dass in Production `NODE_ENV=production` gesetzt ist.

---

## Zusammenfassung

| Schweregrad | Anzahl | Soforthandlungsbedarf |
|-------------|--------|----------------------|
| 🔴 KRITISCH | 2 | Ja – vor jedem weiteren Commit |
| 🟠 HOCH | 3 | Ja – vor Go-Live |
| 🟡 MITTEL | 5 | Vor Go-Live |
| 🟢 LOW | 4 | Kann warten |
| 🔵 DEV | 4 | Muss vor Production-Deployment deaktiviert sein |

### Sofortmaßnahmen (in Reihenfolge)

1. **`.env` aus Git-History entfernen und alle Secrets rotieren** — DRINGEND
2. **Plaintext-Passwort-Fallback entfernen**
3. **SHA256-Timing-Attack fixen** mit `timingSafeEqual`
4. **Fehlerdetails nicht an Client senden** in Production
5. Guards für `DEV_AUTO_LOGIN` und `DEV_EXPOSE_VERIFICATION_CODE` einbauen
