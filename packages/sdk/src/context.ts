import { AsyncLocalStorage } from "node:async_hooks";

export type SpanRecord = {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: "llm" | "tool";
  status: "ok" | "error";
  errorMessage?: string;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: string;
};

export type TraceContext = {
  traceId: string;
  name: string;
  startedAt: Date;
  spans: SpanRecord[];
  status: "ok" | "error";
};

const als = new AsyncLocalStorage<TraceContext>();

export function runWithTrace<T>(ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

export function getActiveTrace(): TraceContext | undefined {
  return als.getStore();
}
