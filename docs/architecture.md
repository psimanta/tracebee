# Architecture

This document describes the full architecture of the agent observability
dashboard MVP. It is the source of truth for how the system fits together.
`CLAUDE.md` has the summary; this file has the reasoning and the details.

## System overview

The product has three deployable artifacts:

1. A **TypeScript SDK** that Alex installs from npm and wires into his agent
   code. It captures LLM calls and tool calls as spans, groups them into
   traces, and ships each completed trace to the backend as one HTTP POST.

2. A **Next.js 15 application** hosted on Vercel. It serves two unrelated
   surfaces from the same codebase: the ingest API (one endpoint, Bearer
   token auth, machine-to-machine) and the dashboard UI (GitHub OAuth,
   human-to-machine).

3. A **Postgres database** hosted on Neon. One schema, five tables for MVP
   (users, projects, project_users, api_keys, traces, spans), plus whatever
   tables Auth.js requires for its adapter.

The SDK talks only to the ingest API. The dashboard talks only to its own
internal queries against Postgres (via server components and server actions).
The ingest API and the dashboard never talk to each other.

## Data model

The schema follows OpenTelemetry semantics loosely but is not OTel-compliant
by design — the MVP optimizes for clarity and for the UI we're building, not
for interoperability. A Phase 2 rewrite can adopt OTel once the shape of real
usage is clear.

### Entities

**users** — one row per authenticated human. Populated by the Auth.js GitHub
provider. Key fields: `id`, `github_id`, `email`, `avatar_url`.

**projects** — one row per logical observability namespace. A user might have
a "dev" project and a "prod" project, or one project per agent they're
building. Key fields: `id`, `name`, `created_at`.

**project_users** — many-to-many between users and projects, with a `role`
column. For MVP, role is always `owner`; the column exists to keep the
schema open for team invites later without a migration.

**api_keys** — one row per API key, belonging to one project. Fields:
`id`, `project_id`, `key_hash` (sha256 of the raw key), `key_prefix` (first
~16 chars of the raw key, stored unhashed for UI display), `created_at`,
`revoked_at` (nullable).

**traces** — one row per agent run. Fields: `id` (ULID, client-generated),
`project_id`, `name`, `started_at`, `ended_at`, `status` (`ok` | `error`),
`error_message` (nullable), `metadata` (jsonb, freeform), `sdk_name`,
`sdk_version`.

**spans** — one row per captured operation inside a trace. Fields: `id`
(ULID), `trace_id`, `parent_span_id` (nullable — present for Phase 2 nested
tool calls, null for MVP), `type` (`llm_call` | `tool_call`), `name`,
`started_at`, `ended_at`, `status`, `error_message`. LLM-specific columns:
`model`, `prompt_tokens`, `completion_tokens`, `cost_usd`. Tool-specific
columns: `tool_args` (jsonb), `tool_result` (jsonb). `input` and `output`
(jsonb) are shared — for LLM calls they hold the message array and the
response content; for tool calls they duplicate `tool_args` and
`tool_result` (keeps the UI simpler).

### Indexes (MVP)

- `traces(project_id, started_at desc)` — every list-view query hits this
- `spans(trace_id, started_at)` — every trace-detail query hits this
- `api_keys(key_hash) where revoked_at is null` — ingest auth lookup
- `project_users(user_id)` — dashboard "projects I belong to" query

Resist the urge to add more. Neon is fast; Postgres is fast. Indexes make
writes slower, and the write path is the hot path for this product.

## The SDK

### Shape of the public API

Alex's integration looks like this:

```typescript
import OpenAI from "openai";
import { observeOpenAI, trace, tool } from "@yourname/sdk";

const openai = observeOpenAI(new OpenAI());  // one-time wrap at module scope

async function researchTopic(topic: string) {
  return trace("research-topic", async () => {
    const plan = await openai.chat.completions.create({ ... });
    const results = await tool("web-search", () => webSearch(plan.query));
    const summary = await openai.chat.completions.create({ ... });
    return summary;
  });
}
```

Three exports: `observeOpenAI` (and `observeAnthropic`), `trace`, `tool`.
That's the whole surface.

### How trace correlation works

Node's `AsyncLocalStorage` is the backbone. `trace()` creates a context
object `{ traceId, buffer: Span[] }` and runs the user's callback inside
`traceContext.run(ctx, fn)`. Every await inside that callback preserves the
context automatically — that's what AsyncLocalStorage is for.

The wrapped OpenAI client has a proxy around `chat.completions.create` (and
`responses.create` for the newer API). Each call reads the current context
with `traceContext.getStore()`. If there's no active context (Alex called
the wrapped client outside a trace), the call passes through without
capturing anything — silent no-op, not an error. If there is a context, the
proxy records start time, awaits the real call, records end time, computes
cost from the model and token counts, and pushes a completed span onto the
context's buffer.

`tool(name, fn)` follows the same pattern but takes an explicit thunk:

```typescript
export async function tool<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const ctx = traceContext.getStore();
  if (!ctx) return fn();
  const span = { id: ulid(), traceId: ctx.traceId, type: "tool_call",
                 name, startedAt: Date.now(), status: "ok" as const };
  try {
    const result = await fn();
    span.toolResult = result;
    return result;
  } catch (err) {
    span.status = "error";
    span.errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    span.endedAt = Date.now();
    ctx.buffer.push(span);
  }
}
```

The thunk pattern (passing `() => webSearch(...)` rather than
`webSearch(...)`) is what gives the SDK the chance to start a timer before
execution. TypeScript's type system enforces it: the second parameter is
typed `() => Promise<T>`, so passing a raw promise is a compile error.

### Flushing and shutdown

When the callback passed to `trace()` resolves or throws, we stamp the
trace's `endedAt` and `status`, then fire off the HTTP POST without
awaiting it. Observability should never add latency to the user's hot path.

The module keeps a `Set<Promise<void>>` of in-flight requests. Each flush
adds to the set and removes itself on completion. An exit handler drains
the set:

```typescript
process.on("beforeExit", async () => {
  await Promise.all([...pendingFlushes]);
});
process.on("SIGTERM", () => drainThenExit());
process.on("SIGINT", () => drainThenExit());
```

`drainThenExit()` races `Promise.all([...pending])` against a 5-second
timeout, then calls `process.exit()`. This covers both long-running servers
(SIGTERM on deploy) and one-shot scripts (beforeExit when the event loop
empties).

### What gets sent on the wire

One POST per completed trace. Body is JSON:

```json
{
  "trace": {
    "id": "tr_01HXYZ...",
    "name": "research-topic",
    "started_at": "2026-04-24T10:15:00.000Z",
    "ended_at": "2026-04-24T10:15:04.842Z",
    "status": "ok",
    "metadata": {},
    "sdk": { "name": "ts", "version": "0.1.0" }
  },
  "spans": [
    {
      "id": "sp_01HXYZ...",
      "parent_span_id": null,
      "type": "llm_call",
      "name": "openai.chat.completions.create",
      "started_at": "2026-04-24T10:15:00.100Z",
      "ended_at": "2026-04-24T10:15:01.200Z",
      "status": "ok",
      "model": "gpt-4o",
      "input": { "messages": [...] },
      "output": { "content": "..." },
      "prompt_tokens": 342,
      "completion_tokens": 89,
      "cost_usd": 0.00234
    }
  ]
}
```

Large traces (>100 spans or >1 MB serialized) are split into multiple POSTs
with the same `trace.id`. The server merges them thanks to the upsert +
`ON CONFLICT` pattern below — no special protocol for chunked traces,
they're just multiple idempotent writes.

### Cost calculation

The SDK ships a hardcoded pricing table for roughly five models (the ones
Alex is plausibly using: gpt-4o, gpt-4o-mini, claude-sonnet, claude-haiku,
gpt-4.1-mini or whatever's current). Unknown models record `cost_usd: null`
and log a warning once per process. Updating the pricing table is a Phase 2
story; for MVP, an occasional manual bump is fine.

## The ingest API

One endpoint: `POST /v1/traces`. Implemented as a Next.js Route Handler at
`apps/web/src/app/v1/traces/route.ts`.

### Request lifecycle

1. Parse `Authorization: Bearer <key>` header. Reject 401 if missing or
   malformed.
2. Compute sha256 of the key. Look up `api_keys` where `key_hash = $1 and
   revoked_at is null`. Reject 401 if no row.
3. Read the `project_id` from the matched key row. This is the project
   the trace belongs to — the SDK never sends `project_id`, and any value
   it did send would be ignored.
4. Parse and validate the JSON body with Zod. Reject 400 with a structured
   error list on validation failure.
5. Enforce payload size limit (1 MB). Reject 413 if exceeded.
6. Run one transaction against Postgres:
   ```sql
   INSERT INTO traces (id, project_id, name, started_at, ended_at,
                       status, metadata, sdk_name, sdk_version)
     VALUES (...)
     ON CONFLICT (id) DO UPDATE
       SET ended_at = EXCLUDED.ended_at,
           status = EXCLUDED.status;

   INSERT INTO spans (id, trace_id, project_id, ...)
     VALUES (...), (...), ...
     ON CONFLICT (id) DO NOTHING;
   ```
7. Return 202 with `{ trace_id, spans_written }`.

The transaction is the whole durability story: either all spans in this
request land, or none do. No partial writes, no half-visible traces.

### Error contract

- `401 invalid_api_key` — missing, malformed, unknown, or revoked key
- `400 invalid_payload` — Zod validation failed; body includes `details[]`
- `413 payload_too_large` — body > 1 MB
- `500 server_error` — anything else; body includes a request ID that
  matches server logs for debugging

No retries, no queues, no webhooks. The SDK decides what to do with each
response class (see CLAUDE.md).

## The dashboard

Same Next.js app, different routes. All dashboard routes are under
`apps/web/src/app/(dashboard)/` and require an Auth.js session.

### Auth

Auth.js v5 with the GitHub provider and the Drizzle adapter. Database
sessions (not JWT) — simpler to reason about, revocation is just deleting
a row. The Auth.js tables (`users`, `accounts`, `sessions`,
`verification_tokens`) serve double duty as our own user store; we add a
`github_id` column to Auth.js's `users` table rather than maintaining a
parallel user table.

### Routes

- `/` — landing page. Signed in → redirect to `/dashboard`. Signed out →
  "Sign in with GitHub" button.
- `/dashboard` — list of projects the current user belongs to.
- `/dashboard/new` — create a project form (single `name` field, server
  action on submit).
- `/dashboard/[projectId]` — the traces list for one project. Paginated,
  sorted by `started_at desc`. Filters for status and time range.
- `/dashboard/[projectId]/traces/[traceId]` — the hero screen. Waterfall
  on the left, span detail panel on the right.
- `/dashboard/[projectId]/settings` — API key management. Create, list,
  revoke.

### Access control

Every dashboard query is scoped by a join through `project_users` to the
current user's ID. There's no admin role and no "see all projects" view —
if you're not in `project_users` for a project, it doesn't exist as far
as the UI is concerned.

The check happens in a single `requireProjectAccess(projectId)` helper
that's called at the top of each server component and server action. It
reads the session, queries `project_users`, and throws a 404 (not 403) on
miss — we don't want to leak the existence of projects the user can't see.

### The hero waterfall

The centerpiece of the MVP and the thing most worth polishing. Built
weeks 6–7 as custom SVG — not a chart library, because the interaction
requirements (click a bar to open the span detail, hover to see timing,
handle wildly varying span durations on a shared time axis) are specific
enough that a library will fight more than it helps.

Rough layout: horizontal time axis at the top, one row per span stacked
vertically in chronological order, each row is a rounded rect whose x and
width map the span's start and duration. Click a row to fill the right-
hand panel with the span's input, output, and metadata. LLM and tool
spans are color-distinguished (two ramps only — keep it clean).

## Deployment

One Vercel project, one Neon project, one npm package. Separate GitHub
OAuth apps for local (`localhost:3000`) and production (the Vercel URL).

Environment variables on Vercel:
- `DATABASE_URL` — Neon connection string
- `AUTH_SECRET` — random 32-byte string
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- `NEXTAUTH_URL` — the production URL

The SDK's ingest endpoint URL is configurable but defaults to the
production dashboard URL. Alex sets it explicitly when he wants to point
his local agent at his local dashboard.

## What gets added in Phase 2 (not MVP)

- ClickHouse for spans; Postgres stays for users, projects, keys. The
  ingest writes to both during a migration window, then reads shift to
  ClickHouse.
- Redis-backed queue between the ingest endpoint and the database, so
  ingest can accept bursts without blocking on Postgres writes.
- SSE stream from the dashboard to the server, so the traces list updates
  live as new traces land.
- OpenTelemetry wire format on the ingest endpoint (in addition to the
  current format, for backward compatibility).
- Python SDK, using contextvars in place of AsyncLocalStorage.
- Retry logic in the SDK, with a small persistent queue on disk so traces
  survive a crash.
- Rate limiting per API key.
- Team invites with real role enforcement.
