# King of Court Scores & Monthly Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can optionally log each present player's King of Court points per group session from the Daily Report. A new admin page ranks players per group per calendar month and names each group's winner.

**Architecture:**
- **Storage:** a new `king_of_court_scores` table. Two triggers guard it: one refuses a score for a player who wasn't present, and one deletes a score when that player's attendance is removed or changed away from present.
- **Logic:** framework-free modules in `src/lib/king-of-court/` hold all the logic: parsing points, the save diff, validation, month maths, formatting and ranking. `node:test` tests them.
- **Screens:**
  - A new **Scores** tab on the Daily Report writes scores through one admin-only server action.
  - A new server-rendered page at `/admin/king-of-court` reads a month of scores and hands them to a client component. That component renders the group cards, the pinned group chips and a per-player drawer.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, Supabase (Postgres 17, RLS, PostgREST through `@supabase/ssr`), Tailwind, lucide-react, `tsx --test` (Node 20 built-in test runner).

**Spec:** `docs/superpowers/specs/2026-09-28-king-of-court-scores-design.md`

## Global Constraints

- **Admin-only:**
  - RLS on `king_of_court_scores` allows admins only.
  - The server action calls `requireAdmin`.
  - Coaches and players get no UI and no read access.
- **Points:**
  - Points are whole numbers from **0 to 999**.
  - A **blank box means the player didn't play**, and no row is stored.
  - **0 is a real score:** it is stored and counts as a session played.
- **Only group sessions are scored** (`schedule_sessions.session_type = 'group'`). Private sessions never appear.
- **Only players saved as `present`** for that session and date can hold a score. The server action and a database trigger both enforce this.
- **Attendance changes:** removing attendance, or changing it away from `present`, deletes the score. Re-saving attendance as present keeps it.
- **Months:**
  - A month is the calendar month of `session_date`, written `YYYY-MM`.
  - The current month comes from `cairoMonthKey(new Date())`, never from UTC `toISOString()`.
- **Ranking:**
  - Highest total first; players level on points are ranked by fewer sessions.
  - Players still tied share the rank (1, 1, 3).
  - `isWinner = rank === 1 && total > 0`.
  - Label "Leading" for the current month and "Winner" for past months.
- **A score's `group_id`** comes from the player's attendance row, falling back to the session's `group_id`. It never comes from the client.
- **Database writes go to staging only,** through `scripts/db/*`. **Never write to prod.** The prod migration is applied by hand after merge, outside this plan.
- **Match the surrounding code:**
  - Supabase clients are cast with `as any` plus the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment.
  - Each actions file copies its own `getCurrentUserRole()` and `requireAdmin()` helpers.
  - Comments explain *why*.
- **Copy strings, verbatim:**
  - "Log attendance first. Only players marked present can be scored."
  - "No players marked present"
  - "No scores logged this month"
  - "Blank = didn't play · 0 = played, no points"
  - "Leading" and "Winner"
  - "Scores saved"
- **Every commit message ends with:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **Arabic-keyboard digits.** In Cairo, phones set to Arabic produce Eastern Arabic digits (`١٢`) in a numeric box. These must read as 12, not be marked invalid. Pinned in Task 2 (`points.test.ts`).
2. **Blanking a saved box, including a saved 0,** must delete the stored score, not silently keep it. Pinned in Task 2 (`save.test.ts`).
3. **A coach changing attendance through their own client** (`updateAttendanceRecord` runs under the coach's RLS) must still delete the score. Pinned in Task 1 (SQL case 8).
4. **Month edges:**
   - The last day of a month is inside it, and the 1st of the next month is outside.
   - Leap day and the Dec → Jan change are handled.
   - A bad `?month=` falls back to the current month.

   Pinned in Task 3 (`month.test.ts`).
5. **Occurrences:**
   - A player scored in two groups in one month shows up separately on each board.
   - Two sessions on the same day are separate occurrences in the breakdown.

   Pinned in Task 3 (`leaderboard.test.ts`).

---

### Task 1: Database — table, triggers, SQL tests on staging, types

**Files:**
- Create: `scripts/db/test-king-of-court.sql`
- Create: `scripts/db/test-king-of-court.sh`
- Create: `supabase/migrations/20260928000000_king_of_court_scores.sql`
- Modify: `src/types/database.ts`:
  - add a table entry after `merch_stock`, which ends just before the `coach_groups: {` line;
  - add a `KingOfCourtScore` export after the `WhatsappTemplate` export at the end of the file.

**Interfaces:**
- Produces the table `king_of_court_scores`:
  - columns `id`, `player_id`, `schedule_session_id`, `group_id`, `session_date` (DATE), `points` (INT 0–999), `entered_by`, `created_at` and `updated_at`;
  - unique on `(player_id, schedule_session_id, session_date)`;
  - FK constraint name `king_of_court_scores_player_id_fkey` (used by PostgREST embeds in Task 6).
- Produces the TS type `KingOfCourtScore`.

- [ ] **Step 1: Start Docker.** The `scripts/db` runners use a Postgres image. Run `open -a Docker`, then wait until `docker info >/dev/null 2>&1 && echo ok` prints `ok`. Confirm `scripts/db/.env.db` exists.

- [ ] **Step 2: Write the SQL test** `scripts/db/test-king-of-court.sql`:

```sql
-- King of Court score tests: the present-only rule and the attendance clean-up trigger.
-- Runs against STAGING in one transaction that always rolls back, so nothing persists.
--   ./scripts/db/test-king-of-court.sh staging

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

-- ── Fixtures ────────────────────────────────────────────────────────────
-- A throwaway group and session with one present and one absent player, plus an
-- admin, a coach and a player to act as under RLS.
SELECT set_config('kt.admin', coalesce((SELECT id::text FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('kt.coach', coalesce((SELECT id::text FROM profiles WHERE role = 'coach' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('kt.p1', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('kt.p2', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at OFFSET 1 LIMIT 1), ''), true);

DO $$
DECLARE
  g UUID;
  s UUID;
BEGIN
  ASSERT current_setting('kt.admin') <> '', 'fixture: staging needs an admin profile';
  ASSERT current_setting('kt.coach') <> '', 'fixture: staging needs a coach profile';
  ASSERT current_setting('kt.p2') <> '', 'fixture: staging needs two player profiles';

  INSERT INTO groups (name) VALUES ('ZZ KOTC test') RETURNING id INTO g;
  INSERT INTO schedule_sessions (group_id, day_of_week, start_time, end_time)
    VALUES (g, 3, '18:00', '20:00') RETURNING id INTO s;
  INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id) VALUES
    (current_setting('kt.p1')::uuid, g, DATE '2026-09-02', 'present', s),
    (current_setting('kt.p2')::uuid, g, DATE '2026-09-02', 'absent', s);

  PERFORM set_config('kt.group', g::text, true);
  PERFORM set_config('kt.session', s::text, true);
END $$;

CREATE FUNCTION pg_temp.score(p_player TEXT, p_points INTEGER) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
  VALUES (current_setting(p_player)::uuid, current_setting('kt.session')::uuid,
          current_setting('kt.group')::uuid, DATE '2026-09-02', p_points)
  ON CONFLICT (player_id, schedule_session_id, session_date) DO UPDATE SET points = EXCLUDED.points
$$;

CREATE FUNCTION pg_temp.points_of(p_player TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT points FROM king_of_court_scores
  WHERE player_id = current_setting(p_player)::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid
    AND session_date = DATE '2026-09-02'
$$;

CREATE FUNCTION pg_temp.set_status(p_player TEXT, p_status TEXT) RETURNS VOID LANGUAGE sql AS $$
  UPDATE attendance SET status = p_status
  WHERE player_id = current_setting(p_player)::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid
    AND session_date = DATE '2026-09-02'
$$;

-- ── 1. A present player can be scored; re-saving updates in place ──────
DO $$ BEGIN
  PERFORM pg_temp.score('kt.p1', 8);
  PERFORM pg_temp.score('kt.p1', 12);
  ASSERT pg_temp.points_of('kt.p1') = 12, '1: re-saving should update the score in place';
  ASSERT (SELECT count(*) FROM king_of_court_scores
          WHERE schedule_session_id = current_setting('kt.session')::uuid) = 1,
    '1: one row per player per occurrence';
END $$;

-- ── 2. An absent player, or a date with no attendance, cannot be scored ─
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.score('kt.p2', 5);
    RAISE EXCEPTION '2: scoring an absent player should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
    VALUES (current_setting('kt.p1')::uuid, current_setting('kt.session')::uuid,
            current_setting('kt.group')::uuid, DATE '2026-09-09', 5);
    RAISE EXCEPTION '2: scoring a date with no attendance should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 3. Points are 0-999, and 0 is a real score ──────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.score('kt.p1', 0);
  ASSERT pg_temp.points_of('kt.p1') = 0, '3: 0 should be stored';
  BEGIN
    PERFORM pg_temp.score('kt.p1', 1000);
    RAISE EXCEPTION '3: 1000 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.score('kt.p1', -1);
    RAISE EXCEPTION '3: -1 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.score('kt.p1', 12);
END $$;

-- ── 4. Re-saving attendance as present keeps the score ──────────────────
DO $$ BEGIN
  PERFORM pg_temp.set_status('kt.p1', 'present');
  ASSERT pg_temp.points_of('kt.p1') = 12, '4: re-saving present attendance must keep the score';
END $$;

-- ── 5. Present -> excused drops the score; back to present does not restore it
DO $$ BEGIN
  PERFORM pg_temp.set_status('kt.p1', 'excused');
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '5: changing away from present should delete the score';
  PERFORM pg_temp.set_status('kt.p1', 'present');
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '5: going back to present must not bring the score back';
END $$;

-- ── 6. Deleting the attendance row drops the score ──────────────────────
DO $$ BEGIN
  PERFORM pg_temp.score('kt.p1', 7);
  DELETE FROM attendance
  WHERE player_id = current_setting('kt.p1')::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid;
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '6: removing attendance should delete the score';

  -- Put p1 back as present and scored for the RLS cases below
  INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id)
  VALUES (current_setting('kt.p1')::uuid, current_setting('kt.group')::uuid, DATE '2026-09-02',
          'present', current_setting('kt.session')::uuid);
  PERFORM pg_temp.score('kt.p1', 9);
END $$;

-- ── 7. Players and coaches cannot read scores ───────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.p1'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM king_of_court_scores) = 0, '7: players must not read scores';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.coach'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM king_of_court_scores) = 0, '7: coaches must not read scores';
  -- 8 (setup): a coach marks the player absent through their own client, as
  -- updateAttendanceRecord does. The coach's RLS must not stop the clean-up.
  UPDATE attendance SET status = 'absent'
  WHERE player_id = current_setting('kt.p1')::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid;
END $$;
RESET ROLE;

-- ── 8. ...and the score is gone even though the coach can't see the table ─
DO $$ BEGIN
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '8: a coach marking absent should delete the score despite RLS';
  PERFORM pg_temp.set_status('kt.p1', 'present');
END $$;

-- ── 9. As an admin under RLS: write and read through the admin policy ───
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.admin'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points, entered_by)
  VALUES (current_setting('kt.p1')::uuid, current_setting('kt.session')::uuid,
          current_setting('kt.group')::uuid, DATE '2026-09-02', 11, current_setting('kt.admin')::uuid);
  ASSERT (SELECT points FROM king_of_court_scores
          WHERE schedule_session_id = current_setting('kt.session')::uuid) = 11,
    '9: an admin should write and read scores';
END $$;
RESET ROLE;

ROLLBACK;
```

- [ ] **Step 3: Write the runner** `scripts/db/test-king-of-court.sh`, then run `chmod +x scripts/db/test-king-of-court.sh`:

```bash
#!/usr/bin/env bash
# Runs the King of Court score tests (test-king-of-court.sql) against STAGING. The SQL
# runs in one transaction that always rolls back, so staging is left exactly as it was.
#
#   ./scripts/db/test-king-of-court.sh staging

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ "${1:-}" = "staging" ] || die "usage: $0 staging   (these tests only ever run against staging)"

load_config
assert_staging_is_not_prod
warn_if_direct_connection STAGING_DB_URL "$STAGING_DB_URL"
require_docker
ensure_pg_image

DUMP_DIR="$(mktemp -d)"
trap 'rm -rf "$DUMP_DIR"' EXIT
cp "$SCRIPT_DIR/test-king-of-court.sql" "$DUMP_DIR/"

blue "==> Running King of Court score tests against staging ($STAGING_REF)"
psql_run "$STAGING_DB_URL" --no-psqlrc --quiet --variable ON_ERROR_STOP=1 -f /dump/test-king-of-court.sql
green "All King of Court score tests passed"
```

- [ ] **Step 4: Run it and expect FAIL.**
  - Run: `bash scripts/db/test-king-of-court.sh staging`
  - Expected: a failure with `relation "king_of_court_scores" does not exist`, raised at `CREATE FUNCTION pg_temp.score`.
  - If it fails earlier on a `fixture:` assert instead, stop and report which fixture staging lacks.

- [ ] **Step 5: Write the migration** `supabase/migrations/20260928000000_king_of_court_scores.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- King of Court scores (2026-09-28)
--   Points each present player scored in a group session's King of Court
--   game, logged by an admin from the Daily Report. Summed per group per
--   calendar month for the admin leaderboard.
--
--   A blank score means the player didn't play and has no row; 0 is stored.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE king_of_court_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  -- The group the player attended under. Copied rather than joined so that editing a
  -- session's group later never moves points between leaderboards.
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  points              INTEGER NOT NULL CHECK (points BETWEEN 0 AND 999),
  entered_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One score per player per session occurrence; re-saving upserts
  UNIQUE (player_id, schedule_session_id, session_date)
);

-- ── Indexes ──
CREATE INDEX idx_kotc_scores_group_date ON king_of_court_scores(group_id, session_date);
CREATE INDEX idx_kotc_scores_session ON king_of_court_scores(schedule_session_id, session_date);

-- ── Updated-at trigger (reuses the existing function) ──
CREATE TRIGGER king_of_court_scores_updated_at
  BEFORE UPDATE ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security: admins only; coaches and players see nothing ──
ALTER TABLE king_of_court_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage king of court scores"
  ON king_of_court_scores FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── A score needs a present attendance row for the same occurrence ──
CREATE FUNCTION kotc_require_present() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM attendance
    WHERE player_id = NEW.player_id
      AND schedule_session_id = NEW.schedule_session_id
      AND session_date = NEW.session_date
      AND status = 'present'
  ) THEN
    RAISE EXCEPTION 'Player % was not marked present for this session', NEW.player_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER king_of_court_scores_require_present
  BEFORE INSERT OR UPDATE OF player_id, schedule_session_id, session_date
  ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION kotc_require_present();

-- ── Attendance removed, or changed away from present → drop the score ──
-- log_attendance_with_deduction updates rows in place, so re-saving attendance as
-- present never reaches the DELETE below.
-- SECURITY DEFINER: updateAttendanceRecord runs with the caller's own client, and a
-- coach's RLS would otherwise silently filter this DELETE down to nothing.
CREATE FUNCTION kotc_drop_score_on_attendance_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.status = 'present' AND NEW.status <> 'present') THEN
    DELETE FROM king_of_court_scores
    WHERE player_id = OLD.player_id
      AND schedule_session_id = OLD.schedule_session_id
      AND session_date = OLD.session_date;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER attendance_drop_kotc_score
  AFTER DELETE OR UPDATE OF status ON attendance
  FOR EACH ROW EXECUTE FUNCTION kotc_drop_score_on_attendance_change();
```

- [ ] **Step 6: Apply to staging and re-run the tests; expect PASS.**
  - Run: `bash scripts/db/apply-migration.sh staging supabase/migrations/20260928000000_king_of_court_scores.sql && bash scripts/db/test-king-of-court.sh staging`
  - Expected: `Applied and recorded 20260928000000 on staging`, then `All King of Court score tests passed`.
  - If a case fails, fix the migration. It is already recorded on staging, so run it again through psql with `CREATE OR REPLACE FUNCTION` for function-only fixes, or report back before touching staging by hand.

- [ ] **Step 7: Add the types.** In `src/types/database.ts`, insert this entry after the `merch_stock: { … };` block, just before `coach_groups: {`:

```ts
      king_of_court_scores: {
        Row: {
          id: string;
          player_id: string;
          schedule_session_id: string;
          group_id: string;
          session_date: string;
          points: number;
          entered_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          schedule_session_id: string;
          group_id: string;
          session_date: string;
          points: number;
          entered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          schedule_session_id?: string;
          group_id?: string;
          session_date?: string;
          points?: number;
          entered_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

Then, after the line `export type WhatsappTemplate = Database["public"]["Tables"]["whatsapp_templates"]["Row"];`, add:

```ts
export type KingOfCourtScore = Database["public"]["Tables"]["king_of_court_scores"]["Row"];
```

- [ ] **Step 8: Type-check.** Run `npx tsc --noEmit`. Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260928000000_king_of_court_scores.sql scripts/db/test-king-of-court.sql scripts/db/test-king-of-court.sh src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(king-of-court): scores table with present-only and attendance clean-up triggers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Score entry logic — parsing points and the save diff

**Files:**
- Create: `src/lib/king-of-court/points.ts`
- Create: `src/lib/king-of-court/points.test.ts`
- Create: `src/lib/king-of-court/save.ts`
- Create: `src/lib/king-of-court/save.test.ts`
- Modify: `package.json`. The `"test"` script gains `src/lib/king-of-court/*.test.ts`.

**Interfaces:**
- Produces from `points.ts`:
  - `MAX_POINTS = 999`
  - `parsePoints(input: string): number | null | "invalid"`
  - `isValidPoints(n: unknown): n is number`
- Produces from `save.ts`:
  - `interface ScoreEntry { player_id: string; points: number }`
  - `interface SavePayload { scores: ScoreEntry[]; cleared_player_ids: string[]; invalid_player_ids: string[] }`
  - `buildSavePayload(inputs: Record<string, string>, saved: Record<string, number>): SavePayload`
  - `hasUnsavedChanges(inputs: Record<string, string>, saved: Record<string, number>): boolean`
  - `checkScoreSave(scores: ScoreEntry[], clearedIds: string[], presentIds: ReadonlySet<string>): { error: string; reload: boolean } | null`

- [ ] **Step 1: Add the test glob.** In `package.json`, change the `"test"` script to:

```json
    "test": "tsx --test src/lib/merch/*.test.ts src/lib/nav/*.test.ts src/lib/king-of-court/*.test.ts",
```

- [ ] **Step 2: Write the failing tests.** Create `src/lib/king-of-court/points.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPoints, parsePoints } from "./points";

test("parsePoints: blank means the player didn't play", () => {
  assert.equal(parsePoints(""), null);
  assert.equal(parsePoints("   "), null);
});

test("parsePoints: whole numbers 0-999, surrounding spaces and leading zeros allowed", () => {
  assert.equal(parsePoints("0"), 0);
  assert.equal(parsePoints("12"), 12);
  assert.equal(parsePoints(" 7 "), 7);
  assert.equal(parsePoints("07"), 7);
  assert.equal(parsePoints("999"), 999);
});

test("parsePoints: Eastern Arabic and Persian digits (Arabic phone keyboards) read as 0-9", () => {
  assert.equal(parsePoints("١٢"), 12);
  assert.equal(parsePoints("٠"), 0);
  assert.equal(parsePoints("٩٩٩"), 999);
  assert.equal(parsePoints("۱۲"), 12);
});

test("parsePoints: anything else is invalid", () => {
  for (const bad of ["1000", "-1", "+5", "7.5", "7.0", "1e2", "abc", "5 pts", "1 2", "0x1", "١٠٠٠"]) {
    assert.equal(parsePoints(bad), "invalid", bad);
  }
});

test("isValidPoints: the server's check on numbers sent by the client", () => {
  assert.equal(isValidPoints(0), true);
  assert.equal(isValidPoints(999), true);
  for (const bad of [-1, 1000, 2.5, NaN, Infinity, "5", null, undefined]) {
    assert.equal(isValidPoints(bad), false, String(bad));
  }
});
```

Create `src/lib/king-of-court/save.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSavePayload, checkScoreSave, hasUnsavedChanges } from "./save";

test("buildSavePayload: typed boxes become scores, blank boxes stay out", () => {
  const p = buildSavePayload({ a: "12", b: "0", c: "" }, {});
  assert.deepEqual(p.scores, [{ player_id: "a", points: 12 }, { player_id: "b", points: 0 }]);
  assert.deepEqual(p.cleared_player_ids, []);
  assert.deepEqual(p.invalid_player_ids, []);
});

test("buildSavePayload: blanking a saved score clears it", () => {
  const p = buildSavePayload({ a: "", b: "4" }, { a: 9, b: 3 });
  assert.deepEqual(p.scores, [{ player_id: "b", points: 4 }]);
  assert.deepEqual(p.cleared_player_ids, ["a"]);
});

test("buildSavePayload: a saved 0 that is blanked is cleared too, since 0 is a real score", () => {
  const p = buildSavePayload({ a: "" }, { a: 0 });
  assert.deepEqual(p.cleared_player_ids, ["a"]);
  assert.deepEqual(p.scores, []);
});

test("buildSavePayload: invalid boxes are reported and nothing is sent for them", () => {
  const p = buildSavePayload({ a: "7.5", b: "3" }, { a: 2 });
  assert.deepEqual(p.invalid_player_ids, ["a"]);
  assert.deepEqual(p.scores, [{ player_id: "b", points: 3 }]);
  assert.deepEqual(p.cleared_player_ids, []);
});

test("buildSavePayload: Arabic digits are sent as numbers", () => {
  assert.deepEqual(buildSavePayload({ a: "١٢" }, {}).scores, [{ player_id: "a", points: 12 }]);
});

test("hasUnsavedChanges compares what the boxes mean, not their text", () => {
  assert.equal(hasUnsavedChanges({ a: "9", b: "" }, { a: 9 }), false);
  assert.equal(hasUnsavedChanges({ a: "09" }, { a: 9 }), false);
  assert.equal(hasUnsavedChanges({ a: "٩" }, { a: 9 }), false);
  assert.equal(hasUnsavedChanges({ a: "10" }, { a: 9 }), true);
  assert.equal(hasUnsavedChanges({ a: "" }, { a: 0 }), true);
  assert.equal(hasUnsavedChanges({ a: "0" }, {}), true);
  assert.equal(hasUnsavedChanges({ a: "x" }, {}), true);
});

test("checkScoreSave: valid points for present players pass", () => {
  const present = new Set(["a", "b"]);
  assert.equal(checkScoreSave([{ player_id: "a", points: 0 }, { player_id: "b", points: 999 }], ["c"], present), null);
  assert.equal(checkScoreSave([], [], present), null);
});

test("checkScoreSave: out-of-range or fractional points reject the whole save", () => {
  const present = new Set(["a"]);
  const expected = { error: "Points must be whole numbers from 0 to 999", reload: false };
  assert.deepEqual(checkScoreSave([{ player_id: "a", points: 1000 }], [], present), expected);
  assert.deepEqual(checkScoreSave([{ player_id: "a", points: 2.5 }], [], present), expected);
  assert.deepEqual(checkScoreSave([{ player_id: "a", points: -1 }], [], present), expected);
});

test("checkScoreSave: a player listed twice, or scored and cleared at once, is refused", () => {
  const present = new Set(["a"]);
  assert.deepEqual(
    checkScoreSave([{ player_id: "a", points: 1 }, { player_id: "a", points: 2 }], [], present),
    { error: "A player is listed twice", reload: false }
  );
  assert.deepEqual(
    checkScoreSave([{ player_id: "a", points: 1 }], ["a"], present),
    { error: "A player can't be scored and cleared at once", reload: false }
  );
});

test("checkScoreSave: players not marked present reject the save and ask for a reload", () => {
  assert.deepEqual(
    checkScoreSave([{ player_id: "a", points: 1 }, { player_id: "b", points: 2 }, { player_id: "c", points: 3 }], [], new Set(["a"])),
    { error: "2 players aren't marked present for this session. Reload and try again.", reload: true }
  );
  assert.deepEqual(
    checkScoreSave([{ player_id: "b", points: 2 }], [], new Set(["a"])),
    { error: "1 player isn't marked present for this session. Reload and try again.", reload: true }
  );
});
```

- [ ] **Step 3: Run and expect FAIL.** Run `npm test`. Expected: both new files fail with `Cannot find module './points'` or `'./save'`. The merch and nav tests still pass.

- [ ] **Step 4: Implement** `src/lib/king-of-court/points.ts`:

```ts
// Reading the points typed into a King of Court score box.

/** The most points a player can score in one session */
export const MAX_POINTS = 999;

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Phones set to Arabic type Eastern Arabic digits (٠-٩, or Persian ۰-۹); read them as 0-9 */
function toWesternDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * A score box's text as points: null when blank (the player didn't play), a whole
 * number 0-999, or "invalid" for anything else (decimals, signs, exponents, words).
 */
export function parsePoints(input: string): number | null | "invalid" {
  const text = toWesternDigits(input.trim());
  if (text === "") return null;
  if (!/^\d{1,3}$/.test(text)) return "invalid";
  return Number(text);
}

/** Whether a value can be stored as points: the server's check on what the client sent */
export function isValidPoints(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_POINTS;
}
```

Implement `src/lib/king-of-court/save.ts`:

```ts
// Turning a Scores card's boxes into a save request, and the server's check on one.

import { isValidPoints, parsePoints } from "./points";

export interface ScoreEntry {
  player_id: string;
  points: number;
}

export interface SavePayload {
  scores: ScoreEntry[];
  /** Players whose saved score was blanked: their rows are deleted */
  cleared_player_ids: string[];
  /** Players whose box holds something that isn't valid points */
  invalid_player_ids: string[];
}

/**
 * inputs: the text in each present player's box (player id -> text).
 * saved: the points stored before editing (player id -> points).
 */
export function buildSavePayload(inputs: Record<string, string>, saved: Record<string, number>): SavePayload {
  const scores: ScoreEntry[] = [];
  const cleared: string[] = [];
  const invalid: string[] = [];
  for (const [playerId, text] of Object.entries(inputs)) {
    const parsed = parsePoints(text);
    if (parsed === "invalid") invalid.push(playerId);
    else if (parsed === null) {
      if (playerId in saved) cleared.push(playerId);
    } else scores.push({ player_id: playerId, points: parsed });
  }
  return { scores, cleared_player_ids: cleared, invalid_player_ids: invalid };
}

/** Whether any box now means something other than what is stored ("09" and 9 are the same) */
export function hasUnsavedChanges(inputs: Record<string, string>, saved: Record<string, number>): boolean {
  return Object.entries(inputs).some(([playerId, text]) => {
    const before = playerId in saved ? saved[playerId] : null;
    return parsePoints(text) !== before;
  });
}

/**
 * The server's check before writing. Returns null when the save can go ahead.
 * `reload` is set when the page is out of date (attendance changed since it loaded).
 */
export function checkScoreSave(
  scores: ScoreEntry[],
  clearedIds: string[],
  presentIds: ReadonlySet<string>
): { error: string; reload: boolean } | null {
  if (scores.some((s) => !isValidPoints(s.points))) {
    return { error: "Points must be whole numbers from 0 to 999", reload: false };
  }
  const ids = scores.map((s) => s.player_id);
  if (new Set(ids).size !== ids.length) return { error: "A player is listed twice", reload: false };
  if (ids.some((id) => clearedIds.includes(id))) {
    return { error: "A player can't be scored and cleared at once", reload: false };
  }
  const notPresent = ids.filter((id) => !presentIds.has(id)).length;
  if (notPresent > 0) {
    const who = notPresent === 1 ? "1 player isn't" : `${notPresent} players aren't`;
    return { error: `${who} marked present for this session. Reload and try again.`, reload: true };
  }
  return null;
}
```

- [ ] **Step 5: Run and expect PASS.** Run `npm test`. Expected: every test passes, including the merch and nav ones.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/king-of-court/points.ts src/lib/king-of-court/points.test.ts src/lib/king-of-court/save.ts src/lib/king-of-court/save.test.ts
git commit -m "$(cat <<'EOF'
feat(king-of-court): parse points and build score saves

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Leaderboard logic — months, formatting, standings, breakdown

**Files:**
- Create: `src/lib/king-of-court/month.ts`
- Create: `src/lib/king-of-court/month.test.ts`
- Create: `src/lib/king-of-court/format.ts`
- Create: `src/lib/king-of-court/format.test.ts`
- Create: `src/lib/king-of-court/leaderboard.ts`
- Create: `src/lib/king-of-court/leaderboard.test.ts`

**Interfaces:**
- Consumes: the test glob from Task 2.
- Produces from `month.ts`:
  - `parseMonthParam(param: string | undefined, fallback: string): string`
  - `shiftMonth(month: string, by: number): string`
  - `monthRange(month: string): { from: string; to: string }`
- Produces from `format.ts`:
  - `ordinal(n: number): string`
  - `formatTime(time: string): string`
  - `formatDay(date: string): string`
  - `formatMonth(month: string, style?: "short" | "long"): string`
  - `joinNames(names: string[]): string`
- Produces from `leaderboard.ts`:
  - the interfaces `ScoreRow`, `Standing` and `BreakdownRow`, with the fields below;
  - `buildStandings(scores: ScoreRow[]): Standing[]`
  - `groupScores(scores: ScoreRow[]): Map<string, ScoreRow[]>`
  - `playerBreakdown(scores: ScoreRow[], playerId: string): BreakdownRow[]`

- [ ] **Step 1: Write the failing tests.** Create `src/lib/king-of-court/month.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthRange, parseMonthParam, shiftMonth } from "./month";

test("parseMonthParam keeps a valid YYYY-MM and falls back otherwise", () => {
  assert.equal(parseMonthParam("2026-09", "2026-10"), "2026-09");
  for (const bad of ["2026-13", "2026-00", "2026-9", "abc", "", undefined, "2026-09-01"]) {
    assert.equal(parseMonthParam(bad, "2026-10"), "2026-10", String(bad));
  }
});

test("shiftMonth crosses year boundaries both ways", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-09", 0), "2026-09");
  assert.equal(shiftMonth("2026-09", -13), "2025-08");
});

test("monthRange: the 1st of the month to the 1st of the next, end exclusive", () => {
  assert.deepEqual(monthRange("2026-09"), { from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
});

test("monthRange: the last day is inside the month, the next month's 1st is not", () => {
  const inside = (month: string, date: string) => {
    const { from, to } = monthRange(month);
    return date >= from && date < to;
  };
  assert.equal(inside("2026-09", "2026-09-30"), true);
  assert.equal(inside("2026-09", "2026-10-01"), false);
  assert.equal(inside("2026-09", "2026-08-31"), false);
  assert.equal(inside("2028-02", "2028-02-29"), true);
  assert.equal(inside("2026-12", "2026-12-31"), true);
});
```

Create `src/lib/king-of-court/format.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDay, formatMonth, formatTime, joinNames, ordinal } from "./format";

test("ordinal: st/nd/rd/th, with 11-13 always th", () => {
  const cases: [number, string][] = [
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [10, "10th"], [11, "11th"], [12, "12th"],
    [13, "13th"], [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"],
  ];
  for (const [n, expected] of cases) assert.equal(ordinal(n), expected);
});

test("formatTime: 12-hour clock from a Postgres TIME", () => {
  assert.equal(formatTime("18:00:00"), "6:00 PM");
  assert.equal(formatTime("00:30:00"), "12:30 AM");
  assert.equal(formatTime("12:15:00"), "12:15 PM");
  assert.equal(formatTime("09:05"), "9:05 AM");
});

test("formatDay: weekday, day and short month", () => {
  assert.equal(formatDay("2026-09-03"), "Thu 3 Sep");
  assert.equal(formatDay("2026-09-28"), "Mon 28 Sep");
  assert.equal(formatDay("2028-02-29"), "Tue 29 Feb");
});

test("formatMonth: short by default, long on request", () => {
  assert.equal(formatMonth("2026-09"), "Sep 2026");
  assert.equal(formatMonth("2026-09", "long"), "September 2026");
  assert.equal(formatMonth("2027-01", "long"), "January 2027");
});

test("joinNames lists co-winners naturally", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Ahmed Kamal"]), "Ahmed Kamal");
  assert.equal(joinNames(["Ahmed Kamal", "Mariam Samir"]), "Ahmed Kamal & Mariam Samir");
  assert.equal(joinNames(["A", "B", "C"]), "A, B & C");
});
```

Create `src/lib/king-of-court/leaderboard.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStandings, groupScores, playerBreakdown, type ScoreRow } from "./leaderboard";

/** A score row; defaults to group g1, session s1 at 18:00 */
function row(player_id: string, session_date: string, points: number, extra: Partial<ScoreRow> = {}): ScoreRow {
  return { player_id, group_id: "g1", schedule_session_id: "s1", session_date, start_time: "18:00:00", points, ...extra };
}

test("buildStandings: totals, sessions played (0-point sessions count) and best", () => {
  const standings = buildStandings([
    row("a", "2026-09-03", 8),
    row("a", "2026-09-07", 12),
    row("a", "2026-09-10", 0),
    row("b", "2026-09-03", 5),
  ]);
  assert.deepEqual(
    standings.map((s) => [s.player_id, s.total, s.sessions, s.best, s.rank, s.isWinner]),
    [["a", 20, 3, 12, 1, true], ["b", 5, 1, 5, 2, false]]
  );
});

test("buildStandings: level on points, fewer sessions ranks higher", () => {
  // m: 38 points in 6 sessions; n: 38 points in 7 sessions
  const scores = [
    ...[7, 7, 6, 6, 6, 6].map((p, i) => row("m", `2026-09-0${i + 1}`, p)),
    ...[6, 6, 5, 5, 6, 5, 5].map((p, i) => row("n", `2026-09-0${i + 1}`, p)),
  ];
  assert.deepEqual(
    buildStandings(scores).map((s) => [s.player_id, s.total, s.sessions, s.rank, s.isWinner]),
    [["m", 38, 6, 1, true], ["n", 38, 7, 2, false]]
  );
});

test("buildStandings: level on points and sessions share the rank, and the next rank skips (1, 1, 3)", () => {
  const standings = buildStandings([row("a", "2026-09-03", 10), row("b", "2026-09-03", 10), row("c", "2026-09-03", 4)]);
  assert.deepEqual(
    standings.map((s) => [s.player_id, s.rank, s.isWinner]),
    [["a", 1, true], ["b", 1, true], ["c", 3, false]]
  );
});

test("buildStandings: no winner when the top total is 0", () => {
  const standings = buildStandings([row("a", "2026-09-03", 0), row("b", "2026-09-03", 0)]);
  assert.deepEqual(standings.map((s) => [s.rank, s.isWinner]), [[1, false], [1, false]]);
});

test("buildStandings: no scores, no standings", () => {
  assert.deepEqual(buildStandings([]), []);
});

test("groupScores: a player scored in two groups counts separately on each board", () => {
  const byGroup = groupScores([
    row("a", "2026-09-03", 8),
    row("a", "2026-09-20", 5, { group_id: "g2", schedule_session_id: "s9" }),
    row("b", "2026-09-03", 4),
  ]);
  assert.deepEqual(buildStandings(byGroup.get("g1")!).map((s) => [s.player_id, s.total]), [["a", 8], ["b", 4]]);
  assert.deepEqual(buildStandings(byGroup.get("g2")!).map((s) => [s.player_id, s.total]), [["a", 5]]);
  assert.equal(byGroup.get("g3"), undefined);
});

test("playerBreakdown: oldest first, with the player's place and field size each time", () => {
  const scores = [
    row("a", "2026-09-07", 12), row("b", "2026-09-07", 9), row("c", "2026-09-07", 12), // a shares 1st of 3
    row("a", "2026-09-03", 8), row("b", "2026-09-03", 10), // a is 2nd of 2
    row("b", "2026-09-10", 6), // a didn't play
  ];
  assert.deepEqual(playerBreakdown(scores, "a"), [
    { schedule_session_id: "s1", session_date: "2026-09-03", start_time: "18:00:00", points: 8, place: 2, fieldSize: 2 },
    { schedule_session_id: "s1", session_date: "2026-09-07", start_time: "18:00:00", points: 12, place: 1, fieldSize: 3 },
  ]);
});

test("playerBreakdown: two sessions on the same day are separate occurrences, ordered by time", () => {
  const scores = [
    row("a", "2026-09-03", 5, { schedule_session_id: "late", start_time: "20:00:00" }),
    row("b", "2026-09-03", 9, { schedule_session_id: "late", start_time: "20:00:00" }),
    row("a", "2026-09-03", 7, { schedule_session_id: "early", start_time: "18:00:00" }),
  ];
  assert.deepEqual(
    playerBreakdown(scores, "a").map((r) => [r.schedule_session_id, r.points, r.place, r.fieldSize]),
    [["early", 7, 1, 1], ["late", 5, 2, 2]]
  );
});

test("playerBreakdown: a player with no scores has no rows", () => {
  assert.deepEqual(playerBreakdown([row("b", "2026-09-03", 4)], "a"), []);
});
```

- [ ] **Step 2: Run and expect FAIL.** Run `npm test`. Expected: the three new files fail with `Cannot find module`.

- [ ] **Step 3: Implement** `src/lib/king-of-court/month.ts`:

```ts
// Calendar months for the King of Court leaderboard, written "YYYY-MM".

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The ?month= value when it is a real YYYY-MM, otherwise the fallback (the current month) */
export function parseMonthParam(param: string | undefined, fallback: string): string {
  return param && MONTH_PATTERN.test(param) ? param : fallback;
}

/** The month `by` months after `month` (negative goes back) */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  const year = Math.floor(index / 12);
  const monthNumber = index - year * 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

/** Dates in the month are `from <= session_date < to`; comparing YYYY-MM-DD strings needs no timezone */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}
```

Implement `src/lib/king-of-court/format.ts`:

```ts
// Display formatting for King of Court scores.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd" */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "18:00:00" → "6:00 PM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

/** "2026-09-03" → "Thu 3 Sep". Read in UTC so the viewer's timezone can't shift the day. */
export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "2026-09" → "Sep 2026", or "September 2026" in the long style */
export function formatMonth(month: string, style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number);
  return `${(style === "long" ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}

/** ["A", "B", "C"] → "A, B & C", for co-winners */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
```

Implement `src/lib/king-of-court/leaderboard.ts`:

```ts
// Ranking a group's month of King of Court scores, and one player's breakdown.
// Pure functions: the leaderboard page fetches the rows and these turn them into tables.

export interface ScoreRow {
  player_id: string;
  group_id: string;
  schedule_session_id: string;
  /** YYYY-MM-DD */
  session_date: string;
  /** HH:MM:SS, from schedule_sessions */
  start_time: string;
  points: number;
}

export interface Standing {
  player_id: string;
  total: number;
  /** Sessions scored, including 0-point ones */
  sessions: number;
  best: number;
  /** Competition ranking: 1, 1, 3 */
  rank: number;
  /** Shares first place with more than 0 points */
  isWinner: boolean;
}

export interface BreakdownRow {
  schedule_session_id: string;
  session_date: string;
  start_time: string;
  points: number;
  /** The player's place in that session occurrence (ties share it) */
  place: number;
  /** How many players were scored in that occurrence */
  fieldSize: number;
}

/**
 * Standings for one group's month. Most points first; level on points, fewer sessions
 * ranks higher; level on both, the players share the rank and the next one skips.
 * Players sharing a rank keep input order; the page sorts those by name.
 */
export function buildStandings(scores: ScoreRow[]): Standing[] {
  const byPlayer = new Map<string, { total: number; sessions: number; best: number }>();
  for (const s of scores) {
    const agg = byPlayer.get(s.player_id) ?? { total: 0, sessions: 0, best: 0 };
    agg.total += s.points;
    agg.sessions += 1;
    agg.best = Math.max(agg.best, s.points);
    byPlayer.set(s.player_id, agg);
  }

  const rows = [...byPlayer.entries()].map(([player_id, agg]) => ({ player_id, ...agg }));
  rows.sort((a, b) => b.total - a.total || a.sessions - b.sessions);

  const standings: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tiedWithPrev = prev !== undefined && prev.total === r.total && prev.sessions === r.sessions;
    const rank = tiedWithPrev ? standings[i - 1].rank : i + 1;
    standings.push({ ...r, rank, isWinner: rank === 1 && r.total > 0 });
  });
  return standings;
}

/** Rows split by the group they were logged under */
export function groupScores(scores: ScoreRow[]): Map<string, ScoreRow[]> {
  const byGroup = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const rows = byGroup.get(s.group_id);
    if (rows) rows.push(s);
    else byGroup.set(s.group_id, [s]);
  }
  return byGroup;
}

/**
 * One player's scored sessions from a group's month of rows, oldest first. The place
 * compares them with everyone scored in the same occurrence (session + date).
 */
export function playerBreakdown(scores: ScoreRow[], playerId: string): BreakdownRow[] {
  const byOccurrence = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const key = `${s.schedule_session_id}|${s.session_date}`;
    const rows = byOccurrence.get(key);
    if (rows) rows.push(s);
    else byOccurrence.set(key, [s]);
  }

  const breakdown: BreakdownRow[] = [];
  for (const occurrence of byOccurrence.values()) {
    const mine = occurrence.find((s) => s.player_id === playerId);
    if (!mine) continue;
    breakdown.push({
      schedule_session_id: mine.schedule_session_id,
      session_date: mine.session_date,
      start_time: mine.start_time,
      points: mine.points,
      place: 1 + occurrence.filter((s) => s.points > mine.points).length,
      fieldSize: occurrence.length,
    });
  }
  breakdown.sort((a, b) => a.session_date.localeCompare(b.session_date) || a.start_time.localeCompare(b.start_time));
  return breakdown;
}
```

- [ ] **Step 4: Run and expect PASS.** Run `npm test`. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/king-of-court/month.ts src/lib/king-of-court/month.test.ts src/lib/king-of-court/format.ts src/lib/king-of-court/format.test.ts src/lib/king-of-court/leaderboard.ts src/lib/king-of-court/leaderboard.test.ts
git commit -m "$(cat <<'EOF'
feat(king-of-court): monthly standings, player breakdown and formatting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Server action — `saveKingOfCourtScores`

**Files:**
- Create: `src/app/_actions/king-of-court.ts`

**Interfaces:**
- Consumes:
  - `checkScoreSave` and `ScoreEntry` from `@/lib/king-of-court/save` (Task 2);
  - `cairoToday` from `@/lib/utils/cairo-time`;
  - the `king_of_court_scores` table (Task 1).
- Produces:

```ts
saveKingOfCourtScores(data: {
  schedule_session_id: string;
  session_date: string;          // YYYY-MM-DD
  scores: ScoreEntry[];
  cleared_player_ids: string[];
}): Promise<{ success: true } | { error: string; reload?: boolean }>
```

- [ ] **Step 1: Implement** `src/app/_actions/king-of-court.ts`:

```ts
"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cairoToday } from "@/lib/utils/cairo-time";
import { checkScoreSave, type ScoreEntry } from "@/lib/king-of-court/save";

// ── Helper: get current user role ──
async function getCurrentUserRole() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id, role: profile.role as string } : null;
}

function requireAdmin(user: { role: string } | null) {
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized: admin access required" };
  }
  return null;
}

// ═══════════════════════════════════════
// KING OF COURT SCORES (Admin only)
// ═══════════════════════════════════════

// Points each present player scored in a group session's King of Court game, logged
// from the Daily Report. A blank box means the player didn't play: a previously saved
// row is deleted (cleared_player_ids) rather than kept or stored as 0.
export async function saveKingOfCourtScores(data: {
  schedule_session_id: string;
  session_date: string;
  scores: ScoreEntry[];
  cleared_player_ids: string[];
}): Promise<{ success: true } | { error: string; reload?: boolean }> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  if (!Array.isArray(data.scores) || !Array.isArray(data.cleared_player_ids)) {
    return { error: "Invalid request" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.session_date)) return { error: "Invalid session date" };
  // Same rule as attendance: backfilling the past is fine, the future is not
  if (data.session_date > cairoToday()) return { error: "Cannot log scores for future dates" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: session } = await admin
    .from("schedule_sessions")
    .select("id, group_id, session_type")
    .eq("id", data.schedule_session_id)
    .maybeSingle();
  if (!session || session.session_type !== "group" || !session.group_id) {
    return { error: "Scores can only be logged for group sessions" };
  }

  const { data: presentRows, error: attErr } = await admin
    .from("attendance")
    .select("player_id, group_id")
    .eq("schedule_session_id", data.schedule_session_id)
    .eq("session_date", data.session_date)
    .eq("status", "present");
  if (attErr) return { error: attErr.message };

  // The group each player attended under. Attendance keeps it even if the session's
  // group is edited later, so re-saving old scores never moves them between leaderboards.
  const groupOf = new Map<string, string>();
  for (const r of (presentRows || []) as { player_id: string; group_id: string | null }[]) {
    groupOf.set(r.player_id, r.group_id ?? session.group_id);
  }

  // The database trigger refuses non-present players too; this gives a readable message
  const problem = checkScoreSave(data.scores, data.cleared_player_ids, new Set(groupOf.keys()));
  if (problem) return problem;

  if (data.cleared_player_ids.length > 0) {
    const { error } = await admin
      .from("king_of_court_scores")
      .delete()
      .eq("schedule_session_id", data.schedule_session_id)
      .eq("session_date", data.session_date)
      .in("player_id", data.cleared_player_ids);
    if (error) return { error: error.message };
  }

  if (data.scores.length > 0) {
    const rows = data.scores.map((s) => ({
      player_id: s.player_id,
      schedule_session_id: data.schedule_session_id,
      group_id: groupOf.get(s.player_id)!,
      session_date: data.session_date,
      points: s.points,
      entered_by: user!.id,
    }));
    // Upsert on the unique key so re-saving a session updates in place
    const { error } = await admin
      .from("king_of_court_scores")
      .upsert(rows, { onConflict: "player_id,schedule_session_id,session_date" });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/daily-report");
  revalidatePath("/admin/king-of-court");
  return { success: true };
}
```

- [ ] **Step 2: Type-check and lint.** Run `npx tsc --noEmit && npx next lint --file src/app/_actions/king-of-court.ts`. Expected: no errors.

- [ ] **Step 3: Run the unit tests.** Run `npm test`. Expected: all pass. The action's rules are exercised through `checkScoreSave` in Task 2; the action itself is exercised in Task 5's in-app check.

- [ ] **Step 4: Commit**

```bash
git add src/app/_actions/king-of-court.ts
git commit -m "$(cat <<'EOF'
feat(king-of-court): admin action to save a session's scores

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Daily Report — `?tab=` and the Scores tab

**Files:**
- Modify: `src/app/(portal)/admin/daily-report/page.tsx`. The whole file is replaced below.
- Create: `src/app/(portal)/admin/daily-report/_components/scores-tab.tsx`

**Interfaces:**
- Consumes:
  - `saveKingOfCourtScores` (Task 4);
  - `parsePoints` (Task 2);
  - `buildSavePayload` and `hasUnsavedChanges` (Task 2);
  - `formatTime` (Task 3).
- Produces:
  - `ScoresTab({ date, onOpenAttendance }: { date: string; onOpenAttendance: () => void })`
  - the URL contract `/admin/daily-report?date=YYYY-MM-DD&tab=scores`, which opens the Scores tab. Task 6 links to it.

- [ ] **Step 1: Replace** `src/app/(portal)/admin/daily-report/page.tsx` with:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, Receipt, CreditCard, UserCheck, Trophy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import { DatePicker } from "@/components/ui";
import { AttendanceTab } from "./_components/attendance-tab";
import { ScoresTab } from "./_components/scores-tab";
import { CoachesTab } from "./_components/coaches-tab";
import { ExpensesTab } from "./_components/expenses-tab";
import { PaymentsTab } from "./_components/payments-tab";

const TABS = [
  { key: "attendance", label: "Attendance", icon: ClipboardCheck },
  { key: "scores", label: "Scores", icon: Trophy },
  { key: "coaches", label: "Coaches", icon: UserCheck },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "payments", label: "Payments", icon: CreditCard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export default function DailyReportPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const today = new Date().toISOString().split("T")[0];
  const selectedDate = searchParams.get("date") || today;

  // The open tab lives in ?tab= so a link can open the report on a given tab (the King
  // of Court leaderboard links straight to Scores). Attendance is the default and is
  // left out of the URL.
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<TabKey>(isTabKey(tabParam) ? tabParam : "attendance");

  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabState(tab);
    // History API rather than router.replace: a tab switch needs no server round trip,
    // and Next keeps useSearchParams in step with replaceState
    const params = new URLSearchParams(window.location.search);
    if (tab === "attendance") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname]);

  const setSelectedDate = useCallback((date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (date === today) {
      params.delete("date");
    } else {
      params.set("date", date);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname, today]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 space-y-3 sm:space-y-0 sm:flex sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Daily Report</h1>
          <p className="text-slate-500 text-sm">
            {formatDate(selectedDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
          <DatePicker
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value as string)}
            placeholder="Select date"
            className="flex-1 sm:w-48"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "attendance" && <AttendanceTab date={selectedDate} />}
      {activeTab === "scores" && <ScoresTab date={selectedDate} onOpenAttendance={() => setActiveTab("attendance")} />}
      {activeTab === "coaches" && <CoachesTab date={selectedDate} />}
      {activeTab === "expenses" && <ExpensesTab date={selectedDate} />}
      {activeTab === "payments" && <PaymentsTab date={selectedDate} />}
    </div>
  );
}
```

- [ ] **Step 2: Create** `src/app/(portal)/admin/daily-report/_components/scores-tab.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Toast } from "@/components/ui";
import { Loader2, Check, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { saveKingOfCourtScores } from "@/app/_actions/king-of-court";
import { parsePoints } from "@/lib/king-of-court/points";
import { buildSavePayload, hasUnsavedChanges } from "@/lib/king-of-court/save";
import { formatTime } from "@/lib/king-of-court/format";

interface GroupSession {
  id: string;
  start_time: string;
  end_time: string;
  location: string | null;
  end_date: string | null;
  created_at: string;
  groups: { name: string; level: string | null } | null;
}

interface PresentPlayer {
  id: string;
  first_name: string;
  last_name: string;
}

interface SessionScores {
  /** Whether any attendance has been saved for this session on this date */
  attendanceLogged: boolean;
  /** Players saved as present, by name */
  players: PresentPlayer[];
  /** Points stored before editing: player id -> points */
  saved: Record<string, number>;
  /** The text in each player's box now: player id -> text */
  inputs: Record<string, string>;
}

/** One box per present player, filled with their stored points or left blank */
function boxesFor(players: PresentPlayer[], saved: Record<string, number>): Record<string, string> {
  return Object.fromEntries(players.map((p) => [p.id, p.id in saved ? String(saved[p.id]) : ""]));
}

export function ScoresTab({ date, onOpenAttendance }: { date: string; onOpenAttendance: () => void }) {
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [bySession, setBySession] = useState<Record<string, SessionScores>>({});
  const [loading, setLoading] = useState(true);
  /** Bumped to reload after the server refused a save because attendance moved on */
  const [reloadKey, setReloadKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [, startTransition] = useTransition();
  const boxRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const dayOfWeek = new Date(date + "T00:00:00").getDay();

      const { data: sessionData } = await supabase
        .from("schedule_sessions")
        .select("id, start_time, end_time, location, end_date, created_at, groups(name, level)")
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .eq("session_type", "group")
        .order("start_time");

      if (cancelled) return;

      // Same rule as the Attendance and Coaches tabs: a recurring session runs from the
      // day it was created until its end_date
      const sessionRows = ((sessionData || []) as unknown as GroupSession[]).filter((s) => {
        if (s.end_date && s.end_date < date) return false;
        if (s.created_at.slice(0, 10) > date) return false;
        return true;
      });
      const sessionIds = sessionRows.map((s) => s.id);

      const [{ data: attendance }, { data: scores }] = await Promise.all([
        sessionIds.length > 0
          ? supabase
              .from("attendance")
              .select("player_id, status, schedule_session_id, profiles!attendance_player_id_fkey(id, first_name, last_name)")
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
        sessionIds.length > 0
          ? supabase
              .from("king_of_court_scores")
              .select("player_id, schedule_session_id, points")
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      if (cancelled) return;

      const attendanceRows = (attendance || []) as unknown as {
        player_id: string;
        status: string;
        schedule_session_id: string;
        profiles: PresentPlayer | null;
      }[];
      const scoreRows = (scores || []) as { player_id: string; schedule_session_id: string; points: number }[];

      const next: Record<string, SessionScores> = {};
      for (const s of sessionRows) {
        // Any saved row, present or not, means attendance was logged for this session
        const logged = attendanceRows.filter((a) => a.schedule_session_id === s.id);
        const players = logged
          .filter((a) => a.status === "present" && a.profiles)
          .map((a) => a.profiles as PresentPlayer)
          .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        const saved: Record<string, number> = {};
        for (const sc of scoreRows) {
          if (sc.schedule_session_id === s.id) saved[sc.player_id] = sc.points;
        }
        next[s.id] = { attendanceLogged: logged.length > 0, players, saved, inputs: boxesFor(players, saved) };
      }

      setSessions(sessionRows);
      setBySession(next);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reloadKey]);

  function setBox(sessionId: string, playerId: string, text: string) {
    setBySession((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], inputs: { ...prev[sessionId].inputs, [playerId]: text } },
    }));
  }

  function clearBoxes(sessionId: string) {
    setBySession((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], inputs: boxesFor(prev[sessionId].players, {}) },
    }));
  }

  /** Enter moves to the next player's box, so a column of scores can be typed in one go */
  function focusNext(sessionId: string, index: number) {
    const players = bySession[sessionId].players;
    const next = players[index + 1];
    if (next) boxRefs.current[`${sessionId}:${next.id}`]?.focus();
    else boxRefs.current[`${sessionId}:${players[index].id}`]?.blur();
  }

  function handleSave(sessionId: string) {
    const current = bySession[sessionId];
    const payload = buildSavePayload(current.inputs, current.saved);
    if (payload.invalid_player_ids.length > 0) return;

    setSavingId(sessionId);
    startTransition(async () => {
      const res = await saveKingOfCourtScores({
        schedule_session_id: sessionId,
        session_date: date,
        scores: payload.scores,
        cleared_player_ids: payload.cleared_player_ids,
      });
      setSavingId(null);

      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        // Attendance changed since this tab loaded: show who is present now
        if (res.reload) setReloadKey((k) => k + 1);
        return;
      }

      const saved = Object.fromEntries(payload.scores.map((sc) => [sc.player_id, sc.points]));
      setBySession((prev) => ({
        ...prev,
        [sessionId]: { ...prev[sessionId], saved, inputs: boxesFor(prev[sessionId].players, saved) },
      }));
      setToast({ message: "Scores saved", variant: "success" });
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-5 w-40 bg-slate-200 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-3/4 bg-slate-100 rounded" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <div className="text-center py-10">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No group sessions</p>
          <p className="text-xs text-slate-400 mt-1">
            There are no group sessions on{" "}
            {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
      {sessions.map((session) => {
        const s = bySession[session.id];
        const invalid = new Set(buildSavePayload(s.inputs, s.saved).invalid_player_ids);
        const scoredCount = s.players.filter((p) => typeof parsePoints(s.inputs[p.id] ?? "") === "number").length;
        const changed = hasUnsavedChanges(s.inputs, s.saved);
        const hasSaved = Object.keys(s.saved).length > 0;
        const isSaving = savingId === session.id;

        return (
          <Card key={session.id} className="p-0">
            <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900">{session.groups?.name}</h3>
                  {session.groups?.level && <Badge variant="neutral">{session.groups.level}</Badge>}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatTime(session.start_time)} – {formatTime(session.end_time)}
                  {session.location && ` · ${session.location}`}
                </p>
              </div>
              {s.players.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400 tabular-nums">
                    {scoredCount}/{s.players.length} scored
                  </span>
                  {changed ? (
                    <Button
                      size="sm"
                      onClick={() => handleSave(session.id)}
                      disabled={invalid.size > 0 || savingId !== null}
                    >
                      {isSaving ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                        </span>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  ) : hasSaved ? (
                    <Badge variant="success">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>

            {!s.attendanceLogged ? (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Log attendance first. Only players marked present can be scored.</p>
                <Button size="sm" variant="secondary" onClick={onOpenAttendance}>
                  Attendance
                </Button>
              </div>
            ) : s.players.length === 0 ? (
              <p className="px-4 sm:px-5 py-4 border-t border-slate-100 text-xs text-slate-400">No players marked present</p>
            ) : (
              <>
                <div className="px-4 sm:px-5 py-2 bg-slate-50/50 border-y border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Present ({s.players.length})
                  </span>
                  {Object.values(s.inputs).some((t) => t.trim() !== "") && (
                    <button
                      type="button"
                      onClick={() => clearBoxes(session.id)}
                      className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {s.players.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                        {p.first_name[0]}{p.last_name[0]}
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate">
                        {p.first_name} {p.last_name}
                      </p>
                      <input
                        ref={(el) => { boxRefs.current[`${session.id}:${p.id}`] = el; }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        enterKeyHint="next"
                        autoComplete="off"
                        aria-label={`Points for ${p.first_name} ${p.last_name}`}
                        aria-invalid={invalid.has(p.id) || undefined}
                        value={s.inputs[p.id] ?? ""}
                        onChange={(e) => setBox(session.id, p.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focusNext(session.id, i);
                          }
                        }}
                        className={cn(
                          "w-16 h-9 px-2 text-right text-sm tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2",
                          invalid.has(p.id)
                            ? "border-red-400 focus:ring-red-200"
                            : "border-slate-200 focus:ring-primary/20 focus:border-primary"
                        )}
                      />
                    </div>
                  ))}
                </div>
                <p className="px-4 sm:px-5 py-2 border-t border-slate-100 text-[11px] text-slate-400">
                  Blank = didn&apos;t play · 0 = played, no points
                </p>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint.** Run `npx tsc --noEmit && npm run lint`. Expected: no new errors.

- [ ] **Step 4: Check it in the app on staging.**
  - Run `npm run env` and confirm it reports **staging**. If it reports prod, stop: never click through against prod.
  - Run `npm run dev` and sign in as an admin.
  - Open `/admin/daily-report` on a past date that has a group session with saved attendance, then go to **Scores** and check:
    - The URL gains `?tab=scores`, and a refresh stays on Scores.
    - Only players marked present are listed, ordered by name.
    - Enter jumps to the next box.
    - Typing `7.5` turns the box red and disables Save.
    - Saving shows "Scores saved" and the "Saved" badge.
    - Blanking a saved box and saving removes it, and a reload keeps it blank.
    - A session without saved attendance shows "Log attendance first…", and its **Attendance** button switches tabs.
  - Then, on the Attendance tab, mark a scored player absent and save. On Scores, their box is gone.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/admin/daily-report/page.tsx" "src/app/(portal)/admin/daily-report/_components/scores-tab.tsx"
git commit -m "$(cat <<'EOF'
feat(king-of-court): Scores tab on the Daily Report; the open tab lives in ?tab=

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Leaderboard page, player drawer and nav entry

**Files:**
- Create: `src/app/(portal)/admin/king-of-court/page.tsx`
- Create: `src/app/(portal)/admin/king-of-court/loading.tsx`
- Create: `src/app/(portal)/admin/king-of-court/_components/leaderboard-client.tsx`
- Create: `src/app/(portal)/admin/king-of-court/_components/player-breakdown-drawer.tsx`
- Modify: `src/components/layout/sidebar-layout.tsx`:
  - the lucide import list (add `Trophy`);
  - `iconMap` (add `"king-of-court": Trophy`);
  - the admin nav array (add an entry after `daily-report`).

**Interfaces:**
- Consumes:
  - `parseMonthParam`, `monthRange` and `shiftMonth` (Task 3);
  - `formatMonth`, `formatDay`, `formatTime`, `ordinal` and `joinNames` (Task 3);
  - `buildStandings`, `groupScores`, `playerBreakdown`, `ScoreRow` and `Standing` (Task 3);
  - `cairoMonthKey` from `@/lib/utils/cairo-time`;
  - the `/admin/daily-report?date=…&tab=scores` URL (Task 5).
- Produces: the route `/admin/king-of-court?month=YYYY-MM&group=<groupId>`.

- [ ] **Step 1: Create** `src/app/(portal)/admin/king-of-court/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { cairoMonthKey } from "@/lib/utils/cairo-time";
import { monthRange, parseMonthParam } from "@/lib/king-of-court/month";
import type { ScoreRow } from "@/lib/king-of-court/leaderboard";
import { LeaderboardClient, type LeaderboardGroup, type PlayerName } from "./_components/leaderboard-client";

/** PostgREST returns at most this many rows per request */
const PAGE = 1000;

export default async function KingOfCourtPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const sp = await searchParams;
  // Cairo's month, not the server's (UTC): around midnight on the 1st they differ
  const currentMonth = cairoMonthKey(new Date());
  const month = parseMonthParam(typeof sp.month === "string" ? sp.month : undefined, currentMonth);
  const { from, to } = monthRange(month);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const scores: ScoreRow[] = [];
  const players: Record<string, PlayerName> = {};
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("king_of_court_scores")
      .select("id, player_id, group_id, schedule_session_id, session_date, points, schedule_sessions(start_time), profiles!king_of_court_scores_player_id_fkey(first_name, last_name)")
      .gte("session_date", from)
      .lt("session_date", to)
      .order("session_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    // A partial month would crown the wrong player, so fail loudly rather than render it
    if (error) throw new Error(`Could not load King of Court scores: ${error.message}`);
    const rows = (data || []) as {
      player_id: string;
      group_id: string;
      schedule_session_id: string;
      session_date: string;
      points: number;
      schedule_sessions: { start_time: string } | null;
      profiles: PlayerName | null;
    }[];
    for (const r of rows) {
      scores.push({
        player_id: r.player_id,
        group_id: r.group_id,
        schedule_session_id: r.schedule_session_id,
        session_date: r.session_date,
        start_time: r.schedule_sessions?.start_time ?? "00:00:00",
        points: r.points,
      });
      if (r.profiles) players[r.player_id] = { first_name: r.profiles.first_name, last_name: r.profiles.last_name };
    }
    if (rows.length < PAGE) break;
  }

  // Active groups, plus any inactive group that has scores this month
  const scoredGroupIds = new Set(scores.map((s) => s.group_id));
  const { data: groupData } = await supabase
    .from("groups")
    .select("id, name, level, is_active")
    .order("name");
  const groups: LeaderboardGroup[] = ((groupData || []) as (LeaderboardGroup & { is_active: boolean })[])
    .filter((g) => g.is_active || scoredGroupIds.has(g.id))
    .map(({ id, name, level }) => ({ id, name, level }));

  return (
    <LeaderboardClient
      month={month}
      currentMonth={currentMonth}
      groups={groups}
      scores={scores}
      players={players}
    />
  );
}
```

- [ ] **Step 2: Create** `src/app/(portal)/admin/king-of-court/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui";

export default function KingOfCourtLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create** `src/app/(portal)/admin/king-of-court/_components/player-breakdown-drawer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Drawer } from "@/components/ui";
import { playerBreakdown, type ScoreRow, type Standing } from "@/lib/king-of-court/leaderboard";
import { formatDay, formatMonth, formatTime, ordinal } from "@/lib/king-of-court/format";

/** One player's month in one group: the headline numbers, then every session they were scored in */
export function PlayerBreakdownDrawer({
  open,
  onClose,
  playerName,
  groupName,
  month,
  standing,
  scores,
}: {
  open: boolean;
  onClose: () => void;
  playerName: string;
  groupName: string;
  month: string;
  /** undefined when nobody is selected */
  standing: Standing | undefined;
  /** The group's rows for the month: a place in a session needs everyone's points */
  scores: ScoreRow[];
}) {
  const rows = standing ? playerBreakdown(scores, standing.player_id) : [];
  const stats: [string, string | number][] = standing
    ? [
        ["Rank", `#${standing.rank}`],
        ["Points", standing.total],
        ["Sessions", standing.sessions],
        ["Best", standing.best],
      ]
    : [];

  return (
    <Drawer open={open} onClose={onClose} title={playerName}>
      {standing && (
        <div className="space-y-5">
          <p className="text-xs text-slate-500">
            {groupName} · {formatMonth(month, "long")}
          </p>

          <div className="grid grid-cols-4 gap-2">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-2 py-3 text-center">
                <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
                <p className="text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Sessions</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
              {rows.map((r) => (
                // Opens that day's Daily Report on Scores, where a wrong score is fixed
                <Link
                  key={`${r.schedule_session_id}|${r.session_date}`}
                  href={`/admin/daily-report?date=${r.session_date}&tab=scores`}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <span className="flex-1 min-w-0 truncate text-sm text-slate-700">
                    {formatDay(r.session_date)} · {formatTime(r.start_time)}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{r.points} pts</span>
                  <span className="w-20 text-right text-xs text-slate-400 tabular-nums">
                    {ordinal(r.place)} of {r.fieldSize}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 4: Create** `src/app/(portal)/admin/king-of-court/_components/leaderboard-client.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { buildStandings, groupScores, type ScoreRow, type Standing } from "@/lib/king-of-court/leaderboard";
import { shiftMonth } from "@/lib/king-of-court/month";
import { formatMonth, joinNames } from "@/lib/king-of-court/format";
import { PlayerBreakdownDrawer } from "./player-breakdown-drawer";

export interface LeaderboardGroup {
  id: string;
  name: string;
  level: string | null;
}

export interface PlayerName {
  first_name: string;
  last_name: string;
}

/** Where the pinned bar ends: the 80px site header plus the bar itself. Keep in step with scroll-mt-52 on the cards. */
const PINNED_OFFSET = 200;

/** #, player, points, sessions, best, chevron */
const ROW_GRID = "grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_4.25rem_2.75rem_1rem] items-center gap-x-2";

export function LeaderboardClient({
  month,
  currentMonth,
  groups,
  scores,
  players,
}: {
  month: string;
  currentMonth: string;
  groups: LeaderboardGroup[];
  scores: ScoreRow[];
  players: Record<string, PlayerName>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isCurrentMonth = month === currentMonth;

  const nameOf = (playerId: string) => {
    const p = players[playerId];
    return p ? `${p.first_name} ${p.last_name}` : "Unknown player";
  };

  const rowsByGroup = useMemo(() => groupScores(scores), [scores]);
  const standingsByGroup = useMemo(() => {
    const map = new Map<string, Standing[]>();
    for (const g of groups) {
      const standings = buildStandings(rowsByGroup.get(g.id) ?? []);
      // Players sharing a rank are listed by name
      standings.sort((a, b) => a.rank - b.rank || nameOf(a.player_id).localeCompare(nameOf(b.player_id)));
      map.set(g.id, standings);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, rowsByGroup, players]);

  const [activeGroup, setActiveGroup] = useState<string | null>(() => {
    const fromUrl = searchParams.get("group");
    return groups.some((g) => g.id === fromUrl) ? fromUrl : groups[0]?.id ?? null;
  });
  const [selected, setSelected] = useState<{ groupId: string; playerId: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const chipBarRef = useRef<HTMLDivElement | null>(null);
  const visibleGroups = useRef(new Set<string>());

  function goToMonth(next: string) {
    setDrawerOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (next === currentMonth) params.delete("month");
    else params.set("month", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function jumpTo(groupId: string) {
    setActiveGroup(groupId);
    cardRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    // History API: the chosen group survives a refresh without refetching the month
    const params = new URLSearchParams(window.location.search);
    params.set("group", groupId);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  // Opening with ?group= (a shared link, a refresh, a month change) lands on that card
  useEffect(() => {
    const groupId = searchParams.get("group");
    if (groupId) cardRefs.current[groupId]?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // While scrolling, highlight the chip of the topmost card just under the pinned bar
  useEffect(() => {
    const visible = visibleGroups.current;
    visible.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.groupId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = groups.find((g) => visible.has(g.id));
        if (first) setActiveGroup(first.id);
      },
      { rootMargin: `-${PINNED_OFFSET}px 0px -55% 0px` }
    );
    for (const g of groups) {
      const el = cardRefs.current[g.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [groups]);

  // Keep the highlighted chip in view when the chip row is wider than the screen
  useEffect(() => {
    const bar = chipBarRef.current;
    const chip = activeGroup ? chipRefs.current[activeGroup] : null;
    if (!bar || !chip) return;
    const outOfView =
      chip.offsetLeft < bar.scrollLeft || chip.offsetLeft + chip.offsetWidth > bar.scrollLeft + bar.clientWidth;
    if (outOfView) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: "smooth" });
  }, [activeGroup]);

  const selectedGroup = selected ? groups.find((g) => g.id === selected.groupId) : undefined;
  const selectedStanding = selected
    ? standingsByGroup.get(selected.groupId)?.find((s) => s.player_id === selected.playerId)
    : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Pinned under the site header: month picker and group chips */}
      <div className="sticky top-20 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-3 mb-4 bg-[#FDFCF9]/95 backdrop-blur border-b border-slate-200/70">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">King of Court</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(shiftMonth(month, -1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[5.5rem] text-center text-sm font-semibold text-slate-800 tabular-nums">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={month >= currentMonth}
              onClick={() => goToMonth(shiftMonth(month, 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {groups.length > 1 && (
          <div ref={chipBarRef} className="relative mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto no-scrollbar">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                ref={(el) => { chipRefs.current[g.id] = el; }}
                onClick={() => jumpTo(g.id)}
                aria-current={activeGroup === g.id ? "true" : undefined}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
                  activeGroup === g.id
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="w-10 h-10" />}
            title="No groups yet"
            description="Leaderboards appear here once groups exist and scores are logged from the Daily Report."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const standings = standingsByGroup.get(g.id) ?? [];
            const winners = standings.filter((s) => s.isWinner);
            return (
              <section
                key={g.id}
                ref={(el) => { cardRefs.current[g.id] = el; }}
                data-group-id={g.id}
                className="scroll-mt-52"
              >
                <Card className="p-0 overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 sm:py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-slate-900">{g.name}</h2>
                      {g.level && <Badge variant="neutral">{g.level}</Badge>}
                    </div>
                    {winners.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-700">
                        <Crown className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                        <span>
                          <span className="font-medium">{isCurrentMonth ? "Leading" : "Winner"}:</span>{" "}
                          {joinNames(winners.map((w) => nameOf(w.player_id)))} · {winners[0].total} pts
                        </span>
                      </p>
                    )}
                  </div>

                  {standings.length === 0 ? (
                    <p className="px-4 sm:px-5 py-6 border-t border-slate-100 text-center text-xs text-slate-400">
                      No scores logged this month
                    </p>
                  ) : (
                    <div className="border-t border-slate-100">
                      <div className={cn(ROW_GRID, "px-4 sm:px-5 py-2 bg-slate-50/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider")}>
                        <span>#</span>
                        <span>Player</span>
                        <span className="text-right">Pts</span>
                        <span className="text-right">Sessions</span>
                        <span className="text-right">Best</span>
                        <span />
                      </div>
                      <div className="divide-y divide-slate-100">
                        {standings.map((s) => (
                          <button
                            key={s.player_id}
                            type="button"
                            onClick={() => {
                              setSelected({ groupId: g.id, playerId: s.player_id });
                              setDrawerOpen(true);
                            }}
                            className={cn(ROW_GRID, "w-full px-4 sm:px-5 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors")}
                          >
                            <span className="text-slate-400 tabular-nums">{s.rank}</span>
                            <span className="min-w-0 truncate font-medium text-slate-900">{nameOf(s.player_id)}</span>
                            <span className="text-right font-semibold text-slate-900 tabular-nums">{s.total}</span>
                            <span className="text-right text-slate-500 tabular-nums">{s.sessions}</span>
                            <span className="text-right text-slate-500 tabular-nums">{s.best}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 justify-self-end" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <PlayerBreakdownDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        playerName={selected ? nameOf(selected.playerId) : ""}
        groupName={selectedGroup?.name ?? ""}
        month={month}
        standing={selectedStanding}
        scores={selected ? rowsByGroup.get(selected.groupId) ?? [] : []}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the nav entry** in `src/components/layout/sidebar-layout.tsx`:
  1. In the `lucide-react` import list, add `Trophy,` after `ChevronRight,`.
  2. In `iconMap`, add `"king-of-court": Trophy,` after `"merch-analytics": BarChart3,`.
  3. In the admin nav array, add this line directly after the `daily-report` line:

```ts
  { key: "king-of-court", label: "King of Court", href: "/admin/king-of-court", section: "Training" },
```

- [ ] **Step 6: Verify.** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: no errors, and all tests pass. The nav tests in `src/lib/nav/sections.test.ts` must still pass.

- [ ] **Step 7: Check it in the app on staging.**
  - Confirm `npm run env` reports staging.
  - With `npm run dev`, first enter scores on the Daily Report for two sessions in the current month. Include a tie on points where one player played fewer sessions.
  - Then open **Training → King of Court** and check:
    - The totals, sessions and best match what was entered.
    - The fewer-sessions player ranks higher.
    - "👑 Leading" shows for the current month.
    - ◂ goes to the previous month, and the header says "Winner" there if it has scores. ▸ is disabled on the current month.
    - Tapping a chip scrolls to that group's card, below the pinned bar and not hidden under it, and the URL gains `?group=`. A refresh lands on the same card.
    - Scrolling moves the chip highlight.
    - Tapping a player opens the drawer with the right sessions, points and "Nth of M".
    - A drawer row opens `/admin/daily-report?date=…&tab=scores` on the Scores tab.
  - Repeat the chip, scroll and drawer checks at 375px width in the browser's device toolbar: no sideways page scroll, and the chip row scrolls by itself.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(portal)/admin/king-of-court" src/components/layout/sidebar-layout.tsx
git commit -m "$(cat <<'EOF'
feat(king-of-court): monthly leaderboard with group chips and player breakdown

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verification & wrap-up

**Files:** none new.

- [ ] **Step 1: Full checks.**
  - Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && bash scripts/db/test-king-of-court.sh staging`
  - Expected: all green. `next build` lists `/admin/king-of-court`.
- [ ] **Step 2: Walk through the spec's edge-case table** on staging. Each row must behave as written. Pay particular attention to:
  - attendance re-saved with no change keeps the scores;
  - a score for a player marked absent after scoring disappears from the leaderboard;
  - a group with no scores shows "No scores logged this month".
- [ ] **Step 3: Hand off.** Report the results with the output of the commands above. Point out that `supabase/migrations/20260928000000_king_of_court_scores.sql` must be applied to prod by hand before the branch deploys. Then use superpowers:finishing-a-development-branch.
