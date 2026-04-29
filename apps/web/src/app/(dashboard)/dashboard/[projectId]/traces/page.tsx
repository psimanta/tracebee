import Link from "next/link";
import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { spans, traces } from "@/db/schema";
import { requireProjectAccess } from "@/lib/access";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { formatDuration, formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 50;

export default async function TracesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { projectId } = await params;
  const { cursor: cursorParam } = await searchParams;
  const { project } = await requireProjectAccess(projectId);
  const cursor = decodeCursor(cursorParam);

  const projectFilter = eq(traces.projectId, projectId);
  const where = cursor
    ? and(
        projectFilter,
        sql`(${traces.startedAt}, ${traces.id}) < (${cursor.startedAt}::timestamptz, ${cursor.id})`,
      )
    : projectFilter;

  const rows = await db
    .select({
      id: traces.id,
      name: traces.name,
      status: traces.status,
      startedAt: traces.startedAt,
      endedAt: traces.endedAt,
      spanCount: count(spans.id),
      costUsd: sum(spans.costUsd),
    })
    .from(traces)
    .leftJoin(spans, eq(spans.traceId, traces.id))
    .where(where)
    .groupBy(traces.id)
    .orderBy(desc(traces.startedAt), desc(traces.id))
    .limit(PAGE_SIZE + 1);

  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = hasNext ? rows.slice(0, PAGE_SIZE) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasNext && lastRow
      ? encodeCursor({
          startedAt: lastRow.startedAt.toISOString(),
          id: lastRow.id,
        })
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard"
        className="text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Back to projects
      </Link>

      <h1 className="mt-4 text-xl font-semibold">{project.name}</h1>

      <nav className="mt-3 flex gap-4 border-b border-neutral-200 text-sm">
        <span className="-mb-px border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900">
          Traces
        </span>
        <Link
          href={`/dashboard/${projectId}/settings`}
          className="-mb-px border-b-2 border-transparent pb-2 text-neutral-600 hover:text-neutral-900"
        >
          Settings
        </Link>
      </nav>

      {pageRows.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">No traces yet.</p>
      ) : (
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Duration</th>
              <th className="py-2 pr-4 font-medium">Spans</th>
              <th className="py-2 pr-4 font-medium">Cost</th>
              <th className="py-2 pr-4 font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const duration = r.endedAt
                ? formatDuration(r.endedAt.getTime() - r.startedAt.getTime())
                : "—";
              const cost = r.costUsd
                ? `$${Number(r.costUsd).toFixed(4)}`
                : "—";
              return (
                <tr key={r.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        r.status === "error"
                          ? "text-red-600"
                          : "text-neutral-700"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-700">{duration}</td>
                  <td className="py-2 pr-4 text-neutral-700">
                    {Number(r.spanCount)}
                  </td>
                  <td className="py-2 pr-4 text-neutral-700">{cost}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    <time
                      dateTime={r.startedAt.toISOString()}
                      title={r.startedAt.toLocaleString()}
                    >
                      {formatRelativeTime(r.startedAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {hasNext && nextCursor ? (
        <div className="mt-6">
          <Link
            href={`/dashboard/${projectId}/traces?cursor=${encodeURIComponent(nextCursor)}`}
            className="text-sm text-neutral-700 hover:text-neutral-900"
          >
            Next →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
