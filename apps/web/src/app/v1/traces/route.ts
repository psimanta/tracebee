import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { spans, traces } from "@/db/schema";
import { authenticateApiKey } from "@/lib/api-auth";
import { logIngest } from "@/lib/log";
import { requestIdFrom } from "@/lib/request-id";

const MAX_BODY_BYTES = 1_000_000;

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ulid = z.string().regex(ULID, "must be a ULID");
const isoDate = z.iso.datetime({ offset: true });

const traceSchema = z
  .object({
    id: ulid,
    name: z.string().min(1).max(256),
    status: z.enum(["ok", "error"]),
    startedAt: isoDate,
    endedAt: isoDate.nullish(),
  })
  .strict();

const spanSchema = z
  .object({
    id: ulid,
    traceId: ulid,
    parentSpanId: ulid.nullish(),
    name: z.string().min(1).max(256),
    kind: z.enum(["llm", "tool"]),
    status: z.enum(["ok", "error"]),
    errorMessage: z.string().nullish(),
    startedAt: isoDate,
    endedAt: isoDate.nullish(),
    durationMs: z.number().int().nonnegative().nullish(),
    input: z.unknown().nullish(),
    output: z.unknown().nullish(),
    model: z.string().nullish(),
    promptTokens: z.number().int().nonnegative().nullish(),
    completionTokens: z.number().int().nonnegative().nullish(),
    totalTokens: z.number().int().nonnegative().nullish(),
    costUsd: z.string().nullish(),
  })
  .strict();

const payloadSchema = z
  .object({
    trace: traceSchema,
    spans: z.array(spanSchema).max(1000),
  })
  .strict();

function jsonError(
  status: number,
  requestId: string,
  body: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ...body, requestId },
    { status, headers: { "x-request-id": requestId } },
  );
}

export async function POST(req: Request) {
  const requestId = requestIdFrom(req);
  const startedAt = Date.now();

  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    const level = auth.reason === "invalid" ? "warn" : "info";
    logIngest(level, {
      requestId,
      status: 401,
      durationMs: Date.now() - startedAt,
      reason: `auth_${auth.reason}`,
    });
    return jsonError(401, requestId, {
      error: "unauthorized",
      reason: auth.reason,
    });
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    logIngest("info", {
      requestId,
      projectId: auth.projectId,
      status: 413,
      durationMs: Date.now() - startedAt,
      reason: "payload_too_large",
    });
    return jsonError(413, requestId, {
      error: "payload_too_large",
      limit: MAX_BODY_BYTES,
      got: contentLength,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logIngest("info", {
      requestId,
      projectId: auth.projectId,
      status: 400,
      durationMs: Date.now() - startedAt,
      reason: "invalid_json",
    });
    return jsonError(400, requestId, { error: "invalid_json" });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    logIngest("info", {
      requestId,
      projectId: auth.projectId,
      status: 400,
      durationMs: Date.now() - startedAt,
      reason: "validation_failed",
    });
    return jsonError(400, requestId, {
      error: "validation_failed",
      issues: parsed.error.issues,
    });
  }

  const { trace, spans: spanRows } = parsed.data;

  const mismatched = spanRows.find((s) => s.traceId !== trace.id);
  if (mismatched) {
    logIngest("info", {
      requestId,
      projectId: auth.projectId,
      traceId: trace.id,
      spanCount: spanRows.length,
      status: 400,
      durationMs: Date.now() - startedAt,
      reason: "span_trace_mismatch",
    });
    return jsonError(400, requestId, {
      error: "span_trace_mismatch",
      spanId: mismatched.id,
      expected: trace.id,
      got: mismatched.traceId,
    });
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(traces)
        .values({
          id: trace.id,
          projectId: auth.projectId,
          name: trace.name,
          status: trace.status,
          startedAt: new Date(trace.startedAt),
          endedAt: trace.endedAt ? new Date(trace.endedAt) : null,
        })
        .onConflictDoUpdate({
          target: traces.id,
          set: {
            status: trace.status,
            endedAt: trace.endedAt ? new Date(trace.endedAt) : null,
          },
        });

      if (spanRows.length > 0) {
        await tx
          .insert(spans)
          .values(
            spanRows.map((s) => ({
              id: s.id,
              traceId: s.traceId,
              parentSpanId: s.parentSpanId ?? null,
              name: s.name,
              kind: s.kind,
              status: s.status,
              errorMessage: s.errorMessage ?? null,
              startedAt: new Date(s.startedAt),
              endedAt: s.endedAt ? new Date(s.endedAt) : null,
              durationMs: s.durationMs ?? null,
              input: s.input ?? null,
              output: s.output ?? null,
              model: s.model ?? null,
              promptTokens: s.promptTokens ?? null,
              completionTokens: s.completionTokens ?? null,
              totalTokens: s.totalTokens ?? null,
              costUsd: s.costUsd ?? null,
            })),
          )
          .onConflictDoNothing({ target: spans.id });
      }
    });
  } catch (err) {
    logIngest("error", {
      requestId,
      projectId: auth.projectId,
      traceId: trace.id,
      spanCount: spanRows.length,
      status: 500,
      durationMs: Date.now() - startedAt,
      reason: "db_error",
      err,
    });
    return jsonError(500, requestId, { error: "internal" });
  }

  logIngest("info", {
    requestId,
    projectId: auth.projectId,
    traceId: trace.id,
    spanCount: spanRows.length,
    status: 202,
    durationMs: Date.now() - startedAt,
  });
  return new NextResponse(null, {
    status: 202,
    headers: { "x-request-id": requestId },
  });
}
