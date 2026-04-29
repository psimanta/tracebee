# Roadmap

Twelve weeks, ~55–65 hours total. MVP ships July 19, 2026.

Each week has a set of tasks with rough time estimates and a single exit
criterion. When working a task, name it by number in the Claude Code prompt
(e.g. "I'm on Task 1.2"). Don't skip ahead; order matters.

## Week 1 (Apr 27 – May 3): Foundation

**Goal:** a signed-in user lands on an empty dashboard.

- [x] **1.1** Repo + Next.js skeleton, pnpm workspace (30 min) — done 2026-04-25
- [x] **1.2** Neon Postgres + Drizzle schema (users, projects, project_users,
  api_keys — no traces/spans yet) (1.5 hr) — done 2026-04-25
- [x] **1.3** GitHub OAuth via Auth.js, Drizzle adapter (3 hr — hard timebox:
  bail to Clerk at 4 hr) — done 2026-04-25
- [x] **1.4** Login gate + bare layout shell (1.5 hr) — done 2026-04-25

**Exit criterion:** sign in with GitHub, land on `/dashboard`, see an empty
state. Sign out works.

## Week 2 (May 4 – May 10): Projects + API keys + deploy

**Goal:** a public URL where a user can create a project and generate an
API key.

- [x] **2.1** Project creation flow, server actions (1.5 hr) — done 2026-04-25
- [x] **2.2** API key generation, hashed storage, show-once UI (2 hr) — done 2026-04-26
- [x] **2.3** First raw LLM API call in a throwaway script (1.5 hr) — done 2026-04-26
- [x] **2.4** Deploy to Vercel, production GitHub OAuth app (1 hr) — done 2026-04-29

**Exit criterion:** a stranger can visit the production URL, sign in,
create a project, generate an API key, and see the prefix in the
settings page.

## Weeks 3–4 (May 11 – May 24): SDK v0 + ingest end-to-end

**Goal:** the first full vertical slice. Alex's code makes an LLM call,
the span lands in Postgres, you can query it manually.

- [x] **3.1** Scaffold `packages/sdk` in the monorepo (30 min) — done 2026-04-29
- [x] **3.2** `traces` and `spans` tables in Drizzle, migration (1 hr) — done 2026-04-29
- [x] **3.3** `POST /v1/traces` route handler with Bearer auth, Zod
  validation, upsert transaction (3 hr) — done 2026-04-29
- [x] **3.4** SDK: `trace()` with AsyncLocalStorage, ULID generation,
  HTTP client, beforeExit drain (3 hr) — done 2026-04-29
- [x] **3.5** SDK: `observeOpenAI()` proxy around chat.completions.create,
  token + cost capture (2 hr) — done 2026-04-29
- [x] **3.6** SDK: `tool()` helper (1 hr) — done 2026-04-29
- [x] **3.7** End-to-end smoke test: throwaway script with real OpenAI key +
  local ingest; verify span rows in Postgres (1.5 hr) — done 2026-04-29

**Exit criterion:** running a test script calls OpenAI, triggers a POST to
the local ingest, and inserts correct rows in `traces` and `spans`.

## Weeks 5 (May 25 – May 31): Traces list view

**Goal:** Alex can see his traces in the dashboard.

- [ ] **5.1** Traces list page: paginated table, sort by started_at desc (2 hr)
- [ ] **5.2** Columns: name, duration, status, span count, cost, started_at
  (1 hr)
- [ ] **5.3** Empty state + loading state (30 min)
- [ ] **5.4** Basic filters: status, time range (1.5 hr)

**Exit criterion:** after running the test script a few times, the
dashboard shows the traces in a sortable list.

## Weeks 6–7 (Jun 1 – Jun 14): The hero screen — trace detail + waterfall

**Goal:** the feature the whole project is built around.

- [ ] **6.1** `/traces/[traceId]` route, fetch trace + spans server-side (1 hr)
- [ ] **6.2** Waterfall SVG: time axis, span rows, color coding (6 hr)
- [ ] **6.3** Span detail panel: input, output, metadata, timing (3 hr)
- [ ] **6.4** Click-to-select interaction, keyboard nav (2 hr)
- [ ] **6.5** Edge cases: very long traces, very short spans, failed spans (2 hr)
- [ ] **6.6** Self-review against hero-screen bar: does this look shippable? (1 hr)

**Exit criterion:** clicking any trace in the list opens a detail view
where the waterfall reads correctly at a glance and clicking a span
reveals its full input/output.

## Week 8 (Jun 15 – Jun 21): SDK polish + docs

**Goal:** a stranger could actually install and use the SDK.

- [ ] **8.1** Publish SDK to npm under a real name (1 hr)
- [ ] **8.2** SDK README: install, 5-line quickstart, API reference (2 hr)
- [ ] **8.3** SDK error cases: 401 loud log, 4xx drop, 5xx drop, network
  errors (1.5 hr)
- [ ] **8.4** Manual end-to-end: install from npm in a fresh project,
  integrate, confirm traces appear (1 hr)
- [ ] **8.5** First real tests: SDK unit tests for trace/tool context
  propagation (2 hr)

**Exit criterion:** `npm install @yourname/sdk`, follow README, traces
appear in production dashboard.

## Week 9 (Jun 22 – Jun 28): Robustness pass

**Goal:** the product doesn't fall over when used for real.

- [ ] **9.1** Ingest: reject malformed payloads clearly, log request IDs (1.5 hr)
- [ ] **9.2** Dashboard: handle large traces (100+ spans) without layout
  breakage (2 hr)
- [ ] **9.3** Dashboard: handle jsonb input/output rendering (collapsible,
  truncate very large values) (2 hr)
- [ ] **9.4** Revoke key flow: UI + server action + ingest check (1 hr)

**Exit criterion:** run an intentionally broken integration (bad key,
malformed payload, oversize span) and get useful errors, not crashes.

## Week 10 (Jun 29 – Jul 5): Second SDK feature + metadata

**Goal:** the product is useful beyond the default happy path.

- [ ] **10.1** SDK: custom metadata on traces (user-supplied tags) (1.5 hr)
- [ ] **10.2** Dashboard: surface metadata in list view as filter chips (2 hr)
- [ ] **10.3** SDK: `observeAnthropic()` equivalent (2 hr)
- [ ] **10.4** Cost rollups: project-level totals in the dashboard header (2 hr)

**Exit criterion:** an Anthropic-based agent integrates as easily as an
OpenAI one, and metadata-based filtering works in the list.

## Week 11 (Jul 6 – Jul 12): Polish

**Goal:** it looks like a real product, not a school project.

- [ ] **11.1** Typography, spacing, color pass across all screens (3 hr)
- [ ] **11.2** Dark mode (2 hr)
- [ ] **11.3** Loading states, empty states, error boundaries everywhere
  (2 hr)
- [ ] **11.4** Landing page with a real pitch (2 hr)

**Exit criterion:** screenshots would look fine in a portfolio.

## Week 12 (Jul 13 – Jul 19): Final polish + ship

**Goal:** ship.

- [ ] **12.1** Dogfood: instrument a real agent for a week, fix what breaks
  (ongoing through the week)
- [ ] **12.2** Main README: what it is, screenshots, how it works,
  architecture diagram (3 hr)
- [ ] **12.3** Phase 2 writeup: ClickHouse migration plan in
  `docs/phase-2.md` (2 hr)
- [ ] **12.4** Tag v0.1.0, announce (if announcing at all) (1 hr)

**Exit criterion:** July 19. Ship. Stop adding features.

## After ship

- Interview prep: be able to explain every architectural decision cold
- Write one `docs/decisions/week-N.md` for each week, in your own voice
- Update README with a "what I'd do differently" section

## Cutting room — things to drop if time pressure rises

Pre-committed cuts, in drop order:

1. Cost rollups (Week 10)
2. Anthropic SDK (Week 10) — OpenAI only is fine
3. Dark mode (Week 11)
4. Metadata filters (Week 10)
5. Filters in list view (Week 5)

Do not cut: the SDK, the ingest endpoint, the trace list, the hero
waterfall. That is the MVP.
