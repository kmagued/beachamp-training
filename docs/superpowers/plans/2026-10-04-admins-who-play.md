# Admins Who Also Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin who plays gets an `is_player` flag. They appear wherever players are listed, picked or counted, and they open the player portal through the Admin | Player switch.

**Architecture:**
- **Mirror players who coach.** `profiles.is_player` is to admins what `is_coach` is to players.
- **One shared definition of a player.** `isPlayer(account)` in `src/lib/auth/portals.ts` is used by routing and checks; `PLAYERS_FILTER` in `src/lib/players/filter.ts` is used by queries.
- **The database follows the same rule.** The view `players_with_status` and the profile guard trigger are updated in one new migration.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres, RLS, PostgREST), TypeScript, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-04-admins-who-play-design.md`

## Global Constraints

- Never edit a committed migration; add new ones. The user applies migrations to production before merging, so each must be safe to apply ahead of the code.
- Verification:
  - run `npm test` and `npx tsc --noEmit -p .`
  - then run `git checkout tsconfig.tsbuildinfo`
  - don't run `next build`, and there's no ESLint config
- A server action is a public POST endpoint: anything writing with the service role checks its caller.
- Two `.or()` filters on one query are ANDed together. Verified on staging (2026-10-04): 275 rows, matching the expected AND.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Deleting from the Players page:**
   - An admin who plays must never be deletable there, including through a direct call to `deletePlayer`.
   - Every other player can still be deleted.
2. **Removing admin access** (role → player) must leave a clean player: `is_player` is false and `is_coach` is false, as today.
3. **Login for an admin who plays:**
   - lands in the last view used on that device
   - lands on `/admin/dashboard` the first time
   - an admin who doesn't play is never sent to the player portal
4. **Search pickers:**
   - the player filter must AND with each existing name/email `.or()`
   - it must never replace it, or searches would return every player
5. **The player layout:**
   - a coach account (role coach) is still sent away
   - an admin who doesn't play is still sent away in production

---

### Task 1: The migration

**Files:**
- Create: `supabase/migrations/20261004100000_admins_who_play.sql`
- Create (scratch, not committed): `$SCRATCH/exec/fixtures-admins-who-play.sql`, `$SCRATCH/exec/checks-admins-who-play.sql`
- Modify (scratch): `$SCRATCH/exec/replay.sh`, so it can stop before a migration (`UNTIL=<basename>`)

`$SCRATCH` = `/private/tmp/claude-501/-Users-kmagued-Documents-Freelance-Beachamp-Code-beachamp-training/70ad2535-0185-4aa8-b591-ab7efa36e06c/scratchpad`

**Interfaces:**
- Produces: `profiles.is_player BOOLEAN NOT NULL DEFAULT FALSE`; `players_with_status` includes `is_player` rows; the guard trigger refuses non-admin changes to `is_player`

- [ ] **Step 1: Let replay.sh stop before a migration**

In the migration loop, skip files at or after `UNTIL` when it's set:

```bash
  if [ -n "${UNTIL:-}" ] && [[ ! "$b" < "$UNTIL" ]]; then continue; fi
```

- [ ] **Step 2: Write the fixtures**

These are applied after the replay stops before the new migration: four admins and one player.

```sql
\set ON_ERROR_STOP on
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'a-sub@t.test'),
  ('00000000-0000-0000-0000-00000000aa02', 'a-group@t.test'),
  ('00000000-0000-0000-0000-00000000aa03', 'a-att@t.test'),
  ('00000000-0000-0000-0000-00000000aa04', 'a-none@t.test'),
  ('00000000-0000-0000-0000-00000000bb01', 'p@t.test');
INSERT INTO profiles (id, first_name, last_name, email, role, is_active) VALUES
  ('00000000-0000-0000-0000-00000000aa01', 'Sub', 'Admin', 'a-sub@t.test', 'admin', TRUE),
  ('00000000-0000-0000-0000-00000000aa02', 'Group', 'Admin', 'a-group@t.test', 'admin', TRUE),
  ('00000000-0000-0000-0000-00000000aa03', 'Att', 'Admin', 'a-att@t.test', 'admin', TRUE),
  ('00000000-0000-0000-0000-00000000aa04', 'None', 'Admin', 'a-none@t.test', 'admin', TRUE),
  ('00000000-0000-0000-0000-00000000bb01', 'Plain', 'Player', 'p@t.test', 'player', TRUE);
INSERT INTO packages (id, name, session_count, validity_days, price, is_active)
  VALUES ('00000000-0000-0000-0000-0000000000c1', 'Pkg', 8, 30, 100, TRUE);
INSERT INTO subscriptions (player_id, package_id, sessions_remaining, sessions_total, status)
  VALUES ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000c1', 8, 8, 'active');
INSERT INTO groups (id, name) VALUES ('00000000-0000-0000-0000-0000000000d1', 'G');
INSERT INTO group_players (group_id, player_id)
  VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aa02');
INSERT INTO attendance (player_id, group_id, session_date, status)
  VALUES ('00000000-0000-0000-0000-00000000aa03', '00000000-0000-0000-0000-0000000000d1', CURRENT_DATE, 'present');
```

(If a NOT NULL column rejects a fixture, add the minimum value it needs. The fixtures are scratch.)

- [ ] **Step 3: Write the checks**

Reuse the `pg_temp.as_user` and `pg_temp.check` helpers from `checks-profile-guard.sql`, inside `BEGIN … ROLLBACK`.

```sql
SELECT pg_temp.check('admin with a subscription plays', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000aa01'), 'true');
SELECT pg_temp.check('admin in a group plays', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000aa02'), 'true');
SELECT pg_temp.check('admin with attendance plays', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000aa03'), 'true');
SELECT pg_temp.check('admin with no history does not', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000aa04'), 'false');
SELECT pg_temp.check('a player is not flagged', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000bb01'), 'false');
SELECT pg_temp.check('flagged admin has a status', (SELECT count(*)::text FROM players_with_status WHERE id = '00000000-0000-0000-0000-00000000aa01'), '1');
SELECT pg_temp.check('player has a status', (SELECT count(*)::text FROM players_with_status WHERE id = '00000000-0000-0000-0000-00000000bb01'), '1');
SELECT pg_temp.check('other admins have none', (SELECT count(*)::text FROM players_with_status WHERE id = '00000000-0000-0000-0000-00000000aa04'), '0');
SELECT pg_temp.check('player flags themselves',
  pg_temp.as_user('00000000-0000-0000-0000-00000000bb01', $q$UPDATE profiles SET is_player = TRUE WHERE id = '00000000-0000-0000-0000-00000000bb01'$q$), 'refused');
SELECT pg_temp.check('admin flags an admin',
  pg_temp.as_user('00000000-0000-0000-0000-00000000aa01', $q$UPDATE profiles SET is_player = TRUE WHERE id = '00000000-0000-0000-0000-00000000aa04'$q$), 'ran');
SELECT pg_temp.check('the flag is set', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000aa04'), 'true');
UPDATE profiles SET is_player = FALSE WHERE id = '00000000-0000-0000-0000-00000000aa04';
SELECT pg_temp.check('the server clears it', (SELECT is_player::text FROM profiles WHERE id = '00000000-0000-0000-0000-00000000aa04'), 'false');
SELECT pg_temp.check('player still edits their name',
  pg_temp.as_user('00000000-0000-0000-0000-00000000bb01', $q$UPDATE profiles SET first_name = 'X' WHERE id = '00000000-0000-0000-0000-00000000bb01'$q$), 'ran');
ROLLBACK;
\echo ALL CHECKS PASSED
```

- [ ] **Step 4: Run it before the migration exists, to watch it fail**

Run: `UNTIL=20261004100000 $SCRATCH/exec/replay.sh $SCRATCH/exec/fixtures-admins-who-play.sql $SCRATCH/exec/checks-admins-who-play.sql`

Expected: FAIL on the first check (`column "is_player" does not exist`).

- [ ] **Step 5: Write the migration**

```sql
-- ═══════════════════════════════════════════════════════════════
-- Admins who also play (2026-10-04)
--   An admin who plays keeps role 'admin' and gets is_player, the way a
--   player who coaches keeps role 'player' and gets is_coach. A player is
--   now role 'player' OR is_player wherever players are listed.
--
--   Safe to apply ahead of the code: today's code ignores the column. The
--   only visible change is that flagged admins get a row in
--   players_with_status, which today's Players list never asks about.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_player BOOLEAN NOT NULL DEFAULT FALSE;

-- Admins with player history (subscriptions, groups or attendance) are players too
UPDATE profiles p SET is_player = TRUE
WHERE p.role = 'admin' AND (
  EXISTS (SELECT 1 FROM subscriptions s WHERE s.player_id = p.id)
  OR EXISTS (SELECT 1 FROM group_players g WHERE g.player_id = p.id)
  OR EXISTS (SELECT 1 FROM attendance a WHERE a.player_id = p.id)
);

-- Dropped and recreated rather than replaced: p.* gains is_player, so the
-- column list no longer lines up with the old view
DROP VIEW IF EXISTS players_with_status;

CREATE VIEW players_with_status AS
SELECT
  p.*,
  EXISTS (
    SELECT 1 FROM attendance a
    WHERE a.player_id = p.id
      AND a.session_date >= CURRENT_DATE - INTERVAL '30 days'
      AND a.status = 'present'
  )
  OR EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.player_id = p.id
      AND s.status = 'active'
      AND s.sessions_remaining > 0
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  ) AS is_currently_active
FROM profiles p
WHERE p.role = 'player' OR p.is_player;

GRANT SELECT ON players_with_status TO authenticated;

-- Player access is protected like role, coach access and active status:
-- only an admin or the server (service role, no signed-in user) changes it
CREATE OR REPLACE FUNCTION guard_profile_access_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_coach IS DISTINCT FROM OLD.is_coach
      OR NEW.is_player IS DISTINCT FROM OLD.is_player
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     -- A signed-in user who isn't an admin; the service role has no auth.uid()
     AND auth.uid() IS NOT NULL
     AND auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change role, coach or player access, or active status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 6: Replay with the migration, to watch it pass**

Run: `UNTIL=20261004100001 $SCRATCH/exec/replay.sh $SCRATCH/exec/fixtures-admins-who-play.sql supabase/migrations/20261004100000_admins_who_play.sql $SCRATCH/exec/checks-admins-who-play.sql`

The run stops before the migration, applies the fixtures, then the migration, then the checks.

Expected: `ALL CHECKS PASSED`.

Then run a full replay (`$SCRATCH/exec/replay.sh` with no `UNTIL`). Expected: every migration replays.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261004100000_admins_who_play.sql
git commit -m "feat(admins): is_player flag for admins who also play"
```

### Task 2: Accounts know who plays

**Files:**
- Modify: `src/lib/auth/portals.ts`, `src/lib/auth/portals.test.ts`
- Modify: `src/middleware.ts` (two profile selects)
- Modify: `src/lib/actions/auth.ts` (two selects, with `.returns<Pick<Profile, "role" | "is_coach" | "is_player">[]>()`)
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/types/database.ts`: `profiles` Row `is_player: boolean`, Insert/Update `is_player?: boolean`, and the `players_with_status` Row `is_player: boolean`

**Interfaces:**
- Produces:
  - `Account { role; is_coach: boolean; is_player: boolean }`
  - `accountOf(profile)` reads `is_player`
  - `isPlayer(a: Account): boolean`
  - `portalsFor(admin who plays)` returns `["admin", "player"]`

- [ ] **Step 1: Write the failing tests**

In `portals.test.ts`, every fixture gains `is_player: false`. Add these fixtures:

```ts
const adminPlayer: Account = { role: "admin", is_coach: false, is_player: true };
const adminPlayerCoach: Account = { role: "admin", is_coach: true, is_player: true };
```

Add these tests:

```ts
test("accountOf: reads player access", () => {
  assert.deepEqual(accountOf({ role: "admin", is_player: true }), adminPlayer);
  assert.equal(accountOf({ role: "admin", is_player: null }).is_player, false);
});

test("isPlayer: player accounts, and admins who also play", () => {
  assert.equal(isPlayer(player), true);
  assert.equal(isPlayer(playerCoach), true);
  assert.equal(isPlayer(adminPlayer), true);
  assert.equal(isPlayer(admin), false);
  assert.equal(isPlayer(adminCoach), false);
  assert.equal(isPlayer(coach), false);
});

test("portalsFor: an admin who plays has the admin view and the player view", () => {
  assert.deepEqual(portalsFor(adminPlayer), ["admin", "player"]);
  assert.deepEqual(portalsFor(adminPlayerCoach), ["admin", "player"]);
});

test("homePath: an admin who plays lands in the view they used last, admin the first time", () => {
  assert.equal(homePath(adminPlayer, "player"), "/player/dashboard");
  assert.equal(homePath(adminPlayer, undefined), "/admin/dashboard");
  assert.equal(homePath(admin, "player"), "/admin/dashboard");
});

test("viewToRemember: an admin who plays opening the player view", () => {
  assert.equal(viewToRemember(adminPlayer, "/player/dashboard", "admin", visit), "player");
  assert.equal(viewToRemember(adminPlayer, "/coach/dashboard", "admin", visit), null);
});

test("switchesFor: an admin who plays gets the Admin | Player switch", () => {
  assert.deepEqual(switchesFor("admin", portalsFor(adminPlayer), false), { devPortals: false, views: true });
  assert.deepEqual(switchesFor("admin", portalsFor(adminPlayer), true), { devPortals: true, views: true });
});
```

The existing assertion `accountOf({ role: "admin" })` → `admin` stays, now with `is_player: false`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx tsx --test src/lib/auth/portals.test.ts`

Expected: FAIL. `isPlayer` isn't exported, and `portalsFor(adminPlayer)` returns `["admin"]`.

- [ ] **Step 3: Implement**

```ts
export interface Account {
  role: "player" | "coach" | "admin";
  is_coach: boolean;
  /** An admin who also plays */
  is_player: boolean;
}

export function accountOf(
  profile: { role?: string | null; is_coach?: boolean | null; is_player?: boolean | null } | null | undefined
): Account {
  const role = profile?.role;
  return {
    role: role === "admin" || role === "coach" ? role : "player",
    is_coach: profile?.is_coach === true,
    is_player: profile?.is_player === true,
  };
}

/** Plays: a player account, or an admin who also plays */
export function isPlayer(a: Account): boolean {
  return a.role === "player" || a.is_player;
}

export function portalsFor(a: Account): Portal[] {
  if (a.role === "admin") return a.is_player ? ["admin", "player"] : ["admin"];
  if (a.role === "coach") return ["coach"];
  return a.is_coach ? ["player", "coach"] : ["player"];
}
```

Update the header comment and the `VIEW_COOKIE` comment to "an account with two views (a player who coaches, an admin who plays)".

Change each profile select that feeds `accountOf` for routing from `"role, is_coach"` to `"role, is_coach, is_player"`:

- `src/middleware.ts`: twice
- `src/lib/actions/auth.ts`: twice, plus the `.returns<…>` Pick
- `src/app/auth/callback/route.ts`: once

The layouts use `getCurrentUser()`, which already selects `*`.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx tsx --test src/lib/auth/portals.test.ts && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`

Expected: all portals tests pass, and tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/portals.ts src/lib/auth/portals.test.ts src/middleware.ts src/lib/actions/auth.ts src/app/auth/callback/route.ts src/types/database.ts
git commit -m "feat(admins): an admin who plays gets the Admin | Player views"
```

### Task 3: Player lists include admins who play

**Files:**
- Create: `src/lib/players/filter.ts`
- Modify: these 10 queries, replacing `.eq("role", "player")` with `.or(PLAYERS_FILTER)`:
  - `src/app/(portal)/admin/players/page.tsx`
  - `src/app/(portal)/admin/players/[id]/page.tsx`
  - `src/app/(portal)/admin/groups/page.tsx`
  - `src/app/(portal)/admin/groups/[id]/_components/players-section.tsx`
  - `src/app/(portal)/admin/payments/_components/new-payment-drawer.tsx`
  - `src/app/(portal)/admin/payments/_components/payment-drawer.tsx`
  - `src/app/(portal)/admin/private-sessions/page.tsx`
  - `src/app/(portal)/admin/feedback/_components/new-feedback-drawer.tsx`
  - `src/app/(portal)/admin/dashboard/page.tsx`
  - `src/app/_actions/private-sessions.ts` (`searchPlayersForPartner`)
- Leave alone: `src/app/(portal)/admin/coaches/_components/add-coach-drawer.tsx`, where the Existing player search stays players-only

**Interfaces:**
- Produces: `PLAYERS_FILTER = "role.eq.player,is_player.eq.true"`

- [ ] **Step 1: Write the filter**

```ts
// Who counts as a player in lists, pickers and counts: a player account, or an admin who
// also plays (is_player). Use it as query.or(PLAYERS_FILTER). A second .or() on the same
// query (a name search) is ANDed with it, not mixed into it.
export const PLAYERS_FILTER = "role.eq.player,is_player.eq.true";
```

- [ ] **Step 2: Swap the 10 queries**

In each file:
- import `PLAYERS_FILTER` from `@/lib/players/filter`
- replace `.eq("role", "player")` with `.or(PLAYERS_FILTER)`

Add `role` to the select in `admin/players/page.tsx` and `admin/players/[id]/page.tsx`, for the Admin tag in Task 6.

- [ ] **Step 3: Check that nothing filters players the old way**

Run: `grep -rn 'eq("role", "player")' src --include='*.ts' --include='*.tsx'`

Expected: only `add-coach-drawer.tsx`.

Then run `npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/players/filter.ts src/app
git commit -m "feat(admins): admins who play appear in player lists, pickers and counts"
```

### Task 4: The player portal and player-only checks

**Files:**
- Modify: `src/app/(portal)/player/layout.tsx`
- Modify: `src/app/(portal)/player/feedback/actions.ts` (`createCoachFeedback`)
- Modify: `src/app/_actions/private-sessions.ts` (the partner check in `createPrivateSessionRequest`)

**Interfaces:**
- Consumes: `isPlayer`, `accountOf` (Task 2)

- [ ] **Step 1: The layout**

```ts
if (process.env.NODE_ENV !== "development" && !isPlayer(accountOf(currentUser.profile))) redirect("/login");
```

- [ ] **Step 2: `createCoachFeedback`**

Select `"id, role, is_player, first_name, last_name"`, then:

```ts
if (!me || !isPlayer(accountOf(me))) return { error: "Not authorized" };
```

- [ ] **Step 3: The partner check**

Select `"id, role, is_player, is_active"`, then:

```ts
if (!partner || !isPlayer(accountOf(partner)) || !partner.is_active) {
```

- [ ] **Step 4: Type check, then commit**

Run: `npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: clean.

```bash
git add "src/app/(portal)/player/layout.tsx" "src/app/(portal)/player/feedback/actions.ts" src/app/_actions/private-sessions.ts
git commit -m "feat(admins): admins who play open the player portal and act as players"
```

### Task 5: The Admins page

**Files:**
- Create: `src/lib/auth/role-change.ts`, `src/lib/auth/role-change.test.ts`
- Modify: `src/app/(portal)/admin/users/actions.ts` (`updateUserRole`; new `updateUserIsPlayer`)
- Modify: `src/app/(portal)/admin/users/page.tsx` (`+ Player` toggle)

**Interfaces:**
- Produces: `roleChangeFlags(from: string, to: string): { is_coach?: boolean; is_player?: boolean }`, and `updateUserIsPlayer(userId: string, isPlayer: boolean)`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleChangeFlags } from "./role-change";

test("roleChangeFlags: a player made admin keeps playing", () => {
  assert.deepEqual(roleChangeFlags("player", "admin"), { is_player: true });
});

test("roleChangeFlags: a coach made admin doesn't start playing", () => {
  assert.deepEqual(roleChangeFlags("coach", "admin"), {});
});

test("roleChangeFlags: back to player, the role covers playing and coach access ends, as before", () => {
  assert.deepEqual(roleChangeFlags("admin", "player"), { is_coach: false, is_player: false });
});

test("roleChangeFlags: made a coach, coach access is on and the player flag is cleared", () => {
  assert.deepEqual(roleChangeFlags("admin", "coach"), { is_coach: true, is_player: false });
  assert.deepEqual(roleChangeFlags("player", "coach"), { is_coach: true, is_player: false });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx tsx --test src/lib/auth/role-change.test.ts`

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// The access flags that change with a role. A player who becomes an admin keeps playing
// (is_player). A player or coach role already says what they do, so the flag is cleared.
// Coach access follows the old rules: on for coaches, off for players, untouched for admins.
export function roleChangeFlags(from: string, to: string): { is_coach?: boolean; is_player?: boolean } {
  const flags: { is_coach?: boolean; is_player?: boolean } = {};
  if (to === "coach") flags.is_coach = true;
  if (to === "player") flags.is_coach = false;
  if (to === "admin" && from === "player") flags.is_player = true;
  if (to === "player" || to === "coach") flags.is_player = false;
  return flags;
}
```

- [ ] **Step 4: Run the tests, to watch them pass**

Run: `npx tsx --test src/lib/auth/role-change.test.ts`. Expected: PASS (4/4).

- [ ] **Step 5: The actions**

In `updateUserRole`, after the self-demotion check, read the target's role and use the flags. Drop the old inline `is_coach` lines; the flags carry them.

```ts
const { data: target } = await supabase.from("profiles").select("role").eq("id", userId).single();
if (!target) return { error: "User not found" };

const update = { role: newRole, ...roleChangeFlags(target.role, newRole), updated_at: new Date().toISOString() };
```

Add `updateUserIsPlayer`. It mirrors `updateUserIsCoach`, with the same admin check, and also requires the target to be an admin:

```ts
export async function updateUserIsPlayer(userId: string, isPlayer: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") return { error: "Not authorized" };

  // Players are players by role; only an admin is marked as also playing
  const { data: target } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (target?.role !== "admin") return { error: "Only admins can be marked as players" };

  const { error } = await supabase
    .from("profiles")
    .update({ is_player: isPlayer, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  return { success: true };
}
```

- [ ] **Step 6: The page**

- `AdminUser` gains `is_player: boolean`, and the select adds `is_player`.
- `handleTogglePlayer` mirrors `handleToggleCoach`: optimistic, reverts on error, toasts "Player access granted" or "Player access removed".
- A toggle goes beside "+ Coach", in the same style, labelled `{admin.is_player ? "✓ Player" : "+ Player"}`. Its title is "Click to remove player access" or "Click to also add as a player".

- [ ] **Step 7: Type check, run all tests, commit**

Run: `npm test && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: all pass, tsc clean.

```bash
git add src/lib/auth/role-change.ts src/lib/auth/role-change.test.ts "src/app/(portal)/admin/users"
git commit -m "feat(admins): + Player toggle on the Admins page; promoted players keep playing"
```

### Task 6: The Players page guards admin accounts

**Files:**
- Modify: `src/app/(portal)/admin/players/_components/types.ts` (`PlayerRow.role: string`)
- Modify: `src/app/(portal)/admin/players/_components/table.tsx`: Admin tag in the desktop and mobile name cells
- Modify: `src/app/(portal)/admin/players/_components/player-drawer.tsx`: Admin tag by the name; no Delete for admins
- Modify: `src/app/(portal)/admin/players/[id]/_components/types.ts` (`PlayerProfile.role: string`)
- Modify: `src/app/(portal)/admin/players/[id]/_components/player-header.tsx`: Admin tag
- Modify: `src/app/(portal)/admin/players/[id]/_components/player-actions.tsx`: no Delete for admins
- Modify: `src/app/(portal)/admin/players/[id]/actions.ts`: `deletePlayer` refuses admins

**Interfaces:**
- Consumes: `role` in the Players page and player page selects (Task 3)

- [ ] **Step 1: Make `deletePlayer` refuse admins**

After `assertAdmin`:

```ts
// An admin who plays is listed here too; deleting the account would delete an admin
const { data: target } = await admin.from("profiles").select("role").eq("id", playerId).single();
if (target?.role === "admin") {
  return { error: "This player is also an admin. Remove Player access on the Admins page instead." };
}
```

- [ ] **Step 2: Add the Admin tag and hide Delete**

The tag is `<Badge variant="info">Admin</Badge>`, shown when `player.role === "admin"`, beside the name in:
- the table's desktop cell (wrap the name `<p>` in `flex items-center gap-1.5`)
- the mobile row, beside `ActivityIcon`
- the drawer header
- `PlayerHeader`

Delete is hidden when `player.role === "admin"`:
- the drawer's trash button: render it only for non-admins
- `PlayerActionsMenu`'s trash button: same

- [ ] **Step 3: Type check, run all tests, commit**

Run: `npm test && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: all pass, tsc clean.

```bash
git add "src/app/(portal)/admin/players"
git commit -m "feat(admins): Players page tags admins and never deletes their account"
```
