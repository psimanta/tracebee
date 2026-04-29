import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { spans, traces } from "@/db/schema";
import { authenticateApiKey } from "@/lib/api-auth";

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

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { trace, spans: spanRows } = parsed.data;

  const mismatched = spanRows.find((s) => s.traceId !== trace.id);
  if (mismatched) {
    return NextResponse.json(
      {
        error: "span_trace_mismatch",
        spanId: mismatched.id,
        expected: trace.id,
        got: mismatched.traceId,
      },
      { status: 400 },
    );
  }

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

  return new NextResponse(null, { status: 202 });
}
