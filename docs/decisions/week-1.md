# Week 1 — Foundation

Shipped: workspace + Next.js 15 skeleton, Neon Postgres + Drizzle schema with
seven tables, Auth.js v5 with GitHub OAuth and database sessions, landing
page → auth-gated dashboard layout.

The exit criterion was simple: sign in with GitHub, land on `/dashboard`, see
an empty state, sign out. It came in roughly on the budgeted ~6.5 hours, with
all of the surprise concentrated in 1.3 (Auth.js).

## Decisions

### Auth.js v5 (beta) over v4 (stable)

When `pnpm add next-auth@^5` failed and pnpm helpfully suggested I install the
stable `4.24.14` instead, the easy move was to take it. v4 has four years of
docs, every Stack Overflow answer, and no `@beta` tag. I almost did.

What pushed me to v5: this is a portfolio project shipping in mid-2026. By the
time I'm interviewing, v4 will read as dated and v5 will be the default. The
`auth()` server-component helper is the API I'd actually use in a 2026
codebase; v4's `getServerSession(authOptions)` ceremony is what I'd encounter
maintaining a legacy app. Learning v5 first was the better long-term bet, even
with the beta tag.

The risk I priced in: a future beta could ship a breaking change. The install
pinned `5.0.0-beta.31` exactly (no caret), so a future `pnpm install` won't
silently bump. If something breaks during a deliberate upgrade later, that's
fine — I'll be paying attention.

### Database sessions, not JWT

The architecture doc settled this before the code, but I want to record why
the call holds up after building it.

Database sessions cost one indexed lookup per authenticated request. With one
Vercel app and one Neon database, that's invisible latency. What they buy:

- Trivial sign-out (`DELETE` one row).
- Easy "force log out user X everywhere" (`DELETE WHERE user_id = X`).
- Inspectable state (`SELECT * FROM sessions` to see who's signed in).

JWT's "stateless" advantage evaporates the moment you need revocation, which
any real product does. The pitch for JWT in serverless apps is real but only
matters when DB latency starts hurting. Not yet, and probably not on this
project.

### Drizzle ORM over Prisma

I considered Prisma. It's more polished, more batteries included. But:

- Prisma's schema lives in a separate DSL file (`schema.prisma`); Drizzle is
  TypeScript end-to-end. Less context-switching.
- Prisma's query engine is a separate Rust binary that ships with the app.
  Drizzle is a thin SQL builder over your driver of choice. Smaller surface
  area, fewer moving parts.
- Drizzle's types flow through to query results without a code-gen step.

For an MVP, I'd rather understand exactly what SQL runs than rely on a
generated client. The cost is fewer batteries — fewer migration helpers, less
hand-holding — but at this scale that doesn't bite.

### Auth gate at the dashboard layout, not middleware

Two ways to gate authenticated routes: a `middleware.ts` that runs on every
matching request, or a server-component check inside the dashboard layout.

I went with the layout. Reasons:

- Middleware runs on the Edge runtime, which can't use the `postgres` driver.
  I'd have to fetch the session through some Edge-compatible path (Auth.js's
  JWT adapter, which we rejected, or a separate HTTP call to a Node endpoint).
  Both add complexity for no real benefit.
- Layout-level checks compose cleanly with the rest of the dashboard's data
  fetching. The layout already has a session in scope; every page below it
  can rely on the gate having run.
- The cost is one `auth()` call per request — the same DB query I'd be doing
  for any data fetching anyway.

If the auth gate ever becomes a perf bottleneck (it won't at MVP scale), the
fix is to cache the session lookup, not to push the gate to the Edge.

### Pre-staging Auth.js's adapter columns on `users` in 1.2

The roadmap said 1.2 was just "users + projects + project_users + api_keys".
The architecture doc said the Auth.js `users` table doubles as our user store.
The collision: do I write `users` strictly per the roadmap (six columns), or
pre-stage Auth.js's expected `name`, `emailVerified`, `image` so 1.3 doesn't
need a column-add migration mid-task?

I pre-staged. The shape we'd end up with after 1.3 was knowable in advance, and
"oh, I forgot to add three columns" mid-Auth.js-setup is a worse story than a
slightly bigger 1.2.

## The bug worth remembering — `OAuthAccountNotLinked`

After 1.3's smoke test worked, signing in again threw:
> Another account already exists with the same e-mail address.

The first hypothesis was an orphaned user (user row, no accounts row). But
both tables had one row each. The actual cause: state I'd corrupted earlier
while exploring data in Drizzle Studio — Auth.js's lookup by
`(provider, providerAccountId)` returned nothing, fell through to email
lookup, found the existing user, refused to silently link.

Two-part fix:

1. Wipe `sessions`, `accounts`, `users`, clear cookies, sign in fresh.
2. Add `allowDangerousEmailAccountLinking: true` to the GitHub provider.

The flag's name reads alarming, but it's safe specifically for GitHub. GitHub
verifies email ownership before letting an address be primary, so an attacker
can't claim someone else's verified email without already controlling it. The
"dangerous" warning applies to providers without that guarantee. For our
single-provider, GitHub-verified setup, auto-linking is the correct behavior
when a dangling user appears.

The lesson: in dev, schema explorations and DB tools can leave Auth.js's
relational invariants subtly broken. The flag handles the recovery path
gracefully.

## What got deferred (intentionally, to avoid scope creep)

- Avatar in the dashboard header — Week 11 polish.
- Custom sign-in and error pages — Week 11.
- Redirect-after-sign-in to the originally-requested URL — when this annoys
  me enough to fix.
- The pooled Neon connection URL for runtime queries — when cold starts on
  Vercel start hurting.
- A `users.email` nullable migration — when a private-email GitHub user
  actually hits the constraint.
