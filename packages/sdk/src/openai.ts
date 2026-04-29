import { getActiveTrace } from "./context.js";
import { computeCost } from "./pricing.js";
import { newId } from "./ulid.js";

const WRAPPED = Symbol.for("@tracebee/sdk:wrapped");

type ChatParams = {
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
};

type ChatResponse = {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
};

type ChatCreate = (params: ChatParams) => Promise<ChatResponse>;

export function observeOpenAI<T>(client: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  const original: ChatCreate | undefined = c?.chat?.completions?.create;
  if (typeof original !== "function") {
    throw new Error(
      "[tracebee] observeOpenAI: client.chat.completions.create not found",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((original as any)[WRAPPED]) return client;

  const wrapped: ChatCreate = async function (this: unknown, params: ChatParams) {
    if (params?.stream === true) {
      return original.call(c.chat.completions, params);
    }

    const ctx = getActiveTrace();
    if (!ctx) {
      return original.call(c.chat.completions, params);
    }

    const startedAt = new Date();
    const spanId = newId();

    try {
      const res = (await original.call(c.chat.completions, params)) as ChatResponse;
      const endedAt = new Date();
      const usage = res?.usage;
      const promptTokens = usage?.prompt_tokens;
      const completionTokens = usage?.completion_tokens;
      const totalTokens = usage?.total_tokens;
      const costUsd = computeCost(params.model, promptTokens, completionTokens);

      ctx.spans.push({
        id: spanId,
        traceId: ctx.traceId,
        name: "openai.chat",
        kind: "llm",
        status: "ok",
        startedAt,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        input: params,
        output: res,
        ...(params.model !== undefined && { model: params.model }),
        ...(promptTokens !== undefined && { promptTokens }),
        ...(completionTokens !== undefined && { completionTokens }),
        ...(totalTokens !== undefined && { totalTokens }),
        ...(costUsd !== null && { costUsd }),
      });

      return res;
    } catch (err) {
      const endedAt = new Date();
      ctx.spans.push({
        id: spanId,
        traceId: ctx.traceId,
        name: "openai.chat",
        kind: "llm",
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        startedAt,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        input: params,
        ...(params.model !== undefined && { model: params.model }),
      });
      throw err;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (wrapped as any)[WRAPPED] = true;
  c.chat.completions.create = wrapped;
  return client;
}
