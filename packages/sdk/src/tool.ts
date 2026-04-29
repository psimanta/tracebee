import { getActiveTrace } from "./context.js";
import { newId } from "./ulid.js";

export async function tool<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const ctx = getActiveTrace();
  if (!ctx) return fn();

  const startedAt = new Date();
  const spanId = newId();

  try {
    const result = await fn();
    const endedAt = new Date();
    ctx.spans.push({
      id: spanId,
      traceId: ctx.traceId,
      name,
      kind: "tool",
      status: "ok",
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      output: result,
    });
    return result;
  } catch (err) {
    const endedAt = new Date();
    ctx.spans.push({
      id: spanId,
      traceId: ctx.traceId,
      name,
      kind: "tool",
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
    });
    throw err;
  }
}
