# Weeks 6–7 — The hero screen

Shipped: `/traces/[traceId]` server-rendered with a parallel fetch of the
trace row and its spans, the waterfall view (time axis, span rows, color
coding), the span detail panel (timing, tokens for LLM spans, input/output,
metadata), click-to-select with arrow-key navigation, edge-case handling for
long traces and very short spans and failed spans, a side-by-side layout on
`lg` breakpoints so the panel doesn't disappear below a long span list, and
a sticky time axis + sticky span-name column so the chart stays legible
during both vertical and horizontal scroll. Plus a fixture-generator script
in `packages/sdk/scripts/gen-long-trace.mjs` for testing without burning
real OpenAI tokens.

The exit criterion was that clicking any trace in the list opens a detail
view where the waterfall reads correctly at a glance and clicking a span
reveals its full input/output. Done. The whole 6.1–6.6 block came in at
roughly five hours against the ~15-hour budget — finished April 30, the day
after Weeks 3–5 wrapped, and forty days before the June 8 calendar window
opens.

The buffer the roadmap had reallocated to "extend Weeks 6–7 and Week 11"
is now banked entirely for Week 11. The hero screen turned out to be more
straightforward than the budget suggested, but Week 11 polish is the kind
of work that absorbs whatever time you give it.

## Architecture decisions

### Single `TraceView` client wrapper, not a page-wide `"use client"`

The detail page does three things: a database fetch, a waterfall render,
and a span-detail render. Only the waterfall ↔ panel selection state
needs to be on the client. The pull toward `"use client"` at the top of
`page.tsx` is one fewer file and no boundary plumbing.

The case against is that the database fetch lives at the top of the page,
and a client page can't run server-only code. Even setting that aside,
the panel's contents are pure-data render — there's no reason to ship its
JSX as a client component. Moving the boundary down one level
(`page.tsx` server, `TraceView.tsx` client wrapper, `Waterfall.tsx`
client for event handlers, `SpanDetail.tsx` server-shaped) lets each
piece be the smallest thing it needs to be. The page stays a server
component with `await db.select(...)`, the heavy detail panel doesn't
ship to the client, and the only `"use client"` directives are on
components that actually use hooks or events.

The cost is one extra file and one prop interface. Worth it for the
boundary clarity alone, regardless of bundle size.

### `Date` objects passed across the RSC boundary, not ISO strings

The page fetches `spans` from Drizzle and passes them directly to
`<TraceView spans={spanRows} />` as `Span[]`. Drizzle returns
`startedAt`, `endedAt` as JavaScript `Date` objects. The pull toward
`spanRows.map(s => ({ ...s, startedAt: s.startedAt.toISOString() }))`
is muscle memory from JSON-serialized fetch responses.

Next.js 15's RSC serialization handles `Date` natively — it round-trips
across the boundary without manual conversion, and the client gets a
`Date` instance, not a string. So `Waterfall` can call
`span.startedAt.getTime()` directly without re-parsing.

The reason to record this is that the opposite is true for many types
(`Map`, `Set`, class instances), and the muscle-memory conversion would
have been a small but unnecessary tax on every page that crosses the
boundary.

### `typeof spans.$inferSelect` for the prop type, not a hand-rolled DTO

`SpanDetail` and `TraceView` both type their `span`/`spans` props as
`typeof spans.$inferSelect` from the Drizzle schema. The pull toward a
`type Span = { id: string; name: string; ... }` DTO is the comfort of
"the UI shouldn't depend on the database schema."

The case against is that the UI is the database schema, viewed
through formatters. Every time the schema changes, the UI needs to
follow — re-typing the DTO is bookkeeping that adds no information.
`$inferSelect` makes the dependency explicit: when a column lands or
moves, the UI either compiles or doesn't, immediately.

The escape hatch, when a real abstraction layer is needed (mapping a
domain type that's distinct from the row shape), is to introduce it
when the abstraction earns its keep — not preemptively.

## Waterfall rendering decisions

### Started in SVG, rewrote in HTML + CSS

The first cut was a single `<svg>` with `<rect>` bars, `<text>` labels,
and `<line>` gridlines. SVG made the math direct — one coordinate
system, `<g transform="translate(x, y)">` for row offsets, no
flexbox/grid bookkeeping. That worked through 6.4.

The breaking point came in 6.5 when long traces revealed the
double-scroll problem: vertical scroll for many spans, horizontal
scroll for the time axis. SVG sub-elements don't honor
`position: sticky` — sticky is a CSS layout property, and SVG has
its own coordinate model. Pinning the time axis to the top during
vertical scroll, or pinning the span-name column to the left during
horizontal scroll, was unreachable from inside an `<svg>` without
JavaScript-based scroll listeners (which fight the browser's native
scroll behavior and feel laggy).

The rewrite was smaller than expected. The math (scale function,
ticks, bar widths) is identical; only the elements changed. Bars
became absolutely-positioned `<div>`s, gridlines became 1px-wide
`<div>`s with `position: absolute; top: 0; bottom: 0`, the row layout
became flex with one sticky-left cell. Roughly 30 lines of structural
churn for two layout properties that SVG couldn't give me.

The lesson: SVG is the right tool for charts where the visualization
is the whole interaction. The moment scroll, hover-row-highlighting,
or click-on-row enters the picture, HTML+CSS earns its keep.

### Continuous gridlines, not per-row gridlines

The five vertical gridlines span the full body height as five
absolute-positioned `<div>`s with `top: 0; bottom: 0; width: 1px`.
Rendered once, behind every row.

The pull toward per-row gridlines (five 1px divs inside each span
row) is uniformity — every row knows about its own ticks, no shared
parent state. That's also five times the DOM weight at 100 spans:
500 gridline elements instead of 5. At 1000 spans (eventually
plausible) it's 5000 vs 5.

Continuous gridlines are also the right metaphor: a tick at "200ms"
is one position in the chart, not 100 separate positions that happen
to align. Per-row gridlines would also need to align across rows
pixel-perfect, which they would by construction here, but the
continuous version makes the alignment a fact of the layout rather
than a coincidence.

### Color encoding: status-first, kind-second, name-color for errors

The status branch wins outright:

```ts
function colorFor(span: WaterfallSpan): string {
  if (span.status === "error") return "#ef4444";
  return span.kind === "llm" ? "#3b82f6" : "#8b5cf6";
}
```

Plus the span name renders red (`#dc2626`) when the status is `error`.
The same signal — "this span failed" — is encoded twice: bar color,
and label color. The pull toward "don't be redundant, pick one" misses
that the bar is small (16px tall, often a few pixels wide for fast
spans) and the label is the eye's first stop in the row. Either alone
is too easy to miss when scanning.

Kind (`llm` vs `tool`) is a classification — blue vs purple, both
calm. Status (`error`) is an alert — red, doubled. The visual hierarchy
matches the cognitive priority: classifications are background
information, alerts demand attention.

## Interaction decisions

### Side-by-side layout on `lg`, not full-width-then-below

The original 6.3 plan put the panel below the waterfall. That's the
layout shadcn examples and most observability tools use, and it
defers responsive layout work to Week 11.

The 6.5 fixture script (34 spans, 952px tall waterfall) immediately
showed the friction: clicking row #20, scrolling down to read the
panel, scrolling back up to click row #21, scrolling down again. For
the hero screen — the feature the whole project is built around — that
felt unshippable. A two-column layout at `lg:` was a 30-minute change
that fixed it. The cost is a minor deviation from the roadmap's
"defer responsive polish to Week 11" framing.

CLAUDE.md's "don't refactor outside the current task's scope" rule
held up here — the call wasn't "polish the layout," it was "the
panel below the waterfall doesn't pass 6.6's self-review." Different
framing, same change.

### Sticky panel via `lg:sticky lg:top-4`

In the side-by-side layout, the waterfall is tall and the panel is
shorter. Without sticky, scrolling the page to look at the bottom of
the waterfall pushes the panel off-screen. `lg:sticky lg:top-4` on
the waterfall wrapper (with `lg:items-start` on the flex parent so
the waterfall doesn't stretch to match the panel's height) pins the
chart to the top while the page scrolls — but actually the panel is
the one that stays visible because the chart is the taller one and
the panel is the column-mate that scrolls past.

The mental model: in a flex row with `items-start`, the taller column
scrolls naturally, and `sticky` on the shorter column keeps it
anchored. I had to prototype this to convince myself it worked. The
final structure has sticky on the waterfall wrapper, not on the panel.

### Manual `scrollTop`, not `scrollIntoView`

When the user arrow-keys to a span that's outside the visible window,
the waterfall scroller needs to bring it into view. The first cut was
`row.scrollIntoView({ block: "nearest", behavior: "instant" })`. That
worked — until the sticky-name-column rewrite made horizontal scrolling
actually meaningful. After that, every click on a row that was within
the visible window jumped horizontal scroll back to position 0.

The cause: `scrollIntoView` defaults `inline` to `"nearest"` when
unspecified. The browser's "nearest inline edge" heuristic is sensitive
to row width. Each row is `TOTAL_WIDTH = 960px` (label + chart). On a
viewport narrower than that, the browser decided the "nearest inline
edge" was the row's left edge and scrolled to bring it flush, even
when the row was already visible.

The fix is to never call `scrollIntoView` and instead walk up to the
scroller manually:

```ts
const row = document.getElementById(`waterfall-row-${selectedId}`);
if (!row) return;
const scroller = row.closest<HTMLElement>("[data-waterfall-scroller]");
if (!scroller) return;

const rowRect = row.getBoundingClientRect();
const scrollerRect = scroller.getBoundingClientRect();
const STICKY_HEADER_H = 32;
const visibleTop = scrollerRect.top + STICKY_HEADER_H;
const visibleBottom = scrollerRect.bottom;

if (rowRect.top < visibleTop) {
  scroller.scrollTop -= visibleTop - rowRect.top;
} else if (rowRect.bottom > visibleBottom) {
  scroller.scrollTop += rowRect.bottom - visibleBottom;
}
```

Two adjustments only happen when the row is actually outside the
visible window. `scrollLeft` is never touched. The sticky header is
32px tall, so `visibleTop` is the scroller's top plus the header
height — landing a row exactly at `visibleTop` would put it
underneath the sticky axis, which is wrong.

The data attribute (`[data-waterfall-scroller]`) on the Waterfall
outer is what lets `TraceView`'s `useEffect` find the scroller from
a row. Putting the lookup in `TraceView` instead of `Waterfall`
keeps the scroll logic next to the selection state — same component
that owns "which span is selected" owns "scroll the selected span
into view."

### Click on a row also focuses the wrapper

`onClick` does both `setSelectedId(id)` and
`wrapperRef.current?.focus()`. Without the focus call, clicking a
row selects it but leaves the focus on `<body>`, so arrow keys do
browser-default page scroll instead of moving the selection.

This is a roving-tabindex pattern: the wrapper has `tabIndex={0}`
and listens for `ArrowUp`/`ArrowDown`, individual rows are not
focusable. One focus target for the whole list, keyboard nav within
the list is purely state-driven. Standard pattern for
list-with-arrow-key-navigation; worth recording so I don't reach
for "make every row focusable" by reflex next time.

## The bugs worth remembering

### `scrollIntoView` killed horizontal scroll

Covered above. The thing worth flagging separately is the surfacing
pattern: this was a latent bug from the moment `scrollIntoView` was
introduced in 6.4, but it didn't manifest until 6.5's sticky-column
work made horizontal scroll a thing the user actually does. A test
that exercised "click a row when the chart is scrolled right" would
have caught it; manual smoke-testing with a short trace did not.

The general lesson: when you change the surface a feature interacts
with (here: the scroll surface), re-test the existing features against
the new surface. Sticky columns weren't a "polish" change — they were
a layout change, and layout changes can invalidate scroll-related
assumptions.

### React 19 `<title>` rejecting array children

Inside the SVG version of the waterfall, each `<rect>` had a child
`<title>{span.name} {"—"} {durationLabel}</title>` for native browser
tooltips. React 19 logged:

> React expects the children prop of <title> tags to be a string,
> number, bigint, boolean, null, undefined, or never but found an
> Array with length 5.

The braces `{"—"}` separate three nodes (text, em-dash text, text)
which React passes as an array. React 19 tightened this — earlier
versions silently coerced, 19 warns. Fix was a template literal:
`<title>{`${span.name} — ${durationLabel}`}</title>`.

The latency is interesting: this was technically wrong from 6.2, but
the warning only appeared after `Waterfall` got a `"use client"`
directive in the sticky-rewrite. Server-rendered SVG either tolerated
it or the warning was suppressed in production builds. Worth flagging
because "looks fine in dev, console-warn in client" is a category of
React 19 strictness that's easy to miss.

The HTML rewrite kept the same pattern using `title` as a DOM
attribute on the row div, which takes a string directly — the array
problem disappears by construction.

## What got deferred

- **Sub-span nesting / tree indentation.** `parent_span_id` exists
  on the schema, but the SDK currently emits siblings under the
  trace (Weeks 3–4 deferral, called out there). Rendering as a flat
  list is honest about what the data is. When the SDK gains nested
  `tool()` context propagation, the waterfall will need indent
  levels and parent/child connectors. Phase 2 or later.
- **jsonb input/output collapsibility and truncation.** Right now
  the panel renders raw `JSON.stringify(value, null, 2)` inside a
  `max-h-96 overflow-auto` `<pre>`. A 100KB span input scrolls
  forever. Task 9.3 covers this — collapsible sections, truncate-
  with-expand, syntax highlighting.
- **Trace-level "jump to next error".** The page header shows
  `· N errors`, the waterfall colors errors red, but there's no
  affordance to skip to the next failed span. For traces with one
  or two errors, scanning is fine. For traces with many, this earns
  its keep. Defer until the dogfooding in 12.x surfaces a real need.
- **"Copy span ID" affordance.** The metadata section renders the
  ID and parent ID as `<code>`. Users will want to copy them to
  search elsewhere. One-click copy is a small touch; not worth
  adding before there's any "elsewhere" to copy them to.
- **Dark mode, typography pass, animation polish.** Week 11.
- **Virtualization.** At 100 spans the flat DOM is fine; at 10k
  spans it won't be. The fix is `react-window` or
  `@tanstack/react-virtual`, but the threshold is far enough out
  that adding a virtualization library now is preemptive
  optimization. Revisit if a real trace breaks the page.
- **Filter/search within a trace.** "Show only LLM spans" or
  "spans matching name X" — useful at scale, not yet earned.

## What surprised me

How small the SVG-to-HTML rewrite was. I expected the math to be
the hard part — coordinate transforms, pixel-aligning the bars
inside their rows, the tick label positioning. None of that
changed. The rewrite was structural: `<svg><g><rect></g></svg>`
became `<div><div><div></div></div></div>`. The bar's `x` became
the absolute div's `left`, the bar's `width` stayed `width`, the
bar's `y` became `top` (offset by `BAR_Y_OFFSET` to center it in
the row). Maybe an hour, end-to-end.

The implication is that I might reach for SVG less often. The
reasons I started there were "it's a chart, charts are SVG" and
"the math is direct." Both are real, but the math is also direct
in HTML once you have a fixed-width container, and the moment you
need anything beyond pure render — sticky, hover state, click,
keyboard focus — HTML is more cooperative.

The fixture script (`gen-long-trace.mjs`) was the highest-leverage
thing I built that week. Before it, "very long traces" was an
abstract concern; after it, the panel-below-waterfall problem was
obvious in five seconds. Week 6.5 is nominally "edge cases" but
the fixture made the whole week's UX problems visible. Worth
recording for next time: **build the fixture before the feature
that needs to handle it.** The sequencing in the roadmap
(build the feature, then test the edges) is backwards for
visualization work.

The Date-across-RSC-boundary thing. I wrote a `.toISOString()`
conversion in my head before I wrote any code, then realized I
hadn't needed one anywhere else. Good moment to actually check the
docs instead of cargo-culting from the JSON-fetch era.
