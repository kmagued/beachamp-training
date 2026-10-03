# Players Who Coach & Coach Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can make an existing player a coach (one account, with a Player | Coach view switch), and new coaches join through an invite link instead of an admin-set password.

**Architecture:** A player who coaches stays `role = 'player'` with `is_coach = true`.

- **Database:** one migration rebuilds the six coach RLS rules (plus the "players see coaches" rule) on a new `auth_can_coach()` helper. A second migration adds `coach_invites`.
- **App:** one pure module, `src/lib/auth/portals.ts`, decides who can coach, which views an account has, and where login lands. The middleware, layouts, login actions and server actions all use it.
- **Views:** the existing `/player` and `/coach` portals. A cookie remembers the last one used.
- **Invites:** a service-role server action claims a single-use token, signs the coach up through the normal email-code flow, and notifies admins.

**Tech Stack:** Next.js 15 (App Router, server actions), Supabase (Postgres RLS, Auth), TypeScript, Tailwind, `node:test` run by `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-03-player-coaches-design.md`

## Global Constraints

- **Branch.** Work on `feat/player-coaches`, which already exists and holds the spec.
- **Commits.**
  - Use the conventional style the repo already uses, e.g. `feat(coaches): …`.
  - End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Migrations.**
  - Never edit an existing migration. The user applies migrations to production as soon as they're written.
  - New migrations are `20261003200000_player_coaches.sql` and `20261003210000_coach_invites.sql`. Each header says "Safe to apply ahead of the code".
  - Don't apply migrations to staging or production yourself. The user does that.
- **Verification.**
  - Run `npm test`, then `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo` (tsc rewrites it).
  - There's no ESLint config: `next lint` stops at an interactive prompt, so don't run it.
  - Don't run `next build`: the user's `next dev` is usually running on :3000, and a build clobbers `.next`.
- **Cairo dates.** Never hardcode a UTC offset (Cairo is +02:00 in winter and +03:00 in summer). Show dates with `cairoDayKey` (`src/lib/utils/cairo-time.ts`) and `shortDate` (`src/lib/birthdays/format.ts`), through `expiryLabel`.
- **Supabase clients.** Match the surrounding code: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above every `as any` client cast. Comments are short and explain why.
- **Invites.** A link works once, expires after `INVITE_DAYS = 7` and can be revoked. The view cookie is named `beachamp-view`.
- **Copy.** User-facing text is used exactly as written in this plan.

## Review Focus

1. **Prefetches.** A prefetch of the other view must not change the remembered view: Next.js prefetches the bell's `/player/notifications` link while a player who coaches is in the coach view. Pinned in Task 1 by the "viewToRemember: a prefetch … changes nothing" test.
2. **Phones typed with spaces.** A phone number typed with spaces or dashes in the Existing player search ("010 1234 5678") must search by phone, not as a first and last name. Pinned in Task 13 by the "a phone typed with spaces or dashes" test.
3. **Emails with wildcards.** An email containing `_` or `%` in the "already has an account" check must match only itself, because both are LIKE wildcards. Pinned in Task 8 by the `escapeLike` test.
4. **Invite closed mid-form.** An invite that expires or is revoked while the coach is filling in the form must refuse the signup ("no longer valid"). Pinned in Task 9 by the expired/revoked claim check.
5. **Already-registered emails.** Signing up an email that already has an account must give the friendly message and free the invite. Supabase answers either with an error or, with email confirmation on, with a user that has no identities. Pinned in Task 8 by the `alreadyRegistered` tests.

---

### Task 1: Access rules module (`src/lib/auth/portals.ts`)

**Files:**
- Create: `src/lib/auth/portals.ts`
- Create: `src/lib/auth/portals.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3, 4, 6):
  - `type Portal = "player" | "coach" | "admin"`
  - `interface Account { role: "player" | "coach" | "admin"; is_coach: boolean }`
  - `VIEW_COOKIE = "beachamp-view"`
  - `VIEW_COOKIE_OPTIONS`
  - `accountOf(profile: { role?: string | null; is_coach?: boolean | null } | null | undefined): Account`
  - `canCoach(a: Account): boolean`
  - `coachOrAdmin(a: Account): boolean`
  - `portalsFor(a: Account): Portal[]`
  - `portalOfPath(pathname: string): Portal | null`
  - `homePath(a: Account, lastView: string | undefined): string`
  - `viewToRemember(a: Account, pathname: string, current: string | undefined, headers: Headers): Portal | null`
  - `isPrefetch(headers: Headers): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/portals.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountOf,
  canCoach,
  coachOrAdmin,
  homePath,
  isPrefetch,
  portalOfPath,
  portalsFor,
  viewToRemember,
  type Account,
} from "./portals";

const player: Account = { role: "player", is_coach: false };
const playerCoach: Account = { role: "player", is_coach: true };
const coach: Account = { role: "coach", is_coach: true };
const admin: Account = { role: "admin", is_coach: false };
const adminCoach: Account = { role: "admin", is_coach: true };

test("accountOf: a profile row as an account", () => {
  assert.deepEqual(accountOf({ role: "player", is_coach: true }), playerCoach);
  assert.deepEqual(accountOf({ role: "coach", is_coach: true }), coach);
  assert.deepEqual(accountOf({ role: "admin" }), admin);
});

test("accountOf: no profile, or a role it doesn't know, is a plain player", () => {
  assert.deepEqual(accountOf(null), player);
  assert.deepEqual(accountOf(undefined), player);
  assert.deepEqual(accountOf({ role: "superuser", is_coach: null }), player);
});

test("canCoach: coach accounts, and players or admins with coach access", () => {
  assert.equal(canCoach(coach), true);
  assert.equal(canCoach(playerCoach), true);
  assert.equal(canCoach(adminCoach), true);
  assert.equal(canCoach(player), false);
  assert.equal(canCoach(admin), false);
});

test("coachOrAdmin: every admin, coaching or not, and anyone who coaches", () => {
  assert.equal(coachOrAdmin(admin), true);
  assert.equal(coachOrAdmin(adminCoach), true);
  assert.equal(coachOrAdmin(coach), true);
  assert.equal(coachOrAdmin(playerCoach), true);
  assert.equal(coachOrAdmin(player), false);
});

test("portalsFor: only a player who coaches has two views, player first", () => {
  assert.deepEqual(portalsFor(player), ["player"]);
  assert.deepEqual(portalsFor(playerCoach), ["player", "coach"]);
  assert.deepEqual(portalsFor(coach), ["coach"]);
  assert.deepEqual(portalsFor(admin), ["admin"]);
  assert.deepEqual(portalsFor(adminCoach), ["admin"]);
});

test("portalOfPath: the first path segment, matched exactly", () => {
  assert.equal(portalOfPath("/coach"), "coach");
  assert.equal(portalOfPath("/coach/groups/1"), "coach");
  assert.equal(portalOfPath("/player/dashboard"), "player");
  assert.equal(portalOfPath("/admin/coaches"), "admin");
  assert.equal(portalOfPath("/"), null);
  assert.equal(portalOfPath("/login"), null);
  assert.equal(portalOfPath("/coaching"), null);
  assert.equal(portalOfPath("/admin-setup"), null);
});

test("homePath: a player who coaches lands in the view they used last", () => {
  assert.equal(homePath(playerCoach, "coach"), "/coach/dashboard");
  assert.equal(homePath(playerCoach, "player"), "/player/dashboard");
});

test("homePath: the first time, or with a cookie it doesn't recognise, the player view", () => {
  assert.equal(homePath(playerCoach, undefined), "/player/dashboard");
  assert.equal(homePath(playerCoach, "admin"), "/player/dashboard");
  assert.equal(homePath(playerCoach, "nonsense"), "/player/dashboard");
});

test("homePath: a remembered view the account doesn't have is ignored", () => {
  assert.equal(homePath(player, "coach"), "/player/dashboard");
  assert.equal(homePath(coach, "player"), "/coach/dashboard");
  assert.equal(homePath(admin, "coach"), "/admin/dashboard");
  assert.equal(homePath(adminCoach, "coach"), "/admin/dashboard");
});

const visit = new Headers({ rsc: "1" });

test("viewToRemember: a player who coaches opening the other view", () => {
  assert.equal(viewToRemember(playerCoach, "/coach/schedule", "player", visit), "coach");
  assert.equal(viewToRemember(playerCoach, "/player/dashboard", "coach", visit), "player");
  assert.equal(viewToRemember(playerCoach, "/coach/dashboard", undefined, new Headers()), "coach");
});

test("viewToRemember: nothing to write when unchanged, not their view, or not a portal", () => {
  assert.equal(viewToRemember(playerCoach, "/coach/schedule", "coach", visit), null);
  assert.equal(viewToRemember(playerCoach, "/admin/dashboard", "player", visit), null);
  assert.equal(viewToRemember(playerCoach, "/invite/abc", "player", visit), null);
});

test("viewToRemember: accounts with one view never get the cookie", () => {
  assert.equal(viewToRemember(player, "/player/dashboard", undefined, visit), null);
  assert.equal(viewToRemember(coach, "/coach/dashboard", undefined, visit), null);
  assert.equal(viewToRemember(admin, "/coach/dashboard", undefined, visit), null);
});

test("viewToRemember: a prefetch of the other view (the bell's link in the coach view) changes nothing", () => {
  const prefetch = new Headers({ rsc: "1", "next-router-prefetch": "1" });
  assert.equal(viewToRemember(playerCoach, "/player/notifications", "coach", prefetch), null);
  assert.equal(viewToRemember(playerCoach, "/coach/dashboard", "player", new Headers({ "sec-purpose": "prefetch" })), null);
});

test("isPrefetch: Next.js link prefetches and browser prefetch hints", () => {
  assert.equal(isPrefetch(new Headers({ "next-router-prefetch": "1" })), true);
  assert.equal(isPrefetch(new Headers({ purpose: "prefetch" })), true);
  assert.equal(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isPrefetch(new Headers({ rsc: "1" })), false);
  assert.equal(isPrefetch(new Headers()), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/lib/auth/portals.test.ts`
Expected: FAIL, with `Cannot find module './portals'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/portals.ts`:

```ts
// Which views (portals) an account can open, and where it lands after login.
// A player who coaches is role 'player' with is_coach = true: they have the player view
// and the coach view, and each device remembers the last one they used.

export type Portal = "player" | "coach" | "admin";

export interface Account {
  role: "player" | "coach" | "admin";
  is_coach: boolean;
}

/** The cookie that remembers which view a player who coaches used last */
export const VIEW_COOKIE = "beachamp-view";

/** Kept a year; only the server reads it */
export const VIEW_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

/** A profile row (or none) as an Account: a missing or unknown role is a player, as before */
export function accountOf(profile: { role?: string | null; is_coach?: boolean | null } | null | undefined): Account {
  const role = profile?.role;
  return {
    role: role === "admin" || role === "coach" ? role : "player",
    is_coach: profile?.is_coach === true,
  };
}

/** Can do coach work: a coach account, or a player or admin with coach access */
export function canCoach(a: Account): boolean {
  return a.role === "coach" || a.is_coach;
}

/** May use coach tools: an admin, or anyone who can coach */
export function coachOrAdmin(a: Account): boolean {
  return a.role === "admin" || canCoach(a);
}

/** The views this account can open, in switcher order */
export function portalsFor(a: Account): Portal[] {
  if (a.role === "admin") return ["admin"];
  if (a.role === "coach") return ["coach"];
  return a.is_coach ? ["player", "coach"] : ["player"];
}

/** "/coach/groups/1" → "coach"; anything outside the three portals → null */
export function portalOfPath(pathname: string): Portal | null {
  const first = pathname.split("/")[1];
  return first === "admin" || first === "coach" || first === "player" ? first : null;
}

/** Where login lands: the remembered view if this account has it, else its first view */
export function homePath(a: Account, lastView: string | undefined): string {
  const portals = portalsFor(a);
  const view = portals.find((p) => p === lastView) ?? portals[0];
  return `/${view}/dashboard`;
}

/** The view to remember for this visit, or null to leave the cookie alone: only for
 *  accounts with two views, only a view they have, only when it changes, and never for
 *  a prefetch (a link to the other view must not flip it) */
export function viewToRemember(
  a: Account,
  pathname: string,
  current: string | undefined,
  headers: Headers
): Portal | null {
  if (isPrefetch(headers)) return null;
  const portals = portalsFor(a);
  const portal = portalOfPath(pathname);
  if (portals.length < 2 || !portal || !portals.includes(portal) || portal === current) return null;
  return portal;
}

/** A background prefetch, not a visit: Next.js link prefetches and browser prefetch hints */
export function isPrefetch(headers: Headers): boolean {
  return (
    headers.has("next-router-prefetch") ||
    /prefetch/i.test(headers.get("purpose") ?? "") ||
    /prefetch/i.test(headers.get("sec-purpose") ?? "")
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/auth/portals.test.ts`
Expected: PASS, `# pass 14`, `# fail 0`.

- [ ] **Step 5: Add the folder to `npm test`**

In `package.json`, change the end of the `test` script from `src/lib/birthdays/*.test.ts"` to `src/lib/birthdays/*.test.ts src/lib/auth/*.test.ts"`.

Run: `npm test`
Expected: every suite passes, including the 14 new tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/portals.ts src/lib/auth/portals.test.ts package.json
git commit -m "feat(auth): who can coach, which views an account has, and where login lands

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Database: players who coach

**Files:**
- Create: `supabase/migrations/20261003200000_player_coaches.sql`
- Scratch only, never committed: `$SCRATCH/replay.sh` and `$SCRATCH/checks-player-coaches.sql`. `$SCRATCH` is your session scratchpad directory, or any temp directory outside the repo.

**Interfaces:**
- Consumes: the existing `auth_role()` and `profiles.is_coach`.
- Produces: the SQL function `auth_can_coach()`, plus the seven rebuilt RLS rules named in the spec. The app relies on these rules from Task 3 on.

- [ ] **Step 1: Write the replay script**

Create `$SCRATCH/replay.sh` and `chmod +x` it. It needs Docker and the image `public.ecr.aws/supabase/postgres:17.6.1.167`, which is already pulled on this machine. It replays every migration on a fresh container named `pc-rls-pg`, then applies any extra SQL files passed as arguments.

```bash
#!/usr/bin/env bash
# Throwaway: replay every migration on a local Supabase Postgres, then apply extra SQL files given as args.
set -uo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
NAME=pc-rls-pg
docker rm -f $NAME >/dev/null 2>&1
docker run -d --name $NAME -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.167 >/dev/null || exit 1
ready=0
for i in $(seq 1 180); do
  if docker logs $NAME 2>&1 | grep -q "PostgreSQL init process complete"; then
    if docker exec $NAME psql -U supabase_admin -d postgres -c 'select 1' >/dev/null 2>&1; then ready=1; break; fi
  fi
  sleep 1
done
[ $ready = 1 ] || { echo "postgres not ready"; docker logs $NAME 2>&1 | tail -20; exit 1; }
run() { docker exec -i $NAME psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
run <<'SQL' || exit 1
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT reverse(split_part(reverse(name), '.', 1))
$$;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone text;
SQL
for f in "$REPO"/supabase/migrations/*.sql; do
  b=$(basename "$f")
  if [ "$b" = "20260317100000_subscription_freeze.sql" ]; then
    run -c "ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'frozen';" 2>&1 | tail -3
  fi
  out=$(run < "$f" 2>&1) || { echo "FAILED: $b"; echo "$out" | tail -8; exit 1; }
done
echo "replayed $(ls "$REPO"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"
for extra in "$@"; do
  out=$(run < "$extra" 2>&1) || { echo "FAILED: $extra"; echo "$out" | tail -8; exit 1; }
  echo "applied $(basename "$extra")"
done
```

- [ ] **Step 2: Write the RLS checks**

Create `$SCRATCH/checks-player-coaches.sql`. It seeds five users inside one transaction, signs in as each one, raises on the first wrong answer, and rolls back.

```sql
-- Throwaway RLS checks for players who coach. Run as supabase_admin with ON_ERROR_STOP:
-- the first failed expectation raises and stops the script.
\set ON_ERROR_STOP on
-- One transaction, rolled back at the end: the database is left as it was, pass or fail
BEGIN;

-- ── Seed: two plain players, a player who coaches, a coach and an admin ──
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'p@rls.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'p2@rls.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'pc@rls.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@rls.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'a@rls.test');
INSERT INTO profiles (id, first_name, last_name, email, role, is_coach) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Plain', 'Player', 'p@rls.test', 'player', FALSE),
  ('00000000-0000-0000-0000-0000000000a2', 'Other', 'Player', 'p2@rls.test', 'player', FALSE),
  ('00000000-0000-0000-0000-0000000000b1', 'Coaching', 'Player', 'pc@rls.test', 'player', TRUE),
  ('00000000-0000-0000-0000-0000000000c1', 'Only', 'Coach', 'c@rls.test', 'coach', TRUE),
  ('00000000-0000-0000-0000-0000000000d1', 'The', 'Admin', 'a@rls.test', 'admin', FALSE);
INSERT INTO groups (id, name) VALUES ('00000000-0000-0000-0000-0000000000e1', 'RLS Group');
INSERT INTO group_players (group_id, player_id) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');
INSERT INTO packages (id, name, session_count, validity_days, price)
  VALUES ('00000000-0000-0000-0000-0000000000f1', 'RLS Package', 8, 30, 100);
INSERT INTO subscriptions (player_id, package_id, sessions_remaining, sessions_total)
  VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 8, 8);
INSERT INTO schedule_sessions (id, group_id, day_of_week, start_time, end_time)
  VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000e1', 1, '18:00', '19:30');

-- Profiles among the seeded five that the current user can read
CREATE FUNCTION pg_temp.seen_profiles() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM profiles WHERE email LIKE '%@rls.test'
$$;

-- Runs one statement as a signed-in user; true if RLS let it through
CREATE FUNCTION pg_temp.expect(who uuid, label text, want boolean, stmt text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ok boolean := true;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', who::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege THEN ok := false;
  END;
  EXECUTE 'RESET ROLE';
  IF ok <> want THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, ok; END IF;
END $$;

-- Reads: raise inside the statement when the visible count is wrong
CREATE FUNCTION pg_temp.expect_count(who uuid, label text, want bigint, query text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', who::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE query INTO got;
  EXECUTE 'RESET ROLE';
  IF got <> want THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, got; END IF;
END $$;

-- Player who coaches: coach reads and writes
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000b1', 'player-coach reads every profile', 5, 'SELECT pg_temp.seen_profiles()');
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000b1', 'player-coach reads group members', 1, 'SELECT count(*) FROM group_players');
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000b1', 'player-coach reads subscriptions', 1, $q$SELECT count(*) FROM subscriptions WHERE player_id = '00000000-0000-0000-0000-0000000000a1'$q$);
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000b1', 'player-coach marks attendance', true,
  $q$INSERT INTO attendance (player_id, session_date) VALUES ('00000000-0000-0000-0000-0000000000a1', '2026-10-05')$q$);
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000b1', 'player-coach writes feedback', true,
  $q$INSERT INTO feedback (player_id, coach_id, session_date, rating) VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '2026-10-05', 5)$q$);
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000b1', 'player-coach writes a session plan', true,
  $q$INSERT INTO session_plans (schedule_session_id, session_date, goal) VALUES ('00000000-0000-0000-0000-000000000101', '2026-10-05', 'Serve')$q$);

-- Plain player: sees coaches (including the player who coaches), never other plain players, writes nothing
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000a1', 'plain player reads self and the three coaches', 4, 'SELECT pg_temp.seen_profiles()');
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000a1', 'plain player cannot read another plain player', 0, $q$SELECT count(*) FROM profiles WHERE email = 'p2@rls.test'$q$);
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000a1', 'plain player cannot mark attendance', false,
  $q$INSERT INTO attendance (player_id, session_date) VALUES ('00000000-0000-0000-0000-0000000000a1', '2026-10-06')$q$);

-- Coach and admin keep their access
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000c1', 'coach reads every profile', 5, 'SELECT pg_temp.seen_profiles()');
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000c1', 'coach marks attendance', true,
  $q$INSERT INTO attendance (player_id, session_date) VALUES ('00000000-0000-0000-0000-0000000000a1', '2026-10-07')$q$);
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000d1', 'admin reads every profile', 5, 'SELECT pg_temp.seen_profiles()');
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000d1', 'admin marks attendance', true,
  $q$INSERT INTO attendance (player_id, session_date) VALUES ('00000000-0000-0000-0000-0000000000a1', '2026-10-08')$q$);

-- Coach access removed: back to a plain player
UPDATE profiles SET is_coach = FALSE WHERE id = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.expect_count('00000000-0000-0000-0000-0000000000b1', 'removed coach reads only self and coaches', 3, 'SELECT pg_temp.seen_profiles()');
SELECT pg_temp.expect('00000000-0000-0000-0000-0000000000b1', 'removed coach cannot mark attendance', false,
  $q$INSERT INTO attendance (player_id, session_date) VALUES ('00000000-0000-0000-0000-0000000000a1', '2026-10-09')$q$);

-- Each rebuilt rule exists exactly once
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.name, (SELECT count(*) FROM pg_policies p WHERE p.policyname = t.name) AS n
    FROM (VALUES
      ('Coaches can view player profiles'), ('Coaches can view group players'), ('Coaches can view subscriptions'),
      ('Coaches and admins can manage attendance'), ('Coaches and admins can manage feedback'),
      ('Coaches and admins can manage session plans'), ('Players can view coach profiles')
    ) AS t(name)
  LOOP
    IF r.n <> 1 THEN RAISE EXCEPTION 'FAIL policy "%" exists % times', r.name, r.n; END IF;
  END LOOP;
END $$;

SELECT 'ALL PLAYER-COACH CHECKS PASSED';
ROLLBACK;
```

- [ ] **Step 3: Run the checks before the migration, to see them fail**

Run from the repo root: `"$SCRATCH/replay.sh"`. It takes 1 to 3 minutes; run it in the background and wait for it to finish.
Expected: `replayed 64 migrations`.

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -q < "$SCRATCH/checks-player-coaches.sql"`
Expected: `ERROR:  FAIL player-coach reads every profile: expected 5, got 3`.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261003200000_player_coaches.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- Players who coach (2026-10-03)
--   An admin can make an existing player a coach: role stays 'player'
--   and is_coach = TRUE, so they keep their player account and stay in
--   every player list. Coach access in RLS used to key on role, which a
--   player who coaches doesn't have; it now keys on "can coach":
--   role = 'coach' OR is_coach, via auth_can_coach().
--
--   Safe to apply ahead of the code: today every is_coach = TRUE account
--   is a coach or an admin, and both already pass these rules, so nobody
--   gains or loses access until a player is made a coach.
-- ═══════════════════════════════════════════════════════════════

-- Built like auth_role(): SECURITY DEFINER, so rules on profiles can call
-- it without recursing into profiles' own rules.
CREATE OR REPLACE FUNCTION auth_can_coach()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'coach' OR is_coach FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ── What a coach reads: players, group members, subscriptions ──
DROP POLICY IF EXISTS "Coaches can view player profiles" ON profiles;
CREATE POLICY "Coaches can view player profiles"
  ON profiles FOR SELECT USING (auth_can_coach());

DROP POLICY IF EXISTS "Coaches can view group players" ON group_players;
CREATE POLICY "Coaches can view group players"
  ON group_players FOR SELECT USING (auth_can_coach());

DROP POLICY IF EXISTS "Coaches can view subscriptions" ON subscriptions;
CREATE POLICY "Coaches can view subscriptions"
  ON subscriptions FOR SELECT USING (auth_can_coach());

-- ── What a coach writes: attendance, feedback to players, session plans ──
DROP POLICY IF EXISTS "Coaches and admins can manage attendance" ON attendance;
CREATE POLICY "Coaches and admins can manage attendance"
  ON attendance FOR ALL USING (auth_role() = 'admin' OR auth_can_coach());

DROP POLICY IF EXISTS "Coaches and admins can manage feedback" ON feedback;
CREATE POLICY "Coaches and admins can manage feedback"
  ON feedback FOR ALL USING (auth_role() = 'admin' OR auth_can_coach());

DROP POLICY IF EXISTS "Coaches and admins can manage session plans" ON session_plans;
CREATE POLICY "Coaches and admins can manage session plans"
  ON session_plans FOR ALL USING (auth_role() = 'admin' OR auth_can_coach());

-- ── Players see who coaches, so a player who coaches can be picked for
--    feedback and private sessions ──
DROP POLICY IF EXISTS "Players can view coach profiles" ON profiles;
CREATE POLICY "Players can view coach profiles"
  ON profiles FOR SELECT
  USING (auth_role() = 'player' AND (role IN ('coach', 'admin') OR is_coach));
```

- [ ] **Step 5: Apply it locally and rerun the checks**

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261003200000_player_coaches.sql`
Expected: no errors.

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -q < "$SCRATCH/checks-player-coaches.sql"`
Expected: `ALL PLAYER-COACH CHECKS PASSED`.

Keep the container running: Task 9 reuses it.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261003200000_player_coaches.sql
git commit -m "feat(db): coach access in RLS keys on can-coach, so a player can coach

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: App access checks and login landing

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/actions/auth.ts` (`login`, `verifyEmailOtp`)
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/(portal)/coach/layout.tsx`
- Modify: `src/app/_actions/training.ts` (`getCurrentUserRole`, `requireCoachOrAdmin`)
- Modify: `src/app/_actions/birthdays.ts`
- Modify: `src/app/(portal)/admin/feedback/actions.ts`

**Interfaces:**
- Consumes (Task 1): `VIEW_COOKIE`, `VIEW_COOKIE_OPTIONS`, `accountOf`, `coachOrAdmin`, `homePath`, `portalOfPath`, `portalsFor`, `viewToRemember`.
- Produces:
  - `getCurrentUserRole()` in `training.ts` now returns `{ id, role, is_coach: boolean } | null`. Task 6 relies on this.
  - `src/app/(portal)/coach/layout.tsx` holds `const account = accountOf(currentUser.profile)`. Task 4 passes it on.

- [ ] **Step 1: Middleware: import the helpers**

In `src/middleware.ts`, add below `import { NextResponse, type NextRequest } from "next/server";`:

```ts
import {
  VIEW_COOKIE,
  VIEW_COOKIE_OPTIONS,
  accountOf,
  homePath,
  portalOfPath,
  portalsFor,
  viewToRemember,
} from "@/lib/auth/portals";
```

- [ ] **Step 2: Middleware: replace the signed-in block**

Replace the whole block that starts at `  // If user is authenticated and verified` and ends with that `if`'s closing `  }`, just before the final `  return supabaseResponse;`, with:

```ts
  // If user is authenticated and verified
  if (user && user.email_confirmed_at) {
    // The view a player who coaches used last on this device
    const lastView = request.cookies.get(VIEW_COOKIE)?.value;

    // Redirect away from login/register/verify-email if already verified
    if (pathname === "/login" || pathname === "/register" || pathname === "/verify-email") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_coach")
        .eq("id", user.id)
        .single();

      const url = request.nextUrl.clone();
      url.pathname = homePath(accountOf(profile), lastView);
      return NextResponse.redirect(url);
    }

    // Portal routes: remember the view of an account that has two, then check access
    // (access is skipped in dev mode for portal switching)
    if (pathname.startsWith("/admin") || pathname.startsWith("/coach") || pathname.startsWith("/player")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_coach")
        .eq("id", user.id)
        .single();

      const account = accountOf(profile);
      const view = viewToRemember(account, pathname, lastView, request.headers);
      if (view) supabaseResponse.cookies.set(VIEW_COOKIE, view, VIEW_COOKIE_OPTIONS);

      if (process.env.NODE_ENV === "development") return supabaseResponse;

      // Admin can access everything
      if (account.role === "admin") return supabaseResponse;

      // Everyone else opens only the views their account has (a player who coaches has two).
      // Anything else under these prefixes, like /admin-setup, still bounces non-admins home.
      const portal = portalOfPath(pathname);
      if (portal && portalsFor(account).includes(portal)) return supabaseResponse;

      const url = request.nextUrl.clone();
      url.pathname = homePath(account, lastView);
      return NextResponse.redirect(url);
    }
  }
```

- [ ] **Step 3: Login actions land through `homePath`**

In `src/lib/actions/auth.ts`, add below `import { redirect } from "next/navigation";`:

```ts
import { cookies } from "next/headers";
import { VIEW_COOKIE, accountOf, homePath } from "@/lib/auth/portals";
```

The block below appears twice, in `login()` and in `verifyEmailOtp()`, and the two copies are identical. Replace both: use Edit with `replace_all: true`.

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .returns<Pick<Profile, "role">[]>()
    .single();

  const role = profile?.role || "player";
  const redirectTo =
    role === "admin" ? "/admin/dashboard" : role === "coach" ? "/coach/dashboard" : "/player/dashboard";

  redirect(redirectTo);
}
```

with:

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_coach")
    .eq("id", user.id)
    .returns<Pick<Profile, "role" | "is_coach">[]>()
    .single();

  // A player who coaches lands in the view they used last on this device
  const lastView = (await cookies()).get(VIEW_COOKIE)?.value;
  redirect(homePath(accountOf(profile), lastView));
}
```

- [ ] **Step 4: The auth callback lands through `homePath`**

In `src/app/auth/callback/route.ts`, add below `import { NextResponse, type NextRequest } from "next/server";`:

```ts
import { VIEW_COOKIE, accountOf, homePath } from "@/lib/auth/portals";
```

Replace:

```ts
  // Determine redirect based on role
  const { data: { user } } = await supabase.auth.getUser();
  let redirectPath = "/player/dashboard";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    switch (profile?.role) {
      case "admin":
        redirectPath = "/admin/dashboard";
        break;
      case "coach":
        redirectPath = "/coach/dashboard";
        break;
      default:
        redirectPath = "/player/dashboard";
    }
  }
```

with:

```ts
  // Land by role; a player who coaches lands in the view they used last on this device
  const { data: { user } } = await supabase.auth.getUser();
  let redirectPath = "/player/dashboard";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_coach")
      .eq("id", user.id)
      .single();

    redirectPath = homePath(accountOf(profile), request.cookies.get(VIEW_COOKIE)?.value);
  }
```

- [ ] **Step 5: The coach layout admits players with coach access**

Replace the whole of `src/app/(portal)/coach/layout.tsx` with:

```tsx
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { accountOf, coachOrAdmin } from "@/lib/auth/portals";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/login");
  const account = accountOf(currentUser.profile);
  // Coaches, admins, and players with coach access
  if (process.env.NODE_ENV !== "development" && !coachOrAdmin(account)) {
    redirect("/player/dashboard");
  }

  return (
    <SidebarLayout portal="coach" user={currentUser.profile}>
      {children}
    </SidebarLayout>
  );
}
```

- [ ] **Step 6: Coach-or-admin server actions**

In `src/app/_actions/training.ts`, add below `import { isFutureCairoDate } from "@/lib/utils/cairo-time";`:

```ts
import { accountOf, coachOrAdmin } from "@/lib/auth/portals";
```

Replace:

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id, role: profile.role as string } : null;
}
```

with:

```ts
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_coach")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id, role: profile.role as string, is_coach: profile.is_coach === true } : null;
}
```

Replace:

```ts
function requireCoachOrAdmin(user: { role: string } | null) {
  if (!user || (user.role !== "coach" && user.role !== "admin")) {
```

with:

```ts
function requireCoachOrAdmin(user: { role: string; is_coach: boolean } | null) {
  // Coaches, admins, and players with coach access
  if (!user || !coachOrAdmin(accountOf(user))) {
```

`requireCoachOrAdmin` has 4 callers (lines ~590, 671, 738, 994). Each passes the result of `getCurrentUserRole()`, so none of them change.

In `src/app/_actions/birthdays.ts`, add below the existing imports:

```ts
import { accountOf, coachOrAdmin } from "@/lib/auth/portals";
```

Replace:

```ts
    .select("id, role")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id as string, role: profile.role as string } : null;
```

with:

```ts
    .select("id, role, is_coach")
    .eq("id", user.id)
    .single();

  return profile
    ? { id: profile.id as string, role: profile.role as string, is_coach: profile.is_coach === true }
    : null;
```

and replace `  if (!user || (user.role !== "admin" && user.role !== "coach")) return [];` with:

```ts
  if (!user || !coachOrAdmin(accountOf(user))) return [];
```

In `src/app/(portal)/admin/feedback/actions.ts`, add below `import { createNotification } from "@/app/_actions/notifications";`:

```ts
import { accountOf, coachOrAdmin } from "@/lib/auth/portals";
```

and replace:

```ts
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || !["admin", "coach"].includes(me.role)) {
```

with:

```ts
  const { data: me } = await supabase
    .from("profiles")
    .select("role, is_coach")
    .eq("id", user.id)
    .single();
  // Coaches, admins, and players with coach access
  if (!me || !coachOrAdmin(accountOf(me))) {
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

Run: `npm test`
Expected: all pass.

Run: `grep -rn 'role === "coach" ? "/coach/dashboard"' src`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/middleware.ts src/lib/actions/auth.ts src/app/auth/callback/route.ts "src/app/(portal)/coach/layout.tsx" src/app/_actions/training.ts src/app/_actions/birthdays.ts "src/app/(portal)/admin/feedback/actions.ts"
git commit -m "feat(auth): players who coach open the coach portal, and login lands in their last view

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The view switcher

**Files:**
- Modify: `src/components/layout/sidebar-layout.tsx`
- Modify: `src/app/(portal)/player/layout.tsx`
- Modify: `src/app/(portal)/admin/layout.tsx`
- Modify: `src/app/(portal)/coach/layout.tsx`

**Interfaces:**
- Consumes (Task 1): `type Portal`, `accountOf`, `portalsFor`. Task 3's coach layout has `account` in scope.
- Produces: `SidebarLayout` takes a new required prop, `portals: Portal[]`.

- [ ] **Step 1: Use the shared `Portal` type**

In `src/components/layout/sidebar-layout.tsx`, delete the line `type Portal = "player" | "coach" | "admin";`. Add below `import { groupBySection, parseOpenSections, sectionOfKey, toggleSection, withSection } from "@/lib/nav/sections";`:

```ts
import type { Portal } from "@/lib/auth/portals";
```

- [ ] **Step 2: Replace `DevPortalSwitcher` with `PortalSwitcher`**

Replace the whole function from `/** Development only: jump between the three portals */` through its closing `}` with:

```tsx
/** Links between the views this account has (a player who coaches: Player | Coach).
 *  In development, all three portals. */
function PortalSwitcher({ portal, portals }: { portal: Portal; portals: Portal[] }) {
  const dev = process.env.NODE_ENV === "development";
  const shown: Portal[] = dev ? ["admin", "coach", "player"] : portals;
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-700/40 px-3 mb-1.5">
        {dev ? "Switch Portal" : "Switch view"}
      </p>
      <div className="flex gap-1">
        {shown.map((p) => (
          <a
            key={p}
            href={`/${p}/dashboard`}
            aria-current={portal === p ? "page" : undefined}
            className={cn(
              "flex-1 text-center py-1.5 rounded-md text-[11px] font-medium transition-colors",
              portal === p
                ? "bg-primary-50 text-primary-700"
                : "text-primary-700/50 hover:text-primary-900 hover:bg-sand/50"
            )}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </a>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Add the `portals` prop**

Replace:

```ts
interface SidebarLayoutProps {
  portal: Portal;
  user: Pick<Profile, "id" | "first_name" | "last_name" | "role" | "email">;
```

with:

```ts
interface SidebarLayoutProps {
  portal: Portal;
  /** The views this account can open (portalsFor); more than one shows the switcher */
  portals: Portal[];
  user: Pick<Profile, "id" | "first_name" | "last_name" | "role" | "email">;
```

Replace `export function SidebarLayout({ portal, user, children }: SidebarLayoutProps) {` with `export function SidebarLayout({ portal, portals, user, children }: SidebarLayoutProps) {`.

- [ ] **Step 4: Set the bell link and when the switcher shows**

Replace:

```ts
  const notifHref = portal === "admin" ? "/admin/notifications" : portal === "coach" ? "/coach/notifications" : "/player/notifications";
```

with:

```ts
  // There's no coach notifications page yet: a player who coaches reads theirs on the player side
  const notifHref =
    portal === "admin"
      ? "/admin/notifications"
      : portal === "coach" && !portals.includes("player")
        ? "/coach/notifications"
        : "/player/notifications";
  const showSwitcher = process.env.NODE_ENV === "development" || portals.length > 1;
```

- [ ] **Step 5: Show the switcher in its three places**

Replace:

```tsx
        {/* Dev portal switcher */}
        {process.env.NODE_ENV === "development" && !collapsed && (
          <div className="px-3 border-t border-primary-200/60 pt-3 pb-4 mt-2">
            <DevPortalSwitcher portal={portal} />
          </div>
        )}
```

with:

```tsx
        {/* View switcher */}
        {showSwitcher && !collapsed && (
          <div className="px-3 border-t border-primary-200/60 pt-3 pb-4 mt-2">
            <PortalSwitcher portal={portal} portals={portals} />
          </div>
        )}
```

Replace:

```tsx
            {process.env.NODE_ENV === "development" && (
              <div className="px-3 border-t border-primary-200/60 pt-3 pb-4">
                <DevPortalSwitcher portal={portal} />
              </div>
            )}
```

with:

```tsx
            {showSwitcher && (
              <div className="px-3 border-t border-primary-200/60 pt-3 pb-4">
                <PortalSwitcher portal={portal} portals={portals} />
              </div>
            )}
```

Replace `          footer={process.env.NODE_ENV === "development" ? <DevPortalSwitcher portal={portal} /> : undefined}` with:

```tsx
          footer={showSwitcher ? <PortalSwitcher portal={portal} portals={portals} /> : undefined}
```

- [ ] **Step 6: Each layout passes its account's views**

In `src/app/(portal)/player/layout.tsx`, add `import { accountOf, portalsFor } from "@/lib/auth/portals";`. Then replace `    <SidebarLayout portal="player" user={currentUser.profile}>` with:

```tsx
    <SidebarLayout portal="player" portals={portalsFor(accountOf(currentUser.profile))} user={currentUser.profile}>
```

In `src/app/(portal)/admin/layout.tsx`, add `import { accountOf, portalsFor } from "@/lib/auth/portals";`. Then replace:

```tsx
    <SidebarLayout
      portal="admin"
      user={currentUser.profile}
    >
```

with:

```tsx
    <SidebarLayout
      portal="admin"
      portals={portalsFor(accountOf(currentUser.profile))}
      user={currentUser.profile}
    >
```

In `src/app/(portal)/coach/layout.tsx`, change the import to `import { accountOf, coachOrAdmin, portalsFor } from "@/lib/auth/portals";`. Then replace `    <SidebarLayout portal="coach" user={currentUser.profile}>` with:

```tsx
    <SidebarLayout portal="coach" portals={portalsFor(account)} user={currentUser.profile}>
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

Run: `grep -rn "DevPortalSwitcher" src`
Expected: no output.

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/sidebar-layout.tsx "src/app/(portal)/player/layout.tsx" "src/app/(portal)/admin/layout.tsx" "src/app/(portal)/coach/layout.tsx"
git commit -m "feat(nav): players who coach switch between the Player and Coach views from the menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Players never pick themselves as coach

**Files:**
- Modify: `src/app/(portal)/player/feedback/page.tsx`
- Modify: `src/app/(portal)/player/feedback/actions.ts`
- Modify: `src/app/(portal)/player/private-sessions/request/page.tsx`
- Modify: `src/app/_actions/private-sessions.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: none for other tasks.

- [ ] **Step 1: Leave the current user out of both coach lists**

In `src/app/(portal)/player/feedback/page.tsx`, replace:

```ts
      .eq("is_coach", true)
      .eq("is_active", true)
      .order("first_name"),
  ]) as [
```

with:

```ts
      .eq("is_coach", true)
      .eq("is_active", true)
      // A player who coaches doesn't leave feedback for themselves
      .neq("id", currentUser.id)
      .order("first_name"),
  ]) as [
```

In `src/app/(portal)/player/private-sessions/request/page.tsx`, replace:

```ts
    .eq("is_coach", true)
    .eq("is_active", true)
    .order("first_name");
```

with:

```ts
    .eq("is_coach", true)
    .eq("is_active", true)
    // A player who coaches doesn't book a session with themselves
    .neq("id", currentUser.id)
    .order("first_name");
```

- [ ] **Step 2: Refuse it on the server too**

In `src/app/(portal)/player/feedback/actions.ts`, replace `  if (!input.coach_id) return { error: "Please select a coach" };` with:

```ts
  if (!input.coach_id) return { error: "Please select a coach" };
  if (input.coach_id === user.id) return { error: "You can't leave feedback for yourself" };
```

In `src/app/_actions/private-sessions.ts`, inside `createPrivateSessionRequest`, replace:

```ts
  if (data.requested_day_of_week < 0 || data.requested_day_of_week > 6) {
    return { error: "Invalid day of week" };
  }

  // Defense in depth: never trust the client's slot pick. Re-check the full
```

with:

```ts
  if (data.requested_day_of_week < 0 || data.requested_day_of_week > 6) {
    return { error: "Invalid day of week" };
  }
  if (data.coach_id && data.coach_id === user.id) {
    return { error: "You can't book a private session with yourself." };
  }

  // Defense in depth: never trust the client's slot pick. Re-check the full
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(portal)/player/feedback/page.tsx" "src/app/(portal)/player/feedback/actions.ts" "src/app/(portal)/player/private-sessions/request/page.tsx" src/app/_actions/private-sessions.ts
git commit -m "fix(player): a player who coaches can't pick themselves for feedback or a private session

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Server actions: make a player a coach, remove coach access

**Files:**
- Modify: `src/app/_actions/training.ts`

**Interfaces:**
- Consumes (Task 3): `getCurrentUserRole()` returning `{ id, role, is_coach }`. Also the existing `requireAdmin`.
- Produces (used by Tasks 7 and 13):
  - `assignPlayerAsCoach(playerId: string): Promise<{ error: string } | { success: true }>`
  - `removeCoachAccess(coachId: string): Promise<{ error: string } | { success: true }>`
  - `deleteCoach` now refuses `role = 'player'`.
  - `updateCoach` leaves `is_active` alone for `role = 'player'`.

- [ ] **Step 1: `deleteCoach` refuses players who coach**

Replace:

```ts
  // Never delete an admin via the coaches list — an admin can also be a coach
  // (is_coach=true), and identity/is_active live on the single shared profile row.
  const { data: target } = await admin.from("profiles").select("role").eq("id", coachId).single();
  if (!target) return { error: "Coach not found" };
  if (target.role === "admin") {
    return { error: "This account is also an admin and can't be deleted from the coaches list." };
  }
```

with:

```ts
  // Never delete an admin or a player via the coaches list — either can also be a coach
  // (is_coach=true), and identity/is_active live on the single shared profile row.
  const { data: target } = await admin.from("profiles").select("role").eq("id", coachId).single();
  if (!target) return { error: "Coach not found" };
  if (target.role === "admin") {
    return { error: "This account is also an admin and can't be deleted from the coaches list." };
  }
  if (target.role === "player") {
    return { error: "This coach is also a player. Use Remove coach access instead." };
  }
```

- [ ] **Step 2: `updateCoach` leaves a player's account status alone**

Replace:

```ts
  const { error } = await admin
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName, email, phone, area, is_active: isActive })
    .eq("id", coachId)
    .eq("is_coach", true);
```

with:

```ts
  // For a player who coaches, is_active is their player account's status: it's managed
  // from Players, never from here
  const { data: target } = await admin.from("profiles").select("role").eq("id", coachId).single();
  const update: Record<string, unknown> = { first_name: firstName, last_name: lastName, email, phone, area };
  if (target?.role !== "player") update.is_active = isActive;

  const { error } = await admin
    .from("profiles")
    .update(update)
    .eq("id", coachId)
    .eq("is_coach", true);
```

- [ ] **Step 3: Add the two new actions**

Right after the end of `bulkDeleteCoaches`, which is:

```ts
  revalidatePath("/admin/coaches");
  revalidatePath("/admin/dashboard");
  return { success: true, results };
}
```

insert:

```ts

/** Make an existing player a coach on their own account: they keep role 'player', so they
 *  stay in every player list, and gain the coach view. */
export async function assignPlayerAsCoach(playerId: string): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: target } = await admin
    .from("profiles")
    .select("role, is_coach, is_active")
    .eq("id", playerId)
    .single();
  if (!target || target.role !== "player") return { error: "Player not found" };
  if (!target.is_active) return { error: "This player's account is inactive" };
  if (target.is_coach) return { error: "This player is already a coach" };

  const { error } = await admin
    .from("profiles")
    .update({ is_coach: true, updated_at: new Date().toISOString() })
    .eq("id", playerId);
  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** Take coach access away from a player who coaches. Their player account and history stay;
 *  they come off the groups they coach. Coach-only accounts are deleted instead (deleteCoach). */
export async function removeCoachAccess(coachId: string): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: target } = await admin.from("profiles").select("role, is_coach").eq("id", coachId).single();
  if (!target || target.role !== "player" || !target.is_coach) {
    return { error: "Only a player who coaches can have coach access removed" };
  }

  // Groups first: if this fails they're still a coach, and the admin can try again from their drawer
  const { error: groupsError } = await admin
    .from("coach_groups")
    .update({ is_active: false })
    .eq("coach_id", coachId)
    .eq("is_active", true);
  if (groupsError) return { error: groupsError.message };

  const { error } = await admin
    .from("profiles")
    .update({ is_coach: false, updated_at: new Date().toISOString() })
    .eq("id", coachId);
  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/groups");
  revalidatePath("/admin/dashboard");
  return { success: true };
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/_actions/training.ts
git commit -m "feat(coaches): admins make a player a coach or remove coach access without touching their account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Coaches list, drawer and detail page for players who coach

**Files:**
- Modify: `src/app/(portal)/admin/coaches/_components/types.ts`
- Modify: `src/app/(portal)/admin/coaches/page.tsx`
- Modify: `src/app/(portal)/admin/coaches/_components/table.tsx`
- Modify: `src/app/(portal)/admin/coaches/_components/coach-drawer.tsx`
- Modify: `src/app/(portal)/admin/coaches/[id]/page.tsx`

**Interfaces:**
- Consumes (Task 6): `removeCoachAccess`, plus `deleteCoach` refusing players.
- Produces: `CoachRow.is_player: boolean`.

- [ ] **Step 1: `CoachRow.is_player`**

In `types.ts`, replace:

```ts
  group_count: number;
  group_names: string[];
}
```

with:

```ts
  group_count: number;
  group_names: string[];
  /** A player who coaches (role 'player', is_coach): removing coach access keeps their account */
  is_player: boolean;
}
```

- [ ] **Step 2: Load the role, and update the bulk-delete wording**

In `page.tsx`, replace `.select("id, first_name, last_name, email, phone, area, is_active, created_at, coach_groups!coach_groups_coach_id_fkey(is_active, groups(name))")` with:

```ts
      .select("id, first_name, last_name, email, phone, area, is_active, created_at, role, coach_groups!coach_groups_coach_id_fkey(is_active, groups(name))")
```

Replace:

```ts
          group_count: group_names.length,
          group_names,
        };
```

with:

```ts
          group_count: group_names.length,
          group_names,
          is_player: c.role === "player",
        };
```

Replace `Admin accounts are skipped. This can&apos;t be undone.` with `Admin and player accounts are skipped. This can&apos;t be undone.`

Replace `couldn't be deleted (admin accounts are skipped).` with `couldn't be deleted (admin and player accounts are skipped).`

- [ ] **Step 3: The Player tag in the table**

In `table.tsx` (desktop), replace:

```tsx
                      <p className="text-sm font-medium text-slate-900">
                        {coach.first_name} {coach.last_name}
                      </p>
```

with:

```tsx
                      <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        {coach.first_name} {coach.last_name}
                        {coach.is_player && <Badge variant="neutral">Player</Badge>}
                      </p>
```

and in the mobile cards, replace:

```tsx
                  <p className="text-sm font-semibold text-slate-900">
                    {coach.first_name} {coach.last_name}
                  </p>
```

with:

```tsx
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    {coach.first_name} {coach.last_name}
                    {coach.is_player && <Badge variant="neutral">Player</Badge>}
                  </p>
```

- [ ] **Step 4: The coach drawer**

In `coach-drawer.tsx`, make these replacements.

Imports. Replace

```ts
import { X, Mail, Phone, MapPin, Calendar, Users, Pencil, ExternalLink, Loader2, ArrowLeft, Trash2 } from "lucide-react";
```

with

```ts
import { X, Mail, Phone, MapPin, Calendar, Users, Pencil, ExternalLink, Loader2, ArrowLeft, Trash2, UserMinus, User } from "lucide-react";
```

and replace `import { updateCoach, deleteCoach } from "@/app/_actions/training";` with:

```ts
import { updateCoach, deleteCoach, removeCoachAccess } from "@/app/_actions/training";
```

Header badges. Replace:

```tsx
            <div className="mt-1">
              <Badge variant={coach.is_active ? "success" : "neutral"}>
                {coach.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
```

with:

```tsx
            <div className="mt-1 flex items-center gap-1.5">
              <Badge variant={coach.is_active ? "success" : "neutral"}>
                {coach.is_active ? "Active" : "Inactive"}
              </Badge>
              {coach.is_player && <Badge variant="neutral">Player</Badge>}
            </div>
```

Footer. Replace:

```tsx
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 border border-slate-200 hover:bg-red-50 hover:border-red-200 transition-colors"
            title="Delete Coach"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <Link href={`/admin/coaches/${coach.id}`} className="block">
          <Button fullWidth>
            <span className="flex items-center justify-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> View Full Profile
            </span>
          </Button>
        </Link>
      </div>
```

with:

```tsx
          {/* A player who coaches keeps their account: coach access is removed, not the account */}
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 border border-slate-200 hover:bg-red-50 hover:border-red-200 transition-colors"
            title={coach.is_player ? "Remove coach access" : "Delete Coach"}
            aria-label={coach.is_player ? "Remove coach access" : "Delete Coach"}
          >
            {coach.is_player ? <UserMinus className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
        <Link href={`/admin/coaches/${coach.id}`} className="block">
          <Button fullWidth>
            <span className="flex items-center justify-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> View Full Profile
            </span>
          </Button>
        </Link>
        {coach.is_player && (
          <Link href={`/admin/players/${coach.id}`} className="block">
            <Button variant="secondary" fullWidth>
              <span className="flex items-center justify-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Player Profile
              </span>
            </Button>
          </Link>
        )}
      </div>
```

Confirmation text. Replace:

```tsx
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Delete Coach</h3>
              <p className="text-sm text-slate-500 mt-1">
                Permanently delete <span className="font-medium text-slate-700">{coach.first_name} {coach.last_name}</span>? Their account is removed, any sessions they ran become unassigned, and their feedback is deleted. This can&apos;t be undone.
              </p>
```

with:

```tsx
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                {coach.is_player ? <UserMinus className="w-6 h-6 text-red-500" /> : <Trash2 className="w-6 h-6 text-red-500" />}
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{coach.is_player ? "Remove Coach Access" : "Delete Coach"}</h3>
              {coach.is_player ? (
                <p className="text-sm text-slate-500 mt-1">
                  <span className="font-medium text-slate-700">{coach.first_name} {coach.last_name}</span> stops being a coach and loses the Coach view. Their player account, subscriptions and history stay. They&apos;re taken off the groups they coach; sessions already on the schedule keep their name until you reassign them. Export their pay first if you still need it.
                </p>
              ) : (
                <p className="text-sm text-slate-500 mt-1">
                  Permanently delete <span className="font-medium text-slate-700">{coach.first_name} {coach.last_name}</span>? Their account is removed, any sessions they ran become unassigned, and their feedback is deleted. This can&apos;t be undone.
                </p>
              )}
```

The action. Replace:

```tsx
                    const res = await deleteCoach(coach.id);
                    if ("error" in res) setDeleteError(res.error ?? "Failed to delete coach");
```

with:

```tsx
                    const res = coach.is_player ? await removeCoachAccess(coach.id) : await deleteCoach(coach.id);
                    if ("error" in res) setDeleteError(res.error ?? (coach.is_player ? "Failed to remove coach access" : "Failed to delete coach"));
```

The button label. Replace:

```tsx
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</span>
                ) : (
                  "Delete Coach"
                )}
```

with:

```tsx
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {coach.is_player ? "Removing..." : "Deleting..."}</span>
                ) : coach.is_player ? (
                  "Remove Access"
                ) : (
                  "Delete Coach"
                )}
```

The edit view hides Status for a player who coaches. Replace:

```tsx
        <div>
          <Label>Status</Label>
          <Select value={isActive ? "true" : "false"} onChange={(e) => setIsActive(e.target.value === "true")}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>
```

with:

```tsx
        {/* A player who coaches: Active/Inactive is their player account's status, set from Players */}
        {!coach.is_player && (
          <div>
            <Label>Status</Label>
            <Select value={isActive ? "true" : "false"} onChange={(e) => setIsActive(e.target.value === "true")}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
        )}
```

- [ ] **Step 5: The Player tag on the detail page**

In `[id]/page.tsx`, replace `      .select("id, first_name, last_name, email, phone, area, is_active, created_at")` with:

```ts
      .select("id, first_name, last_name, email, phone, area, is_active, created_at, role")
```

Replace `    phone: string | null; area: string | null; is_active: boolean; created_at: string;` with:

```ts
    phone: string | null; area: string | null; is_active: boolean; created_at: string; role: string;
```

Replace:

```tsx
              <Badge variant={coach.is_active ? "success" : "neutral"}>
                {coach.is_active ? "Active" : "Inactive"}
              </Badge>
              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
```

with:

```tsx
              <Badge variant={coach.is_active ? "success" : "neutral"}>
                {coach.is_active ? "Active" : "Inactive"}
              </Badge>
              {coach.role === "player" && <Badge variant="neutral">Player</Badge>}
              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/admin/coaches"
git commit -m "feat(coaches): players who coach are tagged, and their drawer removes coach access instead of deleting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Invite helpers (`src/lib/coaches/invites.ts`)

**Files:**
- Create: `src/lib/coaches/invites.ts`
- Create: `src/lib/coaches/invites.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: `branding` (`src/lib/config/branding.ts`), `shortDate` (`src/lib/birthdays/format.ts`) and `cairoDayKey` (`src/lib/utils/cairo-time.ts`).
- Produces (used by Tasks 10, 11, 12, 13):
  - `INVITE_DAYS`
  - `type InviteState`
  - `interface InviteDates`
  - `inviteExpiry(now: Date): Date`
  - `inviteState(invite: InviteDates, now: Date): InviteState`
  - `inviteUrl(origin: string, token: string): string`
  - `originFrom(host: string | null, proto: string | null): string | null`
  - `expiryLabel(expiresAt: string): string`
  - `inviteMessage(firstName: string, url: string, expiresAt: string): string`
  - `interface CreatedInvite { url; firstName; phone; email: string | null; expiresAt; emailed: boolean | null }`
  - `escapeLike(text: string): string`
  - `alreadyRegistered(error: { message: string } | null, user: { identities?: unknown[] | null } | null): boolean`
  - `interface InviteForm`, `interface SignupForm`
  - `inviteProblem(input: InviteForm): string | null`
  - `signupProblem(input: SignupForm): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/coaches/invites.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_DAYS,
  alreadyRegistered,
  escapeLike,
  expiryLabel,
  inviteExpiry,
  inviteMessage,
  inviteProblem,
  inviteState,
  inviteUrl,
  originFrom,
  signupProblem,
} from "./invites";

const NOW = new Date("2026-10-03T12:00:00Z");

test("inviteExpiry: seven days after it's made", () => {
  assert.equal(INVITE_DAYS, 7);
  assert.equal(inviteExpiry(NOW).toISOString(), "2026-10-10T12:00:00.000Z");
});

test("inviteState: open until the moment it expires", () => {
  const open = { expires_at: "2026-10-10T12:00:00Z", accepted_at: null, revoked_at: null };
  assert.equal(inviteState(open, NOW), "pending");
  assert.equal(inviteState(open, new Date("2026-10-10T11:59:59Z")), "pending");
  assert.equal(inviteState(open, new Date("2026-10-10T12:00:00Z")), "expired");
});

test("inviteState: accepted beats revoked beats expired", () => {
  const past = "2026-10-01T00:00:00Z";
  assert.equal(inviteState({ expires_at: past, accepted_at: past, revoked_at: past }, NOW), "accepted");
  assert.equal(inviteState({ expires_at: past, accepted_at: null, revoked_at: past }, NOW), "revoked");
  assert.equal(inviteState({ expires_at: past, accepted_at: null, revoked_at: null }, NOW), "expired");
});

test("inviteUrl: the invite page under the site's address", () => {
  assert.equal(inviteUrl("https://app.beachamp.com", "abc_123"), "https://app.beachamp.com/invite/abc_123");
  assert.equal(inviteUrl("https://app.beachamp.com/", "abc"), "https://app.beachamp.com/invite/abc");
});

test("originFrom: host and protocol from the request", () => {
  assert.equal(originFrom("app.beachamp.com", "https"), "https://app.beachamp.com");
  assert.equal(originFrom("app.beachamp.com", "https,http"), "https://app.beachamp.com");
  assert.equal(originFrom("app.beachamp.com", null), "https://app.beachamp.com");
  assert.equal(originFrom("localhost:3000", null), "http://localhost:3000");
  assert.equal(originFrom(null, "https"), null);
});

test("expiryLabel: the Cairo calendar day, not the server's", () => {
  assert.equal(expiryLabel("2026-10-10T12:00:00Z"), "Sat 10 Oct");
  // 22:30 UTC on Fri 9 Oct is already Sat 10 Oct in Cairo
  assert.equal(expiryLabel("2026-10-09T22:30:00Z"), "Sat 10 Oct");
});

test("inviteMessage: name, link and the last day it works", () => {
  const text = inviteMessage("Omar", "https://x.test/invite/abc", "2026-10-10T12:00:00Z");
  assert.match(text, /^Hi Omar, you're invited to join .+ as a coach\./);
  assert.match(text, /\nhttps:\/\/x\.test\/invite\/abc\n/);
  assert.match(text, /expires on Sat 10 Oct\.$/);
});

test("escapeLike: an email with _ or % matches only itself", () => {
  assert.equal(escapeLike("omar_adel@example.com"), "omar\\_adel@example.com");
  assert.equal(escapeLike("100%@x.com"), "100\\%@x.com");
  assert.equal(escapeLike("back\\slash@x.com"), "back\\\\slash@x.com");
  assert.equal(escapeLike("plain@x.com"), "plain@x.com");
});

test("alreadyRegistered: both ways Supabase says the email has an account", () => {
  assert.equal(alreadyRegistered({ message: "User already registered" }, null), true);
  assert.equal(alreadyRegistered(null, { identities: [] }), true);
});

test("alreadyRegistered: a new account, or a different failure", () => {
  assert.equal(alreadyRegistered(null, { identities: [{ provider: "email" }] }), false);
  assert.equal(alreadyRegistered(null, { identities: null }), false);
  assert.equal(alreadyRegistered(null, null), false);
  assert.equal(alreadyRegistered({ message: "Email rate limit exceeded" }, null), false);
});

test("inviteProblem: names and phone are required, an email is optional but must look right", () => {
  const ok = { first_name: "Omar", last_name: "Adel", phone: "01000000000", email: "" };
  assert.equal(inviteProblem(ok), null);
  assert.equal(inviteProblem({ ...ok, email: "omar@example.com" }), null);
  assert.equal(inviteProblem({ ...ok, first_name: " " }), "First and last name are required");
  assert.equal(inviteProblem({ ...ok, last_name: "" }), "First and last name are required");
  assert.equal(inviteProblem({ ...ok, phone: "  " }), "Phone is required");
  assert.equal(inviteProblem({ ...ok, email: "omar@" }), "Please enter a valid email");
});

test("signupProblem: the coach also needs an email and a 6-character password", () => {
  const ok = { first_name: "Omar", last_name: "Adel", phone: "01000000000", email: "omar@example.com", password: "secret" };
  assert.equal(signupProblem(ok), null);
  assert.equal(signupProblem({ ...ok, first_name: "" }), "First and last name are required");
  assert.equal(signupProblem({ ...ok, email: "" }), "Email is required");
  assert.equal(signupProblem({ ...ok, email: "nope" }), "Please enter a valid email");
  assert.equal(signupProblem({ ...ok, password: "12345" }), "Password must be at least 6 characters");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test src/lib/coaches/invites.test.ts`
Expected: FAIL, with `Cannot find module './invites'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/coaches/invites.ts`:

```ts
// Coach invites: an admin sends a link, and the coach creates their own account from it.

import { branding } from "@/lib/config/branding";
import { shortDate } from "@/lib/birthdays/format";
import { cairoDayKey } from "@/lib/utils/cairo-time";

export const INVITE_DAYS = 7;

export type InviteState = "pending" | "expired" | "accepted" | "revoked";

export interface InviteDates {
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/** When a link made now stops working */
export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

/** Where an invite stands: accepted beats revoked beats expired */
export function inviteState(invite: InviteDates, now: Date): InviteState {
  if (invite.accepted_at) return "accepted";
  if (invite.revoked_at) return "revoked";
  return new Date(invite.expires_at).getTime() <= now.getTime() ? "expired" : "pending";
}

/** The link the coach opens */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/** The site's address from the request's host and protocol headers, or null without a host */
export function originFrom(host: string | null, proto: string | null): string | null {
  if (!host) return null;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const scheme = proto?.split(",")[0].trim() || (local ? "http" : "https");
  return `${scheme}://${host}`;
}

/** The last day a link works, as a Cairo calendar day: "Sat 10 Oct" */
export function expiryLabel(expiresAt: string): string {
  return shortDate(cairoDayKey(new Date(expiresAt)));
}

/** The WhatsApp and email text: who it's for, the link, and the last day it works */
export function inviteMessage(firstName: string, url: string, expiresAt: string): string {
  return (
    `Hi ${firstName}, you're invited to join ${branding.name} as a coach. ` +
    `Create your coach account here:\n${url}\n\nThe link works once and expires on ${expiryLabel(expiresAt)}.`
  );
}

/** What createCoachInvite hands back for the admin to share */
export interface CreatedInvite {
  url: string;
  firstName: string;
  phone: string;
  email: string | null;
  expiresAt: string;
  /** Whether the email went out; null when no email was given */
  emailed: boolean | null;
}

/** Escapes LIKE wildcards, so an ilike() on an email matches only that email ("omar_a" isn't "omarxa") */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Supabase's answer to signing up an email that already has an account: an "already registered"
 *  error, or (with email confirmation on) no error and a user with no identities */
export function alreadyRegistered(
  error: { message: string } | null,
  user: { identities?: unknown[] | null } | null
): boolean {
  if (error) return /already registered/i.test(error.message);
  return user?.identities?.length === 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export interface SignupForm extends InviteForm {
  password: string;
}

/** What's wrong with the admin's invite form, or null: names and phone required, email optional */
export function inviteProblem(input: InviteForm): string | null {
  if (!input.first_name.trim() || !input.last_name.trim()) return "First and last name are required";
  if (!input.phone.trim()) return "Phone is required";
  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) return "Please enter a valid email";
  return null;
}

/** What's wrong with the coach's signup form, or null: also an email and a 6-character password */
export function signupProblem(input: SignupForm): string | null {
  return (
    inviteProblem(input) ??
    (input.email.trim() ? null : "Email is required") ??
    (input.password.length < 6 ? "Password must be at least 6 characters" : null)
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/lib/coaches/invites.test.ts`
Expected: PASS, `# pass 12`, `# fail 0`.

- [ ] **Step 5: Add the folder to `npm test`**

In `package.json`, change the end of the `test` script from `src/lib/auth/*.test.ts"` to `src/lib/auth/*.test.ts src/lib/coaches/*.test.ts"`.

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/coaches/invites.ts src/lib/coaches/invites.test.ts package.json
git commit -m "feat(coaches): invite expiry, links, messages and form checks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Database: coach invites

**Files:**
- Create: `supabase/migrations/20261003210000_coach_invites.sql`
- Scratch only: `$SCRATCH/checks-coach-invites.sql`

**Interfaces:**
- Consumes: the `pc-rls-pg` container from Task 2. If it's gone, rerun `"$SCRATCH/replay.sh"`. After this task the migration files exist, so the replay includes them.
- Produces the `coach_invites` table. Columns:
  - `id`, `token` (unique), `first_name`, `last_name`, `phone`
  - `email` (nullable)
  - `created_by`
  - `created_at`, `expires_at`
  - `accepted_at`, `accepted_by`, `revoked_at`

  Only admins can read or write it through RLS.

- [ ] **Step 1: Write the checks**

Create `$SCRATCH/checks-coach-invites.sql`:

```sql
-- Throwaway RLS checks for coach invites. Run as supabase_admin with ON_ERROR_STOP.
\set ON_ERROR_STOP on
-- One transaction, rolled back at the end: the database is left as it was, pass or fail
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'p@rls.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'pc@rls.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@rls.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'a@rls.test');
INSERT INTO profiles (id, first_name, last_name, email, role, is_coach) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Plain', 'Player', 'p@rls.test', 'player', FALSE),
  ('00000000-0000-0000-0000-0000000000b1', 'Coaching', 'Player', 'pc@rls.test', 'player', TRUE),
  ('00000000-0000-0000-0000-0000000000c1', 'Only', 'Coach', 'c@rls.test', 'coach', TRUE),
  ('00000000-0000-0000-0000-0000000000d1', 'The', 'Admin', 'a@rls.test', 'admin', FALSE);
INSERT INTO coach_invites (token, first_name, last_name, phone, created_by, expires_at)
  VALUES ('rls-token', 'New', 'Coach', '01000000000', '00000000-0000-0000-0000-0000000000d1', NOW() + INTERVAL '7 days');

CREATE FUNCTION pg_temp.invites_seen(who uuid) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE got bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', who::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO got FROM coach_invites WHERE token = 'rls-token';
  EXECUTE 'RESET ROLE';
  RETURN got;
END $$;

CREATE FUNCTION pg_temp.can_insert(who uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE ok boolean := true;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', who::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO coach_invites (token, first_name, last_name, phone, expires_at)
      VALUES ('rls-' || who::text, 'X', 'Y', '0', NOW() + INTERVAL '1 day');
  EXCEPTION WHEN insufficient_privilege THEN ok := false;
  END;
  EXECUTE 'RESET ROLE';
  RETURN ok;
END $$;

DO $$
BEGIN
  IF pg_temp.invites_seen('00000000-0000-0000-0000-0000000000d1') <> 1 THEN RAISE EXCEPTION 'FAIL admin reads invites'; END IF;
  IF pg_temp.invites_seen('00000000-0000-0000-0000-0000000000a1') <> 0 THEN RAISE EXCEPTION 'FAIL plain player reads invites'; END IF;
  IF pg_temp.invites_seen('00000000-0000-0000-0000-0000000000b1') <> 0 THEN RAISE EXCEPTION 'FAIL player-coach reads invites'; END IF;
  IF pg_temp.invites_seen('00000000-0000-0000-0000-0000000000c1') <> 0 THEN RAISE EXCEPTION 'FAIL coach reads invites'; END IF;
  IF NOT pg_temp.can_insert('00000000-0000-0000-0000-0000000000d1') THEN RAISE EXCEPTION 'FAIL admin creates an invite'; END IF;
  IF pg_temp.can_insert('00000000-0000-0000-0000-0000000000c1') THEN RAISE EXCEPTION 'FAIL coach creates an invite'; END IF;
END $$;

-- Single use: the claim the signup action makes succeeds once, then matches nothing
DO $$
DECLARE first_claim int; second_claim int;
BEGIN
  UPDATE coach_invites SET accepted_at = NOW()
    WHERE token = 'rls-token' AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW();
  GET DIAGNOSTICS first_claim = ROW_COUNT;
  UPDATE coach_invites SET accepted_at = NOW()
    WHERE token = 'rls-token' AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW();
  GET DIAGNOSTICS second_claim = ROW_COUNT;
  IF first_claim <> 1 OR second_claim <> 0 THEN RAISE EXCEPTION 'FAIL single use: % then %', first_claim, second_claim; END IF;
END $$;

-- An invite that expired or was revoked while the coach filled in the form can't be claimed
INSERT INTO coach_invites (token, first_name, last_name, phone, expires_at)
  VALUES ('rls-expired', 'Late', 'Coach', '0', NOW() - INTERVAL '1 minute');
INSERT INTO coach_invites (token, first_name, last_name, phone, expires_at, revoked_at)
  VALUES ('rls-revoked', 'Revoked', 'Coach', '0', NOW() + INTERVAL '7 days', NOW());
DO $$
DECLARE claimed int;
BEGIN
  UPDATE coach_invites SET accepted_at = NOW()
    WHERE token IN ('rls-expired', 'rls-revoked') AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW();
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed <> 0 THEN RAISE EXCEPTION 'FAIL expired or revoked invite was claimed (% rows)', claimed; END IF;
END $$;

-- Deleting the admin who made it (or the coach who used it) keeps the invite row
DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000d1';
DO $$
BEGIN
  IF (SELECT created_by FROM coach_invites WHERE token = 'rls-token') IS NOT NULL THEN RAISE EXCEPTION 'FAIL created_by not cleared'; END IF;
END $$;

SELECT 'ALL COACH-INVITE CHECKS PASSED';
ROLLBACK;
```

- [ ] **Step 2: Run the checks before the migration, to see them fail**

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -q < "$SCRATCH/checks-coach-invites.sql"`
Expected: `ERROR:  relation "coach_invites" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261003210000_coach_invites.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- Coach invites (2026-10-03)
--   Admins invite a new coach with a link instead of creating the
--   account and a password for them. The coach opens /invite/<token>,
--   creates their own account (role 'coach', is_coach) and verifies
--   their email with the usual signup code.
--
--   A link works once (accepted_at is claimed atomically), expires
--   (expires_at, 7 days after it's made) and can be revoked
--   (revoked_at). Only admins read this table; the invite page and its
--   signup action use the service role.
--
--   Safe to apply ahead of the code: a new table nothing reads yet.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE coach_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ
);

-- The Coaches page lists the open ones, newest first
CREATE INDEX idx_coach_invites_open ON coach_invites(created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE coach_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coach invites"
  ON coach_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

- [ ] **Step 4: Apply it locally and rerun both checks**

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261003210000_coach_invites.sql`
Expected: no errors.

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -q < "$SCRATCH/checks-coach-invites.sql"`
Expected: `ALL COACH-INVITE CHECKS PASSED`.

Run: `docker exec -i pc-rls-pg psql -U supabase_admin -d postgres -q < "$SCRATCH/checks-player-coaches.sql"`
Expected: `ALL PLAYER-COACH CHECKS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261003210000_coach_invites.sql
git commit -m "feat(db): coach invites, single-use links only admins can see

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Invite server actions

**Files:**
- Create: `src/app/_actions/coach-invites.ts`

**Interfaces:**
- Consumes:
  - Task 8: `alreadyRegistered`, `escapeLike`, `inviteExpiry`, `inviteMessage`, `inviteProblem`, `inviteUrl`, `originFrom`, `signupProblem`, `type CreatedInvite`
  - existing: `notifyAdmins` (`src/app/_actions/notifications.ts`), `sendEmail` (`src/lib/email/send.ts`), `branding`, and `createClient` / `createAdminClient`
- Produces (used by Tasks 11, 12, 13):
  - `createCoachInvite(formData: FormData): Promise<{ error: string } | { success: true; invite: CreatedInvite }>`
  - `revokeCoachInvite(inviteId: string): Promise<{ error: string } | { success: true }>`
  - `acceptCoachInvite(token: string, formData: FormData): Promise<{ error: string }>`. On success it redirects to `/verify-email?email=…`.

  The form fields are `first_name`, `last_name`, `phone` and `email`, plus `password` for accept.

- [ ] **Step 1: Write the actions**

Create `src/app/_actions/coach-invites.ts`:

```ts
"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/app/_actions/notifications";
import { sendEmail } from "@/lib/email/send";
import { branding } from "@/lib/config/branding";
import {
  alreadyRegistered,
  escapeLike,
  inviteExpiry,
  inviteMessage,
  inviteProblem,
  inviteUrl,
  originFrom,
  signupProblem,
  type CreatedInvite,
} from "@/lib/coaches/invites";

// ── Helper: the signed-in admin's id, or null ──
async function currentAdminId(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? (user.id as string) : null;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// ═══════════════════════════════════════
// ADMIN: invite a coach, revoke an invite
// ═══════════════════════════════════════

/** Invite a new coach: a link that works once and expires in 7 days, emailed too when there's an address */
export async function createCoachInvite(
  formData: FormData
): Promise<{ error: string } | { success: true; invite: CreatedInvite }> {
  const adminId = await currentAdminId();
  if (!adminId) return { error: "Unauthorized: admin access required" };

  const input = {
    first_name: field(formData, "first_name"),
    last_name: field(formData, "last_name"),
    phone: field(formData, "phone"),
    email: field(formData, "email").toLowerCase(),
  };
  const problem = inviteProblem(input);
  if (problem) return { error: problem };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Someone who already has an account is made a coach from Existing player instead
  if (input.email) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", escapeLike(input.email))
      .limit(1);
    if (existing?.length) return { error: "This email already has an account. Use Existing player instead." };
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = inviteExpiry(new Date()).toISOString();
  const { error } = await admin.from("coach_invites").insert({
    token,
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    email: input.email || null,
    created_by: adminId,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  // The link uses the address the admin is on, so it works on staging and production alike
  const h = await headers();
  const origin = originFrom(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")) ?? "";
  const url = inviteUrl(origin, token);

  let emailed: boolean | null = null;
  if (input.email) {
    const sent = await sendEmail({
      to: input.email,
      subject: `You're invited to coach at ${branding.name}`,
      body: inviteMessage(input.first_name, url, expiresAt),
      ctaLabel: "Create your coach account",
      ctaUrl: url,
    });
    emailed = sent.success;
  }

  revalidatePath("/admin/coaches");
  return {
    success: true,
    invite: { url, firstName: input.first_name, phone: input.phone, email: input.email || null, expiresAt, emailed },
  };
}

/** Revoke an open invite: its link stops working */
export async function revokeCoachInvite(inviteId: string): Promise<{ error: string } | { success: true }> {
  const adminId = await currentAdminId();
  if (!adminId) return { error: "Unauthorized: admin access required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("coach_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  return { success: true };
}

// ═══════════════════════════════════════
// INVITEE: create the coach account
// ═══════════════════════════════════════

/** The invited coach creates their account. On success it redirects to the email-code page. */
export async function acceptCoachInvite(token: string, formData: FormData): Promise<{ error: string }> {
  const input = {
    first_name: field(formData, "first_name"),
    last_name: field(formData, "last_name"),
    phone: field(formData, "phone"),
    email: field(formData, "email").toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
  const problem = signupProblem(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Someone signed in would keep their own session while the new account waits for its code
  const {
    data: { user: signedIn },
  } = await supabase.auth.getUser();
  if (signedIn) return { error: "You're signed in. Log out first, then open the invite link again." };

  // Claim the invite with one conditional update, so only one signup can ever use it
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("coach_invites")
    .update({ accepted_at: now })
    .eq("token", token)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "This invite link is no longer valid. Ask the academy for a new one." };
  const release = () => admin.from("coach_invites").update({ accepted_at: null }).eq("id", claimed.id);

  // Supabase emails the signup code, as it does for players
  const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password });
  const newUser = data?.user ?? null;
  if (alreadyRegistered(error, newUser)) {
    await release();
    return { error: "This email already has an account. Ask the academy to make that account a coach." };
  }
  if (error || !newUser) {
    await release();
    return { error: error?.message ?? "Couldn't create your account. Please try again." };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: newUser.id,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
      role: "coach",
      is_coach: true,
      is_active: true,
      profile_completed: true,
    },
    { onConflict: "id" }
  );
  if (profileError) {
    // Don't leave a login with no profile behind
    await admin.auth.admin.deleteUser(newUser.id);
    await release();
    return { error: `Couldn't create your account: ${profileError.message}` };
  }

  await admin.from("coach_invites").update({ accepted_by: newUser.id }).eq("id", claimed.id);

  await notifyAdmins({
    title: "Coach invite accepted",
    body: `${input.first_name} ${input.last_name} created their coach account. Assign them to a group.`,
    type: "system",
    link: "/admin/groups",
  });

  revalidatePath("/admin/coaches");
  redirect(`/verify-email?email=${encodeURIComponent(input.email)}`);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/coach-invites.ts
git commit -m "feat(coaches): create, revoke and accept coach invites

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The invite page and signup form

**Files:**
- Create: `src/app/(auth)/invite/[token]/page.tsx`
- Create: `src/app/(auth)/invite/[token]/_components/coach-signup-form.tsx`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes:
  - Task 8: `inviteState`, `type InviteState`
  - Task 10: `acceptCoachInvite`
  - existing: `logout` (`src/lib/actions/auth.ts`), `branding`, and the UI components `Alert`, `Button`, `Input`, `Label`
- Produces: the public route `/invite/[token]`.

- [ ] **Step 1: Make `/invite/` paths public**

In `src/middleware.ts`, below the `publicRoutes` line, add:

```ts

/** Public routes, plus coach invite links (/invite/<token>) */
function isPublic(pathname: string): boolean {
  return publicRoutes.includes(pathname) || pathname.startsWith("/invite/");
}
```

Then replace `if (!user && !publicRoutes.includes(pathname)) {` with `if (!user && !isPublic(pathname)) {`, and replace `if (user && !user.email_confirmed_at && !publicRoutes.includes(pathname)) {` with `if (user && !user.email_confirmed_at && !isPublic(pathname)) {`.

- [ ] **Step 2: The signup form**

Create `src/app/(auth)/invite/[token]/_components/coach-signup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { acceptCoachInvite } from "@/app/_actions/coach-invites";
import { Alert, Button, Input, Label } from "@/components/ui";

interface CoachSignupFormProps {
  token: string;
  invite: { first_name: string; last_name: string; phone: string; email: string | null };
}

/** The invited coach's signup, prefilled from the invite */
export function CoachSignupForm({ token, invite }: CoachSignupFormProps) {
  const [form, setForm] = useState({
    first_name: invite.first_name,
    last_name: invite.last_name,
    email: invite.email ?? "",
    phone: invite.phone,
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField(name: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(form)) formData.set(key, value);

    // On success the action redirects to the email-code page
    const result = await acceptCoachInvite(token, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      {error && <Alert className="mb-6">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>First Name</Label>
            <Input
              value={form.first_name}
              onChange={(e) => updateField("first_name", e.target.value)}
              required
              autoComplete="given-name"
            />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input
              value={form.last_name}
              onChange={(e) => updateField("last_name", e.target.value)}
              required
              autoComplete="family-name"
            />
          </div>
        </div>

        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
          />
          <p className="text-[11px] text-primary-700/50 mt-1">We&apos;ll email you a code to confirm it.</p>
        </div>

        <div>
          <Label>Phone</Label>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            required
            autoComplete="tel"
          />
        </div>

        <div>
          <Label>Password</Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
            minLength={6}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>

        <Button type="submit" disabled={loading} fullWidth>
          {loading ? "Creating your account..." : "Create Coach Account"}
        </Button>
      </form>
    </>
  );
}
```

- [ ] **Step 3: The page**

Create `src/app/(auth)/invite/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { branding } from "@/lib/config/branding";
import { Button } from "@/components/ui";
import { inviteState, type InviteState } from "@/lib/coaches/invites";
import { CoachSignupForm } from "./_components/coach-signup-form";

interface InviteRow {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/** Why the signup form isn't shown */
const NOTICES: Record<Exclude<InviteState, "pending">, { title: string; body: string }> = {
  revoked: { title: "This invite link isn't valid", body: "Ask the academy for a new one." },
  expired: { title: "This invite has expired", body: "Ask the academy for a new link." },
  accepted: {
    title: "This invite has already been used",
    body: "If it was you, log in with the email and password you chose.",
  },
};

export default async function CoachInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // The person opening the link has no account yet, so the invite is read with the service role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("coach_invites")
    .select("first_name, last_name, phone, email, expires_at, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  const invite = data as InviteRow | null;
  // An unknown token reads the same as a revoked one
  const state: InviteState = invite ? inviteState(invite, new Date()) : "revoked";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-sand/10 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-[0_8px_40px_-20px_rgba(18,75,93,0.15)] p-8 w-full max-w-md">
        {state === "pending" && invite && !user ? (
          <>
            <div className="text-center mb-8">
              <h1 className="font-display text-4xl sm:text-5xl tracking-tight text-primary-900">Join as a Coach</h1>
              <p className="text-primary-700/60 text-sm mt-2">Create your {branding.name} coach account</p>
            </div>
            <CoachSignupForm token={token} invite={invite} />
          </>
        ) : state === "pending" ? (
          <div className="text-center space-y-4">
            <h1 className="font-display text-3xl tracking-tight text-primary-900">You&apos;re signed in</h1>
            <p className="text-sm text-primary-700/70">
              You&apos;re signed in as {user?.email}. Log out, then open this link again to create your coach account.
            </p>
            <form action={logout}>
              <Button type="submit" variant="outline" fullWidth>
                Log out
              </Button>
            </form>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <h1 className="font-display text-3xl tracking-tight text-primary-900">{NOTICES[state].title}</h1>
            <p className="text-sm text-primary-700/70">{NOTICES[state].body}</p>
            {state === "accepted" && (
              <Link
                href="/login"
                className="inline-block text-sm font-semibold text-primary-800 hover:text-primary-900 hover:underline"
              >
                Log in
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

If the user's dev server is up on :3000, run `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/invite/not-a-real-token`.
Expected: `200` (not a redirect to `/login`). The page reads "This invite link isn't valid". This needs the invites migration on staging; if it isn't applied yet, the page still renders the "isn't valid" notice, because `data` is null.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/invite" src/middleware.ts
git commit -m "feat(coaches): invited coaches create their own account from the invite link

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Pending invites on the Coaches page

**Files:**
- Modify: `src/app/(portal)/admin/coaches/_components/types.ts`
- Create: `src/app/(portal)/admin/coaches/_components/pending-invites.tsx`
- Modify: `src/app/(portal)/admin/coaches/page.tsx`

**Interfaces:**
- Consumes:
  - Task 8: `expiryLabel`, `inviteMessage`, `inviteState`, `inviteUrl`
  - Task 10: `revokeCoachInvite`
  - existing: `buildWhatsAppUrl`, and the UI components `Badge`, `Card`, `ConfirmDialog`
- Produces (Task 13 uses `fetchInvites` as `onInvited`):
  - `InviteRow` in `types.ts`
  - `PendingInvites({ invites, onChange })`
  - `fetchInvites` in `page.tsx`

- [ ] **Step 1: `InviteRow`**

Append to `src/app/(portal)/admin/coaches/_components/types.ts`:

```ts

/** An open coach invite, as the Coaches page lists it */
export interface InviteRow {
  id: string;
  token: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
```

- [ ] **Step 2: The list component**

Create `src/app/(portal)/admin/coaches/_components/pending-invites.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Badge, Card, ConfirmDialog } from "@/components/ui";
import { CheckCircle2, Copy, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import { expiryLabel, inviteMessage, inviteState, inviteUrl } from "@/lib/coaches/invites";
import { revokeCoachInvite } from "@/app/_actions/coach-invites";
import type { InviteRow } from "./types";

const actionClass =
  "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors";

interface PendingInvitesProps {
  invites: InviteRow[];
  /** Called after a revoke, to reload the list */
  onChange: () => void;
}

/** Coach invites nobody has used yet: copy or resend the link, or revoke it */
export function PendingInvites({ invites, onChange }: PendingInvitesProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  const now = new Date();
  // Links are built from the address the admin is on, like the one createCoachInvite returned
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const revokingExpired = revoking ? inviteState(revoking, now) === "expired" : false;

  function copy(id: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  function confirmRevoke() {
    if (!revoking) return;
    const invite = revoking;
    setError(null);
    startTransition(async () => {
      const res = await revokeCoachInvite(invite.id);
      if ("error" in res) setError(res.error);
      setRevoking(null);
      onChange();
    });
  }

  return (
    <Card className="mb-4 p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Pending invites ({invites.length})
        </p>
      </div>
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {invites.map((invite) => {
          // An expired link is dead: it can only be removed
          const expired = inviteState(invite, now) === "expired";
          const url = inviteUrl(origin, invite.token);
          const contact = [invite.phone, invite.email].filter(Boolean).join(" · ");
          return (
            <li key={invite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  {invite.first_name} {invite.last_name}
                  {expired && <Badge variant="warning">Expired</Badge>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {expired ? contact : `${contact} · Expires ${expiryLabel(invite.expires_at)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!expired && (
                  <>
                    <button type="button" onClick={() => copy(invite.id, url)} className={actionClass}>
                      {copiedId === invite.id ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedId === invite.id ? "Copied" : "Copy link"}
                    </button>
                    <a
                      href={buildWhatsAppUrl(invite.phone, inviteMessage(invite.first_name, url, invite.expires_at))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={actionClass}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setRevoking(invite)}
                  className={cn(actionClass, "text-red-500 hover:bg-red-50 hover:border-red-200")}
                >
                  <X className="w-3.5 h-3.5" /> {expired ? "Remove" : "Revoke"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={confirmRevoke}
        title={revokingExpired ? "Remove invite" : "Revoke invite"}
        description={
          revoking ? (
            <>
              {revokingExpired ? "The expired invite for " : "The link for "}
              <span className="font-medium text-slate-700">
                {revoking.first_name} {revoking.last_name}
              </span>
              {revokingExpired ? " leaves this list." : " stops working."} You can invite them again any time.
            </>
          ) : null
        }
        confirmLabel={revokingExpired ? "Remove" : "Revoke"}
        loading={isPending}
        loadingLabel={revokingExpired ? "Removing..." : "Revoking..."}
      />
    </Card>
  );
}
```

- [ ] **Step 3: Load and show the invites on the page**

In `src/app/(portal)/admin/coaches/page.tsx`:

Replace `import type { CoachRow, SortField, SortDir } from "./_components/types";` with:

```ts
import type { CoachRow, SortField, SortDir, InviteRow } from "./_components/types";
```

Add below `import { ExportPayDrawer } from "./_components/export-pay-drawer";`:

```ts
import { PendingInvites } from "./_components/pending-invites";
```

Add below `  const [showExport, setShowExport] = useState(false);`:

```ts
  const [invites, setInvites] = useState<InviteRow[]>([]);
```

Replace:

```ts
  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);
```

with:

```ts
  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  // Open invites: not accepted, not revoked (expired ones stay until removed)
  const fetchInvites = useCallback(async () => {
    const { data } = await supabase
      .from("coach_invites")
      .select("id, token, first_name, last_name, phone, email, created_at, expires_at, accepted_at, revoked_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    setInvites((data ?? []) as InviteRow[]);
  }, [supabase]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);
```

Replace:

```tsx
      <CoachesFilters
        search={search}
```

with:

```tsx
      <PendingInvites invites={invites} onChange={fetchInvites} />

      <CoachesFilters
        search={search}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/admin/coaches"
git commit -m "feat(coaches): pending invites on the Coaches page, to copy, resend or revoke

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The Add Coach drawer: Existing player and Invite coach

**Files:**
- Create: `src/lib/coaches/player-search.ts`
- Create: `src/lib/coaches/player-search.test.ts`
- Create: `src/app/(portal)/admin/coaches/_components/add-coach-drawer.tsx`
- Modify: `src/app/(portal)/admin/coaches/page.tsx`
- Modify: `src/app/_actions/training.ts` (remove `createCoach`)

**Interfaces:**
- Consumes:
  - Task 6: `assignPlayerAsCoach`
  - Task 8: `INVITE_DAYS`, `expiryLabel`, `inviteMessage`, `type CreatedInvite`
  - Task 10: `createCoachInvite`
  - Task 12: `fetchInvites` in `page.tsx`
- Produces:
  - `playerSearch(query: string): PlayerSearch | null` and `anyFieldFilter(text: string): string`
  - `AddCoachDrawer({ open, onClose, onAssigned, onInvited })`

- [ ] **Step 1: Write the failing search test**

Create `src/lib/coaches/player-search.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { anyFieldFilter, playerSearch } from "./player-search";

test("playerSearch: two or more words are a first and a last name", () => {
  assert.deepEqual(playerSearch("John Doe"), { kind: "full-name", first: "John", last: "Doe" });
  assert.deepEqual(playerSearch("  Mary  Ann   Lee "), { kind: "full-name", first: "Mary", last: "Ann Lee" });
});

test("playerSearch: one word matches name, email or phone", () => {
  assert.deepEqual(playerSearch("omar"), { kind: "any", text: "omar" });
  assert.deepEqual(playerSearch("0100"), { kind: "any", text: "0100" });
  assert.deepEqual(playerSearch("omar@example.com"), { kind: "any", text: "omar@example.com" });
});

test("playerSearch: a phone typed with spaces or dashes is one number, not a name", () => {
  assert.deepEqual(playerSearch("010 1234 5678"), { kind: "any", text: "01012345678" });
  assert.deepEqual(playerSearch("+20 100-123-4567"), { kind: "any", text: "+201001234567" });
});

test("playerSearch: fewer than 2 characters searches nothing", () => {
  assert.equal(playerSearch(""), null);
  assert.equal(playerSearch(" o "), null);
});

test("playerSearch: commas and brackets can't break the filter", () => {
  assert.deepEqual(playerSearch("omar,(x)"), { kind: "full-name", first: "omar", last: "x" });
  assert.equal(playerSearch("(,)"), null);
});

test("anyFieldFilter: the word in either name, the email or the phone", () => {
  assert.equal(
    anyFieldFilter("omar"),
    "first_name.ilike.%omar%,last_name.ilike.%omar%,email.ilike.%omar%,phone.ilike.%omar%"
  );
});
```

Run: `npx tsx --test src/lib/coaches/player-search.test.ts`
Expected: FAIL, with `Cannot find module './player-search'`.

- [ ] **Step 2: Write the search helper**

Create `src/lib/coaches/player-search.ts`:

```ts
// The Coaches page's "Existing player" search: what to match for what the admin typed.

export type PlayerSearch =
  | { kind: "full-name"; first: string; last: string }
  | { kind: "any"; text: string };

/**
 * "John Doe" matches first name John… and last name Doe…; a single word matches first
 * name, last name, email or phone, and so does a phone number typed with spaces or
 * dashes. Commas and brackets are dropped because they would break the PostgREST or()
 * filter. Fewer than 2 characters searches nothing.
 */
export function playerSearch(query: string): PlayerSearch | null {
  const clean = query.replace(/[,()]/g, " ").trim().replace(/\s+/g, " ");
  if (clean.length < 2) return null;
  if (/^\+?[\d\s-]+$/.test(clean)) return { kind: "any", text: clean.replace(/[\s-]/g, "") };
  const [first, ...rest] = clean.split(" ");
  return rest.length > 0 ? { kind: "full-name", first, last: rest.join(" ") } : { kind: "any", text: clean };
}

/** The or() filter for one word across name, email and phone */
export function anyFieldFilter(text: string): string {
  return ["first_name", "last_name", "email", "phone"].map((column) => `${column}.ilike.%${text}%`).join(",");
}
```

Run: `npx tsx --test src/lib/coaches/player-search.test.ts`
Expected: PASS, `# pass 6`.

- [ ] **Step 3: The drawer**

Create `src/app/(portal)/admin/coaches/_components/add-coach-drawer.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Drawer, Input, Label, buttonSizes, buttonVariants } from "@/components/ui";
import { CheckCircle2, Copy, Loader2, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import { anyFieldFilter, playerSearch } from "@/lib/coaches/player-search";
import { INVITE_DAYS, expiryLabel, inviteMessage, type CreatedInvite } from "@/lib/coaches/invites";
import { assignPlayerAsCoach } from "@/app/_actions/training";
import { createCoachInvite } from "@/app/_actions/coach-invites";

type Tab = "existing" | "invite";

interface PlayerResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface AddCoachDrawerProps {
  open: boolean;
  onClose: () => void;
  /** An existing player was made a coach */
  onAssigned: (name: string) => void;
  /** An invite was created; the drawer stays open so the admin can share it */
  onInvited: () => void;
}

/** Add Coach: make an existing player a coach, or invite someone new with a link */
export function AddCoachDrawer({ open, onClose, onAssigned, onInvited }: AddCoachDrawerProps) {
  const [tab, setTab] = useState<Tab>("existing");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Existing player
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PlayerResult | null>(null);
  const searchSeq = useRef(0);

  // Invite coach
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Every opening starts fresh, on Existing player
  useEffect(() => {
    if (!open) return;
    searchSeq.current++;
    setTab("existing");
    setError(null);
    setQuery("");
    setResults([]);
    setSearching(false);
    setSelected(null);
    setInvite(null);
    setCopied(false);
  }, [open]);

  async function search(text: string) {
    setQuery(text);
    setSelected(null);
    const seq = ++searchSeq.current;
    const terms = playerSearch(text);
    if (!terms) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let q = supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone")
      .eq("role", "player")
      .eq("is_coach", false)
      .eq("is_active", true);
    q =
      terms.kind === "full-name"
        ? q.ilike("first_name", `%${terms.first}%`).ilike("last_name", `%${terms.last}%`)
        : q.or(anyFieldFilter(terms.text));
    const { data } = await q.order("first_name").limit(20);
    // A newer search has started since: its answer wins
    if (seq !== searchSeq.current) return;
    setResults((data ?? []) as PlayerResult[]);
    setSearching(false);
  }

  function makeCoach() {
    if (!selected) return;
    const player = selected;
    setError(null);
    startTransition(async () => {
      const res = await assignPlayerAsCoach(player.id);
      if ("error" in res) setError(res.error);
      else onAssigned(`${player.first_name} ${player.last_name}`.trim());
    });
  }

  function createInvite(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createCoachInvite(formData);
      if ("error" in res) setError(res.error);
      else {
        setInvite(res.invite);
        onInvited();
      }
    });
  }

  function copyLink() {
    if (!invite) return;
    navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const footer =
    tab === "existing" ? (
      <Button fullWidth onClick={makeCoach} disabled={!selected || isPending}>
        {isPending ? "Saving..." : selected ? `Make ${selected.first_name} a coach` : "Pick a player"}
      </Button>
    ) : invite ? (
      <Button fullWidth onClick={onClose}>
        Done
      </Button>
    ) : (
      <Button type="submit" form="invite-coach-form" fullWidth disabled={isPending}>
        {isPending ? "Creating..." : "Create Invite"}
      </Button>
    );

  return (
    <Drawer open={open} onClose={onClose} title={invite ? "Invite Ready" : "Add Coach"} footer={footer}>
      {!invite && (
        <div role="tablist" className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-lg bg-slate-100">
          {(["existing", "invite"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={cn(
                "py-1.5 rounded-md text-sm font-medium transition-colors",
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t === "existing" ? "Existing player" : "Invite coach"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>
      )}

      {tab === "existing" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            They keep their player account and log in as usual, with a Coach view next to their Player view.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search players by name, email or phone"
              aria-label="Search players"
              className="pl-9"
            />
          </div>
          {searching ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : playerSearch(query) && results.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              No active players found who aren&apos;t coaches already
            </p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((p) => {
                const isSelected = selected?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
                        isSelected ? "border-primary bg-primary-50" : "border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {[p.email, p.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "invite" && !invite && (
        <form id="invite-coach-form" action={createInvite} className="space-y-3">
          <p className="text-xs text-slate-500">
            They get a link to create their own account. It works once and expires in {INVITE_DAYS} days. Once
            they&apos;ve joined, assign them to a group from the group&apos;s page.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>First Name</Label>
              <Input name="first_name" required placeholder="John" />
            </div>
            <div>
              <Label required>Last Name</Label>
              <Input name="last_name" required placeholder="Doe" />
            </div>
          </div>
          <div>
            <Label required>Phone</Label>
            <Input name="phone" type="tel" required placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="coach@example.com" />
            <p className="text-[10px] text-slate-400 mt-1">Optional: we&apos;ll email the link too</p>
          </div>
        </form>
      )}

      {tab === "invite" && invite && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">Invite created for {invite.firstName}</p>
            </div>
            <p className="text-xs text-emerald-600">
              Send them this link. It works once and expires on {expiryLabel(invite.expiresAt)}.
            </p>
          </div>
          <div>
            <Label>Invite link</Label>
            <Input value={invite.url} readOnly onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={copyLink}>
              <span className="flex items-center justify-center gap-1.5">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </span>
            </Button>
            <a
              href={buildWhatsAppUrl(invite.phone, inviteMessage(invite.firstName, invite.url, invite.expiresAt))}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
                buttonVariants.outline,
                buttonSizes.sm
              )}
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          </div>
          {invite.emailed !== null && (
            <p className={cn("text-xs", invite.emailed ? "text-slate-500" : "text-amber-600")}>
              {invite.emailed
                ? `Emailed to ${invite.email}.`
                : "Couldn't send the email. Copy the link or send it on WhatsApp instead."}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 4: Wire the drawer into the page and drop the old form**

In `src/app/(portal)/admin/coaches/page.tsx`:

Replace:

```ts
import { Pagination, SelectionBar, Button, Input, Drawer } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { createCoach, bulkDeleteCoaches } from "@/app/_actions/training";
import { Plus, Eye, EyeOff, Copy, CheckCircle2, Trash2, Loader2, Download } from "lucide-react";
```

with:

```ts
import { Pagination, SelectionBar, Button, Toast } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { bulkDeleteCoaches } from "@/app/_actions/training";
import { Plus, Trash2, Loader2, Download } from "lucide-react";
```

Add below `import { PendingInvites } from "./_components/pending-invites";`:

```ts
import { AddCoachDrawer } from "./_components/add-coach-drawer";
```

Replace:

```ts
  // Add Coach state
  const [showAddCoach, setShowAddCoach] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
```

with:

```ts
  // Add Coach
  const [showAddCoach, setShowAddCoach] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
```

Delete the two functions `handleAddCoach` and `copyPassword` entirely. They're the block that starts at `  function handleAddCoach(formData: FormData) {` and ends with the closing `}` of `copyPassword`, just before `  return (`.

Replace `        <Button size="sm" onClick={() => { setShowAddCoach(true); setAddError(null); setCreatedPassword(null); }}>` with:

```tsx
        <Button size="sm" onClick={() => setShowAddCoach(true)}>
```

Replace the whole old drawer, from the line `      {/* Add Coach Drawer */}` through its closing `      </Drawer>` (the line before `<PendingInvites`), with:

```tsx
      <Toast message={toast} variant="success" onClose={clearToast} />

      <AddCoachDrawer
        open={showAddCoach}
        onClose={() => setShowAddCoach(false)}
        onAssigned={(name) => {
          setShowAddCoach(false);
          fetchCoaches();
          setToast(`${name} is now a coach. They'll see the Coach view next time they open the app.`);
        }}
        onInvited={fetchInvites}
      />
```

`fetchInvites` is declared below the JSX it's used in. That's fine: the JSX runs on render, after every `const` in the component body has been set.

- [ ] **Step 5: Remove `createCoach`**

In `src/app/_actions/training.ts`, delete the whole `createCoach` function: from `export async function createCoach(formData: FormData) {` through its closing `}`, which follows `  return { success: true, password };`.

Run: `grep -rn "createCoach\b" src`
Expected: no output. `createCoachInvite` doesn't match, because of the `\b`.

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: all pass, including the 6 player-search tests.

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors. If tsc reports `useTransition` or `Input` as unused, check you removed exactly the imports listed above: `useTransition` is still used by the bulk delete.

- [ ] **Step 7: Commit**

```bash
git add src/lib/coaches/player-search.ts src/lib/coaches/player-search.test.ts "src/app/(portal)/admin/coaches" src/app/_actions/training.ts
git commit -m "feat(coaches): Add Coach makes an existing player a coach or sends an invite link

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Final verification and handoff

**Files:** none, unless a check fails.

- [ ] **Step 1: The whole suite and the type-check**

Run: `npm test`
Expected: all pass, including the 14 portals, 12 invites and 6 player-search tests.

Run: `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
Expected: no errors.

- [ ] **Step 2: Replay both migrations from scratch**

Run: `"$SCRATCH/replay.sh"`, in the background, and wait.
Expected: `replayed 66 migrations`.

Run both check scripts against `pc-rls-pg`.
Expected: `ALL PLAYER-COACH CHECKS PASSED` and `ALL COACH-INVITE CHECKS PASSED`.

Then run `docker rm -f pc-rls-pg`.

- [ ] **Step 3: Look for leftovers**

Run: `grep -rn -e "DevPortalSwitcher" -e "createCoach\b" -e 'role === "coach" ? "/coach/dashboard"' src`
Expected: no output.

Run: `git status --short`
Expected: clean.

- [ ] **Step 4: Hand off to the user**

Report:

- **Migrations to apply.** `20261003200000_player_coaches.sql` and `20261003210000_coach_invites.sql`, staging first. Both are safe to apply ahead of the code.
- **Manual checks.** The ten steps in the spec's "Manual check (staging …)" list. They need an admin login, which Claude doesn't have.
- **What wasn't run.** `next lint` (no ESLint config) and `next build` (the user's dev server).

Then use superpowers:finishing-a-development-branch.
