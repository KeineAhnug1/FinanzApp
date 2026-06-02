#+ CHANGE: TypeScript-Migration – FinanzApp

Dieser Change-Plan beschreibt die beabsichtigten Schritte für eine schrittweise, risikoarme Migration von JavaScript zu TypeScript mit Fokus auf Back-End (Node ESM) und domänensichere Typen im Finanzbereich. Der Plan ist inkrementell aufgebaut und kann jederzeit pausiert oder zurückgesetzt werden.

## Ziele
- Robustere Typensicherheit, insbesondere für Geldbeträge, Währungen, IDs und Datumswerte.
- Gemeinsame, versionierte API-Verträge zwischen Backend und Frontend.
- Reduzierte Laufzeitfehler und bessere Refactor-Sicherheit.
- Minimaler Impact auf den laufenden Betrieb durch inkrementelles Vorgehen.

## Ausgangslage (Stand heute)
- Node.js ESM-Code im Backend (`.mjs`), reines JS im Frontend (ohne Bundler).
- `pg` als DB-Client, eigenständige Skripte unter `database/`.
- Keine TypeScript-Toolchain vorhanden, ESLint für JS konfiguriert.

## Umfang / Nicht-Ziele
- Umfang: Backend-Umstellung auf TS, definierte Domänen-Typen, API-Contracts, verbesserte DB-Typisierung, optionale Runtime-Validation.
- Nicht-Ziele (zunächst): Vollständige Frontend-TS-Umstellung oder Einführung eines Bundlers. Frontend wird vorerst via JSDoc/`@ts-check` abgesichert.

---

## Phasenplan

### Phase 0 – Vorbereitung & Sicherheit
1. Branch anlegen: `feat/ts-migration`.
2. Baseline CI-Check einführen: Type-Checking ohne Emission (nur Analyse).
3. Dokumentation erstellen/aktualisieren (dieses Dokument), Rollback-Plan definieren.

### Phase 1 – Type-Checking ohne Build-Schritt
Ziel: Sofortiger Nutzen durch Typ-Fehlererkennung ohne Code-Umbenennungen oder Build-Anpassungen.

- `typescript` installieren und `tsconfig.json` anlegen mit `allowJs: true`, `checkJs: true`, `strict: true`, `noEmit: true`.
- Script hinzufügen: `npm run type-check` → `tsc --noEmit`.
- In kritischen JS-Dateien `@ts-check` aktivieren und leichtgewichtige JSDoc-Typen ergänzen (z. B. für Money, Currency, IDs).
- Offene Typfehler priorisieren und pragmatisch beheben (Signaturen, Rückgabewerte, Nullability, unbekannte Felder).

Beispiel `tsconfig.json` (Startversion):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node16",
    "strict": true,
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["backend/**/*", "database/**/*", "frontend/**/*", "*.mjs"],
  "exclude": ["node_modules", "dist"]
}
```

### Phase 2 – Domänentypen & Runtime-Validierung
Ziel: Finanzdomäne konsistent und sicher modellieren.

- Gemeinsames Types-Paket/Ordner anlegen: `shared/types/`.
- Domänentypen definieren:
  - `Currency` (ISO-4217-Codes; initial subset, später erweiterbar).
  - `Money` als Cents-Integer (z. B. `bigint`) oder als Decimal-basierter Typ; Entscheidung festhalten.
  - Branded Types für IDs (`UserId`, `AccountId`, ...), Perioden, ISO-Datumsstrings.
- Zentrale Parser/Serializer implementieren (z. B. `parseMoney`, `formatMoney`, `parseCurrency`).
- Optional (empfohlen): Runtime-Validierung via Zod für API-Ein-/Ausgaben.

Beispiel (Typskizze):
```ts
// shared/types/money.ts
export type Currency = 'EUR' | 'USD'; // initial, später erweitern
export type Brand<T, U extends string> = T & { readonly __brand: U };
export type Cents = Brand<bigint, 'Cents'>;
export interface Money { amount: Cents; currency: Currency }

export function toCents(input: string): Cents {
  // Erwartet Dezimalzahl mit Punkt, skaliert auf 2 Nachkommastellen
  const [i, f = ''] = input.split('.');
  const frac = (f + '00').slice(0, 2);
  const sign = i.startsWith('-') ? -1n : 1n;
  const absInt = BigInt(i.replace('-', '') || '0');
  const absFrac = BigInt(frac || '0');
  return (absInt * 100n + absFrac) * sign as Cents;
}
```

### Phase 3 – DB-Schicht absichern
Ziel: Einheitliche und sichere Behandlung von DB-Typen (insbesondere `numeric`).

- Zentrale `pg`-Konfiguration: `numeric`-Werte als String abholen und ausschließlich in den Serializer/Parsern konvertieren.
- Für monetäre Spalten festlegen: Skala = 2 (Cents). Migrationsskript prüfen/dokumentieren.
- Gemeinsame DB-Helper-Funktionen typisieren (z. B. `db-client`, `data-service`).
- Optional: Einführung eines typisierten SQL-Layers (Kysely/Drizzle) als separates Milestone.

### Phase 4 – Schrittweise TS im Backend
Ziel: Kritische Backend-Module auf `.ts` heben, ohne Big-Bang.

Reihenfolge (jeweils klein schneiden, PRs schlank halten):
1. `backend/utils/*` (HTTP, Password, Rate-Limit, Data) → `.ts` mit klaren Signaturen.
2. `backend/helpers/*` (Serializers, Finance-DB, Responses) → `.ts` und strikte Domänentypen.
3. `backend/config/*` → `.ts` plus typisierte Konfiguration.
4. `backend/handlers/*` und `backend/routes/*` → `.ts` mit typisierten Request/Response-Objekten.
5. `backend/server.mjs` → `server.ts` (Startpunkt), Build-Ziel `dist/backend/server.mjs`.

Tooling:
- Entwicklung: `tsx backend/server.ts` (oder `ts-node`), kein komplexer Bundler nötig.
- Produktion: `tsc` Build → `node dist/backend/server.mjs`.

### Phase 5 – API-Verträge teilen
Ziel: Brüche zwischen Backend und Frontend verhindern.

- Gemeinsame Typen in `shared/types/` verwenden.
- Optional: Zod-Schemata als Single-Source-of-Truth nutzen und aus Schemata Typen ableiten.
- Frontend-`api-client` annotieren (JSDoc oder `.ts`), Response/Request-Typen konsistent halten.

### Phase 6 – Frontend (pragmatisch)
Ziel: Verbesserte Sicherheit ohne sofortigen Bundler.

- Kurzfristig: `// @ts-check` in Frontend-Dateien aktivieren, JSDoc-Typen für State, API-Responses und View-Modelle ergänzen.
- Mittelfristig (separater Milestone): Vite + TS einführen, schrittweise `.ts`-Migration, Code-Splitting und Linting anpassen.

### Phase 7 – Tooling & Qualitätssicherung
- `npm scripts` ergänzen: `type-check`, `dev`, `build`, `start:prod`.
- ESLint auf TS erweitern (`@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`), bestehende Regeln migrieren.
- Optional: Pre-commit Hook (Husky) für `eslint` und `type-check`.
- CI: `npm run lint` und `npm run type-check` verpflichtend.

### Phase 8 – Doku & Übergabe
- README und API-Dokumentation aktualisieren (Build/Run, Typkonzepte, Money-Handling, Parser/Serializer, API-Contracts).
- Entwickler-Guides: How-Tos für neue Endpunkte, DB-Werte und Frontend-Consumption.

---

## Befehlsbeispiele (orientierend)
> Hinweis: Paketversionen und genaue Flags werden im jeweiligen PR festgelegt.

Installationen (Dev):
```bash
npm i -D typescript tsx @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

Optional (Runtime-Validation und Dezimalarithmetik):
```bash
npm i zod decimal.js
```

Scripts (Beispiele für `package.json`):
```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "dev": "tsx backend/server.ts",
    "build": "tsc -p tsconfig.json",
    "start:prod": "node dist/backend/server.mjs"
  }
}
```

---

## Akzeptanzkriterien (Definition of Done)
- `npm run type-check` läuft fehlerfrei (CI-gated).
- Zentrale Domänentypen (`Money`, `Currency`, IDs) sind definiert und werden in Backend-Modulen verwendet.
- Monetäre Werte werden konsistent als Cents-Integer oder über zentralen Decimal-Typ verarbeitet; Parsing/Formatierung ist vereinheitlicht.
- Backend startet in Dev (`tsx`) und in Prod (kompiliert) stabil.
- Frontend ist via `@ts-check` abgesichert; API-Contracts sind dokumentiert und konsistent.
- README/Docs zeigen aktualisierte Build-/Run-/Coding-Guidelines.

## Risiken & Rollback
- Risiko: Initial viele Typfehler. Mit `allowJs`/`checkJs` und schrittweisen PRs mitigiert.
- Risiko: Inkompatible ESM/TS-Configs. Mit `module: ES2022`, `moduleResolution: node16` und isolierten Tests mitigieren.
- Rollback: Branch-basiert, PRs klein halten; bei Bedarf `allowJs`/`skipLibCheck` temporär erhöhen, Migration pausieren.

## Zeit-/Meilensteinplanung (Richtwerte)
- Phase 1–2: 1–2 Tage (Einrichtung, erste Typen, Quick Wins).
- Phase 3–4: 3–6 Tage (DB-Schicht, Utils/Helpers/Server nach TS).
- Phase 5–6: 2–4 Tage (API-Contracts teilen, Frontend-Absicherung).
- Phase 7–8: 1–2 Tage (Tooling, Doku, Cleanup).

---

## Nächste konkrete Schritte
1. `tsconfig.json` hinzufügen (wie oben), `type-check`-Script eintragen.
2. `@ts-check` in `backend/utils/*` und `backend/helpers/*` aktivieren, offensichtliche Fehler beheben.
3. `shared/types/` anlegen und `Money`/`Currency`-Typen definieren.
4. Parser/Serializer für DB-`numeric` zentralisieren und Backend-Module darauf umstellen.
5. Optional: Zod-Schemata für häufige API-Endpunkte ergänzen.

Diese Schritte können in separaten, kleinen Pull Requests umgesetzt und überprüft werden.

