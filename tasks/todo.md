# FBM FinanzApp — Follow-up Roadmap

> Follow-up roadmap captured during the grading-criteria pass on 2026-06-25.
> These items are deliberately deferred — too risky or too broad for inclusion in
> the current pass, but tracked here so they don't get lost.
> The root-level `TODO.md` covers feature backlog; this file covers
> architecture, quality, infrastructure, and deferred features in one place.

## A11y & UX

- [ ] Loading skeletons across data-heavy pages (dashboard, accounts, stocks, groups). Currently only spinners; skeletons reduce perceived load time.
- [ ] Empty-state illustrations + suggested actions (e.g., "Noch keine Konten — Lege dein erstes Konto an" with a CTA button). Currently text-only messages.
- [ ] Onboarding tour for first-time users (welcome screen with 3-step guide).
- [ ] Page transitions between routes (View Transitions API or framer-motion-style CSS).
- [ ] Focus trap inside `Modal.tsx` (currently focus can escape with Tab).
- [ ] Confirmation dialogs for destructive actions (delete account, leave group) — partial today.

## Code architecture

- [ ] Refactor `frontend/src/app/(app)/dashboard/page.tsx` (873 lines) — see `docs/REFACTOR-DASHBOARD.md` for the plan.
- [ ] Extract reusable `<Card>`, `<Button>`, `<Input>` primitives from page-level CSS into typed components.
- [ ] Move inline `<style>` patterns in pages (e.g., `style={{ padding: '2px 8px' }}` in dashboard) into utility CSS classes.

## Testing

- [ ] Expand backend Vitest coverage to routes (mock Hono context, test happy/error paths for auth, finance, groups).
- [ ] Add frontend Vitest + React Testing Library for component tests.
- [ ] Add Playwright e2e for critical flows (login, add account, add income, view dashboard).

## Infrastructure

- [ ] Docker — see `docs/DOCKER.md` for analysis. Cloudflare Workers (backend) cannot run in a standard container; only the frontend can be containerized.
- [ ] CI workflow (GitHub Actions) running `type-check`, `lint`, `test` on every push.
- [ ] Run `prettier --write` repo-wide once and commit (deferred to avoid a 10k-line diff in this pass).

## Features (deferred from existing TODO.md)

### Budgets

- [ ] Monatliche Budget-Limits pro Kategorie (z.B. max. 200 € / Monat für Lebensmittel)
- [ ] Budget-Übersicht: Fortschrittsbalken mit "verbraucht / gesamt"
- [ ] Warnung / Indikator wenn Budget überschritten oder nahezu ausgeschöpft
- [ ] Budget auf Wochenbasis optional (z.B. 50 € / Woche)
- [ ] Budgets an Einnahmen koppeln (prozentualer Anteil statt Fixbetrag möglich)

### Sparziele

- [ ] Sparziel anlegen: Zielname, Zielbetrag, Zieldatum (optional)
- [ ] Monatliche Mindest-Sparrate definieren (z.B. min. 100 € / Monat)
- [ ] Fortschrittsanzeige: aktueller Stand vs. Ziel, verbleibende Monate
- [ ] Automatische Erkennung wenn Sparrate unterschritten wird
- [ ] Sparziele mit Konto verknüpfen (z.B. Sparkonto X)
- [ ] Mehrere parallele Sparziele gleichzeitig verwalten

### Freistellungsaufträge

- [ ] Freistellungsauftrag pro Bank / Depot erfassen (Betrag, Institut)
- [ ] Gesamtübersicht: genutzter Anteil vs. Freistellungsbetrag (801 € / 1.602 € bei Zusammenveranlagung)
- [ ] Kapitalerträge automatisch gegen Freistellungsaufträge aufrechnen
- [ ] Warnung wenn Freistellungsbetrag ausgeschöpft / überschritten
- [ ] Export-Möglichkeit für Steuerübersicht (Jahresauswertung)

### Kategorie-Verbesserungen

- [ ] Unterkategorien einführen (z.B. Lebensmittel > Supermarkt / Restaurant / Lieferdienst)
- [ ] Kategorien individuell umbenennen und farblich markieren
- [ ] Eigene Kategorien anlegen und löschen
- [ ] Standardkategorien mit Icons versehen
- [ ] Automatische Kategorieerkennung anhand von Transaktionsbeschreibungen (Regel-Engine)
- [ ] Kategorie-Statistiken: Trend über mehrere Monate anzeigen
- [ ] Kategorie-Filter in allen Auswertungsansichten vereinheitlichen
