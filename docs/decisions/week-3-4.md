# Weeks 3–4 — SDK + ingest end-to-end

Shipped: `traces` and `spans` tables with one migration, the `POST /v1/traces`
ingest endpoint with Bearer auth and Zod validation in a single transaction,
the `@tracebee/sdk` workspace package with `trace()`, `tool()`,
`observeOpenAI()`, and `configure()`, and two smoke scripts — one with a fake
OpenAI client for fast wiring checks, one with a real OpenAI key for
end-to-end verification.

The exit criterion was that running a test script calls OpenAI, triggers a
POST to local ingest, and inserts correct rows in `traces` and `spans`. That
works. The two-week block came in at roughly 10.5 hours against a 12-hour
budget, finished April 29 — about twelve days ahead of the May 11–24
calendar window.

That gap isn't impressive on its own. Weeks 1–4 are the part of the roadmap
most amenable to AI pair-programming — schemas, route handlers, well-defined
SDK surfaces. The estimates were padded for scaffolding work I was always
going to clear quickly. Weeks 6–7 (the waterfall) and Week 11 (polish) are
where the budget gets tight, and that's where the saved hours need to land.

## Schema decisions

### Text columns + Drizzle `$type<>`, not Postgres enums

`kind` and `status` are typed at compile time with `text("kind").$type<"llm" | "tool">()`,
but stored as plain `text` in Postgres. The pull toward an enum is the comfort
of "the database itself enforces the shape." That comfort costs a migration
every time a new value arrives — `ALTER TYPE ... ADD VALUE` is a real schema
change with real ceremony.

For an observability tool, the set of span kinds is exactly the kind of thing
that grows. Today it's `llm` and `tool`. Tomorrow it's `retrieval`, then
`evaluator`, then `agent.step`. I don't want to migrate the database every
time the SDK learns a new word.

The cost is that a typo in the SDK becomes bad data instead of a runtime
error. Mitigation: Zod validates `kind` at the ingest boundary as a
`z.enum(["llm", "tool"])`, so a mistyped span fails with `400` at the door
rather than rotting in `spans` for someone to notice in a query a month
later. The database stays flexible; the wire boundary stays strict.

### No FK on `parent_span_id`

`spans.trace_id → traces.id` has a foreign key with `ON DELETE CASCADE`.
`spans.parent_span_id` is also a span id, but has no FK constraint. The
pull toward adding one is consistency — both columns reference the same
table, both should have the same constraint.

The reason it doesn't is the bulk insert pattern. The SDK ships all spans
for a trace in one POST. They go into Postgres in a single
`INSERT ... VALUES (...), (...), ...`. Postgres evaluates row constraints
in array order; if a child span lands before its parent in the same array,
a self-referential FK fails. The fix is either to topologically sort the
spans before inserting, or to use `DEFERRABLE INITIALLY DEFERRED` constraints
and accept the bookkeeping. Both are extra work for a guarantee I don't
need: the only delete that matters is "the trace was deleted, take all its
spans with it," and that one is handled by the trace-level cascade.

If `parent_span_id` ever points to a non-existent id, the dashboard will
just render an orphan span. That's a recoverable visual bug, not data
corruption. Phase 2 will revisit if I add nested-span features that need
referential guarantees.

### `numeric(20, 10)` for `cost_usd`, string on the wire

The pull toward `double precision` is "it's just money, who cares about the
last picocent." Floats accumulating over millions of LLM calls drift in
ways that show up in user-visible totals — once a customer notices their
month's cost is off by a fraction, every subsequent number you show them is
suspect. I didn't want to pay a migration tax six months from now to fix a
column type I could have picked correctly on day one.

The trade-off is that the SDK does `cost.toFixed(10)` and ships a string,
which feels weird until you remember why. The wire format and the column
type are both lossless for the precision the dashboard cares about (ten
decimal places — far more than the actual prices need). Display rounding
happens at the UI layer.

### Three token columns, not just `total_tokens`

Most providers report all three: prompt, completion, total. The pull toward
storing only `total_tokens` is "it's literally the sum of the other two,
why duplicate." The reason it's worth duplicating is that providers don't
always sum cleanly — some include cached input tokens differently, some
have reasoning tokens that aren't in either bucket, some return slightly
different numbers in the streaming vs. non-streaming response shapes. If I
only store total, I lose the ability to surface the breakdown later, and
I lose the ability to detect when total ≠ prompt + completion (which is a
legitimate signal, not a bug).

The cost is twelve more bytes per span. Worth it.

## Ingest decisions

### Literal `/v1/traces`, not `/api/v1/traces`

Next.js convention is `/api/...`. The convention exists because in the
Pages Router era, `/api/` was a runtime distinction — files in `pages/api`
ran as serverless functions, files outside it didn't. App Router doesn't
care; a route handler is a route handler whether the URL has `/api/` in
it or not.

The pull toward `/api/v1/traces` is muscle memory. The case against is
that this is the public surface a third-party SDK targets. Users will be
configuring `TRACEBEE_BASE_URL` and reading "look up the SDK docs" for
years. `https://tracebee.dev/v1` is one less segment than
`https://tracebee.dev/api/v1`, and there's no benefit to the prefix
because every external request is API anyway. Stripe, OpenAI, Anthropic,
none of them have `/api/` in their public URLs.

### Separate `api-auth.ts`, not bolted onto `access.ts`

The dashboard already has `requireProjectAccess()` in `src/lib/access.ts`
that handles Auth.js sessions. The pull toward putting the API key check
there is "auth is auth, one helper." The reason to keep them apart is
that they answer different questions for different audiences. `access.ts`
asks "is this signed-in user allowed to see this project?" and redirects
to the sign-in page on failure. `api-auth.ts` asks "does this Bearer
token correspond to a non-revoked API key?" and returns a 401 envelope
on failure. The flow control is different, the failure modes are
different, the audience is different. The temptation to merge them comes
from the word "auth" being shared, not from any actual reuse.

### Zod `.strict()` and cross-validate `span.traceId === trace.id`

The schemas are `.strict()` so unknown keys produce a `400`. The
cross-validation rejects payloads where any span's `traceId` doesn't
match the envelope's trace `id`, also `400`. Both are catching SDK bugs
during development, not malicious input — by the time I'm rejecting a
trace because the SDK shipped a span with the wrong `traceId`, something
went very wrong upstream. But it's the kind of bug that's silent if you
let it through (the row inserts cleanly, just under the wrong trace),
and obvious if you reject it.

The cost is one extra `.find()` per request. At MVP volumes it's free.

### One transaction, two conflict policies

The full ingest is `db.transaction(tx => { tx.insert(traces).onConflictDoUpdate(...); tx.insert(spans).onConflictDoNothing(...); })`.
Same trace can be POSTed twice (retry on the SDK side, eventually);
the second POST should update the trace's `endedAt` and `status` (in case
the trace finished after the first POST started) but not duplicate spans.
That asymmetry — update for the trace, ignore for the spans — falls out
of the data model: a trace is a mutable container that's known by id from
the start, a span is an immutable event that's never re-emitted with
different data.

## SDK decisions

### `tsc` first, defer the bundler choice

The pull toward `tsup` or `tsdown` from day one is that everyone uses
them. They bundle, minify, emit dual ESM/CJS, generate `.d.ts`, and
they're fast. The reason to start with `tsc` is that none of those
features matter for a Node-only ESM SDK that hasn't been published.
`tsc` transpiles each `.ts` to `.js` and writes the declarations. That's
what's needed.

When I publish in Week 8, the cost-benefit changes — bundling lets me
ship a single file with tree-shakable exports, dual ESM/CJS unblocks
older Node and CommonJS consumers, the build is faster on every CI run.
That's when I'll switch. Picking the bundler now optimizes for a
problem I don't have.

### Native `fetch`, not `undici` or `axios`

Node 20+ has `fetch` built in. The SDK requires Node 20+. Adding a
dependency to call HTTP would be weight for no reason.

### `AsyncLocalStorage` for trace context

CLAUDE.md spec'd this as the trace propagation mechanism, but it's worth
recording why it's the right call. The alternative is explicit context
threading: `trace(name, ctx => { observeOpenAI(client, ctx).chat...; tool(name, ctx, fn) })`.
That's the pattern OpenTelemetry's earliest API tried, and the reason
they walked it back to context implicit-via-storage is that explicit
threading is hostile to library code. Alex calls a helper that calls a
helper that calls OpenAI; if every layer needs to know about the trace
context to pass it down, the SDK is no longer a five-line integration.

`AsyncLocalStorage` makes the propagation invisible. `trace()` opens an
ALS scope; anything inside the scope (including async work) reads the
same context. `tool()` and `observeOpenAI()` find the active trace
without the user threading it. That's what makes the integration small.

### Required base URL, no default

I don't have a real prod URL yet. The pull toward a default like
`https://tracebee.dev/v1` is "make the import-and-call path work." The
case against is that defaults silently misbehave: a user who forgets to
set `TRACEBEE_BASE_URL` and is running locally would have their script
appear to succeed (no error, no warning) while their traces vanish into
a domain that doesn't exist yet. Forcing the explicit env var means
configuration mistakes fail loud at the first call.

### Drain on `beforeExit` + `SIGTERM` + `SIGINT`, 2-second timeout

The SDK fires HTTP requests fire-and-forget from the user's
perspective. A module-level `Set<Promise<void>>` tracks them; signal
handlers `await Promise.race([Promise.allSettled([...inflight]), 2s])`
before exiting.

Two seconds is a guess that survives sanity checks. Healthy local POSTs
finish in tens of milliseconds; healthy production POSTs in low
hundreds. Two seconds is loose enough that a slow network rarely loses
a trace, tight enough that it doesn't make CI hang on graceful exit.
The right number lives somewhere between "the time you'd wait for a
test to finish" and "the time before someone Ctrl-C's harder."

The known limitation is that registering on `SIGTERM`/`SIGINT` means if
Alex has his own handlers (e.g. a graceful HTTP server shutdown), ours
runs alongside and can interfere. The signal flow in Node is messy —
the cleanest fix is to detect existing handlers and chain ours, which
is fiddly and not worth doing for MVP. For now the SDK can lose a
trace at Ctrl-C; that's a worse failure mode than crashing the user's
shutdown.

### Monkey-patch, not `Proxy`, for `observeOpenAI`

The pull toward `Proxy` is that it's the academically correct answer.
You wrap the client in a proxy with a `get` handler that returns a
proxy for `chat`, whose `get` returns a proxy for `completions`, whose
`get` returns a wrapped `create`. That's three levels of metaprogramming
to instrument one method.

Monkey-patch is one line: `client.chat.completions.create = wrap(original)`.
It mutates the user's client, which is the trade-off — the same client
instance now has different behavior, which is surprising if you expect
"observe" to mean "wrap, don't change." The mitigation is idempotency:
the wrapped function is tagged with `Symbol.for("@tracebee/sdk:wrapped")`,
so calling `observeOpenAI(client)` twice on the same client is a no-op.
Documentation will spell out the mutation when the README ships in 8.2.

The bigger reason `Proxy` lost is debuggability. If something breaks
inside the wrapped `create`, the stack trace from a monkey-patch is
straightforward — there's a function in the SDK that calls `original`.
The stack trace from a `Proxy` chain bounces through three handlers
and is hard to read. For something that's going to be debugged in
strangers' codebases, the simpler artifact wins.

### Hardcoded pricing table with version-suffix fallback

Real prices come from OpenAI/Anthropic and they change. The pull toward
fetching them at runtime is "always accurate." The case against is the
network call, the cache, the failure mode when the price service is
down, and the fact that the prices in question move by single-digit
percentages a few times a year — small relative to the noise in any
real cost calculation.

The MVP table covers four models and falls back via
`startsWith(model + "-")` for version-suffixed names like
`gpt-4o-2024-08-06`. Unknown model: `cost_usd` is `null`, span is
recorded anyway. Documented as best-effort. Override coming in a
later milestone.

The thing I'd revisit is making the table itself a `configure()`
option earlier than planned. Right now the only escape hatch for "your
prices are wrong" is a PR. A `pricing` field on `configure()` is
maybe an hour of work and it removes the SDK-as-source-of-truth
problem entirely.

### No `openai` peer dep, structural typing for the client

The SDK doesn't import `openai`. `observeOpenAI` takes `<T>(client: T): T`
and uses a minimal local interface — `client.chat.completions.create`
typed as `(params: { model?: string; stream?: boolean; ... }) => Promise<{ usage?: ... }>`.
At runtime it checks the function exists; otherwise throws.

The pull toward `peerDependencies: { openai: "^4.0.0" }` is type
fidelity — the user's `OpenAIChat.Completion` types would flow through.
The case against is the version-compatibility tax. OpenAI's SDK
restructures every couple of releases. Pinning a peer dep range means
either tracking those changes or shipping a compatibility matrix. None
of that earns its keep when the SDK only touches one method's call
signature.

## The mishap — the migration ran against production

When `0002_misty_zeigeist.sql` was generated and applied, it ran against
the production Neon branch instead of dev. Either `DATABASE_URL` was
exported in my shell, or `.env` had the prod connection string and beat
`.env.local` via `@next/env`'s precedence (`process.env > .env.NODE_ENV.local
> .env.local > .env.NODE_ENV > .env`).

Damage assessment: zero. The migration was purely additive — two
`CREATE TABLE`s, two FK constraints, two indexes. Production was always
going to need the same schema. The recovery was to apply the same
migration to dev with an explicit `DATABASE_URL='<dev-url>' pnpm --filter web db:migrate`,
which works because `process.env` overrides every `.env` file in the
precedence chain.

But I got lucky, not careful. The same accident with a destructive
migration — `DROP COLUMN`, `ALTER TYPE`, anything that rewrites a row —
would have been a real incident, possibly an unrecoverable one without
a recent backup. The lesson:

1. The `.env` hygiene rule from Week 2 ("only ever in `.env.local` for
   dev, only ever in Vercel for prod") needs to be enforced, not just
   stated. `.env` shouldn't exist in this repo. If it does, it should
   only contain non-sensitive defaults that are correct for both
   environments.
2. The migration command should refuse to run against a database whose
   connection string isn't explicitly tagged dev. Easiest version: a
   wrapper script that prints the target host and asks for confirmation
   unless `--yes` is passed. Adding to the Week 9 robustness backlog
   alongside the revoke-key flow.

## What got deferred

- `metadata` jsonb on traces — Week 10 task 10.1.
- `span_count` and `total_cost` denormalized on the trace row — defer until
  the Week 5 list view actually feels slow. Aggregating at query time costs
  one join; denormalizing costs trigger logic and a write-amplification.
- Parent-span tracking for nested `tool()` calls — would need a span-level
  ALS layer. Currently nested `tool()` produces sibling spans, which is
  visually wrong but data-correct. Defer.
- Streaming support in `observeOpenAI` — pass-through with no instrumentation
  for now. Streaming is its own can of worms (consume the stream while
  passing it through, accumulate tokens incrementally, handle backpressure).
  Phase 2.
- Anthropic equivalent (`observeAnthropic`) — Week 10 task 10.3.
- Test framework — honoring "no tests until Week 8."
- A `pricing` override on `configure()` — should land sooner than the
  current Week 10 cost-rollups task, ideally.

## What surprised me

How well structural typing held up for `observeOpenAI`. I expected to need
the `openai` package as at least a dev dep for types, but defining a tiny
local interface and casting at the boundary kept the SDK clean. The wrapped
function preserves the user's TypeScript inference because it returns the
same client instance back — `observeOpenAI(new OpenAI())` has the same type
as `new OpenAI()`, no special handling on Alex's side.

Pricing was the most "real" decision of the two weeks. Everything else is
plumbing — schemas, route handlers, context propagation, that's all stuff
with a known correct answer. The pricing table is the first place where the
SDK has an opinion that's visible to the user, and the opinion can be
wrong. That's worth more thought than I gave it.
