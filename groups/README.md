# Groups App

This folder contains the standalone group management app for FinanzApp.

## Scope

The app provides:
- list of memberships for the current session user
- group detail view with participants
- member actions:
  - create group activity
  - create group funding (optional link to existing group activity)
- invitation inbox (accept/deny)
- admin actions:
  - invite user by username
  - remove participant
  - delete group (including linked group data)
- create new group

## Current Runtime Setup

- Entry: `groups/server.js`
- UI files: `groups/index.html`, `groups/app.js`, `groups/style.css`
- Default port: `3001`
- Start command (from repo root): `npm run groups:start`

Database target:
- Uses `MONGODB_DB_V2` if set.
- Otherwise uses `${MONGODB_DB}_v2`.
- Requires `MONGODB_URI`.

## Session Model (Current State)

- Session user is currently hardcoded to `anna` in backend (`SESSION_USERNAME`).
- Frontend also has a `SESSION_USER` constant, but effective identity is determined by backend lookup.
- There is no login/session token flow in this app yet.

## API Endpoints

- `GET /api/session`
- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/:groupId`
- `DELETE /api/groups/:groupId`
- `POST /api/groups/:groupId/activities`
- `POST /api/groups/:groupId/funding`
- `POST /api/groups/:groupId/invite`
- `DELETE /api/groups/:groupId/members/:userId`
- `GET /api/inbox/invitations`
- `POST /api/inbox/invitations/:groupId/accept`
- `POST /api/inbox/invitations/:groupId/deny`

## Data Dependencies

Core collections used:
- `users`
- `groups`
- `group_members`

Group cleanup additionally touches:
- `group_funding`
- `group_expenses`
- `funding_participants`
- `group_activities`
- `transactions` (via `group_expense_id`)

This means the app is designed for the v2 dataset shape.

## Membership Status Handling

Primary statuses:
- `invited`
- `denied`
- `accepted`

Compatibility fallbacks still exist in code for legacy values (for example `active` or missing status), but the v2 schema expects the three statuses above.
