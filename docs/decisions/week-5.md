# Week 5 — Traces list view

Shipped: `/dashboard/[projectId]/traces` with cursor pagination, all six
columns from the spec (name, status, duration, span count, cost, started),
preset time-range and status filters, an empty state that branches on
whether the user filtered into nothing or has actually never sent a trace,
and a `loading.tsx` skeleton. Tab nav between Traces and Settings landed
on both project pages.

The exit criterion was that running the smoke script a few times produces
a sortable list of traces in the dashboard. Done. Came in at roughly five
hours against the five-hour budget — finished April 29, a day before the
May 10 calendar window opens, and from the same session as the Weeks 3–4
wrap.

## Pagination decisions

### Cursor on `(started_at, id)`, not offset

The pull toward offset is "page 7 is `OFFSET 300 LIMIT 50`, that's the
whole feature." Two reasons it's the wrong answer for this list:

1. **Drift under writes.** Every new trace lands at the top. If Alex is
   reading page 2 and a trace lands while he's reading, page 3 repeats
   one row and skips none. Annoying for a list ordered DESC by time.
2. **Cost.** Postgres has to walk every skipped row internally —
   `OFFSET 10000` reads ten thousand rows it then throws away. Slow at
   scale, fine at MVP scale, but the wrong shape: the cost grows with
   success.

Cursor pagination uses the value of the last-rendered row as the boundary
for the next page. New inserts above it don't shift the page; the query
jumps straight to the cursor via the existing `(project_id, started_at)`
index. Page 47 costs the same as page 1.

The `id` is the tiebreaker. Two traces could share `started_at` to
millisecond precision; without `id` in the comparison, the boundary
either skips or duplicates one row. ULIDs are unique, so adding `id` to
the order makes the boundary deterministic.

### Postgres row-value comparison, not the long-form OR

The predicate is `(started_at, id) < (cursor.startedAt, cursor.id)`. The
long form is `started_at < $1 OR (started_at = $1 AND id < $2)`. Same
semantics, more typing, harder to read, easier to get wrong. Postgres
compares tuples lexicographically out of the box.

It also plays well with Drizzle: the rest of the WHERE clause uses the
typed builder, and the cursor predicate is one `sql\`...\`` fragment.
Three lines instead of a manual builder for an operator Drizzle doesn't
have a first-class helper for.

### No total count, no numbered pages

The pull toward `SELECT COUNT(*)` alongside the page query is "render
'Page 2 of 47'." The case against is that count grows linearly with
project size. Cheap at 1k traces, ~30ms at 100k, painful at 10M. Every
page render gets slower in lockstep with how successful a project gets.

The compensating UX is the time-range filter (`1h`, `24h`, `7d`, `30d`).
That's a better mental model for a debugging stream — Alex doesn't think
"page 47," he thinks "Tuesday around 2pm." Stripe and Datadog do the
same thing for the same reason.

If dogfooding in Week 12 surfaces a real need ("I want to know how much
I sent today"), that's a different query in a different place — a stats
card on the dashboard home, not pagination chrome.

### `+1` trick for `hasNext`

Fetch `PAGE_SIZE + 1`, slice off the 51st before rendering. The
presence of the 51st row is the signal that there's more. No second
`COUNT(*)` query, no separate "is this the last page" check. Standard
pattern; worth recording so I don't forget why the limit is `51`.

## Query decisions

### Aggregates at query time, not denormalized on the trace row

Span count and cost rollup come from a `LEFT JOIN spans` with `count()`
and `sum()`, grouped by `traces.id`. The pull toward storing
`span_count` and `total_cost` columns on `traces` and updating them in
the ingest transaction is "fast read, single row."

The reason to defer that until measured: aggregates over a 50-row page
are constant cost. The join touches at most the spans for those 50
traces — at average 10 spans per trace, that's 500 rows joined. Postgres
does this in a few ms with the existing `spans_trace_started_idx`. The
denormalized version saves a join but pays for it on every ingest with
extra writes and a window for drift between the trace's stored count
and the actual row count.

The Week 3–4 doc explicitly said "defer until the Week 5 list view
actually feels slow." It doesn't.

If the trace detail page in 6.x or the project rollups in 10.4 surface
a real perf wall, denormalization is the answer then. Not now.

### Cost as `string` from the driver, parsed at render

`cost_usd` is `numeric(20, 10)`. node-postgres returns numerics as
strings to avoid float precision loss. The render path does
`Number(r.costUsd).toFixed(4)` for display. The cost is a JS-side
parse; the benefit is that the wire format and the column type stay
lossless.

The thing I'd revisit if any actual rendering shows up downstream is
centralizing the parse — right now it's inline at the call site. Once
the trace detail page in 6.x also displays cost (per-span and totals),
I'll lift it into `format.ts` next to `formatDuration`.

## Filter decisions

### URL is the source of truth, no client state

Both filters live in `searchParams`: `?status=ok&range=24h&cursor=...`.
Bookmarkable, back-button works, no `"use client"` anywhere. The page
is a server component, the filter pills are anchor links, the form is
the URL.

The pull toward a controlled `<select>` or React state is muscle memory
from SPA dashboards. The case against is that none of the affordances
of client state pay off here — nothing changes faster than the page
reload, nothing needs validation feedback before submit, nothing
benefits from optimistic UI. Server-rendered links are smaller, simpler,
and free of hydration cost.

### Filter changes reset the cursor

Critical correctness point. A cursor like
`(started_at < 2026-04-29T14:00, id < 01ARZ...)` is meaningless once
you switch from "Status: All" to "Status: Error" — you might be
paginating into a different filtered list, where the boundary row
isn't even in the result set. Either the next page silently skips
rows or the boundary lands somewhere arbitrary.

The fix is in the URL builder: filter pill links call
`buildUrl({ status, range })` without a `cursor`. Only the `Next →`
link calls it with `{ status, range, cursor: nextCursor }`. The cursor
only ever propagates within the same filter set.

### Preset ranges, not custom from/to

Preset ranges are five anchor links. Custom from/to is two date inputs,
validation, URL encoding, an "apply" button or live updates. Custom is
more flexible; preset is more useful. The way I actually debug an agent
run is "what happened in the last hour?", not "show me logs between
2026-04-12T14:23:00Z and 2026-04-12T14:31:00Z."

If dogfooding shows the presets are too coarse, custom is a stretch.
Not now.

### Empty state branches on `filtersActive`

Two empty states, same shape. If no filters are active and zero rows
return, the user has never sent a trace — render the "Generate an API
key in Settings" CTA. If filters are active and zero rows return, the
user just filtered into nothing — render "No traces match these
filters" with a "Clear filters" link.

The bug to avoid was telling a user with thousands of traces to "go
to Settings" because they'd selected `Error + 1h` on a quiet hour.
Wrong gradient — they'd think the dashboard is broken.

### The filters task was on the cut list

The roadmap pre-committed cuts in drop order, and "filters in list
view (Week 5)" was the fifth item. The week came in under budget; the
filters earned their place because the empty-state branch and the
time-range pills are the two smallest touches that make the list feel
like a debugging tool instead of a log dump. Cutting them is fine if
the calendar tightens later — the rest of Week 5 stands alone.

## UI decisions

### `format.ts` as a module, not inline

`formatDuration` and `formatRelativeTime` are pure helpers in
`src/lib/format.ts`. Two known callers ahead of time (the trace list,
the trace detail page in 6.x) make extraction not premature. The cost
is one tiny module file; the benefit is that the trace detail page
in 6.x doesn't redefine the same logic.

The thresholds (`<1s` → `Nms`, `<1min` → `N.Ns`, `<1hr` → `Nm Ns`,
otherwise `Nh Nm`) match how humans read durations once they cross a
unit boundary. Same shape for relative time (`Just now`, `Nm ago`,
`Nh ago`, `Nd ago`, then absolute date).

### Tab nav inlined twice, not extracted

Traces and Settings each render the same tab nav row, with the active
tab differing by one branch. Two callsites, ~12 lines each. Extracting
a `<ProjectNav active="traces" />` would save ~12 lines but introduce
a third file for a navigation component nobody else uses.

CLAUDE.md says "three similar lines is better than a premature
abstraction." The bar to extract is a third callsite — if the
revoke-key flow in 9.4 lands as a third project page, or if a
per-project usage page shows up in 10.4, that's the moment.

### `loading.tsx` is generic, not project-aware

`loading.tsx` in App Router doesn't receive `params` — it's a static
fallback shown via Suspense while the page resolves. So the project
name renders as a gray bar (no name available), and the tab nav is a
divider line (no `projectId` to build the Settings href).

The skeleton pulses through `animate-pulse` with row widths varied so
seven identical bars don't read as a placeholder grid. Small touch
that makes the loading state look intentional rather than abandoned.

If the placeholder-instead-of-real project name is ever annoying, the
fix is to push the tab nav and project header up into the
`[projectId]` segment's layout (which does receive params), and let
`loading.tsx` only cover the table. Not annoying enough yet.

## What got deferred

- **Click-through to trace detail.** Each row should link to
  `/traces/[traceId]`. That's task 6.1 — the route doesn't exist yet,
  so rows are unclickable. One-liner once 6.1 lands.
- **Total trace count anywhere on the page.** No `COUNT(*)` at all. If
  12.x dogfooding shows a real need, an approximate count from
  `pg_class.reltuples` or a denormalized counter on `projects` is the
  path.
- **Custom date range filter.** Five preset ranges only.
- **SDK install snippet in the empty state.** Waits for the SDK to be
  published in 8.1 and the README in 8.2. The current empty state
  points to Settings; enough until the SDK has a real install command.
- **ProjectNav extraction.** Two callsites, inlined. Extract on the
  third.
- **Status added to the list-page index.** The query filters by status
  after `(project_id, started_at)` narrows the rows. At MVP volumes
  the filter is in-memory and free. If 9.x dogfooding shows a hot
  path, `(project_id, started_at, status)` or a partial index on
  `status = 'error'` is the fix.
- **Previous-page link.** Cursor pagination is forward-only by default.
  Building "previous" requires either keeping a cursor stack in the
  URL or a second predicate (`>` instead of `<` with `LIMIT` and
  reverse). Not requested, not built.

## What surprised me

How short the actual cursor implementation is. The mental model is
intricate (lexicographic tuple comparison, the `+1` trick, the
filters-reset-cursor invariant), but the code is fifteen lines
including the helper. Most of the page file is the table render and
the filter pills.

The `loading.tsx` no-params constraint. I wanted to render the project
name in the skeleton and discovered it's not possible without
restructuring the route segment. Documented it; the workaround exists
if it ever matters. Not blocking anything today.

The aggregates-at-query-time path performed exactly as Week 3–4
predicted. Indexes earn their keep; don't denormalize until a query
plan tells me to.
