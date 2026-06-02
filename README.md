# TraceBee

Open-source observability for LLM agents. TypeScript SDK + dashboard for tracing, debugging, and understanding what your agents actually do.

**Status:** Week 1 of 12 complete — foundation done (auth, DB, schema). MVP target: July 19, 2026.

## Local development

### Prerequisites

- Node 20+ and pnpm 10+
- A Neon Postgres project (free tier works)

### Setup

    pnpm install

Create `apps/web/.env.local` with your Neon connection string:

    DATABASE_URL="postgresql://user:password@host.neon.tech/db?sslmode=require"

Apply database migrations:

    pnpm --filter web db:migrate

Start the dashboard:

    pnpm dev

Dashboard runs at http://localhost:3000. Inspect the database in a browser with:

    pnpm --filter web db:studio

## Running in Docker

The repo ships a multi-stage Dockerfile so the app can run anywhere, not just on Vercel.

### Build

From the repo root:

    docker build -t tracebee-web .

The final image is ~280 MB (Node 20 Alpine + Next.js standalone output).

### Run

    docker run --rm -p 3000:3000 --env-file apps/web/.env.local -e AUTH_TRUST_HOST=true tracebee-web

Two things to note:

- Docker's `--env-file` parser does **not** strip quotes. Values in `apps/web/.env.local` must be unquoted (`DATABASE_URL=postgresql://...`, not `DATABASE_URL="..."`).
- `AUTH_TRUST_HOST=true` tells Auth.js to honor the incoming host header. Vercel sets this automatically; outside Vercel you have to be explicit. In production also set `AUTH_URL` to your canonical URL.

## Repository layout

    apps/web/     # Next.js 15 app — dashboard + ingest API
    packages/sdk/ # TypeScript SDK (added Week 3)
    docs/         # Architecture, roadmap, weekly notes

## Architecture

See [docs/architecture.md](./docs/architecture.md) for the full design. The short version: a TypeScript SDK that wraps OpenAI and Anthropic clients, a Postgres-backed ingest API, and a Next.js dashboard — all in one monorepo.
