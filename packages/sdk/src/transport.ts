import type { Config } from "./config.js";
import type { SpanRecord, TraceContext } from "./context.js";

const DRAIN_TIMEOUT_MS = 2000;

const inflight = new Set<Promise<void>>();
let exitHooksRegistered = false;

type WirePayload = {
  trace: {
    id: string;
    name: string;
    status: "ok" | "error";
    startedAt: string;
    endedAt: string;
  };
  spans: WireSpan[];
};

type WireSpan = {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: "llm" | "tool";
  status: "ok" | "error";
  errorMessage?: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: string;
};

function serializeSpan(s: SpanRecord): WireSpan {
  return {
    id: s.id,
    traceId: s.traceId,
    ...(s.parentSpanId !== undefined && { parentSpanId: s.parentSpanId }),
    name: s.name,
    kind: s.kind,
    status: s.status,
    ...(s.errorMessage !== undefined && { errorMessage: s.errorMessage }),
    startedAt: s.startedAt.toISOString(),
    ...(s.endedAt !== undefined && { endedAt: s.endedAt.toISOString() }),
    ...(s.durationMs !== undefined && { durationMs: s.durationMs }),
    ...(s.input !== undefined && { input: s.input }),
    ...(s.output !== undefined && { output: s.output }),
    ...(s.model !== undefined && { model: s.model }),
    ...(s.promptTokens !== undefined && { promptTokens: s.promptTokens }),
    ...(s.completionTokens !== undefined && { completionTokens: s.completionTokens }),
    ...(s.totalTokens !== undefined && { totalTokens: s.totalTokens }),
    ...(s.costUsd !== undefined && { costUsd: s.costUsd }),
  };
}

export function flushTrace(ctx: TraceContext, endedAt: Date, config: Config): void {
  registerExitHooks();

  const payload: WirePayload = {
    trace: {
      id: ctx.traceId,
      name: ctx.name,
      status: ctx.status,
      startedAt: ctx.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    },
    spans: ctx.spans.map(serializeSpan),
  };

  const promise = postTrace(payload, config);
  inflight.add(promise);
  promise.finally(() => inflight.delete(promise));
}

async function postTrace(payload: WirePayload, config: Config): Promise<void> {
  try {
    const res = await fetch(`${config.baseUrl}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      console.error(
        "[tracebee] 401 Unauthorized — check TRACEBEE_API_KEY. Trace dropped.",
      );
      return;
    }
    if (!res.ok) {
      console.warn(
        `[tracebee] ingest returned ${res.status}, trace dropped (id=${payload.trace.id})`,
      );
    }
  } catch (err) {
    console.warn("[tracebee] network error posting trace, dropped:", err);
  }
}

async function drain(timeoutMs = DRAIN_TIMEOUT_MS): Promise<void> {
  if (inflight.size === 0) return;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.allSettled([...inflight]), timeout]);
}

function registerExitHooks(): void {
  if (exitHooksRegistered) return;
  exitHooksRegistered = true;

  process.on("beforeExit", () => {
    void drain();
  });

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      void drain().finally(() => {
        process.exit(sig === "SIGTERM" ? 143 : 130);
      });
    });
  }
}
