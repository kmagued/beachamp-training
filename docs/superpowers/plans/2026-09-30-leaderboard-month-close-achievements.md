# Closing a Leaderboard Month & Player Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin closes a leaderboard month with a button; closing locks that month's King of Court scores and awards the top two players of every group an achievement, which players see on a new Achievements page and on their dashboard.

**Architecture:**
- **Storage:** two new tables. `leaderboard_month_closes` holds one row per closed month. `leaderboard_awards` holds one row per awarded player and is deleted with its month's close row. A trigger on `king_of_court_scores` refuses any write to a closed month.
- **Logic:** framework-free modules in `src/lib/king-of-court/` decide who is awarded (`awards.ts`) and whether a write must be refused (`lock.ts`). `node:test` tests them.
- **Screens:**
  - The shared `LeaderboardView` gains a Closed badge for everyone and Close / Reopen buttons for admins, backed by two admin-only server actions.
  - The Daily Report's Scores tab turns read-only for a closed month.
  - The player portal gains `/player/achievements` and a dashboard card, both reading the player's own awards under RLS.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, Supabase (Postgres 17, RLS, PostgREST through `@supabase/ssr`), Tailwind, lucide-react, `tsx --test` (Node 20 built-in test runner).

**Spec:** `docs/superpowers/specs/2026-09-30-leaderboard-month-close-achievements-design.md`

## Global Constraints

- **Who is awarded:** everyone ranked 1st or 2nd by `buildStandings` with more than 0 points, per group. Ties share the place: ranks 1, 1, 3 give two 1st places and no 2nd; ranks 1, 2, 2 give three awards.
- **`monthAwards` is the only code that decides who is awarded.** The confirmation dialog and the server action both call it. Never rank in SQL.
- **Closing locks first, then ranks.** The close row is inserted before the scores are read.
- **Nobody is notified unless the whole close succeeded.** Awards are written before notifications, and the notifications are one insert.
- **Only admins close and reopen.** Both actions call `requireAdmin`. Coaches and players never see the buttons.
- **Any month up to the current Cairo month can be closed.** The current month comes from `cairoMonthKey(new Date())`, never from UTC `toISOString()`. Months are written `YYYY-MM`.
- **A change that would alter a closed month's scores is refused,** in the database and in the actions. `removeAttendanceRecords` and `submitAttendance` must refuse **before** they change anything.
- **Monthly awards only.** Do not build the mockup's stat tiles, Badges section or "Share this award" button.
- **Database writes go to staging only,** through `scripts/db/*`. **Never write to prod.**
- **The migration must reach production before this code does.** Without the new tables, the closed-month check fails and attendance and score saves are refused. It is safe to apply early: nothing is closed until the button is used. It is applied by hand, outside this plan.
- **Match the surrounding code:**
  - Supabase clients are cast with `as any` plus the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment.
  - Each actions file keeps its own `getCurrentUserRole()` and `requireAdmin()` helpers.
  - Comments explain *why*.
- **Copy strings, verbatim:**
  - "The September 2026 leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard." (month substituted)
  - "The September 2026 leaderboard is closed, so these scores are read-only."
  - "You won the Group A King of Court for September 2026"
  - "You finished 2nd in the Group A King of Court for September 2026"
  - "142 points from 8 sessions"
  - "1st place" and "2nd place"
  - "Close month", "Reopen", "Closed", "Winner", "Leading", "Runner-up"
  - "No achievements yet" / "Finish in the top 2 of your group's monthly leaderboard to earn one."
- **Every commit message ends with:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Reading this plan's snippets:** a code block nested inside a step is indented along with the step. The code's own indentation is what remains after removing the fence's indentation, and it matches the file being edited.

## Review Focus

1. **Achievements failing to load must not take the player dashboard down.** If the awards read fails (for example the code is live before the migration), the dashboard must render without the card. Pinned in Task 6 (`awards-load.test.ts`).
2. **Group names that already contain an apostrophe or end in "s".** "Women's Team" must read "the Women's Team King of Court", never "Women's Team's". Pinned in Task 2 (`awards.test.ts`).
3. **The refusal must name the real cause.** In a closed month, a write that the present-only rule would also refuse must still be refused as *closed*, so the admin knows to reopen. Pinned in Task 1 (SQL case 13).
4. **A coach changing a scored player's attendance in a closed month.** Coaches write through their own RLS-limited client. The change must be refused and the attendance row left as it was. Pinned in Task 1 (SQL case 15).
5. **A double click, or two admins closing at once.** The second close must read "September 2026 is already closed", not a raw duplicate-key error; and a closed-month check that can't run must refuse rather than let the write through. Pinned in Task 1 (SQL case 11) and Task 3 (`lock.test.ts`).

---

### Task 1: Database — close and award tables, the lock trigger, SQL tests on staging, types

**Files:**
- Modify: `scripts/db/test-king-of-court.sql`
- Create: `supabase/migrations/20260930000000_leaderboard_month_close.sql`
- Modify: `src/types/database.ts`:
  - add two table entries after the `king_of_court_scores: { … };` block, just before `coach_groups: {`;
  - add two exports after the `KingOfCourtScore` export near the end of the file.

**Interfaces:**
- Produces the table `leaderboard_month_closes`: `month` (TEXT primary key, `YYYY-MM`), `closed_by`, `closed_at`.
- Produces the table `leaderboard_awards`: `id`, `month` (FK to the close row, cascade), `group_id`, `player_id`, `place` (1 or 2), `points`, `sessions`, `notification_id` (plain UUID, no FK), `created_at`; unique on `(month, group_id, player_id)`.
- Produces the trigger `king_of_court_scores_refuse_closed_month`, which raises `check_violation` with a message starting `The September 2026 leaderboard is closed` (month substituted).
- Produces the TS types `LeaderboardMonthClose` and `LeaderboardAward`.

- [ ] **Step 1: Start Docker.** The `scripts/db` runners use a Postgres image. Run `open -a Docker`, then wait until `docker info >/dev/null 2>&1 && echo ok` prints `ok`. Confirm `scripts/db/.env.db` exists.

- [ ] **Step 2: Write the failing SQL tests.** Make three edits to `scripts/db/test-king-of-court.sql`.

  **Edit A.** Replace the first comment line of the file:

  ```sql
  -- King of Court score tests: the present-only rule and the attendance clean-up trigger.
  ```

  with:

  ```sql
  -- King of Court score tests: the present-only rule, the attendance clean-up trigger, and
  -- closed months (the score lock and the awards).
  ```

  **Edit B.** Directly after the line `SET LOCAL plpgsql.check_asserts = on;`, insert:

  ```sql

  -- These cases score September and October 2026. If staging has either month closed, open
  -- it for this transaction (rolled back with everything else) so every case starts open.
  DELETE FROM leaderboard_month_closes WHERE month IN ('2026-09', '2026-10');
  ```

  **Edit C.** Directly before the final `ROLLBACK;` line, insert:

  ```sql
  -- ═══════════════════════════════════════════════════════════════════════
  -- Closed months: leaderboard_month_closes, leaderboard_awards and the lock
  -- ═══════════════════════════════════════════════════════════════════════

  -- ── Fixtures ────────────────────────────────────────────────────────────
  -- p1 is present and scored 11 (from case 9). p2 becomes present and stays unscored in
  -- September, and is present and scored in October, which stays open. p3 is a throwaway
  -- player who can be deleted, present and scored in September.
  DO $$
  DECLARE
    p3 UUID := gen_random_uuid();
  BEGIN
    PERFORM pg_temp.set_status('kt.p2', 'present');

    INSERT INTO auth.users (id, instance_id, aud, role, email)
    VALUES (p3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'zz-kotc-test@example.invalid');
    INSERT INTO profiles (id, first_name, last_name, role) VALUES (p3, 'ZZ', 'KOTC test', 'player');
    PERFORM set_config('kt.p3', p3::text, true);

    INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id) VALUES
      (p3, current_setting('kt.group')::uuid, DATE '2026-09-02', 'present', current_setting('kt.session')::uuid),
      (current_setting('kt.p2')::uuid, current_setting('kt.group')::uuid, DATE '2026-10-07', 'present',
       current_setting('kt.session')::uuid);
    PERFORM pg_temp.score('kt.p3', 6);
    INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
    VALUES (current_setting('kt.p2')::uuid, current_setting('kt.session')::uuid,
            current_setting('kt.group')::uuid, DATE '2026-10-07', 4);
  END $$;

  -- True when the statement is refused because September 2026 is closed. Any other
  -- outcome (it ran, or it was refused for another reason) is false or an error.
  CREATE FUNCTION pg_temp.refused_as_closed(p_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
  BEGIN
    EXECUTE p_sql;
    RETURN FALSE;
  EXCEPTION WHEN check_violation THEN
    RETURN SQLERRM LIKE 'The September 2026 leaderboard is closed%';
  END $$;

  CREATE FUNCTION pg_temp.status_of(p_player TEXT) RETURNS TEXT LANGUAGE sql AS $$
    SELECT status FROM attendance
    WHERE player_id = current_setting(p_player)::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-09-02'
  $$;

  -- ── 11. One close row per month, written "YYYY-MM" ──────────────────────
  DO $$ BEGIN
    BEGIN
      INSERT INTO leaderboard_month_closes (month) VALUES ('2026-13');
      RAISE EXCEPTION '11: month 2026-13 should have failed';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO leaderboard_month_closes (month) VALUES ('Sep 2026');
      RAISE EXCEPTION '11: month "Sep 2026" should have failed';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO leaderboard_month_closes (month, closed_by)
    VALUES ('2026-09', current_setting('kt.admin')::uuid);

    -- The action turns this unique_violation (23505) into "already closed"
    BEGIN
      INSERT INTO leaderboard_month_closes (month) VALUES ('2026-09');
      RAISE EXCEPTION '11: closing a closed month should have failed';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END $$;

  -- ── 12. A closed month's scores cannot be added, changed or removed ─────
  DO $$ BEGIN
    ASSERT pg_temp.refused_as_closed($q$
      INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
      VALUES (current_setting('kt.p2')::uuid, current_setting('kt.session')::uuid,
              current_setting('kt.group')::uuid, DATE '2026-09-02', 5) $q$),
      '12: scoring in a closed month should be refused as closed';
    ASSERT pg_temp.refused_as_closed($q$
      UPDATE king_of_court_scores SET points = 99
      WHERE player_id = current_setting('kt.p1')::uuid
        AND schedule_session_id = current_setting('kt.session')::uuid
        AND session_date = DATE '2026-09-02' $q$),
      '12: changing a closed month''s score should be refused as closed';
    ASSERT pg_temp.refused_as_closed($q$
      DELETE FROM king_of_court_scores
      WHERE player_id = current_setting('kt.p1')::uuid
        AND schedule_session_id = current_setting('kt.session')::uuid
        AND session_date = DATE '2026-09-02' $q$),
      '12: deleting a closed month''s score should be refused as closed';
    ASSERT pg_temp.points_of('kt.p1') = 11, '12: the closed month''s score must be untouched';
  END $$;

  -- ── 13. The refusal names the closed month even when another rule would also refuse;
  --        a score can't be moved into a closed month; an open month stays editable ──
  DO $$ BEGIN
    -- No attendance on the 9th: the present-only trigger would refuse this too
    ASSERT pg_temp.refused_as_closed($q$
      INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
      VALUES (current_setting('kt.p2')::uuid, current_setting('kt.session')::uuid,
              current_setting('kt.group')::uuid, DATE '2026-09-09', 5) $q$),
      '13: in a closed month the refusal must say the month is closed';
    ASSERT pg_temp.refused_as_closed($q$
      UPDATE king_of_court_scores SET session_date = DATE '2026-09-02'
      WHERE player_id = current_setting('kt.p2')::uuid
        AND schedule_session_id = current_setting('kt.session')::uuid
        AND session_date = DATE '2026-10-07' $q$),
      '13: moving a score into a closed month should be refused as closed';

    UPDATE king_of_court_scores SET points = 7
    WHERE player_id = current_setting('kt.p2')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-10-07';
    ASSERT (SELECT points FROM king_of_court_scores
            WHERE player_id = current_setting('kt.p2')::uuid
              AND schedule_session_id = current_setting('kt.session')::uuid
              AND session_date = DATE '2026-10-07') = 7,
      '13: an open month must stay editable while another is closed';
  END $$;

  -- ── 14. Attendance changes that would drop a closed month's score are refused whole ─
  DO $$ BEGIN
    ASSERT pg_temp.refused_as_closed($q$
      UPDATE attendance SET status = 'absent'
      WHERE player_id = current_setting('kt.p1')::uuid
        AND schedule_session_id = current_setting('kt.session')::uuid
        AND session_date = DATE '2026-09-02' $q$),
      '14: marking a scored player absent in a closed month should be refused as closed';
    ASSERT pg_temp.refused_as_closed($q$
      DELETE FROM attendance
      WHERE player_id = current_setting('kt.p1')::uuid
        AND schedule_session_id = current_setting('kt.session')::uuid
        AND session_date = DATE '2026-09-02' $q$),
      '14: removing a scored player''s attendance in a closed month should be refused as closed';
    ASSERT pg_temp.status_of('kt.p1') = 'present', '14: a refused change must leave attendance as it was';
    ASSERT pg_temp.points_of('kt.p1') = 11, '14: a refused change must leave the score as it was';

    -- An unscored player's attendance is free to change
    PERFORM pg_temp.set_status('kt.p2', 'excused');
    ASSERT pg_temp.status_of('kt.p2') = 'excused',
      '14: an unscored player''s attendance must stay editable in a closed month';
  END $$;

  -- ── 15. A coach, through their own client: refused the same way; can see that a
  --        month is closed; cannot close or reopen one ──────────────────────────────
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('kt.coach'), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DO $$ BEGIN
    BEGIN
      UPDATE attendance SET status = 'absent'
      WHERE player_id = current_setting('kt.p1')::uuid
        AND schedule_session_id = current_setting('kt.session')::uuid
        AND session_date = DATE '2026-09-02';
      RAISE EXCEPTION '15: a coach marking a scored player absent in a closed month should have failed';
    EXCEPTION WHEN check_violation THEN
      ASSERT SQLERRM LIKE 'The September 2026 leaderboard is closed%', '15: wrong refusal: ' || SQLERRM;
    END;

    ASSERT (SELECT count(*) FROM leaderboard_month_closes WHERE month = '2026-09') = 1,
      '15: any signed-in user should see that a month is closed';
    BEGIN
      INSERT INTO leaderboard_month_closes (month) VALUES ('2026-08');
      RAISE EXCEPTION '15: a coach closing a month should have failed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    -- RLS hides the row from a coach's DELETE: no rows, no error
    DELETE FROM leaderboard_month_closes WHERE month = '2026-09';
  END $$;
  RESET ROLE;

  DO $$ BEGIN
    ASSERT EXISTS (SELECT 1 FROM leaderboard_month_closes WHERE month = '2026-09'),
      '15: a coach must not be able to reopen a month';
    ASSERT pg_temp.status_of('kt.p1') = 'present', '15: the coach''s refused change must leave attendance as it was';
  END $$;

  -- ── 16. Awards: places 1 and 2 only, one per player per group per month, and only
  --        for a closed month ───────────────────────────────────────────────────────
  DO $$ BEGIN
    INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions) VALUES
      ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p1')::uuid, 1, 11, 1),
      ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p3')::uuid, 2, 6, 1);
    BEGIN
      INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
      VALUES ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p2')::uuid, 3, 1, 1);
      RAISE EXCEPTION '16: place 3 should have failed';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
      VALUES ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p1')::uuid, 2, 11, 1);
      RAISE EXCEPTION '16: a second award for the same player, group and month should have failed';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
      INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
      VALUES ('2026-10', current_setting('kt.group')::uuid, current_setting('kt.p2')::uuid, 1, 7, 1);
      RAISE EXCEPTION '16: an award for a month that isn''t closed should have failed';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END $$;

  -- A player reads their own awards and nobody else's, and cannot award themselves
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('kt.p1'), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DO $$ BEGIN
    ASSERT (SELECT count(*) FROM leaderboard_awards WHERE group_id = current_setting('kt.group')::uuid) = 1,
      '16: a player should read their own award and not the other player''s';
    BEGIN
      INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
      VALUES ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p1')::uuid, 1, 999, 1);
      RAISE EXCEPTION '16: a player awarding themselves should have failed';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END $$;
  RESET ROLE;

  SELECT set_config('request.jwt.claims',
    json_build_object('sub', current_setting('kt.p2'), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DO $$ BEGIN
    ASSERT (SELECT count(*) FROM leaderboard_awards WHERE group_id = current_setting('kt.group')::uuid) = 0,
      '16: a player with no award must not read other players'' awards';
  END $$;
  RESET ROLE;

  -- ── 17. Deleting a player takes their scores and awards, closed month or not ─────
  DO $$ BEGIN
    DELETE FROM auth.users WHERE id = current_setting('kt.p3')::uuid;
    ASSERT NOT EXISTS (SELECT 1 FROM profiles WHERE id = current_setting('kt.p3')::uuid),
      '17: fixture: deleting the auth user should delete the profile';
    ASSERT NOT EXISTS (SELECT 1 FROM king_of_court_scores WHERE player_id = current_setting('kt.p3')::uuid),
      '17: a deleted player''s scores should go with them, even in a closed month';
    ASSERT NOT EXISTS (SELECT 1 FROM leaderboard_awards WHERE player_id = current_setting('kt.p3')::uuid),
      '17: a deleted player''s awards should go with them';
    ASSERT pg_temp.points_of('kt.p1') = 11, '17: other players'' scores must stay';
    ASSERT EXISTS (SELECT 1 FROM leaderboard_awards
                   WHERE player_id = current_setting('kt.p1')::uuid
                     AND group_id = current_setting('kt.group')::uuid),
      '17: other players'' awards must stay';
  END $$;

  -- ── 18. Reopening removes the month's awards and unlocks its scores ─────
  DO $$ BEGIN
    DELETE FROM leaderboard_month_closes WHERE month = '2026-09';
    ASSERT NOT EXISTS (SELECT 1 FROM leaderboard_awards WHERE month = '2026-09'),
      '18: reopening should remove the month''s awards';
    PERFORM pg_temp.score('kt.p1', 13);
    ASSERT pg_temp.points_of('kt.p1') = 13, '18: a reopened month should be scorable again';
    PERFORM pg_temp.set_status('kt.p1', 'absent');
    ASSERT pg_temp.points_of('kt.p1') IS NULL, '18: and attendance changes should drop scores again';
  END $$;

  ```

  The inserted SQL sits at column 0 in the file, like the rest of it (the indentation above is only this plan's list nesting).

- [ ] **Step 3: Run it and expect FAIL.**
  - Run: `bash scripts/db/test-king-of-court.sh staging`
  - Expected: a failure with `relation "leaderboard_month_closes" does not exist`, raised at the `DELETE FROM leaderboard_month_closes` line near the top.
  - If it fails on a `fixture:` assert instead, stop and report which fixture staging lacks.

- [ ] **Step 4: Write the migration** `supabase/migrations/20260930000000_leaderboard_month_close.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- Closing a leaderboard month, and the awards it gives (2026-09-30)
--   An admin closes a month from the Leaderboard. That locks the month's
--   King of Court scores and awards the top two players of every group.
--   Reopening deletes the close row: the awards go with it and the scores
--   unlock, so awards always match the leaderboard.
--   Nothing is closed until an admin uses the button, so this is safe to
--   apply ahead of the code.
-- ═══════════════════════════════════════════════════════════════

-- A row here means the month is closed: its scores are locked and its awards are final.
CREATE TABLE leaderboard_month_closes (
  month     TEXT PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- "YYYY-MM"
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per awarded player per group per closed month. Reopening deletes the month's
-- close row, and these go with it.
CREATE TABLE leaderboard_awards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month           TEXT NOT NULL REFERENCES leaderboard_month_closes(month) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  place           SMALLINT NOT NULL CHECK (place IN (1, 2)),
  -- The player's month as it stood at closing, shown on the award card
  points          INTEGER NOT NULL,
  sessions        INTEGER NOT NULL,
  -- The notification sent for this award, so reopening can take back the unread ones.
  -- No foreign key: the award is written before its notification, so that a close which
  -- fails part-way never leaves a player notified (and emailed) about an award they
  -- don't have.
  notification_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, group_id, player_id)
);

CREATE INDEX idx_leaderboard_awards_player ON leaderboard_awards(player_id, month DESC);

-- ── Row-level security ──
ALTER TABLE leaderboard_month_closes ENABLE ROW LEVEL SECURITY;

-- Whether a month is closed is not a secret: every portal's Leaderboard shows it
CREATE POLICY "Signed-in users can see closed months"
  ON leaderboard_month_closes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage closed months"
  ON leaderboard_month_closes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE leaderboard_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can see their own awards"
  ON leaderboard_awards FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "Admins can manage awards"
  ON leaderboard_awards FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── The lock: a closed month's scores cannot be added, changed or removed ──
-- The trigger's name sorts before king_of_court_scores_require_present, so it fires
-- first: in a closed month the refusal says the month is closed, which is the thing the
-- admin can act on.
-- SECURITY DEFINER: it reads and locks leaderboard_month_closes whoever the caller is
-- (a coach's attendance change reaches it through attendance_drop_kotc_score).
CREATE FUNCTION kotc_refuse_closed_month() RETURNS TRIGGER AS $$
DECLARE
  d     DATE;
  dates DATE[];
BEGIN
  -- A player, group or session being deleted takes its scores with it, closed month or
  -- not. A cascading delete runs after its parent row is gone, so the parent is missing.
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = OLD.player_id)
       OR NOT EXISTS (SELECT 1 FROM groups WHERE id = OLD.group_id)
       OR NOT EXISTS (SELECT 1 FROM schedule_sessions WHERE id = OLD.schedule_session_id) THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Wait for a close that is being written, and make a close wait for this write, so the
  -- awards are never ranked from scores that change a moment later. SHARE doesn't block
  -- other score writes, only writes to leaderboard_month_closes.
  LOCK TABLE leaderboard_month_closes IN SHARE MODE;

  IF TG_OP = 'INSERT' THEN
    dates := ARRAY[NEW.session_date];
  ELSIF TG_OP = 'DELETE' THEN
    dates := ARRAY[OLD.session_date];
  ELSE
    dates := ARRAY[OLD.session_date, NEW.session_date];
  END IF;

  FOREACH d IN ARRAY dates LOOP
    IF EXISTS (SELECT 1 FROM leaderboard_month_closes WHERE month = to_char(d, 'YYYY-MM')) THEN
      -- The same sentence as closedMonthMessage() in src/lib/king-of-court/awards.ts
      RAISE EXCEPTION
        'The % leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard.',
        to_char(d, 'FMMonth YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER king_of_court_scores_refuse_closed_month
  BEFORE INSERT OR UPDATE OR DELETE ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION kotc_refuse_closed_month();
```

- [ ] **Step 5: Apply to staging and re-run the tests; expect PASS.**
  - Run: `bash scripts/db/apply-migration.sh staging supabase/migrations/20260930000000_leaderboard_month_close.sql && bash scripts/db/test-king-of-court.sh staging`
  - Expected: `Applied and recorded 20260930000000 on staging`, then `All King of Court score tests passed`.
  - If a case fails, fix the migration. It is already recorded on staging, so for a function-only fix run the corrected `CREATE OR REPLACE FUNCTION` through psql; for anything else, report back before touching staging by hand.
  - If the fixture's `INSERT INTO auth.users` fails, stop and report the error: do not swap case 17 for an existing staging player.

- [ ] **Step 6: Add the types.** In `src/types/database.ts`, insert this after the `king_of_court_scores: { … };` block, just before `coach_groups: {`:

```ts
      leaderboard_month_closes: {
        Row: {
          month: string;
          closed_by: string | null;
          closed_at: string;
        };
        Insert: {
          month: string;
          closed_by?: string | null;
          closed_at?: string;
        };
        Update: {
          month?: string;
          closed_by?: string | null;
          closed_at?: string;
        };
        Relationships: [];
      };
      leaderboard_awards: {
        Row: {
          id: string;
          month: string;
          group_id: string;
          player_id: string;
          place: number;
          points: number;
          sessions: number;
          notification_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          month: string;
          group_id: string;
          player_id: string;
          place: number;
          points: number;
          sessions: number;
          notification_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          month?: string;
          group_id?: string;
          player_id?: string;
          place?: number;
          points?: number;
          sessions?: number;
          notification_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
```

  Then, after the line `export type KingOfCourtScore = Database["public"]["Tables"]["king_of_court_scores"]["Row"];`, add:

```ts
export type LeaderboardMonthClose = Database["public"]["Tables"]["leaderboard_month_closes"]["Row"];
export type LeaderboardAward = Database["public"]["Tables"]["leaderboard_awards"]["Row"];
```

- [ ] **Step 7: Type-check.** Run `npx tsc --noEmit`. Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260930000000_leaderboard_month_close.sql scripts/db/test-king-of-court.sql src/types/database.ts
git commit -m "$(cat <<'EOF'
feat(leaderboard): closed months lock their scores; awards table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Award logic — who is awarded, and the words that go with it

**Files:**
- Create: `src/lib/king-of-court/awards.ts`
- Create: `src/lib/king-of-court/awards.test.ts`
- Modify: `src/lib/king-of-court/month.ts` (add two helpers at the end)
- Modify: `src/lib/king-of-court/month.test.ts` (add two tests at the end)

**Interfaces:**
- Consumes: `buildStandings`, `groupScores`, `ScoreRow` from `./leaderboard`; `formatMonth`, `joinNames`, `ordinal` from `./format`.
- Produces, from `awards.ts`:
  - `type Place = 1 | 2`
  - `interface Award { group_id: string; player_id: string; place: Place; points: number; sessions: number }`
  - `monthAwards(scores: ScoreRow[]): Award[]`
  - `canCloseMonth(month: string, currentMonth: string): boolean`
  - `placeLabel(place: Place): string`
  - `awardSummary(points: number, sessions: number): string`
  - `groupAwardSummary(awards: Award[], groupId: string, nameOf: (playerId: string) => string): { first: string | null; second: string | null }`
  - `awardNotification(a: { place: Place; groupName: string; month: string; points: number; sessions: number }): { title: string; body: string }`
  - `closedMonthMessage(month: string): string`
  - `sortAwards<T extends { month: string; place: Place; group_name: string }>(awards: T[]): T[]`
- Produces, from `month.ts`: `isMonth(value: string): boolean` and `monthOfDate(date: string): string`.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/king-of-court/awards.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awardNotification,
  awardSummary,
  canCloseMonth,
  closedMonthMessage,
  groupAwardSummary,
  monthAwards,
  placeLabel,
  sortAwards,
  type Award,
} from "./awards";
import type { ScoreRow } from "./leaderboard";

/** A score row; defaults to group g1, session s1 at 18:00 */
function row(player_id: string, session_date: string, points: number, extra: Partial<ScoreRow> = {}): ScoreRow {
  return { player_id, group_id: "g1", schedule_session_id: "s1", session_date, start_time: "18:00:00", points, ...extra };
}

test("monthAwards: a 1st and a 2nd, with their points and sessions; 3rd gets nothing", () => {
  const awards = monthAwards([
    row("a", "2026-09-03", 8),
    row("a", "2026-09-07", 12),
    row("b", "2026-09-03", 5),
    row("c", "2026-09-03", 2),
  ]);
  assert.deepEqual(awards, [
    { group_id: "g1", player_id: "a", place: 1, points: 20, sessions: 2 },
    { group_id: "g1", player_id: "b", place: 2, points: 5, sessions: 1 },
  ]);
});

test("monthAwards: a tie for 1st (1, 1, 3) gives two 1st places and no 2nd", () => {
  const awards = monthAwards([row("a", "2026-09-03", 10), row("b", "2026-09-03", 10), row("c", "2026-09-03", 4)]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place]), [["a", 1], ["b", 1]]);
});

test("monthAwards: a tie for 2nd (1, 2, 2) gives three awards", () => {
  const awards = monthAwards([row("a", "2026-09-03", 10), row("b", "2026-09-03", 6), row("c", "2026-09-03", 6)]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place]), [["a", 1], ["b", 2], ["c", 2]]);
});

test("monthAwards: level on points, the player with fewer sessions is 1st and the other 2nd", () => {
  const awards = monthAwards([
    row("m", "2026-09-03", 12),
    row("n", "2026-09-03", 6),
    row("n", "2026-09-07", 6),
  ]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place, a.points, a.sessions]), [["m", 1, 12, 1], ["n", 2, 12, 2]]);
});

test("monthAwards: a player on 0 points is never awarded, even when ranked 2nd", () => {
  const awards = monthAwards([row("a", "2026-09-03", 5), row("b", "2026-09-03", 0)]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place]), [["a", 1]]);
});

test("monthAwards: a group where everyone scored 0 gets no awards", () => {
  assert.deepEqual(monthAwards([row("a", "2026-09-03", 0), row("b", "2026-09-03", 0)]), []);
});

test("monthAwards: groups are awarded independently, and a player can be awarded in both", () => {
  const awards = monthAwards([
    row("a", "2026-09-03", 8),
    row("b", "2026-09-03", 4),
    row("a", "2026-09-04", 3, { group_id: "g2", schedule_session_id: "s9" }),
    row("c", "2026-09-04", 9, { group_id: "g2", schedule_session_id: "s9" }),
  ]);
  assert.deepEqual(awards.map((a) => [a.group_id, a.player_id, a.place]), [
    ["g1", "a", 1],
    ["g1", "b", 2],
    ["g2", "c", 1],
    ["g2", "a", 2],
  ]);
});

test("monthAwards: no scores, no awards", () => {
  assert.deepEqual(monthAwards([]), []);
});

test("canCloseMonth: a past month and the current month can be closed, a future month cannot", () => {
  assert.equal(canCloseMonth("2026-08", "2026-09"), true);
  assert.equal(canCloseMonth("2026-09", "2026-09"), true);
  assert.equal(canCloseMonth("2026-10", "2026-09"), false);
});

test("canCloseMonth: across a year boundary", () => {
  assert.equal(canCloseMonth("2026-12", "2027-01"), true);
  assert.equal(canCloseMonth("2027-01", "2026-12"), false);
});

test("placeLabel", () => {
  assert.equal(placeLabel(1), "1st place");
  assert.equal(placeLabel(2), "2nd place");
});

test("awardSummary: plural and singular", () => {
  assert.equal(awardSummary(142, 8), "142 points from 8 sessions");
  assert.equal(awardSummary(1, 1), "1 point from 1 session");
});

test("groupAwardSummary: one line per place, co-winners joined, null where nobody placed", () => {
  const awards: Award[] = [
    { group_id: "g1", player_id: "a", place: 1, points: 142, sessions: 8 },
    { group_id: "g1", player_id: "b", place: 1, points: 142, sessions: 8 },
    { group_id: "g1", player_id: "c", place: 2, points: 118, sessions: 7 },
    { group_id: "g2", player_id: "d", place: 1, points: 9, sessions: 1 },
  ];
  const names: Record<string, string> = { a: "Ali A", b: "Bea B", c: "Cy C", d: "Dee D" };
  const nameOf = (id: string) => names[id];

  assert.deepEqual(groupAwardSummary(awards, "g1", nameOf), {
    first: "1st: Ali A & Bea B (142 pts)",
    second: "2nd: Cy C (118 pts)",
  });
  assert.deepEqual(groupAwardSummary(awards, "g2", nameOf), { first: "1st: Dee D (9 pts)", second: null });
  assert.deepEqual(groupAwardSummary(awards, "g3", nameOf), { first: null, second: null });
});

test("awardNotification: 1st place, and a group name that already has an apostrophe", () => {
  assert.deepEqual(
    awardNotification({ place: 1, groupName: "Women's Team", month: "2026-09", points: 142, sessions: 8 }),
    {
      title: "You won the Women's Team King of Court for September 2026",
      body: "142 points from 8 sessions.",
    }
  );
});

test("awardNotification: 2nd place, a group name ending in s, and the singular", () => {
  assert.deepEqual(
    awardNotification({ place: 2, groupName: "Juniors", month: "2027-01", points: 1, sessions: 1 }),
    {
      title: "You finished 2nd in the Juniors King of Court for January 2027",
      body: "1 point from 1 session.",
    }
  );
});

test("closedMonthMessage: the same sentence the database trigger raises", () => {
  assert.equal(
    closedMonthMessage("2026-09"),
    "The September 2026 leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard."
  );
});

test("sortAwards: newest month first, then 1st before 2nd, then by group name; the input is left alone", () => {
  const input = [
    { id: "w", month: "2026-08", place: 1 as const, group_name: "Group A" },
    { id: "x", month: "2026-09", place: 2 as const, group_name: "Group A" },
    { id: "y", month: "2026-09", place: 1 as const, group_name: "Group B" },
    { id: "z", month: "2026-09", place: 1 as const, group_name: "Group A" },
  ];
  assert.deepEqual(sortAwards(input).map((a) => a.id), ["z", "y", "x", "w"]);
  assert.deepEqual(input.map((a) => a.id), ["w", "x", "y", "z"]);
});
```

  Then append to `src/lib/king-of-court/month.test.ts`, changing its import line to `import { isMonth, monthOfDate, monthRange, parseMonthParam, shiftMonth } from "./month";`:

```ts

test("isMonth: a real YYYY-MM and nothing else", () => {
  assert.equal(isMonth("2026-09"), true);
  assert.equal(isMonth("2026-12"), true);
  for (const bad of ["2026-13", "2026-00", "2026-9", "abc", "", "2026-09-01"]) {
    assert.equal(isMonth(bad), false, bad);
  }
});

test("monthOfDate: the month a YYYY-MM-DD falls in", () => {
  assert.equal(monthOfDate("2026-09-03"), "2026-09");
  assert.equal(monthOfDate("2026-12-31"), "2026-12");
  assert.equal(monthOfDate("2027-01-01"), "2027-01");
});
```

- [ ] **Step 2: Run and expect FAIL.** Run `npm test`. Expected: `awards.test.ts` fails with `Cannot find module './awards'`, and `month.test.ts` fails because `isMonth` and `monthOfDate` aren't exported. The other test files still pass.

- [ ] **Step 3: Implement.** Append to `src/lib/king-of-court/month.ts`:

```ts

/** Whether this is a real YYYY-MM */
export function isMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

/** "2026-09-03" → "2026-09": session dates are plain calendar days, so no timezone is involved */
export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}
```

  Then create `src/lib/king-of-court/awards.ts`:

```ts
// Who is awarded when a leaderboard month is closed, and the words that go with an award.
// Pure functions: the close confirmation, the server action and the Achievements page all
// use them, so the three can't disagree.

import { formatMonth, joinNames, ordinal } from "./format";
import { buildStandings, groupScores, type ScoreRow } from "./leaderboard";

export type Place = 1 | 2;

export interface Award {
  group_id: string;
  player_id: string;
  place: Place;
  /** The player's total for the month at closing */
  points: number;
  /** Sessions scored that month, including 0-point ones */
  sessions: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Everyone ranked 1st or 2nd with points, for each group in a month of scores. The place
 * is the rank, so ties share it: ranks 1, 1, 3 give two 1st places and no 2nd.
 */
export function monthAwards(scores: ScoreRow[]): Award[] {
  const awards: Award[] = [];
  for (const [group_id, rows] of groupScores(scores)) {
    for (const s of buildStandings(rows)) {
      if (s.rank > 2 || s.total <= 0) continue;
      awards.push({ group_id, player_id: s.player_id, place: s.rank as Place, points: s.total, sessions: s.sessions });
    }
  }
  return awards;
}

/** Any month up to the current one may be closed; a month that hasn't started may not */
export function canCloseMonth(month: string, currentMonth: string): boolean {
  // "YYYY-MM" strings order the same way the months do
  return month <= currentMonth;
}

/** "1st place" / "2nd place" */
export function placeLabel(place: Place): string {
  return `${ordinal(place)} place`;
}

/** "142 points from 8 sessions" */
export function awardSummary(points: number, sessions: number): string {
  return `${plural(points, "point")} from ${plural(sessions, "session")}`;
}

/**
 * One group's lines for the close confirmation, e.g. "1st: A & B (142 pts)". Players
 * sharing a place share its points, so one figure covers them all.
 */
export function groupAwardSummary(
  awards: Award[],
  groupId: string,
  nameOf: (playerId: string) => string
): { first: string | null; second: string | null } {
  const line = (place: Place) => {
    const placed = awards.filter((a) => a.group_id === groupId && a.place === place);
    if (placed.length === 0) return null;
    return `${ordinal(place)}: ${joinNames(placed.map((a) => nameOf(a.player_id)))} (${placed[0].points} pts)`;
  };
  return { first: line(1), second: line(2) };
}

/**
 * The notification an awarded player receives. The group name is never made possessive:
 * "Women's Team's" and "Juniors's" read badly.
 */
export function awardNotification(a: {
  place: Place;
  groupName: string;
  month: string;
  points: number;
  sessions: number;
}): { title: string; body: string } {
  const contest = `the ${a.groupName} King of Court for ${formatMonth(a.month, "long")}`;
  return {
    title: a.place === 1 ? `You won ${contest}` : `You finished 2nd in ${contest}`,
    body: `${awardSummary(a.points, a.sessions)}.`,
  };
}

/**
 * The refusal shown when a change would alter a closed month's scores. The database
 * trigger kotc_refuse_closed_month raises the same sentence.
 */
export function closedMonthMessage(month: string): string {
  return `The ${formatMonth(month, "long")} leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard.`;
}

/** Newest month first; within a month 1st place before 2nd, then by group name */
export function sortAwards<T extends { month: string; place: Place; group_name: string }>(awards: T[]): T[] {
  return [...awards].sort(
    (a, b) => b.month.localeCompare(a.month) || a.place - b.place || a.group_name.localeCompare(b.group_name)
  );
}
```

- [ ] **Step 4: Run and expect PASS.** Run `npm test`. Expected: every test passes, including the merch and nav ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/king-of-court/awards.ts src/lib/king-of-court/awards.test.ts src/lib/king-of-court/month.ts src/lib/king-of-court/month.test.ts
git commit -m "$(cat <<'EOF'
feat(leaderboard): decide a closed month's awards and their wording

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server — closed-month checks, the close and reopen actions, guarded saves

**Files:**
- Create: `src/lib/king-of-court/lock.ts`
- Create: `src/lib/king-of-court/lock.test.ts`
- Modify: `src/lib/king-of-court/load.ts` (`LeaderboardData` and `loadLeaderboard`)
- Modify: `src/app/_actions/king-of-court.ts` (one check in `saveKingOfCourtScores`; two new actions)
- Modify: `src/app/_actions/training.ts` (`submitAttendance` and `removeAttendanceRecords`)

**Interfaces:**
- Consumes, from Task 2: `monthAwards`, `canCloseMonth`, `awardNotification`, `closedMonthMessage` from `@/lib/king-of-court/awards`; `isMonth`, `monthOfDate` from `@/lib/king-of-court/month`.
- Consumes, from Task 1: the tables `leaderboard_month_closes` and `leaderboard_awards`.
- Produces, from `lock.ts`:
  - `closedMonthBlock(admin, month: string): Promise<string | null>`
  - `closedMonthScoreBlock(admin, occurrence: { schedule_session_id: string; session_date: string }, playerIds: string[]): Promise<string | null>`

  Both return the message to refuse with, or `null` to go ahead. Neither throws.
- Produces, from `load.ts`: `LeaderboardData` gains `closedAt: string | null`.
- Produces, from `_actions/king-of-court.ts`:
  - `closeLeaderboardMonth(month: string): Promise<{ success: true; awards: number } | { error: string }>`
  - `reopenLeaderboardMonth(month: string): Promise<{ success: true } | { error: string }>`

- [ ] **Step 1: Write the failing tests.** Create `src/lib/king-of-court/lock.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedMonthBlock, closedMonthScoreBlock } from "./lock";

type Result = { data?: unknown; count?: number | null; error?: { message: string } | null };

/**
 * A stand-in for the Supabase admin client. Every query on a table resolves to that
 * table's canned result, whatever filters are chained; `tables` records what was read.
 */
function stubAdmin(results: Record<string, Result>) {
  const tables: string[] = [];
  const admin = {
    from(table: string) {
      tables.push(table);
      const result = { data: null, count: null, error: null, ...results[table] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => result,
        then: (resolve: (r: typeof result) => unknown) => resolve(result),
      };
      return query;
    },
  };
  return { admin, tables };
}

const CLOSED = "The September 2026 leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard.";
const occurrence = { schedule_session_id: "s1", session_date: "2026-09-03" };

test("closedMonthBlock: an open month may be written", async () => {
  const { admin } = stubAdmin({ leaderboard_month_closes: { data: null } });
  assert.equal(await closedMonthBlock(admin, "2026-09"), null);
});

test("closedMonthBlock: a closed month is refused with the closed message", async () => {
  const { admin } = stubAdmin({ leaderboard_month_closes: { data: { month: "2026-09" } } });
  assert.equal(await closedMonthBlock(admin, "2026-09"), CLOSED);
});

test("closedMonthBlock: a check that can't run refuses, rather than letting the write through", async () => {
  const { admin } = stubAdmin({ leaderboard_month_closes: { error: { message: "relation does not exist" } } });
  assert.equal(
    await closedMonthBlock(admin, "2026-09"),
    "Couldn't check whether the leaderboard is closed: relation does not exist"
  );
});

test("closedMonthScoreBlock: nobody's score is at stake, so nothing is read", async () => {
  const { admin, tables } = stubAdmin({ leaderboard_month_closes: { data: { month: "2026-09" } } });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, []), null);
  assert.deepEqual(tables, []);
});

test("closedMonthScoreBlock: an open month goes ahead without looking at scores", async () => {
  const { admin, tables } = stubAdmin({ leaderboard_month_closes: { data: null }, king_of_court_scores: { count: 2 } });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, ["a", "b"]), null);
  assert.deepEqual(tables, ["leaderboard_month_closes"]);
});

test("closedMonthScoreBlock: a closed month where one of the players holds a score is refused", async () => {
  const { admin } = stubAdmin({
    leaderboard_month_closes: { data: { month: "2026-09" } },
    king_of_court_scores: { count: 1 },
  });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, ["a", "b"]), CLOSED);
});

test("closedMonthScoreBlock: a closed month where none of the players holds a score goes ahead", async () => {
  const { admin } = stubAdmin({
    leaderboard_month_closes: { data: { month: "2026-09" } },
    king_of_court_scores: { count: 0 },
  });
  assert.equal(await closedMonthScoreBlock(admin, occurrence, ["a", "b"]), null);
});

test("closedMonthScoreBlock: a score count that can't be read refuses", async () => {
  const { admin } = stubAdmin({
    leaderboard_month_closes: { data: { month: "2026-09" } },
    king_of_court_scores: { error: { message: "timeout" } },
  });
  assert.equal(
    await closedMonthScoreBlock(admin, occurrence, ["a"]),
    "Couldn't check whether the leaderboard is closed: timeout"
  );
});
```

- [ ] **Step 2: Run and expect FAIL.** Run `npm test`. Expected: `lock.test.ts` fails with `Cannot find module './lock'`. Everything else passes.

- [ ] **Step 3: Implement** `src/lib/king-of-court/lock.ts`:

```ts
// Closed leaderboard months, checked on the server before a write that would change their
// scores. The database refuses those writes too (kotc_refuse_closed_month); these checks
// refuse earlier, before anything is half-done, and with nothing thrown: each returns the
// message to refuse with, or null to go ahead.

import { closedMonthMessage } from "./awards";
import { monthOfDate } from "./month";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const CHECK_FAILED = "Couldn't check whether the leaderboard is closed";

async function checkMonth(admin: AdminClient, month: string): Promise<{ closed: boolean } | { failed: string }> {
  const { data, error } = await admin
    .from("leaderboard_month_closes")
    .select("month")
    .eq("month", month)
    .maybeSingle();
  // Refuse rather than guess: going ahead unchecked could undo a closed month's awards
  if (error) return { failed: `${CHECK_FAILED}: ${error.message}` };
  return { closed: data !== null };
}

/** The message to refuse with when this month ("YYYY-MM") is closed; null when it is open */
export async function closedMonthBlock(admin: AdminClient, month: string): Promise<string | null> {
  const check = await checkMonth(admin, month);
  if ("failed" in check) return check.failed;
  return check.closed ? closedMonthMessage(month) : null;
}

/**
 * The message to refuse with when the date's month is closed and any of these players
 * holds a score for this session occurrence; null when the change may go ahead. An
 * attendance change for such a player would delete their score.
 */
export async function closedMonthScoreBlock(
  admin: AdminClient,
  occurrence: { schedule_session_id: string; session_date: string },
  playerIds: string[]
): Promise<string | null> {
  if (playerIds.length === 0) return null;

  const month = monthOfDate(occurrence.session_date);
  const check = await checkMonth(admin, month);
  if ("failed" in check) return check.failed;
  if (!check.closed) return null;

  const { count, error } = await admin
    .from("king_of_court_scores")
    .select("id", { count: "exact", head: true })
    .eq("schedule_session_id", occurrence.schedule_session_id)
    .eq("session_date", occurrence.session_date)
    .in("player_id", playerIds);
  if (error) return `${CHECK_FAILED}: ${error.message}`;
  return (count ?? 0) > 0 ? closedMonthMessage(month) : null;
}
```

- [ ] **Step 4: Run and expect PASS.** Run `npm test`. Expected: all tests pass.

- [ ] **Step 5: Load whether the month is closed.** In `src/lib/king-of-court/load.ts`:

  Replace the interface:

  ```ts
  export interface LeaderboardData {
    month: string;
    currentMonth: string;
    groups: LeaderboardGroup[];
    scores: ScoreRow[];
    players: Record<string, PlayerName>;
  }
  ```

  with:

  ```ts
  export interface LeaderboardData {
    month: string;
    currentMonth: string;
    /** When the month was closed; null while it is open */
    closedAt: string | null;
    groups: LeaderboardGroup[];
    scores: ScoreRow[];
    players: Record<string, PlayerName>;
  }
  ```

  Then replace the function's last two lines:

  ```ts
    const groups = groupsToShow(visible, new Set(scores.map((s) => s.group_id)));
    return { month, currentMonth, groups, scores, players };
  ```

  with:

  ```ts
    const { data: closeRow, error: closeErr } = await admin
      .from("leaderboard_month_closes")
      .select("closed_at")
      .eq("month", month)
      .maybeSingle();
    // An open month offers Close and a closed one Reopen: don't guess which
    if (closeErr) throw new Error(`Could not load whether ${month} is closed: ${closeErr.message}`);

    const groups = groupsToShow(visible, new Set(scores.map((s) => s.group_id)));
    return { month, currentMonth, closedAt: closeRow?.closed_at ?? null, groups, scores, players };
  ```

- [ ] **Step 6: Guard score saves, and add the close and reopen actions.** In `src/app/_actions/king-of-court.ts`:

  Replace the import block at the top (everything between `"use server";` and the `// ── Helper: get current user role ──` comment) with:

  ```ts
  import { randomUUID } from "node:crypto";
  import { createClient, createAdminClient } from "@/lib/supabase/server";
  import { revalidatePath } from "next/cache";
  import { cairoMonthKey, cairoToday } from "@/lib/utils/cairo-time";
  import { awardNotification, canCloseMonth, monthAwards } from "@/lib/king-of-court/awards";
  import { formatMonth } from "@/lib/king-of-court/format";
  import { loadLeaderboard } from "@/lib/king-of-court/load";
  import { closedMonthBlock } from "@/lib/king-of-court/lock";
  import { isMonth, monthOfDate } from "@/lib/king-of-court/month";
  import { checkScoreSave, type ScoreEntry } from "@/lib/king-of-court/save";
  ```

  In `saveKingOfCourtScores`, replace:

  ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data: session } = await admin
  ```

  with:

  ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // The database refuses this too; refusing here lets the Scores tab reload as read-only
    const closed = await closedMonthBlock(admin, monthOfDate(data.session_date));
    if (closed) return { error: closed, reload: true };

    const { data: session } = await admin
  ```

  Then append to the end of the file:

  ```ts

  // ═══════════════════════════════════════
  // CLOSING A MONTH (Admin only)
  // ═══════════════════════════════════════

  /** Every page that shows a month's state or a player's awards */
  function revalidateLeaderboards() {
    for (const path of [
      "/admin/leaderboard",
      "/coach/leaderboard",
      "/player/leaderboard",
      "/player/achievements",
      "/player/dashboard",
      "/admin/daily-report",
    ]) {
      revalidatePath(path);
    }
  }

  // Closing locks the month's scores and awards each group's top two. The order matters:
  // the close row goes in first, because from then on the database refuses score changes,
  // so the awards are ranked from scores that can no longer move. Notifications go last,
  // in one insert, so nobody is told (or emailed, by the notifications webhook) about an
  // award unless the whole close succeeded.
  export async function closeLeaderboardMonth(
    month: string
  ): Promise<{ success: true; awards: number } | { error: string }> {
    const user = await getCurrentUserRole();
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    if (typeof month !== "string" || !isMonth(month)) return { error: "Invalid month" };
    // Cairo's month, not the server's (UTC): around midnight on the 1st they differ
    if (!canCloseMonth(month, cairoMonthKey(new Date()))) {
      return { error: "A month that hasn't started can't be closed" };
    }
    const label = formatMonth(month, "long");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { error: closeErr } = await admin
      .from("leaderboard_month_closes")
      .insert({ month, closed_by: user!.id });
    if (closeErr) {
      // 23505 is the primary key: another admin, or a second click, closed it first
      return { error: closeErr.code === "23505" ? `${label} is already closed` : closeErr.message };
    }

    try {
      const data = await loadLeaderboard(month, null);
      const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
      const awards = monthAwards(data.scores).map((a) => ({ ...a, month, notification_id: randomUUID() }));

      if (awards.length > 0) {
        const { error: awardErr } = await admin.from("leaderboard_awards").insert(awards);
        if (awardErr) throw new Error(awardErr.message);

        // Straight into the table rather than through createNotification, which would
        // send a second email on top of the webhook's
        const { error: notifyErr } = await admin.from("notifications").insert(
          awards.map((a) => ({
            id: a.notification_id,
            user_id: a.player_id,
            ...awardNotification({
              place: a.place,
              groupName: groupName.get(a.group_id) ?? "your group",
              month,
              points: a.points,
              sessions: a.sessions,
            }),
            type: "system",
            link: "/player/achievements",
          }))
        );
        if (notifyErr) throw new Error(notifyErr.message);
      }

      revalidateLeaderboards();
      return { success: true, awards: awards.length };
    } catch (err) {
      // Put the month back as it was: the awards go with the close row
      const { error: undoErr } = await admin.from("leaderboard_month_closes").delete().eq("month", month);
      if (undoErr) console.error(`[king-of-court] could not undo the failed close of ${month}:`, undoErr.message);
      revalidateLeaderboards();
      const reason = err instanceof Error ? err.message : "unknown error";
      return { error: `Couldn't close ${label}: ${reason}` };
    }
  }

  // Reopening deletes the close row. The month's awards go with it (ON DELETE CASCADE) and
  // its scores unlock; closing again awards afresh.
  export async function reopenLeaderboardMonth(month: string): Promise<{ success: true } | { error: string }> {
    const user = await getCurrentUserRole();
    const authErr = requireAdmin(user);
    if (authErr) return authErr;

    if (typeof month !== "string" || !isMonth(month)) return { error: "Invalid month" };
    const label = formatMonth(month, "long");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Read before the delete: the awards, and their notification ids, are about to go
    const { data: awardRows, error: awardErr } = await admin
      .from("leaderboard_awards")
      .select("notification_id")
      .eq("month", month);
    if (awardErr) return { error: awardErr.message };

    const { data: removed, error: reopenErr } = await admin
      .from("leaderboard_month_closes")
      .delete()
      .eq("month", month)
      .select("month");
    if (reopenErr) return { error: reopenErr.message };
    if (!removed || removed.length === 0) return { error: `${label} isn't closed` };

    // Take back the notifications nobody has opened. One that was read stays in the inbox.
    const notificationIds = ((awardRows || []) as { notification_id: string | null }[])
      .map((a) => a.notification_id)
      .filter((id): id is string => id !== null);
    if (notificationIds.length > 0) {
      const { error: notifyErr } = await admin
        .from("notifications")
        .delete()
        .in("id", notificationIds)
        .eq("is_read", false);
      // The month is already open, which is what was asked for: don't report a failure
      if (notifyErr) console.error(`[king-of-court] could not remove ${month}'s award notifications:`, notifyErr.message);
    }

    revalidateLeaderboards();
    return { success: true };
  }
  ```

- [ ] **Step 7: Guard the attendance saves.** In `src/app/_actions/training.ts`:

  Add this import after the `import { revalidatePath } from "next/cache";` line:

  ```ts
  import { closedMonthScoreBlock } from "@/lib/king-of-court/lock";
  ```

  In `submitAttendance`, replace:

  ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Get the schedule session to find the time
  ```

  with:

  ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Moving a scored player away from present deletes their King of Court score. In a
    // closed leaderboard month the database refuses that; refuse here, before the loop
    // below has saved some players and not others.
    const closed = await closedMonthScoreBlock(
      admin,
      data,
      data.records.filter((r) => r.status !== "present").map((r) => r.player_id)
    );
    if (closed) return { error: closed };

    // Get the schedule session to find the time
  ```

  In `removeAttendanceRecords`, replace:

  ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Find existing attendance records for these players (match via schedule_session_id)
  ```

  with:

  ```ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Removing a scored player's attendance deletes their King of Court score. In a closed
    // leaderboard month the database refuses that delete, but only after the credits below
    // had been restored, leaving the player with both the attendance and the credit.
    const closed = await closedMonthScoreBlock(admin, data, data.player_ids);
    if (closed) return { error: closed };

    // Find existing attendance records for these players (match via schedule_session_id)
  ```

- [ ] **Step 8: Verify.** Run `npm test && npx tsc --noEmit && npm run lint`.
  - Expected: all tests pass and there are no new type or lint errors. `LeaderboardView` only reads a `LeaderboardData`, so the new `closedAt` field doesn't break it.
  - The two actions are exercised in the app in Task 4.

- [ ] **Step 9: Commit**

```bash
git add src/lib/king-of-court/lock.ts src/lib/king-of-court/lock.test.ts src/lib/king-of-court/load.ts src/app/_actions/king-of-court.ts src/app/_actions/training.ts
git commit -m "$(cat <<'EOF'
feat(leaderboard): close and reopen a month; saves into a closed month are refused before anything changes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Leaderboard — Closed badge, Close and Reopen for admins, final winner and runner-up

**Files:**
- Modify: `src/components/ui/confirm-dialog.tsx`
- Modify: `src/components/leaderboard/leaderboard-view.tsx` (replace the whole file)
- Modify: `src/app/(portal)/admin/leaderboard/page.tsx`

**Interfaces:**
- Consumes, from Task 3: `closeLeaderboardMonth`, `reopenLeaderboardMonth` from `@/app/_actions/king-of-court`; `LeaderboardData.closedAt`.
- Consumes, from Task 2: `canCloseMonth`, `groupAwardSummary`, `monthAwards` from `@/lib/king-of-court/awards`.
- Produces: `LeaderboardView` accepts a new optional prop `canClose?: boolean`. `ConfirmDialog` accepts a new optional prop `loadingLabel?: string` (default `"Deleting..."`).

- [ ] **Step 1: Let `ConfirmDialog` hold a list and name its own busy state.** Its description is wrapped in a `<p>`, which can't contain the list this dialog needs, and its busy label is fixed at "Deleting...". In `src/components/ui/confirm-dialog.tsx`:

  Replace:

  ```ts
    confirmVariant?: "primary" | "outline" | "danger";
    loading?: boolean;
  }
  ```

  with:

  ```ts
    confirmVariant?: "primary" | "outline" | "danger";
    loading?: boolean;
    /** Shown on the confirm button while `loading` */
    loadingLabel?: string;
  }
  ```

  Replace:

  ```ts
    confirmVariant = "danger",
    loading,
  }: ConfirmDialogProps) {
  ```

  with:

  ```ts
    confirmVariant = "danger",
    loading,
    loadingLabel = "Deleting...",
  }: ConfirmDialogProps) {
  ```

  Replace:

  ```tsx
          {description && (
            <p className="text-sm text-slate-500 mb-5">{description}</p>
          )}
  ```

  with:

  ```tsx
          {/* A div, not a p: the description may hold a list */}
          {description && (
            <div className="text-sm text-slate-500 mb-5">{description}</div>
          )}
  ```

  Replace:

  ```tsx
              {loading ? "Deleting..." : confirmLabel}
  ```

  with:

  ```tsx
              {loading ? loadingLabel : confirmLabel}
  ```

- [ ] **Step 2: Replace** `src/components/leaderboard/leaderboard-view.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown, Lock, Trophy } from "lucide-react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Toast } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { closeLeaderboardMonth, reopenLeaderboardMonth } from "@/app/_actions/king-of-court";
import { openingGroup } from "@/lib/king-of-court/access";
import { canCloseMonth, groupAwardSummary, monthAwards } from "@/lib/king-of-court/awards";
import { buildStandings, groupScores, type Standing } from "@/lib/king-of-court/leaderboard";
import type { LeaderboardData } from "@/lib/king-of-court/load";
import { shiftMonth } from "@/lib/king-of-court/month";
import { formatMonth, joinNames } from "@/lib/king-of-court/format";
import { PlayerBreakdownDrawer } from "./player-breakdown-drawer";

/** Gold, silver and bronze for the top three; everyone else gets a plain badge */
const PODIUM_BADGE: Record<number, string> = {
  1: "bg-amber-400 text-white",
  2: "bg-slate-300 text-slate-700",
  3: "bg-orange-300 text-white",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The King of Court leaderboard, shared by the admin, coach and player portals */
export function LeaderboardView({
  data,
  linkToDailyReport = false,
  canClose = false,
  viewerId,
  noGroups,
}: {
  /** Already limited to the groups this viewer may see */
  data: LeaderboardData;
  /** Admins: the breakdown's sessions open that day's Daily Report, where scores are fixed */
  linkToDailyReport?: boolean;
  /** Admins: the month can be closed and reopened from here */
  canClose?: boolean;
  /** Players: their own row is marked "You" */
  viewerId?: string;
  /** Shown when the viewer has no group on the leaderboard */
  noGroups: { title: string; description: string };
}) {
  const { month, currentMonth, closedAt, groups, scores, players } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isCurrentMonth = month === currentMonth;
  const isClosed = closedAt !== null;
  const monthLabel = formatMonth(month, "long");
  /** "September": for buttons and sentences where the year is already on screen */
  const monthName = monthLabel.split(" ")[0];

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
  // The same function the server awards with, so the confirmation lists who it will award
  const awards = useMemo(() => monthAwards(scores), [scores]);

  const [requestedGroup, setRequestedGroup] = useState<string | null>(() => searchParams.get("group"));
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState<"close" | "reopen" | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [isPending, startTransition] = useTransition();

  // The asked-for tab if this month shows it, else the first group with scores. Re-derived
  // on every render so a month without that group falls back instead of showing nothing.
  const activeGroup = openingGroup(
    groups.map((g) => g.id),
    new Set(rowsByGroup.keys()),
    requestedGroup
  );

  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function goToMonth(next: string) {
    setDrawerOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (next === currentMonth) params.delete("month");
    else params.set("month", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openGroup(groupId: string) {
    setRequestedGroup(groupId);
    setDrawerOpen(false);
    // History API: the open tab survives a refresh without refetching the month
    const params = new URLSearchParams(window.location.search);
    params.set("group", groupId);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  /** After a close or reopen came back: say what happened and show the month as it is now */
  function finish(res: { error: string } | { success: true }, done: string) {
    setDialog(null);
    if ("error" in res) {
      setToast({ message: res.error, variant: "error" });
      // "Already closed" and "isn't closed" mean this page is out of date
      router.refresh();
      return;
    }
    setToast({ message: done, variant: "success" });
    router.refresh();
  }

  function unreachable() {
    setDialog(null);
    setToast({ message: "Couldn't reach the server. Check your connection and try again.", variant: "error" });
    // The request may have landed before the connection dropped
    router.refresh();
  }

  function handleClose() {
    startTransition(async () => {
      try {
        const res = await closeLeaderboardMonth(month);
        finish(res, "awards" in res ? `${monthLabel} closed · ${plural(res.awards, "achievement")} awarded` : "");
      } catch {
        unreachable();
      }
    });
  }

  function handleReopen() {
    startTransition(async () => {
      try {
        finish(await reopenLeaderboardMonth(month), `${monthLabel} reopened`);
      } catch {
        unreachable();
      }
    });
  }

  // On phones the tab row scrolls sideways: keep the open tab in view
  useEffect(() => {
    const bar = tabBarRef.current;
    const tab = activeGroup ? tabRefs.current[activeGroup] : null;
    if (!bar || !tab) return;
    const outOfView =
      tab.offsetLeft < bar.scrollLeft || tab.offsetLeft + tab.offsetWidth > bar.scrollLeft + bar.clientWidth;
    if (outOfView) bar.scrollTo({ left: tab.offsetLeft - 16, behavior: "smooth" });
  }, [activeGroup]);

  const group = groups.find((g) => g.id === activeGroup);
  const standings = (activeGroup && standingsByGroup.get(activeGroup)) || [];
  const groupRows = (activeGroup && rowsByGroup.get(activeGroup)) || [];
  const winners = standings.filter((s) => s.isWinner);
  // Only a closed month has a runner-up: until then second place can still change hands
  const runnersUp = isClosed ? standings.filter((s) => s.rank === 2 && s.total > 0) : [];
  const sessionCount = new Set(groupRows.map((r) => `${r.schedule_session_id}|${r.session_date}`)).size;
  const selectedStanding = selectedPlayer ? standings.find((s) => s.player_id === selectedPlayer) : undefined;
  const showClose = canClose && !isClosed && canCloseMonth(month, currentMonth);
  const showReopen = canClose && isClosed;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Leaderboard</h1>
          <div className="flex items-center shrink-0 rounded-xl border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(shiftMonth(month, -1))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[5.25rem] text-center text-sm font-semibold text-slate-800 tabular-nums">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={month >= currentMonth}
              onClick={() => goToMonth(shiftMonth(month, 1))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* The subtitle, with the month's state beside it; on phones the state wraps under */}
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-slate-500 text-sm">King of Court points by group</p>
          {(isClosed || showClose) && (
            <div className="flex items-center gap-2">
              {isClosed && (
                <Badge variant="neutral">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Closed
                  </span>
                </Badge>
              )}
              {showReopen && (
                <Button variant="outline" className="px-3.5 py-1.5" onClick={() => setDialog("reopen")}>
                  Reopen
                </Button>
              )}
              {showClose && (
                <Button className="px-3.5 py-1.5" onClick={() => setDialog("close")}>
                  Close month
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <div
          ref={tabBarRef}
          role="tablist"
          aria-label="Groups"
          className="relative -mx-4 px-4 sm:mx-0 sm:px-0 flex border-b border-slate-200 mb-5 overflow-x-auto no-scrollbar"
        >
          {groups.map((g) => {
            const isActive = g.id === activeGroup;
            return (
              <button
                key={g.id}
                ref={(el) => { tabRefs.current[g.id] = el; }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => openGroup(g.id)}
                className={cn(
                  "shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  isActive ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

      {!group ? (
        <Card>
          <EmptyState icon={<Trophy className="w-10 h-10" />} title={noGroups.title} description={noGroups.description} />
        </Card>
      ) : standings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="w-10 h-10" />}
            title="No scores logged this month"
            description={
              linkToDailyReport
                ? `Scores for ${group.name} are entered on the Daily Report's Scores tab.`
                : "Points show up here once King of Court games are logged."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {winners.length > 0 && (
            <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-4 sm:p-5">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Crown className="w-6 h-6 text-amber-500" />
              </div>
              <div className="min-w-0">
                {/* "Winner" is official: it only shows once the month is closed */}
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  {isClosed ? "Winner" : "Leading"} · {monthLabel}
                </p>
                <p className="text-lg font-semibold leading-snug text-slate-900">
                  {joinNames(winners.map((w) => nameOf(w.player_id)))}
                </p>
                <p className="text-sm text-slate-500">
                  {winners[0].total} pts · {plural(winners[0].sessions, "session")}
                </p>
                {runnersUp.length > 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    Runner-up:{" "}
                    <span className="font-medium text-slate-700">
                      {joinNames(runnersUp.map((r) => nameOf(r.player_id)))}
                    </span>{" "}
                    · {runnersUp[0].total} pts
                  </p>
                )}
              </div>
            </div>
          )}

          <Card className="p-0 sm:p-0 overflow-hidden">
            <div className="px-4 sm:px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>
                {plural(standings.length, "player")} · {plural(sessionCount, "session")}
              </span>
              <span className="pr-7">Points</span>
            </div>
            <div className="divide-y divide-slate-100">
              {standings.map((s) => {
                const isViewer = s.player_id === viewerId;
                return (
                  <button
                    key={s.player_id}
                    type="button"
                    onClick={() => {
                      setSelectedPlayer(s.player_id);
                      setDrawerOpen(true);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left transition-colors",
                      isViewer ? "bg-primary-50/60 hover:bg-primary-50" : "hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0",
                        (s.total > 0 && PODIUM_BADGE[s.rank]) || "bg-slate-100 text-slate-500"
                      )}
                    >
                      {s.rank}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-sm font-medium text-slate-900">{nameOf(s.player_id)}</span>
                        {isViewer && <Badge variant="info" className="shrink-0">You</Badge>}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {plural(s.sessions, "session")} · best {s.best}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-base font-semibold text-slate-900 tabular-nums">{s.total}</span>{" "}
                      <span className="text-xs text-slate-400">pts</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <PlayerBreakdownDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        playerName={selectedPlayer ? nameOf(selectedPlayer) : ""}
        groupName={group?.name ?? ""}
        month={month}
        standing={selectedStanding}
        scores={groupRows}
        linkToDailyReport={linkToDailyReport}
      />

      <ConfirmDialog
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        onConfirm={handleClose}
        title={`Close ${monthLabel}?`}
        confirmLabel={`Close ${monthName}`}
        confirmVariant="primary"
        loading={isPending}
        loadingLabel="Closing..."
        description={
          <div className="space-y-3">
            {awards.length === 0 ? (
              <p>No scores were logged, so nobody is awarded.</p>
            ) : (
              // Every group at once: scrolls rather than pushing the buttons off a phone
              <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                {groups.map((g) => {
                  const summary = groupAwardSummary(awards, g.id, nameOf);
                  return (
                    <li key={g.id} className="px-3 py-2">
                      <p className="text-xs font-semibold text-slate-700">{g.name}</p>
                      {summary.first ? (
                        <>
                          <p className="text-xs text-slate-500">{summary.first}</p>
                          {summary.second && <p className="text-xs text-slate-500">{summary.second}</p>}
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">No awards</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p>
              Scores for {monthName} can&apos;t be changed until you reopen it
              {awards.length > 0 && ", and these players are notified"}.
            </p>
            {isCurrentMonth && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {monthName} isn&apos;t over. Sessions still to come this month can&apos;t be scored while
                it&apos;s closed.
              </p>
            )}
          </div>
        }
      />

      <ConfirmDialog
        open={dialog === "reopen"}
        onClose={() => setDialog(null)}
        onConfirm={handleReopen}
        title={`Reopen ${monthLabel}?`}
        confirmLabel="Reopen"
        confirmVariant="danger"
        loading={isPending}
        loadingLabel="Reopening..."
        description={`This removes the month's ${plural(awards.length, "achievement")} and lets its scores be edited again. Notifications that players haven't read are removed. Close the month again to re-award.`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Let the admin page close months.** In `src/app/(portal)/admin/leaderboard/page.tsx`, replace:

```tsx
      linkToDailyReport
      noGroups={{
```

  with:

```tsx
      linkToDailyReport
      canClose
      noGroups={{
```

  The coach and player pages are left alone: they don't pass `canClose`, so they get the badge and no buttons.

- [ ] **Step 4: Verify.** Run `npm test && npx tsc --noEmit && npm run lint`. Expected: all tests pass, and no new type or lint errors.

- [ ] **Step 5: Check it in the app on staging.**
  - Run `npm run env` and confirm it reports **staging**. If it reports prod, stop: never click through against prod.
  - Run `npm run dev` and sign in as an admin. Open `/admin/leaderboard` on a month that has scores in at least one group.
  - **Closing:**
    - **Close month** sits beside the subtitle. On a month later than the current one it can't be reached (the ▸ arrow is disabled).
    - The dialog lists every group: "1st: … (N pts)" and "2nd: … (N pts)", or "No awards".
    - On the current month the amber "isn't over" warning shows; on a past month it doesn't.
    - Confirming shows "… closed · N achievements awarded", and N matches the names listed.
    - The header now shows the **Closed** badge and **Reopen**, and the card reads "Winner" with a "Runner-up" line.
  - **A second close is refused cleanly:** open the same month in a second tab before closing, close it in the first, then press Close in the second. Expected: the toast "… is already closed", and the tab refreshes to the closed state.
  - **Reopening:** press **Reopen** and confirm. Expected: "… reopened", the badge goes, and the card reads "Leading" again.
  - **A past month that isn't closed** reads "Leading", not "Winner".
  - **Phone width (375px):** the badge and button wrap under the subtitle, and the dialog's buttons stay on screen with the group list scrolling.
  - **As a coach,** open `/coach/leaderboard` on a closed month. Expected: the Closed badge and the Winner / Runner-up card, and no Reopen or Close button.
  - **An existing dialog still works:** open `/admin/merch/categories`, press delete on a category and cancel. Expected: the dialog looks as it did before, with its text and both buttons.
  - Leave one month **closed** on staging with at least one awarded player you can sign in as. Task 5 and Task 6 need it.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx src/components/leaderboard/leaderboard-view.tsx "src/app/(portal)/admin/leaderboard/page.tsx"
git commit -m "$(cat <<'EOF'
feat(leaderboard): admins close and reopen a month; a closed month shows its winner and runner-up

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Daily Report — the Scores tab is read-only for a closed month

**Files:**
- Modify: `src/app/(portal)/admin/daily-report/_components/scores-tab.tsx`

**Interfaces:**
- Consumes, from Task 1: the table `leaderboard_month_closes`, readable by any signed-in user.
- Consumes, from Task 2: `monthOfDate` from `@/lib/king-of-court/month`.
- Consumes, from Task 3: `saveKingOfCourtScores` returning `{ error, reload: true }` for a closed month.
- Produces: nothing other tasks use.

- [ ] **Step 1: Import what the closed state needs.** Replace these four lines at the top of the file:

```tsx
import { useEffect, useRef, useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Toast } from "@/components/ui";
import { Loader2, Check, Clock, Trash2 } from "lucide-react";
```

  with:

```tsx
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Toast } from "@/components/ui";
import { Loader2, Check, Clock, Lock, Trash2 } from "lucide-react";
```

  And replace:

```tsx
import { formatTime } from "@/lib/king-of-court/format";
```

  with:

```tsx
import { formatMonth, formatTime } from "@/lib/king-of-court/format";
import { monthOfDate } from "@/lib/king-of-court/month";
```

- [ ] **Step 2: Hold the closed state.** Replace:

```tsx
  const [loading, setLoading] = useState(true);
  /** Bumped to reload after the server refused a save because attendance moved on */
```

  with:

```tsx
  const [loading, setLoading] = useState(true);
  /** The date's leaderboard month is closed: its scores are shown but can't be changed */
  const [closed, setClosed] = useState(false);
  const month = monthOfDate(date);
  /** Bumped to reload after the server refused a save because attendance moved on */
```

- [ ] **Step 3: Load it with the rest.** Replace:

```tsx
      const [{ data: attendance }, { data: scores }] = await Promise.all([
```

  with:

```tsx
      const [{ data: attendance }, { data: scores }, { data: closeRow }] = await Promise.all([
```

  Replace the end of that `Promise.all`:

```tsx
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      if (cancelled) return;

      const attendanceRows = (attendance || []) as unknown as {
```

  with:

```tsx
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
        supabase.from("leaderboard_month_closes").select("month").eq("month", month).maybeSingle(),
      ]);

      if (cancelled) return;

      const attendanceRows = (attendance || []) as unknown as {
```

  The snippet to replace is the **second** `.in("schedule_session_id", sessionIds)` in the file (the `king_of_court_scores` query), followed by the closing `]);`.

  Then replace:

```tsx
      setSessions(sessionRows);
      setBySession(next);
      setLoading(false);
```

  with:

```tsx
      setSessions(sessionRows);
      setBySession(next);
      setClosed(!!closeRow);
      setLoading(false);
```

- [ ] **Step 4: Show the notice, and take away the ways to edit.**

  Replace:

```tsx
        onClose={() => setToast(null)}
      />
      {sessions.map((session) => {
```

  with:

```tsx
        onClose={() => setToast(null)}
      />
      {closed && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Lock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-600">
            The {formatMonth(month, "long")} leaderboard is closed, so these scores are read-only.{" "}
            <Link href={`/admin/leaderboard?month=${month}`} className="font-semibold text-primary hover:underline">
              Open the Leaderboard
            </Link>
          </p>
        </div>
      )}
      {sessions.map((session) => {
```

  Replace:

```tsx
                  {changed ? (
                    <Button
```

  with:

```tsx
                  {changed && !closed ? (
                    <Button
```

  Replace:

```tsx
                  {Object.values(s.inputs).some((t) => t.trim() !== "") && (
```

  with:

```tsx
                  {!closed && Object.values(s.inputs).some((t) => t.trim() !== "") && (
```

  Replace:

```tsx
                        aria-invalid={invalid.has(p.id) || undefined}
                        value={s.inputs[p.id] ?? ""}
```

  with:

```tsx
                        aria-invalid={invalid.has(p.id) || undefined}
                        disabled={closed}
                        value={s.inputs[p.id] ?? ""}
```

  Replace:

```tsx
                          "w-16 h-9 px-2 text-right text-sm tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2",
```

  with:

```tsx
                          "w-16 h-9 px-2 text-right text-sm tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500",
```

- [ ] **Step 5: Verify.** Run `npx tsc --noEmit && npm run lint`. Expected: no new errors.

- [ ] **Step 6: Check it in the app on staging.**
  - Run `npm run env` and confirm it reports **staging**.
  - As an admin, open `/admin/daily-report?tab=scores` on a date inside the month left closed in Task 4, with a scored group session:
    - The notice reads "The … leaderboard is closed, so these scores are read-only." and its link opens that month's Leaderboard.
    - Every points box shows its score, greyed, and can't be typed in.
    - There is no Save button and no Clear action. Cards with scores show the "Saved" badge.
  - **Attendance is refused for a scored player.** On the Attendance tab for the same date, mark a player who has a score as absent and save. Expected: the toast "The … leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard." Reload the page: the player is still present.
  - **Attendance removal is refused without restoring a credit.** Note a scored player's remaining sessions, deselect them on the Attendance tab and save. Expected: the same toast. Reload: the player is still present and their remaining sessions are unchanged.
  - **Attendance for an unscored player still saves.** Mark a present player with a blank score box as absent and save. Expected: it saves. Set them back to present afterwards.
  - **A stale tab is refused and reloads.** Open `/admin/daily-report?tab=scores` on a date in an **open** month and type a score without saving. In another tab, close that month from the Leaderboard. Back in the first tab, press Save. Expected: the closed-month toast, and the tab reloads with the notice and the boxes disabled. Reopen that month afterwards.
  - On a date in an open month, the tab looks and saves exactly as before.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/admin/daily-report/_components/scores-tab.tsx"
git commit -m "$(cat <<'EOF'
feat(king-of-court): the Scores tab is read-only for a closed month

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Player portal — Achievements page, dashboard card and nav entry

**Files:**
- Create: `src/lib/king-of-court/awards-load.ts`
- Create: `src/lib/king-of-court/awards-load.test.ts`
- Create: `src/components/achievements/award-card.tsx`
- Create: `src/app/(portal)/player/achievements/page.tsx`
- Create: `src/app/(portal)/player/achievements/loading.tsx`
- Modify: `src/app/(portal)/player/dashboard/page.tsx`
- Modify: `src/components/layout/sidebar-layout.tsx`

**Interfaces:**
- Consumes, from Task 1: the table `leaderboard_awards`, which a player reads under RLS (own rows only).
- Consumes, from Task 2: `awardSummary`, `placeLabel`, `sortAwards`, `type Place` from `@/lib/king-of-court/awards`.
- Produces, from `awards-load.ts`:
  - `interface PlayerAward { id: string; month: string; place: Place; points: number; sessions: number; group_name: string }`
  - `loadPlayerAwards(supabase, playerId: string): Promise<PlayerAward[]>` (throws when the read fails)
  - `loadLatestAwards(supabase, playerId: string, limit: number): Promise<PlayerAward[]>` (never throws)

- [ ] **Step 1: Write the failing tests.** Create `src/lib/king-of-court/awards-load.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLatestAwards, loadPlayerAwards } from "./awards-load";

/** A stand-in for the player's Supabase client: the awards query resolves to this result */
function stubClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => result,
      }),
    }),
  };
}

const rows = [
  { id: "w", month: "2026-08", place: 1, points: 96, sessions: 6, groups: { name: "Women's Team" } },
  { id: "x", month: "2026-09", place: 2, points: 40, sessions: 4, groups: { name: "Mixed" } },
  { id: "y", month: "2026-09", place: 1, points: 142, sessions: 8, groups: { name: "Women's Team" } },
  { id: "z", month: "2026-06", place: 2, points: 30, sessions: 3, groups: null },
];

test("loadPlayerAwards: newest month first, 1st before 2nd, with the group's name", async () => {
  const awards = await loadPlayerAwards(stubClient({ data: rows, error: null }), "p1");
  assert.deepEqual(awards, [
    { id: "y", month: "2026-09", place: 1, points: 142, sessions: 8, group_name: "Women's Team" },
    { id: "x", month: "2026-09", place: 2, points: 40, sessions: 4, group_name: "Mixed" },
    { id: "w", month: "2026-08", place: 1, points: 96, sessions: 6, group_name: "Women's Team" },
    { id: "z", month: "2026-06", place: 2, points: 30, sessions: 3, group_name: "Your group" },
  ]);
});

test("loadPlayerAwards: no awards is an empty list", async () => {
  assert.deepEqual(await loadPlayerAwards(stubClient({ data: [], error: null }), "p1"), []);
  assert.deepEqual(await loadPlayerAwards(stubClient({ data: null, error: null }), "p1"), []);
});

test("loadPlayerAwards: a failed read is thrown, so the Achievements page doesn't show an empty state for it", async () => {
  await assert.rejects(
    loadPlayerAwards(stubClient({ data: null, error: { message: "relation does not exist" } }), "p1"),
    /Could not load your achievements: relation does not exist/
  );
});

test("loadLatestAwards: the newest few", async () => {
  const awards = await loadLatestAwards(stubClient({ data: rows, error: null }), "p1", 3);
  assert.deepEqual(awards.map((a) => a.id), ["y", "x", "w"]);
});

test("loadLatestAwards: a failed read gives no awards, so the dashboard still renders", async () => {
  const awards = await loadLatestAwards(
    stubClient({ data: null, error: { message: "relation does not exist" } }),
    "p1",
    3
  );
  assert.deepEqual(awards, []);
});
```

- [ ] **Step 2: Run and expect FAIL.** Run `npm test`. Expected: `awards-load.test.ts` fails with `Cannot find module './awards-load'`. Everything else passes.

- [ ] **Step 3: Implement** `src/lib/king-of-court/awards-load.ts`:

```ts
// A player's monthly leaderboard awards, for the Achievements page and the dashboard card.
// Read with the player's own client: row-level security limits it to their rows.

import { sortAwards, type Place } from "./awards";

export interface PlayerAward {
  id: string;
  /** YYYY-MM */
  month: string;
  place: Place;
  points: number;
  sessions: number;
  group_name: string;
}

/** A player's awards, newest month first; 1st place before 2nd within a month */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPlayerAwards(supabase: any, playerId: string): Promise<PlayerAward[]> {
  const { data, error } = await supabase
    .from("leaderboard_awards")
    .select("id, month, place, points, sessions, groups(name)")
    .eq("player_id", playerId);
  if (error) throw new Error(`Could not load your achievements: ${error.message}`);

  const rows = (data || []) as {
    id: string;
    month: string;
    place: Place;
    points: number;
    sessions: number;
    groups: { name: string } | null;
  }[];
  // A player holds a handful of awards, so they are sorted here rather than in the query
  return sortAwards(
    rows.map((r) => ({
      id: r.id,
      month: r.month,
      place: r.place,
      points: r.points,
      sessions: r.sessions,
      group_name: r.groups?.name ?? "Your group",
    }))
  );
}

/**
 * The newest few, for the dashboard card. Never throws: the card is an extra, and a
 * problem reading awards must not take the player's dashboard down with it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLatestAwards(supabase: any, playerId: string, limit: number): Promise<PlayerAward[]> {
  try {
    return (await loadPlayerAwards(supabase, playerId)).slice(0, limit);
  } catch (err) {
    console.error("[achievements]", err);
    return [];
  }
}
```

- [ ] **Step 4: Run and expect PASS.** Run `npm test`. Expected: all tests pass. The "failed read" test for `loadLatestAwards` prints one `[achievements]` error line; that is the function logging, not a failure.

- [ ] **Step 5: Create the award card** `src/components/achievements/award-card.tsx`:

```tsx
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { awardSummary, placeLabel } from "@/lib/king-of-court/awards";
import type { PlayerAward } from "@/lib/king-of-court/awards-load";
import { formatMonth } from "@/lib/king-of-court/format";

/** One monthly award on the Achievements page: gold for 1st place, plain for 2nd */
export function AwardCard({ award }: { award: PlayerAward }) {
  const first = award.place === 1;
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 sm:p-6",
        first ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
            first ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
          )}
        >
          <Trophy className="w-6 h-6" />
        </div>
        {/* Not the Badge component: that capitalises every word ("1st Place") */}
        <span
          className={cn(
            "inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap",
            first ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {placeLabel(award.place)}
        </span>
      </div>
      <h3 className="mt-4 font-display text-2xl sm:text-3xl tracking-wide uppercase text-primary-900">
        {formatMonth(award.month, "long")}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        {award.group_name} · {awardSummary(award.points, award.sessions)}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Create the page** `src/app/(portal)/player/achievements/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { Card, EmptyState } from "@/components/ui";
import { AwardCard } from "@/components/achievements/award-card";
import { loadPlayerAwards } from "@/lib/king-of-court/awards-load";

export default async function PlayerAchievementsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const supabase = await createClient();
  const awards = await loadPlayerAwards(supabase, currentUser.id);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Achievements</h1>
        <p className="text-slate-500 text-sm">Your monthly leaderboard awards.</p>
      </div>

      {awards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Award className="w-10 h-10" />}
            title="No achievements yet"
            description="Finish in the top 2 of your group's monthly leaderboard to earn one."
            action={
              <Link
                href="/player/leaderboard"
                className="text-sm font-semibold text-primary-800 hover:text-primary-900"
              >
                View the leaderboard →
              </Link>
            }
          />
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Monthly awards</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {awards.map((award) => (
              <AwardCard key={award.id} award={award} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create the loading state** `src/app/(portal)/player/achievements/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui";

export default function PlayerAchievementsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-3 w-28 mb-3" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add the dashboard card.** In `src/app/(portal)/player/dashboard/page.tsx`:

  Replace:

```tsx
import {
  CalendarDays,
  Clock,
  Package,
  TrendingUp,
  MessageSquare,
  Star,
  AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { Subscription } from "@/types/database";
import { PendingPaymentCard } from "./_components/pending-payment-card";
```

  with:

```tsx
import {
  CalendarDays,
  Clock,
  Package,
  TrendingUp,
  MessageSquare,
  Star,
  AlertTriangle,
  Award,
  Trophy,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { placeLabel } from "@/lib/king-of-court/awards";
import { loadLatestAwards } from "@/lib/king-of-court/awards-load";
import { formatMonth } from "@/lib/king-of-court/format";
import type { Subscription } from "@/types/database";
import { PendingPaymentCard } from "./_components/pending-payment-card";
```

  Replace:

```tsx
    .maybeSingle();

  let daysRemaining: number | null = null;
```

  with:

```tsx
    .maybeSingle();

  // Never throws: the dashboard renders without the card if awards can't be read
  const latestAwards = await loadLatestAwards(supabase, currentUser.id, 3);

  let daysRemaining: number | null = null;
```

  Replace:

```tsx
      {/* Renewal / Warning Banners */}
```

  with:

```tsx
      {/* Achievements: only for players who have one */}
      {latestAwards.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-primary-700/50" />
              Achievements
            </h2>
            <Link
              href="/player/achievements"
              className="text-sm font-semibold text-primary-800 hover:text-primary-900 whitespace-nowrap"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {latestAwards.map((award) => (
              <div key={award.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    award.place === 1 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                  )}
                >
                  <Trophy className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-900">
                    {placeLabel(award.place)} · {formatMonth(award.month, "long")}
                  </p>
                  <p className="text-xs text-primary-700/60 truncate">
                    {award.group_name} · {award.points} pts
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Renewal / Warning Banners */}
```

- [ ] **Step 9: Add the nav entry.** In `src/components/layout/sidebar-layout.tsx`:

  Replace:

```tsx
  ChevronRight,
  Trophy,
} from "lucide-react";
```

  with:

```tsx
  ChevronRight,
  Trophy,
  Award,
} from "lucide-react";
```

  Replace:

```tsx
  leaderboard: Trophy,
} as const;
```

  with:

```tsx
  leaderboard: Trophy,
  achievements: Award,
} as const;
```

  Replace:

```tsx
  { key: "leaderboard", label: "Leaderboard", href: "/player/leaderboard", section: "Competitions", badge: "New" },
```

  with:

```tsx
  { key: "leaderboard", label: "Leaderboard", href: "/player/leaderboard", section: "Competitions", badge: "New" },
  { key: "achievements", label: "Achievements", href: "/player/achievements", section: "Competitions", badge: "New" },
```

- [ ] **Step 10: Verify.** Run `npm test && npx tsc --noEmit && npm run lint`. Expected: all tests pass, including the nav tests in `src/lib/nav/sections.test.ts`, and no new type or lint errors.

- [ ] **Step 11: Check it in the app on staging.**
  - Run `npm run env` and confirm it reports **staging**.
  - Sign in as a player awarded in the month left closed in Task 4:
    - The bell shows "You won the … King of Court for …" (or "You finished 2nd in the …"), and it opens `/player/achievements`.
    - The sidebar has **Achievements** under Competitions, with the award icon and a "New" tag.
    - The page shows a "Monthly awards" grid. A 1st-place card has the amber border, wash, trophy tile and "1st place" pill; a 2nd-place card is white with a grey tile and "2nd place" pill. Each reads the month in capitals, then "Group · N points from M sessions".
    - At 375px the cards stack in one column; from 640px they sit two across.
    - The dashboard has an **Achievements** card under the two-column grid, with up to three rows and "View all →".
  - Sign in as a player with no awards:
    - `/player/achievements` shows "No achievements yet" and the link to the leaderboard.
    - The dashboard has no Achievements card and otherwise looks as before.
  - As the admin, **reopen** the month. As the awarded player: the unread notification is gone, the Achievements page is empty and the dashboard card is gone. Close the month again and check all three come back.

- [ ] **Step 12: Commit**

```bash
git add src/lib/king-of-court/awards-load.ts src/lib/king-of-court/awards-load.test.ts src/components/achievements/award-card.tsx "src/app/(portal)/player/achievements/page.tsx" "src/app/(portal)/player/achievements/loading.tsx" "src/app/(portal)/player/dashboard/page.tsx" src/components/layout/sidebar-layout.tsx
git commit -m "$(cat <<'EOF'
feat(achievements): players see their monthly awards on an Achievements page and their dashboard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verification & wrap-up

**Files:** none new.

- [ ] **Step 1: Full checks.**
  - Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && bash scripts/db/test-king-of-court.sh staging`
  - Expected: all green. `next build` lists `/player/achievements`.
- [ ] **Step 2: Walk through the spec's edge-case table** on staging. Each row must behave as written. Pay particular attention to:
  - a tie for 1st in a group awards both players 1st place and nobody 2nd, in the dialog and on the players' pages;
  - a player awarded in two groups in one month has two cards and two notifications;
  - reopening and closing again after editing a score re-awards from the new scores;
  - a refused attendance removal in a closed month leaves the player's remaining sessions unchanged.
- [ ] **Step 3: Leave staging tidy.** Reopen any month closed only for testing, unless the user wants it left closed.
- [ ] **Step 4: Hand off.** Report the results with the output of the commands above, and state these two things plainly:
  - `supabase/migrations/20260930000000_leaderboard_month_close.sql` must be applied to production by hand **before** this branch deploys. Without it, attendance and score saves are refused in production. It is safe to apply early.
  - In production the notifications webhook emails every new notification, so awarded players are emailed when a month is closed.

  Then use superpowers:finishing-a-development-branch.
