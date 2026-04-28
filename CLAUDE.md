# Agent Observability Dashboard

## What this is

A portfolio project: an observability tool for LLM agents. Users install a
TypeScript SDK in their agent code, and every LLM call and tool call shows up
as a span in a web dashboard, grouped into traces. The hero feature is a
waterfall view of a single trace, showing exactly what happened step by step.

Target persona: "Alex" — a solo TypeScript developer building an agent as a
side project, frustrated by `console.log` debugging, looking for a drop-in
observability tool that takes five lines to integrate.

MVP ship date: July 19, 2026. Single developer, ~55-65 hours over 12 weeks.

## Stack (locked in — do not suggest alternatives)

- Next.js 15, App Router, TypeScript strict mode
- Drizzle ORM against Postgres hosted on Neon
- Auth.js v5 with GitHub provider, database session strategy
- pnpm workspaces monorepo
- Vercel hosting (same deployment serves dashboard + ingest API)
- TypeScript SDK published to npm, name TBD (added Week 3)
- Tailwind for styling; no component library until Week 11 polish pass

## Architecture decisions (settled — do not relitigate)

**Trace correlation:** SDK uses Node's AsyncLocalStorage to propagate trace
context across async boundaries. Alex wraps his OpenAI/Anthropic client once
with `observeOpenAI()`, wraps each agent run in `trace(name, fn)`, and wraps
each tool call in `tool(name, fn)`. LLM calls are auto-captured; tool calls
require the explicit wrapper.

**Batching:** One HTTP POST per completed trace, containing the trace envelope
and all its spans. Fire-and-forget from the user's perspective. The SDK tracks
in-flight requests in a module-level Set and drains them on `beforeExit`,
SIGTERM, and SIGINT (with a short timeout). No background timer, no queue, no
retry — all of that is Phase 2.

**Ingest:** Single endpoint `POST /v1/traces`. Bearer token auth. One database
transaction per request: upsert the trace row (on conflict, update ended_at
and status), then bulk-insert spans with `ON CONFLICT (id) DO NOTHING` for
idempotency. Returns 202 on success.

**Auth on the ingest endpoint:** API keys shaped `sk_live_<24 random bytes,
base64url>`. Stored as sha256 hash in `api_keys.key_hash`. The raw key is
shown exactly once at creation. A `key_prefix` column stores the first ~16
chars for UI display, so the user can identify keys without exposing them.

**IDs:** Client-generated ULIDs (26 chars, sortable by time). Timestamps are
ISO 8601 strings on the wire, `timestamptz` in Postgres.

**Error handling on the SDK side:** 2xx = success. 4xx = log a warning, drop
the trace (payload is bad, retrying won't help). 5xx or network error = log,
drop. 401 = log loudly because it almost always means a mistyped key.

**Dashboard auth:** Auth.js session cookies. Ingest uses the Bearer token.
Same Next.js app, different middleware per route.

## Conventions

- Server actions over API routes for dashboard mutations
- Drizzle schema is the source of truth; migrations via `drizzle-kit generate`
  and `drizzle-kit migrate`
- No shadcn, no component library, no dark mode, no animations until Week 11
- Commit messages: imperative mood, ≤72 char subject, body wraps at 72
- No test suite until Week 8; verify the hot path manually before then
- Public GitHub repo, MIT licensed, README updated each week
- `.env.local` for local secrets, Vercel env vars for production; `.env*` is
  in `.gitignore` and `gitleaks` runs as a pre-commit hook

## Out of scope for MVP (do not add)

- ClickHouse, Redis, any queue infrastructure
- Server-sent events or live trace streaming
- Retry logic with backoff, persistent SDK queue
- OpenTelemetry wire format (Phase 2 migration story)
- Sampling, rate limiting, webhooks
- Python SDK — TypeScript only for MVP
- Team invites, billing, organizations
- Alerting, dashboards beyond trace list + trace detail

## Folder layout

```
agent-obs/
├── CLAUDE.md
├── README.md
├── LICENSE
├── .gitignore
├── package.json          # workspace root
├── pnpm-workspace.yaml
├── apps/
│   └── web/              # Next.js app, serves dashboard + ingest API
│       ├── src/
│       │   ├── app/
│       │   ├── db/       # Drizzle schema + client
│       │   └── auth.ts
│       └── drizzle.config.ts
├── packages/
│   └── sdk/              # added Week 3; published to npm
└── docs/
    ├── architecture.md
    ├── roadmap.md
    └── decisions/        # one short writeup per week, in my own voice
```

## How to work with me on this project

When I start a Claude Code session, I will name the specific task from
`docs/roadmap.md` I'm working on. Scope your work to that task only. If I
haven't told you which task, ask — don't guess. If a task needs a decision
that isn't covered by this file or the architecture doc, ask before writing
code. Don't add dependencies without asking. Don't refactor code outside the
current task's scope.

Walk me through changes step by step. Explain what you're about to do and
why, then wait for me to say go before editing files, running commands, or
modifying the database. This applies even to tasks that are fully spec'd in
the roadmap — I'm using this project to learn, not to ship fast.
