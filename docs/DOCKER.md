# Docker

## TL;DR

The production stack for FBM FinanzApp is **serverless**:
- **Backend:** Cloudflare Workers (V8 isolates, no Node host) — deploy via `wrangler deploy`.
- **Frontend:** Next.js 15 (deployable to Cloudflare Pages, Vercel, or any Node 20+ host).

For local evaluation, the **frontend can be containerized** (see `frontend/Dockerfile`). The backend continues to run on the host via `wrangler dev` because Cloudflare Workers cannot be packaged as a standard container.

## Quick start

From the repo root:

```sh
# Build and run the frontend container
docker compose up --build

# In a separate terminal, run the backend (Cloudflare Worker)
cd backend && npm run dev
```

The frontend will be available at http://localhost:4000. The browser executes the client bundle on your host, so it talks to the backend at `http://localhost:8787` (your local Wrangler dev server). Override the baked-in API base URL by exporting `NEXT_PUBLIC_API_URL` before `docker compose up --build` — it is a Next.js public env consumed at **build** time and passed through as a Docker `ARG`.

## Frontend Dockerfile

`frontend/Dockerfile` uses a multi-stage build:

1. **deps** — installs production + dev dependencies.
2. **builder** — builds the Next.js app in `output: 'standalone'` mode.
3. **runner** — minimal `node:20-alpine` runtime that only contains the standalone bundle and runs as a non-root user (`nextjs:1001`).

This produces a final image of ~150 MB and starts in <500 ms.

## Why not a full-stack Docker setup?

Cloudflare Workers run on V8 isolates provided by Cloudflare's edge network, not on Node.js. Three options exist if a fully containerized deployment is required:

| Option | Verdict |
|--------|---------|
| Docker Wrangler dev simulator | Possible but ships a dev-only runtime, not production parity. |
| Cloudflare `workerd` in Docker | Experimental; no official Cloudflare image with production parity. |
| Port backend to Hono + Node | Major rewrite. Loses KV, Hyperdrive, edge benefits. |

The current architecture deliberately optimizes for the serverless edge. Use the frontend container for evaluation; deploy the backend with `wrangler deploy` to Cloudflare Workers.

## Production deployment

- **Backend:** `cd backend && npx wrangler deploy`
- **Frontend:** push to a branch connected to Cloudflare Pages, or `docker build` and ship to any container host.
