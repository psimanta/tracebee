import Link from "next/link";
import { and, count, desc, eq, gte, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { spans, traces } from "@/db/schema";
import { requireProjectAccess } from "@/lib/access";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { formatDuration, formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 50;

type StatusFilter = "ok" | "error";
type RangeFilter = "1h" | "24h" | "7d" | "30d";

const RANGE_MS: Record<RangeFilter, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

function parseStatus(v: string | undefined): StatusFilter | null {
  return v === "ok" || v === "error" ? v : null;
}

function parseRange(v: string | undefined): RangeFilter | null {
  return v === "1h" || v === "24h" || v === "7d" || v === "30d" ? v : null;
}

function rangeToSince(
  r: RangeFilter | null,
  now: Date = new Date(),
): Date | null {
  if (!r) return null;
  return new Date(now.getTime() - RANGE_MS[r]);
}

export default async function TracesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    cursor?: string;
    status?: string;
    range?: string;
  }>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const { project } = await requireProjectAccess(projectId);

  const cursor = decodeCursor(sp.cursor);
  const status = parseStatus(sp.status);
  const range = parseRange(sp.range);
  const since = rangeToSince(range);
  const filtersActive = status !== null || range !== null;

  const buildUrl = (next: {
    status?: StatusFilter | null;
    range?: RangeFilter | null;
    cursor?: string | null;
  }) => {
    const usp = new URLSearchParams();
    if (next.status) usp.set("status", next.status);
    if (next.range) usp.set("range", next.range);
    if (next.cursor) usp.set("cursor", next.cursor);
    const q = usp.toString();
    return `/dashboard/${projectId}/traces${q ? `?${q}` : ""}`;
  };

  const wheres: SQL[] = [eq(traces.projectId, projectId)];
  if (status) wheres.push(eq(traces.status, status));
  if (since) wheres.push(gte(traces.startedAt, since));
  if (cursor) {
    wheres.push(
      sql`(${traces.startedAt}, ${traces.id}) < (${cursor.startedAt}::timestamptz, ${cursor.id})`,
    );
  }
  const where = and(...wheres);

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

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-1">
          <span className="mr-1 text-neutral-500">Status:</span>
          <FilterPill href={buildUrl({ range })} active={status === null}>
            All
          </FilterPill>
          <FilterPill
            href={buildUrl({ status: "ok", range })}
            active={status === "ok"}
          >
            OK
          </FilterPill>
          <FilterPill
            href={buildUrl({ status: "error", range })}
            active={status === "error"}
          >
            Error
          </FilterPill>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-neutral-500">Range:</span>
          <FilterPill
            href={buildUrl({ status, range: "1h" })}
            active={range === "1h"}
          >
            1h
          </FilterPill>
          <FilterPill
            href={buildUrl({ status, range: "24h" })}
            active={range === "24h"}
          >
            24h
          </FilterPill>
          <FilterPill
            href={buildUrl({ status, range: "7d" })}
            active={range === "7d"}
          >
            7d
          </FilterPill>
          <FilterPill
            href={buildUrl({ status, range: "30d" })}
            active={range === "30d"}
          >
            30d
          </FilterPill>
          <FilterPill href={buildUrl({ status })} active={range === null}>
            All
          </FilterPill>
        </div>
      </div>

      {pageRows.length === 0 ? (
        filtersActive ? (
          <div className="mt-12 flex flex-col items-center rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
            <h2 className="text-base font-semibold text-neutral-900">
              No traces match these filters
            </h2>
            <p className="mt-2 max-w-sm text-sm text-neutral-600">
              Try a wider time range or a different status.
            </p>
            <Link
              href={buildUrl({})}
              className="mt-5 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
            <h2 className="text-base font-semibold text-neutral-900">
              No traces yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-neutral-600">
              Generate an API key in Settings and integrate the SDK to start
              sending traces.
            </p>
            <Link
              href={`/dashboard/${projectId}/settings`}
              className="mt-5 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Go to Settings
            </Link>
          </div>
        )
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
            href={buildUrl({ status, range, cursor: nextCursor })}
            className="text-sm text-neutral-700 hover:text-neutral-900"
          >
            Next →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded bg-neutral-900 px-2 py-1 text-white"
          : "rounded px-2 py-1 text-neutral-700 hover:bg-neutral-100"
      }
    >
      {children}
    </Link>
  );
}
