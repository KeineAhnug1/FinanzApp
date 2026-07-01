# Docker

Nur das **Frontend** ist containerisiert. Das Backend läuft auf Cloudflare Workers (V8-Isolates, kein Node.js) — dort funktioniert Docker nicht.

## Quickstart

```bash
# Frontend im Container
docker compose up --build

# Backend läuft auf dem Host über Wrangler
cd backend && npm run dev
```

Frontend: http://localhost:4000 · Backend: http://localhost:8787

## API-URL zur Build-Zeit

`NEXT_PUBLIC_API_URL` muss als Docker-`ARG` gesetzt sein (Next.js backt den Wert ins Client-Bundle):

```bash
NEXT_PUBLIC_API_URL=https://api.beispiel.de docker compose up --build
```

Default: `http://localhost:8787`.
