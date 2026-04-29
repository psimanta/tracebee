import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { spans, traces } from "@/db/schema";
import { requireProjectAccess } from "@/lib/access";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import { TraceView } from "./TraceView";

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; traceId: string }>;
}) {
  const { projectId, traceId } = await params;
  const { project } = await requireProjectAccess(projectId);

  const [traceRow, spanRows] = await Promise.all([
    db
      .select()
      .from(traces)
      .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select()
      .from(spans)
      .where(eq(spans.traceId, traceId))
      .orderBy(asc(spans.startedAt), asc(spans.id)),
  ]);

  if (!traceRow) notFound();

  const duration = traceRow.endedAt
    ? formatDuration(traceRow.endedAt.getTime() - traceRow.startedAt.getTime())
    : "—";

  const errorCount = spanRows.filter((s) => s.status === "error").length;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/dashboard/${projectId}/traces`}
        className="text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Back to traces
      </Link>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">{traceRow.name}</h1>
        <span className="text-sm text-neutral-500">{project.name}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            Status
          </dt>
          <dd
            className={
              traceRow.status === "error"
                ? "text-red-600"
                : "text-neutral-700"
            }
          >
            {traceRow.status}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            Duration
          </dt>
          <dd className="text-neutral-700">{duration}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            Spans
          </dt>
          <dd className="text-neutral-700">{spanRows.length}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            Started
          </dt>
          <dd className="text-neutral-700">
            <time
              dateTime={traceRow.startedAt.toISOString()}
              title={traceRow.startedAt.toLocaleString()}
            >
              {formatRelativeTime(traceRow.startedAt)}
            </time>
          </dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-semibold text-neutral-900">
        Spans
        {errorCount > 0 ? (
          <span className="ml-2 font-normal text-red-600">
            · {errorCount} {errorCount === 1 ? "error" : "errors"}
          </span>
        ) : null}
      </h2>

      {spanRows.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">
          This trace has no spans.
        </p>
      ) : (
        <div className="mt-2">
          <TraceView spans={spanRows} />
        </div>
      )}
    </div>
  );
}
