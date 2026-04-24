# TraceBee

Open-source observability for LLM agents. TypeScript SDK + dashboard for tracing, debugging, and understanding what your agents actually do.

**Status:** early development. MVP target: July 19, 2026.

## Local development

    pnpm install
    pnpm dev

Requires Node 20+ and pnpm 9+.

## Architecture

See [docs/architecture.md](./docs/architecture.md) for the full design. The short version: a TypeScript SDK that wraps OpenAI and Anthropic clients, a Postgres-backed ingest API, and a Next.js dashboard — all in one monorepo.