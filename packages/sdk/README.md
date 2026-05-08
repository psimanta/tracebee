# @tracebee/sdk

TypeScript SDK for [Tracebee](https://github.com/psimanta/tracebee) —
observability for LLM agents. Wrap your OpenAI client and your tool calls,
and every LLM call and tool execution shows up as a span in the Tracebee
dashboard, grouped into traces.

> **Status:** `v0.1.x` — early. The API may change before `1.0`. Pin an
> exact version in production.

## Install

```sh
npm install @tracebee/sdk
# or: pnpm add @tracebee/sdk
```

Requires Node 20+.

## Quickstart

```ts
import OpenAI from "openai";
import { configure, observeOpenAI, trace, tool } from "@tracebee/sdk";

configure({
  apiKey: process.env.TRACEBEE_API_KEY!,
  baseUrl: "https://your-tracebee-instance.example.com",
});

const openai = observeOpenAI(new OpenAI());

await trace("answer-question", async () => {
  const docs = await tool("fetch-docs", async () => {
    return await fetchRelevantDocs();
  });

  return await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Using ${docs}, answer...` }],
  });
});
```

That's the full integration. `observeOpenAI` is called once at startup; every
`chat.completions.create` from then on is recorded as an LLM span. `trace()`
opens a trace context; any `tool()` and any wrapped OpenAI call inside the
callback becomes a span on that trace.

## API reference

### `configure(config)`

```ts
configure({ apiKey?: string; baseUrl?: string }): void
```

Set the SDK's API key and ingest URL. Both fields are optional in the call —
anything you don't pass falls back to the `TRACEBEE_API_KEY` and
`TRACEBEE_BASE_URL` environment variables. Calling `configure()` multiple
times merges over previous values rather than replacing them.

If neither explicit config nor env vars provide both fields, `trace()` becomes
a no-op (it still runs your callback) and the SDK prints one warning.

`baseUrl` must point at the host that serves the API directly — **not at a
host that redirects.** `fetch` strips the `Authorization` header when
following a cross-origin redirect (e.g. `tracebee.dev` → `www.tracebee.dev`),
so the redirected request arrives unauthenticated and the ingest returns 401.
If you see a 401 you can't explain, run `curl -i $BASE_URL/v1/traces` — a 3xx
response means your `baseUrl` is wrong.

### `trace(name, fn)`

```ts
trace<T>(name: string, fn: () => Promise<T>): Promise<T>
```

Open a trace, run `fn`, and flush the trace on completion. The return value
of `fn` is forwarded; thrown errors are forwarded too, with the trace marked
`status: "error"` before re-throwing.

The trace is sent in a single POST to `{baseUrl}/v1/traces` after `fn`
resolves. The SDK does not block your code on the network round-trip — the
request is fire-and-forget, drained on process exit (see
[How it works](#how-it-works)).

If the SDK isn't configured, `trace()` runs `fn` directly with no recording
and no error.

### `tool(name, fn)`

```ts
tool<T>(name: string, fn: () => Promise<T>): Promise<T>
```

Record a tool span on the currently active trace. Use this for anything
non-LLM that you want to see in the waterfall — fetching docs, calling an
external API, parsing a response, etc.

The span captures `name`, status, start/end time, duration, and the return
value of `fn` as `output`. Errors are captured with `errorMessage` and then
re-thrown.

If `tool()` is called outside a `trace()`, it runs `fn` and returns silently.
This is intentional — tools should compose into agents that may or may not
be traced.

### `observeOpenAI(client)`

```ts
observeOpenAI<T>(client: T): T
```

Patch an OpenAI client (the `openai` package, or any object with the same
`chat.completions.create` shape) so that every chat completion is recorded
as an LLM span. Returns the same client reference — the patch is in place,
not a wrapper proxy.

Captured per call: `model`, `input` (the params), `output` (the response),
`promptTokens`, `completionTokens`, `totalTokens`, and `costUsd` when the
model is known (see [Cost computation](#cost-computation)).

The patch is idempotent — calling `observeOpenAI` on the same client twice
is a no-op on the second call. If `client.chat.completions.create` doesn't
exist, it throws synchronously.

**Streaming calls (`stream: true`) pass through unrecorded.** Streaming
support is on the roadmap but not in `0.1`. This is a known limitation,
not a bug.

## What gets captured

For each trace:

- `id`, `name`, `status` (`ok` | `error`), `startedAt`, `endedAt`.

For each span:

- `id`, `traceId`, `name`, `kind` (`llm` | `tool`), `status`, `startedAt`,
  `endedAt`, `durationMs`.
- For tool spans: `output` of the wrapped function (or `errorMessage` on
  error).
- For LLM spans: `input` (the params object), `output` (the full response),
  `model`, `promptTokens`, `completionTokens`, `totalTokens`, and `costUsd`
  when computable.

### Cost computation

`costUsd` is computed from `usage.prompt_tokens` and `usage.completion_tokens`
on the response, against a built-in pricing table. Models in the table:

| Model           | Input ($/Mtok) | Output ($/Mtok) |
| --------------- | -------------- | --------------- |
| `gpt-4o`        | 2.50           | 10.00           |
| `gpt-4o-mini`   | 0.15           | 0.60            |
| `gpt-4-turbo`   | 10.00          | 30.00           |
| `gpt-3.5-turbo` | 0.50           | 1.50            |

Versioned model names (e.g. `gpt-4o-2024-08-06`) match their base model. Any
model not in the table records the span without a `costUsd` field.

## How it works

- **Trace context** is propagated using Node's
  [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage),
  so `tool()` and the patched OpenAI call automatically attach to the
  surrounding `trace()` even across `await` boundaries.
- **One HTTP POST per completed trace.** Spans are buffered in memory under
  the trace context and flushed in a single request when `trace()` resolves.
  No background timer, no queue, no retry.
- **Drain on exit.** Outstanding requests are tracked in a module-level
  `Set`. On `beforeExit`, `SIGTERM`, and `SIGINT`, the SDK awaits in-flight
  requests with a 2-second timeout before letting the process exit. Short
  scripts and serverless invocations don't lose their last trace.

## Error handling

The SDK never throws on transport errors. The goal is "instrumentation never
breaks your app."

| Response                | What happens                                         |
| ----------------------- | ---------------------------------------------------- |
| 2xx                     | Trace recorded.                                      |
| 401                     | `console.error` (loud — almost always a bad key).    |
| Other 4xx / 5xx         | `console.warn` with status code. Trace dropped.      |
| Network / fetch failure | `console.warn` with the error. Trace dropped.        |

Errors *inside* your traced code (in the `fn` you pass to `trace()` or
`tool()`, or in the LLM call) are captured on the span and re-thrown so your
existing error handling still runs.

## Not in `0.1`

- Streaming chat completions (passes through unrecorded today).
- Anthropic / non-OpenAI clients (Week 10 on the roadmap).
- Custom metadata / tags on traces (Week 10).
- Browser runtimes — Node-only. The SDK relies on `AsyncLocalStorage` and
  `process` exit hooks.
- Persistent queue, retries, sampling — out of scope for MVP.

## Repository

Source, issues, and roadmap:
[github.com/psimanta/tracebee](https://github.com/psimanta/tracebee/tree/main/packages/sdk).

## License

MIT — see [LICENSE](./LICENSE).
