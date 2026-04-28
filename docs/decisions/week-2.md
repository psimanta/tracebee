# Week 2 — Projects, API keys, deploy

Shipped: project creation flow with server actions, API key generation
(sha256-hashed storage with a key_prefix for UI display, raw key shown
exactly once), an OpenAI probe script to verify the SDK shape I'll build
against in Week 3, and a public production deploy at `tracebee.dev` with
a separate Neon branch and a separate GitHub OAuth app for prod.

The exit criterion was that a stranger could hit the production URL,
sign in, create a project, generate a key, and see the prefix. That
works. Week 2 came in around the budgeted ~6 hours, finished four days
early.

## Decisions

### Server actions, not API routes, for dashboard mutations

CLAUDE.md already settled this as a convention, but Week 2 was the
first time I actually reached for it, so it's worth recording why the
call holds up.

The pull toward an API route is muscle memory from the Pages Router
era — `pages/api/projects.ts`, fetch from the client, parse JSON,
respond. That whole dance is unnecessary in App Router. A server
action is just an async function with `"use server"` at the top; the
form posts to it directly, and Next handles the wire format. Less
ceremony, less code to write, and the function is type-safe across the
client/server boundary because it's still TypeScript on both sides.

The case for an API route survives only when you actually need a
public, versioned, externally-callable HTTP endpoint. The ingest
endpoint in Week 3 will be that. Dashboard mutations aren't.

### `requireProjectAccess` returns `notFound()`, not 403

When a signed-in user requests a project they don't own, the natural
instinct is "return 403 Forbidden." That's wrong here, and the
architecture doc was right to call it out.

A 403 confirms that the project exists and the user just doesn't have
access. That leaks the existence of project IDs — anyone can probe
`/dashboard/<random-id>/settings` and learn whether the ID is real. A
404 (`notFound()`) doesn't distinguish "doesn't exist" from "exists
but not yours," so there's nothing to enumerate.

The cost is that a legitimate user who fat-fingers a URL gets the same
response as an attacker, which is fine for an MVP. If it ever matters
to differentiate ("this project was deleted vs. it was never yours"),
that's a UX problem worth solving in product, not by leaking through
HTTP status codes.

### `useActionState` client island for the show-once panel, not a cookie flash

The show-once API key UX needed somewhere to stash the raw key for one
render and one render only. Two options:

- **Cookie flash:** server action sets a short-lived cookie with the raw
  key, the settings page reads it on the next render, deletes the
  cookie. Pure server-side, no client JS.
- **Client island with `useActionState`:** the form submission stays in
  React state on the client, vanishes on refresh. Pure client-side,
  needs a small `"use client"` boundary.

I went with the client island. The cookie flash is clever but moves the
"key" through more places — a Set-Cookie header, the next request's
cookie header, the page render — and has weird failure modes if the
user navigates instead of refreshing. The client island is one
component, one piece of state, lifecycle is obvious.

The cost is a small `"use client"` boundary in an otherwise
server-rendered settings page. Worth it.

### `.bind(null, projectId)` to pre-fill server action arguments

The settings page is server-rendered, knows `projectId`, and passes the
`createApiKey` action down to a client island. Letting the client supply
`projectId` would mean trusting client input (and the access check would
still need to revalidate it on the server anyway). Pre-binding the
argument server-side — `createApiKey.bind(null, projectId)` — gives the
client a no-arg function it can't tamper with. The projectId is part of
the closure, set on the server.

Small thing, but worth recording because it's the canonical answer to
"how do I scope a server action to a route's params without trusting
the client."

### Neon branches over separate projects for dev/prod

Two reasonable ways to run two databases for one app: two Neon
projects (hard isolation), or one project with two branches (shared
storage with copy-on-write).

I went with branches. The pull toward separate projects is the comfort
of "different hostnames, can't possibly mix them up" — but the actual
risk reduction is small for a solo project, and the cost is two
dashboards, two billing rows, no way to clone prod into dev when a
real bug shows up. Neon branches map cleanly onto a mental model I
already have (git), and the "branch from prod, debug locally with real
data, throw it away" workflow becomes available the moment I have real
users.

The footgun (paste the wrong connection string into `.env.local`) is
real but mitigable: only ever set `DATABASE_URL` in `.env.local` for
dev, only ever in Vercel for prod, never in the same file twice.

### Schema Only branch + drop public + re-migrate, vs. branch with data

When creating the prod branch, Neon offered "Latest data" or "Schema
Only." Schema Only sounded right — "I want a clean slate, no dev junk
in prod." It mostly is, with one wrinkle: Schema Only copies *table
definitions* but not *table rows*, which means `__drizzle_migrations`
exists in the prod branch as an empty table. Drizzle reads that table
to know what's been applied; an empty bookkeeping table tells drizzle
"nothing's been applied," and it tries to run all migrations. The
first one (`CREATE TABLE users (...)`) hits the existing-from-Schema-
Only `users` table and aborts with `relation "users" already exists`.

Recovery: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` in the
Neon SQL editor (note: `__drizzle_migrations` lives in a separate
`drizzle` schema, so it survives the drop), then run migrations
locally against the prod URL. Drizzle now sees an empty public schema,
runs migrations cleanly, and populates `__drizzle_migrations`
correctly.

The lesson is small but generalizable: migration tools trust their
bookkeeping table, not the live schema. Any operation that desyncs
those two (snapshot restores, schema dumps, ORM-backed seeders) needs
explicit handling.

### Custom domain before OAuth, not after

GitHub OAuth apps support exactly one callback URL each. If I'd
configured the OAuth app with the auto-generated `.vercel.app` URL
today and switched to `tracebee.dev` later, I'd have had to update the
callback URL inside the OAuth app — extra work, plus a window where
sign-in would break.

Doing the custom domain first meant DNS propagation was on the
critical path, but the wait was productive: the OAuth app and the
Vercel env vars don't need a live domain to be configured, just a URL.
By the time DNS resolved, everything else was already in place.

## The bug worth remembering — duplicate `accounts` rows on every sign-in

Late in Week 2, I noticed something off in the dev database: the
`accounts` table had three rows for one user, all with the same
`user_id` but different `provider_account_id` values, all UUIDs. Every
sign-in was inserting a fresh row.

The cause was in the GitHub provider's `profile()` callback, written
back in 1.3:

```ts
profile(profile) {
  return {
    id: crypto.randomUUID(),  // wrong
    name: profile.name ?? profile.login,
    email: profile.email,
    image: profile.avatar_url,
    githubId: String(profile.id),
  };
}
```

I'd written this thinking the returned `id` would become `users.id`
and I wanted UUIDs there. What I missed is that Auth.js v5 also uses
the same `id` as `account.providerAccountId` — the stable lookup key
for "this provider account is already linked." A fresh UUID per
sign-in meant `(provider='github', providerAccountId=<uuid>)` never
matched an existing row, so a new account was inserted every time.

The reason `users.id` looked normal across all the duplicates is that
the Drizzle adapter actually overrides the `id` we pass in with its
own `crypto.randomUUID()` (when the schema column has no default,
which ours doesn't). So the user got a stable adapter-generated UUID
once, and the `allowDangerousEmailAccountLinking: true` flag from
Week 1 silently re-linked subsequent sign-ins to that same user via
the email match — masking the duplication entirely from the dashboard.
Only the `accounts` table grew.

The fix:

```ts
profile(profile) {
  return {
    id: String(profile.id),       // GitHub's stable id → providerAccountId
    name: profile.name ?? profile.login,
    email: profile.email,
    image: profile.avatar_url,
    githubId: String(profile.id),
  };
}
```

`profile.id` is GitHub's numeric account id (as a string), which is
stable across logins. Auth.js now uses it as `providerAccountId`, the
lookup matches the existing account, no new row gets inserted. The
Drizzle adapter still generates `users.id` as a UUID, so the user
table is unchanged.

Removing `allowDangerousEmailAccountLinking: true` came as a follow-on
cleanup. That flag had been sitting in the codebase since Week 1
masking the real bug. With `providerAccountId` now stable, the normal
account lookup finds the row every time and no email-fallback linking
is needed.

The lessons:

- `profile().id` in an Auth.js provider is **not** `users.id`. It's
  the candidate value for `providerAccountId`. Returning anything
  non-stable there breaks account linking silently.
- A "fix" added to make a symptom go away can mask the actual bug for
  a long time. The Week 1 writeup describes adding
  `allowDangerousEmailAccountLinking: true` as the fix for an
  `OAuthAccountNotLinked` error. That symptom was probably also
  caused by the same `crypto.randomUUID()` bug — and the flag covered
  it up rather than fixing it.
- Bugs that don't break the user-facing flow can live for weeks.
  Nothing about the dashboard misbehaved; the only signal was a
  growing `accounts` table I happened to inspect.

## What got deferred (intentionally, to avoid scope creep)

- Revoke key flow — Week 9 task 9.4.
- Multiple-keys-per-project UI affordances (rotation, listing all
  active prefixes prominently) — comes for free with 9.4.
- Project rename and project delete — when I need them.
- Custom sign-in / error pages — Week 11 polish.
- Avatar in the dashboard header, dark mode, etc. — Week 11.
- Preview-deploy OAuth (would need a separate OAuth app per preview
  URL or a wildcard callback, both annoying) — not needed for solo
  development, never for MVP.
- Dev/prod isolation guard in `scripts/reset-auth.ts` (refuse to run
  against a non-dev DATABASE_URL) — when I have a near-miss.
