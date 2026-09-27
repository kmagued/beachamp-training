# King of Court Scores & Monthly Leaderboard — Design

**Date:** 2026-09-28
**Status:** Approved (design); spec awaiting review
**Branch:** `feat/king-of-court`, cut from `main` at `74e7e4ba`

## Summary

Group sessions can end with a King of Court game. Admins can optionally log each
player's points for that game from the Daily Report. The points add up over the
calendar month, and each group gets a monthly leaderboard whose top player is that
group's winner of the month.

- A new **Scores** tab on the Daily Report. It lists only players saved as present in
  each group session, with a points box each.
- A new admin page, **Competitions → Leaderboard** (`/admin/leaderboard`), with one tab per
  group for the chosen month. Tapping a player opens a per-session breakdown. *(Revised
  2026-09-28 at the user's request: it was Training → King of Court, with stacked group
  cards and a pinned chip bar.)*
- Admin-only throughout. Coaches and players see nothing new.

## Decisions (settled during brainstorming)

1. **Only admins can see and enter scores.** There is no coach or player view, so RLS
   is admin-only.
2. **The score is points per player:** a whole number from 0 to 999 for each present
   player in a session.
   - **Blank** means the player didn't take part in the game, and no row is stored.
   - **0** means they played and scored nothing. It is stored and counts as a session
     played.
3. **Only group sessions are scored.** Private sessions never appear.
4. **Only players saved as present can hold a score.** The server action and the
   database both enforce this.
5. **Removing a player's attendance, or changing it away from present, deletes their
   score** for that session, using a database trigger. The leaderboard therefore never
   counts someone who wasn't there.
6. **Monthly totals follow the calendar month of `session_date`.**
7. **A score stays with the group it was logged under.** `group_id` is copied onto the
   score row when it's saved. Moving a player to another group, or editing a session's
   group later, doesn't move points between leaderboards.
8. **Ranking:**
   - Highest total first.
   - Players level on points are ranked by **fewer sessions played** (higher average).
   - Players still tied **share the rank** (1, 1, 3) and are co-winners.
   - No winner is shown when the top total is 0.
9. **Storage is a new table, `king_of_court_scores`.** Adding a column to `attendance`
   was rejected: that table drives session deductions and billing.
10. **Scores are entered in their own Daily Report tab**, not inline in the Attendance
    cards, which keeps them out of the save that deducts sessions and creates payments.
11. **The Scores tab layout uses number boxes** (option 1). Steppers and a variant with
    month-to-date context under each name were rejected.
12. **The leaderboard page is called "Leaderboard"** and sits in a new sidebar section,
    **Competitions**, placed after Training. Training already has too many entries, and
    competitions will join this section later. **Each group is a tab**,
    showing one group at a time. On top of that:
    - A card highlights the leader or winner.
    - The ranking is a list that works on phones: rank badge, name, "N sessions · best
      X" and points.
    - Tapping a player row opens a drawer with their per-session breakdown.

    This revises the original choice of stacked group cards with a pinned chip bar, at the
    user's request.

## Existing context (verified)

- **Daily Report:** `src/app/(portal)/admin/daily-report/page.tsx`.
  - It is a client page with `TABS` (attendance, coaches, expenses, payments).
    `activeTab` is local state and doesn't appear in the URL.
  - The date comes from `?date=`.
  - Each tab is a client component in `_components/` that loads its own data with the
    browser Supabase client.
- **Session list for a date:** both `attendance-tab.tsx` and `coaches-tab.tsx` query
  `schedule_sessions` by `day_of_week` and `is_active`, then filter as follows.
  - Private sessions must have `end_date === date`.
  - Recurring sessions are dropped if `end_date < date` or `created_at > date`.
  - Cancelled dates (`schedule_session_cancellations`) are **not** filtered on the Daily
    Report today.
- **`session_type`** is either `'group'` (with `group_id`) or `'private'` (with no
  `group_id`).
- **The `attendance` table:**
  - It has `player_id`, `group_id` (nullable), `session_date`, `status`
    (present/absent/excused) and `schedule_session_id`.
  - It is unique on `(player_id, COALESCE(group_id, 0-uuid), session_date,
    schedule_session_id)`.
  - `log_attendance_with_deduction` (migration `20260905000000`) **updates rows in
    place** when attendance is re-saved or a status changes. It never deletes and
    re-inserts.
  - `removeAttendanceRecords` in `src/app/_actions/training.ts` **deletes** rows.
  - `updateAttendanceRecord` updates `status` using the caller's own client (coach or
    admin), not the admin client.
- **`schedule_sessions` deletes are soft** (`is_active = false`).
- **The closest precedent is `coach_attendance`** (migration `20260925000000`):
  - a unique key on `(coach_id, schedule_session_id, session_date)`;
  - an `update_updated_at()` trigger;
  - an admin-only RLS policy;
  - `submitCoachAttendance`, which checks `requireAdmin`, then writes with the admin
    client using an upsert on the unique key plus a delete for rows the admin cleared.
- **Server actions** each copy the `getCurrentUserRole()` and `requireAdmin()` helpers
  locally, as in `expenses.ts` and `training.ts`.
- **Admin pages** use a server `page.tsx` that fetches data (paging at the PostgREST
  1000-row cap) and a client component that renders it. The model is
  `admin/merch/analytics/page.tsx`.
- **Cairo dates:** `src/lib/utils/cairo-time.ts` provides `cairoToday()` and
  `cairoMonthKey()`. `session_date` is a `DATE`, so month bucketing needs no timezone
  maths.
- **UI kit** (`src/components/ui`): `Card`, `Badge`, `Button`, `Toast`, `Drawer` (a side
  panel on desktop, with `title`, `footer` and `width`), `Select` and `EmptyState`.
  Icons come from `lucide-react` (^0.468, which includes `Trophy` and `Crown`).
- **Nav:** the `adminNav` array in `src/components/layout/sidebar-layout.tsx`, with an
  icon map keyed by nav `key`. The "Training" section holds Schedule, Schedule Photos,
  Daily Report and others.
- **Tests:** `npm test` runs `tsx --test src/lib/merch/*.test.ts src/lib/nav/*.test.ts`
  (Node's built-in runner, Node v20.19).
- **Types:** `src/types/database.ts` is hand-maintained.

## Architecture

### 1. Database — `supabase/migrations/20260928000000_king_of_court_scores.sql`

```sql
CREATE TABLE king_of_court_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  -- The session's group at the time of scoring. Copied rather than joined so that
  -- editing a session's group later never moves points between leaderboards.
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  points              INTEGER NOT NULL CHECK (points BETWEEN 0 AND 999),
  entered_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One score per player per session occurrence; re-saving upserts
  UNIQUE (player_id, schedule_session_id, session_date)
);

CREATE INDEX idx_kotc_scores_group_date ON king_of_court_scores(group_id, session_date);
CREATE INDEX idx_kotc_scores_session ON king_of_court_scores(schedule_session_id, session_date);

CREATE TRIGGER king_of_court_scores_updated_at
  BEFORE UPDATE ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

Re-saving attendance leaves scores alone. The attendance function updates the row in
place, and the trigger only acts when a player moves away from `present` or is deleted.

Also add `king_of_court_scores` (Row, Insert and Update) to `src/types/database.ts`.

### 2. Pure logic — `src/lib/king-of-court/`

These are framework-free modules, tested with `node:test`, following the `src/lib/merch/*`
pattern.

**`points.ts`**
- `parsePoints(input: string): number | null | "invalid"`.
  - It trims the input first.
  - `""` returns `null` (blank).
  - A whole number from `0` to `999` returns that number.
  - Anything else returns `"invalid"`: decimals, negative numbers, values above 999, or
    text.
- Both the Scores tab and the server action use it.

**`save.ts`**
- `buildSavePayload` turns a card's boxes into scores, cleared players and invalid
  players.
- `hasUnsavedChanges` decides whether the card shows Save or the "Saved" badge.
- `checkScoreSave` is the server's validation.

**`month.ts`**
- `parseMonthParam(param: string | undefined, fallback: string): string` returns a valid
  `YYYY-MM`, or `fallback` if the parameter isn't one.
- `monthRange("2026-09")` returns `{ from: "2026-09-01", to: "2026-10-01" }` (end
  exclusive).
- `shiftMonth("2026-01", -1)` returns `"2025-12"`.

**`format.ts`**
- `formatMonth("2026-09")` returns `"Sep 2026"`.
- `formatDay("2026-09-03")` returns `"Thu 3 Sep"`.
- `formatTime("18:00:00")` returns `"6:00 PM"`.
- `ordinal(2)` returns `"2nd"`.
- `joinNames` joins co-winners, for example `"A & B"` or `"A, B & C"`.

**`leaderboard.ts`**
```ts
export interface ScoreRow {
  player_id: string;
  group_id: string;
  schedule_session_id: string;
  session_date: string;   // YYYY-MM-DD
  start_time: string;     // HH:MM:SS, from schedule_sessions
  points: number;
}

export interface Standing {
  player_id: string;
  total: number;
  sessions: number;       // rows, including 0-point ones
  best: number;
  rank: number;           // competition ranking: 1, 1, 3
  isWinner: boolean;      // rank === 1 && total > 0
}

export interface BreakdownRow {
  schedule_session_id: string;
  session_date: string;
  start_time: string;
  points: number;
  place: number;          // competition ranking within that session occurrence
  fieldSize: number;      // players scored in that occurrence
}

/** Standings for one group's month of scores. Ties on total break on fewer sessions; still tied share the rank. */
export function buildStandings(scores: ScoreRow[]): Standing[];

/** One player's scored sessions in a group's month, oldest first, with their place in each. */
export function playerBreakdown(scores: ScoreRow[], playerId: string): BreakdownRow[];
```
- `buildStandings` works on one group's rows; the caller groups the rows by `group_id`.
- Standings sort by rank, then by player name. The client applies the name order, since
  names aren't part of `ScoreRow`.
- A session occurrence means the pair `(schedule_session_id, session_date)`.

### 3. Server action — `src/app/_actions/king-of-court.ts`

```ts
export async function saveKingOfCourtScores(data: {
  schedule_session_id: string;
  session_date: string;
  scores: { player_id: string; points: number }[];
  /** Players whose box was cleared: their saved rows are deleted */
  cleared_player_ids: string[];
}): Promise<{ success: true } | { error: string }>;
```

The action runs these steps in order:
1. Check the caller with `getCurrentUserRole()` and `requireAdmin()`, copied locally as
   in `expenses.ts`.
2. Reject future dates, comparing `session_date` with `cairoToday()`.
3. Load the session with the admin client. Reject it unless it exists and has
   `session_type = 'group'`.
4. Check every `points` value with `parsePoints` rules. Any value outside 0–999, or
   not a whole number, rejects the whole save.
5. Load the `attendance` rows with status `present` for this session and date, and
   reject the save if any scored player isn't among them. The message names how many
   players weren't present. The database trigger enforces the same rule, but this check
   gives a readable error.
   - Each score's `group_id` comes from that player's attendance row, which records the
     group they attended under. If the attendance row has no `group_id`, the session's
     is used. It never comes from the client.
   - Using the attendance row means re-saving an old session after its group was
     edited can't move points to the new group.
6. Delete the rows for `cleared_player_ids`, then upsert the scores on
   `player_id,schedule_session_id,session_date`, with `entered_by` set to the caller.
7. Call `revalidatePath("/admin/daily-report")` and `revalidatePath("/admin/leaderboard")`.

### 4. Daily Report — new Scores tab

**`page.tsx`**
- Add a `{ key: "scores", label: "Scores", icon: Trophy }` tab, placed after
  Attendance.
- Take the starting `activeTab` from `?tab=`, falling back to `attendance` for unknown
  values.
- When the tab changes, update `?tab=` in the URL, the same way `setSelectedDate` does
  for `?date=`. Drop the parameter when it goes back to `attendance`.

**`_components/scores-tab.tsx`** (new)

It loads its data as follows:
- Group sessions for the date, using the same `day_of_week`, `end_date` and `created_at`
  filter as the other tabs, restricted to `session_type = 'group'`. It shares the other
  tabs' behaviour on cancelled dates.
- Attendance rows for those sessions on that date, of **any** status, including player
  names.
  - A session with no rows has "no attendance saved".
  - The rows with `status = 'present'` make up the score list.
- Existing `king_of_court_scores` for those sessions on that date.

Each session is shown as a card that is always open. Cards list only the present
players, so they stay short and there's no collapse toggle.
- **Header:** group name, level badge, time and location. On the right it shows
  "N/M scored" and a Save button, or a "Saved" badge when nothing has changed. This
  matches the Attendance and Coaches tabs.
- **No attendance saved** for the session: show "Log attendance first" with a button
  that switches to the Attendance tab.
- **Attendance saved but nobody present:** show "No players marked present".
- **Otherwise:** a "PRESENT (N)" sub-header with a Clear action that blanks every box,
  then one row per present player, ordered by name. Rows never reorder while you type.
  - Each row shows initials, the name and a number box on the right.
  - The number box has `inputMode="numeric"`, `pattern="[0-9]*"` and an empty
    placeholder.
  - Enter moves the focus to the next box.
  - An invalid value (anything `parsePoints` rejects) gives the box a red border and
    disables Save for that card.
- **Save** sends the non-blank boxes as `scores` and the boxes that were saved but are
  now blank as `cleared_player_ids`. It shows a toast on success or error, as the other
  tabs do.
- A small legend under the list reads: "Blank = didn't play · 0 = played, no points".

### 5. Leaderboard page — `src/app/(portal)/admin/leaderboard/`

**`page.tsx`** (server)
- Read `?month=` with `parseMonthParam(param, cairoMonthKey(new Date()))`.
- Fetch the month's scores, paged at 1000 rows and filtered to
  `session_date >= from AND < to`. Include:
  - `schedule_sessions(start_time)`;
  - player names through `profiles!king_of_court_scores_player_id_fkey(first_name, last_name)`.
- Fetch the groups: `is_active = true`, plus any group that appears in that month's
  scores. Sort by name.
- Pass everything to the client component.

**`loading.tsx`** shows a skeleton: header, tab row, leader card and list.

**`_components/leaderboard-client.tsx`**
- **Header:**
  - The title "Leaderboard", with the month picker `◂ Sep 2026 ▸` on the right. ▸ is
    disabled at the current Cairo month. Changing the month pushes `?month=` and keeps
    `?group=`.
  - The subtitle "King of Court points by group" goes on its own line below, so it
    doesn't wrap on phones.
- **Group tabs,** in the Daily Report's underline style:
  - The row scrolls sideways on phones and keeps the open tab in view.
  - Opening a tab updates `?group=<id>` with `window.history.replaceState`.
  - The page opens the tab named in `?group=`, else the first group with scores that
    month, else the first group.
- **Leader card** (amber):
  - It shows "Leading · September 2026" for the current month, or "Winner · …" for past
    months.
  - It names the winner or co-winners, joined as "A & B", with points and sessions.
  - It is hidden when nobody has more than 0 points.
- **Ranked list,** with a header row reading "N players · M sessions":
  - Each row is a button showing a rank badge (gold, silver or bronze for the top three
    when points are above 0), the name, "N sessions · best X", the points and a `›`.
- A group with no scores in the month shows "No scores logged this month" and points to
  the Daily Report's Scores tab.
- Standings come from `buildStandings`, applied to the open group's rows.

**`_components/player-breakdown-drawer.tsx`** uses `Drawer` (a bottom sheet on phones)
with the player's name as its title.
- **Subtitle:** group name and month, for example "Group A · September 2026".
- **Stat row:** Rank, Points, Sessions and Best.
- **SESSIONS list:** one two-line row per `playerBreakdown` entry, oldest first.
  - The left side shows the date over the time.
  - The right side shows the points over the place, for example "2nd of 9".
  - Each row links to `/admin/daily-report?date=<session_date>&tab=scores`.

**Nav:**
- Add `{ key: "leaderboard", label: "Leaderboard", href: "/admin/leaderboard",
  section: "Competitions" }` as a new section after Training in the `adminNav` array.
- Map the `Trophy` icon to it in the icon map.

## Edge cases

| Case | Behaviour |
|---|---|
| Attendance for the session not saved yet | The Scores card says "Log attendance first", and nothing can be entered. |
| A player is removed from attendance, or changed to absent or excused, after scoring | The trigger deletes that score, and the leaderboard drops it at the next load. |
| Attendance re-saved with no status change | The row updates in place, so the score is kept. |
| Two admins save the same session | Last write wins for each player, because of the upsert on the unique key. |
| A save includes a player who isn't present, e.g. a stale tab | The action rejects the whole save with a readable error, and the tab reloads. |
| The player moves to another group mid-month | Earlier points stay on the old group's board, and new points go to the new group. |
| The session's group is edited later | Scores already logged keep their stored `group_id`. |
| The group is deactivated | It still appears for any month where it has scores. |
| The schedule session is soft-deleted | Its rows remain, and past months still count them. |
| Everyone in a group scored 0 | Ranks are shown, and there is no crown or winner line. |
| Two players tie on points and sessions | They share the rank and are listed as co-winners. |
| A future date on the Daily Report | Nothing can be scored: attendance for future dates is already refused, and the action also rejects the date. |

## Testing

- **Unit tests** (`node:test` through `tsx`), added to the `npm test` glob as
  `src/lib/king-of-court/*.test.ts`:
  - `points.test.ts`:
    - blank input, `0`, `999` and `1000`;
    - negative numbers, decimals, text and surrounding whitespace.
  - `month.test.ts`:
    - range across a year boundary;
    - `shiftMonth` in both directions;
    - rejecting bad parameters (`2026-13`, `abc`, `undefined`).
  - `leaderboard.test.ts`:
    - totals, session counts and best, with a 0-point session counting as played;
    - the tiebreak on fewer sessions;
    - a full tie sharing the rank (1, 1, 3) and producing co-winners;
    - no winner when the top total is 0;
    - `playerBreakdown` date order, and `place` and `fieldSize` including ties.
- **Migration check on staging:**
  - Apply the migration and insert a score for a present player.
  - Confirm that inserting a score for an absent player fails.
  - Confirm that deleting the attendance row, or setting it to `absent`, removes the
    score.
  - Confirm that re-saving attendance as `present` keeps the score.
- **Manual check in the running app:**
  - Enter scores on the Daily Report and check the leaderboard totals, the tiebreak
    order and the drawer.
  - Follow a drawer link to the right date and tab.
  - Check that the group tabs switch the list, keep `?group=` on refresh and month
    change, and work at phone width.

## Out of scope

- Any coach- or player-facing view, and any notification or announcement of winners.
- Scoring private sessions, and scoring from the coach portal.
- All-time or multi-month leaderboards, and a history of past winners beyond using the
  month picker.
- Filtering cancelled session dates out of the Daily Report. That is existing behaviour
  shared by every tab.
