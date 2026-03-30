# TODOs

## Vor dem Release

- [ ] **Dev-Auto-Login entfernen**: Den Test-User `test@test.test` (ID `77a100000000000000000001`) sowie alle
  zugehörigen Seed-Daten aus der Datenbank löschen. Den npm-Script `backend:start:dev` und die
  zugehörige Middleware in `backend/server.mjs` (DEV_AUTO_LOGIN-Block) entfernen.
  Die Konstanten `DEV_AUTO_LOGIN` und `DEV_AUTO_LOGIN_USER_ID` aus `backend/config/runtime.mjs` entfernen.
