# Docker

## TL;DR

The production stack for FBM FinanzApp is **serverless**:
- **Backend:** Cloudflare Workers (runs on V8 isolates, deployed via Wrangler, no Node.js host).
- **Frontend:** Next.js 15 (deployable to Cloudflare Pages, Vercel, or any Node 20+ host).

There is **no Dockerfile in the production path** because Cloudflare Workers cannot be packaged as a container — the Worker runtime is provided by Cloudflare's edge network, not by Node.js. Trying to dockerize Wrangler ends up shipping a local dev simulator, not the actual production runtime.

**For evaluation purposes**, you can containerize the frontend (which is a normal Next.js app). The backend would still need to run separately via `wrangler dev` or `wrangler deploy`.

## Frontend Dockerfile (example)

`frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 4000
ENV PORT=4000
CMD ["node", "server.js"]
```

This requires `output: 'standalone'` in `frontend/next.config.ts`.

## docker-compose.yml (example, frontend only)

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - "4000:4000"
    environment:
      NEXT_PUBLIC_API_URL: http://host.docker.internal:8787
```

The backend continues to run via `cd backend && npm run dev` on the host.

## Why not a full-stack Docker setup?

| Option | Verdict |
|--------|---------|
| Docker Wrangler dev simulator | Possible but ships a dev-only runtime, not the production V8 isolate environment. Misleading. |
| Switch backend to a Node/Express server | Major rewrite. Loses Cloudflare's edge benefits (KV, Hyperdrive, free TLS termination). |
| Use Cloudflare Workerd in Docker | Workerd Docker images exist but are experimental and not officially supported by Cloudflare for production parity. |

## Future work

If a hosted Docker deployment is required, the realistic path is:
1. Port backend routes from Hono+Workers to Hono+Node (Hono supports both).
2. Replace Cloudflare KV with Redis (sessions, CSRF tokens, rate limits).
3. Replace Hyperdrive proxy with direct Postgres connection.
4. Then both services can run in containers behind a reverse proxy.
