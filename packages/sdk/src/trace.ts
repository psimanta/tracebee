import { getConfig, warnNotConfigured } from "./config.js";
import { runWithTrace, type TraceContext } from "./context.js";
import { flushTrace } from "./transport.js";
import { newId } from "./ulid.js";

export async function trace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const config = getConfig();
  if (!config) {
    warnNotConfigured();
    return fn();
  }

  const ctx: TraceContext = {
    traceId: newId(),
    name,
    startedAt: new Date(),
    spans: [],
    status: "ok",
  };

  try {
    const result = await runWithTrace(ctx, fn);
    flushTrace(ctx, new Date(), config);
    return result;
  } catch (err) {
    ctx.status = "error";
    flushTrace(ctx, new Date(), config);
    throw err;
  }
}
