# Groups App 👥🤝📋

Dieses Verzeichnis enthält das Gruppen-Frontend der FinanzApp.

## Scope 🧩
- Mitgliedschaften anzeigen
- Gruppendetails mit Teilnehmern laden
- Gruppenaktivitäten erstellen
- Group-Funding anlegen
- In Funding einzahlen
- Gruppenausgaben aus Funding erstellen
- Einladungen annehmen/ablehnen
- Admin-Funktionen: einladen, entfernen, zu Admin machen, Gruppe löschen
- Gruppe verlassen

## Runtime Setup ⚙️
- Zentraler Server: `backend/server.mjs`
- UI: `frontend/groups/index.html`, `frontend/groups/js/app.js`, `frontend/groups/style.css`
- Start (vom Root): `npm run groups:start` oder `npm run backend:start`
- Default Port: `3000`

DB-Ziel:
- `MONGODB_DB_V4` oder `${MONGODB_DB}_v4` 🗄️
- `MONGODB_URI` erforderlich ✅

## Session Modell 🍪🔐
- Nutzer über zentrale Session `finanzapp_session`
- Alle Gruppenabfragen sind session-scoped

## API (aktueller Stand) 🔌
- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/:groupId`
- `DELETE /api/groups/:groupId`
- `POST /api/groups/:groupId/activities`
- `POST /api/groups/:groupId/funding`
- `POST /api/groups/:groupId/funding/:fundingId/donate`
- `POST /api/groups/:groupId/expenses`
- `POST /api/groups/:groupId/invite`
- `POST /api/groups/:groupId/members/:userId/promote-admin`
- `POST /api/groups/:groupId/leave`
- `DELETE /api/groups/:groupId/members/:userId`
- `GET /api/inbox/invitations`
- `POST /api/inbox/invitations/:groupId/accept`
- `POST /api/inbox/invitations/:groupId/deny`

## Collections 🗂️
- `users`
- `groups`
- `group_members`
- `group_activities`
- `group_funding`
- `funding_participants`
- `group_expenses`
- `transactions`

## Status-Werte 🏷️
- `invited`
- `denied`
- `accepted`

## Datenstruktur (aktueller Stand) 🧭📐
![Aktuelle Datenstruktur](../../Datastructure.png)
