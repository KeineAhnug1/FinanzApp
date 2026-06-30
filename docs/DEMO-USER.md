# Demo User — FBM FinanzApp

This document describes the realistic demo user provided by the seed migration
`seeds/migrations/2026-06-30_demo_user_seed.sql`.

## Login

| Field | Value |
|-------|-------|
| Username | `demo` |
| Password | `Test1234!` |
| Email | `demo@finanzapp.test` |

After login at `/login`, you will see populated data on every page:
Dashboard, Accounts, Stocks, Groups, Questions, Settings.

## Story

**Max Müller** (23) is a Werkstudent in Bonn who became Junior-Developer in
August 2025. His financial history starts on 2024-01-02 (Girokonto opened)
and runs through 2026-06-30.

### Accounts
- Girokonto (2024-01-02, balance ~3 200 €)
- Sparkonto (2024-03-15, balance ~5 800 €)
- Tagesgeld (2024-09-01, balance ~2 400 €)
- Aktiendepot (2024-04-10) with 6 positions: SAP, Apple, Microsoft,
  Allianz, Tesla, Siemens

### Recurring entries (30 months)
- Income: Werkstudent-Gehalt 1 100 € (until 2025-07), Junior-Developer-Gehalt
  2 850 € (from 2025-08), Sparzinsen quartalsweise, Tagesgeld-Zinsen monatlich,
  Aktien-Dividenden, Steuerrückerstattungen, Geburtstagsgelder
- Expenses: Miete 550 € (WG-Anteil), Netflix 12.99 €, Spotify 10.99 €,
  Fitnessstudio 29.90 € (ab März 2024), Strom 65 €, Internet 39.90 €,
  Deutschland-Ticket 49 €, dazu ~6-12 Lebensmittel-/Restaurant-Einträge pro
  Monat sowie Kleidung, Tech, Geschenke, Urlaub, Apotheke, Arzt, Friseur,
  Hobby, Spenden

### Side users
Six additional users (login pattern `demo_<name>` with same password) populate
groups and transfers:
- `demo_anna` (Anna Becker, 24) – Mitbewohnerin
- `demo_jonas` (Jonas Krüger, 25) – Freund
- `demo_lea` (Lea Müller, 21) – Schwester
- `demo_ben` (Ben Schäfer, 26) – Freund
- `demo_marie` (Marie Weiss, 22) – Mitbewohnerin
- `demo_tim` (Tim Hartmann, 23) – Mitbewohner

### Groups
1. **WG Hauptstraße 12** (4 members) – Miete WG (28 settled monatliche Perioden
   à 1 650 € / 412.50 € pro Person), Strom + Gas (20 settled Perioden), zwei
   Sammelaktionen, vier Aktivitäten, acht Chat-Nachrichten.
2. **Mallorca 2025** (4 Teilnehmer) – Closed Trip mit 6 Trip-Ausgaben und
   Settlements via Min-Cash-Flow (Lea→Jonas 162.50 €, Max→Jonas 22.50 €,
   Ben→Jonas 17.50 €).
3. **Geschenke für Lea** – Completed funding (Ziel 150 €, drei Beiträge à
   50 €, Ausgabe "Buch + Gutschein" 145 €).
4. **Team Lunch Bonn** – Prepaid wöchentliches Lunch (24 settled Perioden +
   1 collecting-Periode mit 2 ausstehenden Zahlungen, dazu offene
   Bürodeko-Sammelaktion).

### Forum
8 globale Fragen (6 von Max, 2 von anderen) mit 16 Antworten gemischter
Autoren und ~12 Likes (8 questions, 10 answers).

## Run the seed

```sh
# In Supabase SQL editor (or psql against the Hyperdrive endpoint):
\i seeds/migrations/2026-06-30_demo_user_seed.sql
```

Voraussetzung: Die beiden früheren Migrationen
`2026-06-29_groups_expansion.sql` und `2026-06-30_audit_fixes.sql` müssen
bereits angewendet sein.

Die Migration ist **idempotent** — sie beginnt mit einem `DELETE FROM users
WHERE username IN (...)`. Dank `ON DELETE CASCADE` werden alle abhängigen
Zeilen mitgelöscht. Erneutes Ausführen erzeugt denselben Zielzustand.

## Cleanup (alle Demo-User entfernen)

```sql
DELETE FROM users
 WHERE username IN ('demo','demo_anna','demo_jonas','demo_lea','demo_ben','demo_marie','demo_tim');
```

Cascading deletes entfernen alle bank_accounts, share_accounts, shares,
income, private_expenses, budgets, groups (über group_members), transfers,
shared expenses und Forum-Einträge der Demo-User automatisch.

## Password hash

Jeder Demo-User verwendet denselben verifizierten PBKDF2-SHA256-Hash von
`Test1234!`:

```
scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3
```

Verifiziert durch
[`backend/src/lib/utils/__tests__/password.test.ts`](../backend/src/lib/utils/__tests__/password.test.ts)
(siehe Test "validates the seed-migration Test1234! hash literal").
