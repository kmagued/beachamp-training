# Closing a Leaderboard Month & Player Achievements — Design

**Date:** 2026-09-30
**Status:** Approved (design); spec awaiting review
**Branch:** `feat/leaderboard-achievements`, cut from `main` at `b0f3324d`

## Summary

An admin closes a leaderboard month with a button on the Leaderboard. Closing locks that
month's King of Court scores and awards an achievement to the top two players of every
group. Players see their achievements on a new Achievements page and on their dashboard,
and get a notification when they are awarded. An admin can reopen a closed month to fix
scores, which removes that month's achievements until it is closed again.

- **Admin Leaderboard** (`/admin/leaderboard`): a **Close month** button, and for a closed
  month a **Closed** badge and a **Reopen** button.
- **Daily Report → Scores:** read-only for a closed month.
- **Player portal:** a new **Achievements** page under Competitions, and an Achievements
  card on the dashboard.
- **Coach and player Leaderboards:** show the Closed badge and the final winner and
  runner-up. They get no buttons.

## Decisions (settled during brainstorming)

1. **Closing locks the month; an admin can reopen it.** While a month is closed its
   scores can't be added, changed or removed. Reopening removes the month's achievements
   and unlocks scoring. Closing again awards afresh. Achievements therefore always match
   the leaderboard. A snapshot that leaves scores editable, and a permanent lock, were
   both rejected.
2. **One button closes the whole month, for every group at once.** Closing per group was
   rejected.
3. **Any month up to the current one can be closed**, including the current month before
   it ends. The confirmation warns when the month isn't over. Future months can't be
   closed.
4. **The top two of each group are awarded**, using the existing ranking:
   - everyone ranked 1st gets a 1st-place award and everyone ranked 2nd a 2nd-place
     award, so ties share the award;
   - ranks 1, 1, 3 give two 1st-place awards and no 2nd place;
   - ranks 1, 2, 2 give one 1st-place award and two 2nd-place awards;
   - a player with 0 points is never awarded.
5. **Only admins close and reopen.**
6. **Players see achievements on a dashboard card and a full page.** The page follows the
   mockup the user supplied (see "Achievements page" below).
7. **This build covers monthly awards only.** The mockup's stat tiles, Badges section and
   "Share this award" button are left for later builds.
8. **Awarded players get an in-app notification** linking to the Achievements page.
   Reopening removes the ones not yet read.
9. **A change that would alter a closed month's scores is refused**, including an
   attendance change that would delete a score (see "Attendance in a closed month").
   Letting attendance through and cleaning up on reopen was offered and declined.
10. **Awards are stored in their own tables**, `leaderboard_month_closes` and
    `leaderboard_awards`. A generic achievements table was rejected because badges aren't
    designed yet and unlock differently. Recomputing awards from scores on every page
    load was rejected because it re-ranks every closed month and leaves nothing to attach
    a notification to.

## Existing context (verified)

- **Leaderboard loading:** `loadLeaderboard(monthParam, allowedGroupIds)` in
  `src/lib/king-of-court/load.ts` reads with the service role and returns
  `{ month, currentMonth, groups, scores, players }`. Passing `null` for the allowed groups
  means every group with `in_leaderboard` on.
- **Ranking:** `buildStandings(scores)` in `src/lib/king-of-court/leaderboard.ts` ranks one
  group's rows and returns `rank` (competition ranking: 1, 1, 3) and `total` for each
  player. `groupScores(scores)` splits a month's rows by group.
- **Leaderboard UI:** `src/components/leaderboard/leaderboard-view.tsx` is one client
  component shared by the admin, coach and player pages. Its leader card reads "Leading"
  for the current month and "Winner" for any past month.
- **Score writes:** `saveKingOfCourtScores` in `src/app/_actions/king-of-court.ts` is the
  only writer in the app. It deletes cleared players' rows, then upserts the rest.
- **Scores tab:** `src/app/(portal)/admin/daily-report/_components/scores-tab.tsx` loads
  with the browser Supabase client. A save that returns `{ error, reload: true }` makes
  the tab reload.
- **Attendance changes that delete scores:** the trigger `attendance_drop_kotc_score`
  deletes a player's score when their attendance row is deleted or moves away from
  `present`. Three actions in `src/app/_actions/training.ts` reach it:
  - `submitAttendance` calls the `log_attendance_with_deduction` RPC once per player, in a
    loop. An error stops the loop and leaves the earlier players saved.
  - `removeAttendanceRecords` restores the players' session credits first, then deletes
    the attendance rows.
  - `updateAttendanceRecord` runs a single update with the caller's own client. Nothing
    calls it today.
- **Hard deletes:** players are deleted through `auth.admin.deleteUser`
  (`admin/players/[id]/actions.ts`), which cascades to `profiles`, `attendance` and
  `king_of_court_scores`. `deleteGroup` refuses a group that has attendance rows. Schedule
  sessions are soft-deleted.
- **Notifications:** the `notifications` table has `user_id`, `title`, `body`, `type`,
  `link` and `is_read`. `type` is limited by a CHECK to six values; `'system'` is the
  general one.
  - `createNotification` in `src/app/_actions/notifications.ts` inserts a row and always
    sends an email.
  - The database trigger `trg_notification_email` also posts every new row to the app's
    email webhook. `docs/dev-environment.md` records that webhook as live in production
    and an inert stub on staging.
- **Month helpers:** `src/lib/king-of-court/month.ts` writes months as `"YYYY-MM"`.
  `formatMonth(month, "long")` in `format.ts` gives "September 2026", and `ordinal(2)`
  gives "2nd".
- **Player portal:** `src/app/(portal)/player/dashboard/page.tsx` is a server page that
  reads with the player's own client. The `playerNav` array in
  `src/components/layout/sidebar-layout.tsx` has a Competitions section holding
  Leaderboard.
- **Groups are readable by any signed-in user** (RLS policy in
  `20260218000000_phase1_foundation.sql`), so a player can join an award to its group
  name.
- **UI kit:** `ConfirmDialog` (`title`, `description` as a node, `confirmLabel`,
  `confirmVariant`, `loading`), `Badge`, `Button`, `Card`, `Toast` and `EmptyState`.
  `lucide-react` includes `Award`, `Trophy` and `Lock`.
- **Tests:** `npm test` already globs `src/lib/king-of-court/*.test.ts`. Database tests
  live in `scripts/db/test-king-of-court.sql`, run against staging in a transaction that
  always rolls back.

## Architecture

### 1. Database — `supabase/migrations/20260930000000_leaderboard_month_close.sql`

```sql
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
```

**Row-level security**

| Table | Policy |
|---|---|
| `leaderboard_month_closes` | Any signed-in user can read. Admins can do everything. |
| `leaderboard_awards` | A player can read their own rows (`player_id = auth.uid()`). Admins can do everything. |

**The lock: a trigger on `king_of_court_scores`**

```sql
CREATE FUNCTION kotc_refuse_closed_month() RETURNS TRIGGER AS $$
DECLARE
  d DATE;
BEGIN
  -- A player, group or session being deleted takes its scores with it, closed month or not
  IF TG_OP = 'DELETE' AND (
       NOT EXISTS (SELECT 1 FROM profiles WHERE id = OLD.player_id)
    OR NOT EXISTS (SELECT 1 FROM groups WHERE id = OLD.group_id)
    OR NOT EXISTS (SELECT 1 FROM schedule_sessions WHERE id = OLD.schedule_session_id)
  ) THEN
    RETURN OLD;
  END IF;

  -- Wait for a close that is being written, and make a close wait for this write, so the
  -- awards are never ranked from scores that change a moment later
  LOCK TABLE leaderboard_month_closes IN SHARE MODE;

  FOREACH d IN ARRAY CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.session_date]
      WHEN 'DELETE' THEN ARRAY[OLD.session_date]
      ELSE ARRAY[OLD.session_date, NEW.session_date]
    END
  LOOP
    IF EXISTS (SELECT 1 FROM leaderboard_month_closes WHERE month = to_char(d, 'YYYY-MM')) THEN
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

- It is `SECURITY DEFINER` so that it can read and lock `leaderboard_month_closes`
  whoever the caller is.
- The cascade exemption works because a cascading delete runs after its parent row is
  gone, so the trigger no longer finds the parent.
- The existing trigger `attendance_drop_kotc_score` deletes scores, so in a closed month
  that delete raises and the attendance change that caused it is rolled back with it.

Also add both tables (Row, Insert, Update) and the aliases `LeaderboardMonthClose` and
`LeaderboardAward` to `src/types/database.ts`.

### 2. Pure logic — `src/lib/king-of-court/awards.ts`

Framework-free and tested with `node:test`, like the rest of `src/lib/king-of-court/`.

```ts
export type Place = 1 | 2;

export interface Award {
  group_id: string;
  player_id: string;
  place: Place;
  points: number;
  sessions: number;
}

/** Everyone ranked 1st or 2nd with points, for each group in a month of scores */
export function monthAwards(scores: ScoreRow[]): Award[];

/** Any month up to the current one may be closed; a future month may not */
export function canCloseMonth(month: string, currentMonth: string): boolean;

/** "1st place" / "2nd place" */
export function placeLabel(place: Place): string;

/** "142 points from 8 sessions" */
export function awardSummary(points: number, sessions: number): string;

/** One group's lines for the close confirmation: "1st: A & B (142 pts)" */
export function groupAwardSummary(
  awards: Award[], groupId: string, nameOf: (playerId: string) => string
): { first: string | null; second: string | null };

/** The notification an awarded player receives */
export function awardNotification(a: {
  place: Place; groupName: string; month: string; points: number; sessions: number;
}): { title: string; body: string };

/** The refusal shown when a change would alter a closed month's scores */
export function closedMonthMessage(month: string): string;

/** Newest month first; within a month 1st place before 2nd, then by group name */
export function sortAwards<T extends { month: string; place: Place; group_name: string }>(awards: T[]): T[];
```

- `monthAwards` calls `groupScores` and `buildStandings`, then keeps the standings with
  `rank <= 2` and `total > 0`. `place` is the rank. It is the only place that decides who
  is awarded: the confirmation preview and the server action both call it.
- `awardNotification` returns:
  - 1st: title "You won the Group A King of Court for September 2026";
  - 2nd: title "You finished 2nd in the Group A King of Court for September 2026";
  - body "142 points from 8 sessions." (with "1 point" and "1 session" in the singular).

  The group name is never made possessive, so "Women's Team" reads "the Women's Team King
  of Court".
- `closedMonthMessage("2026-09")` returns "The September 2026 leaderboard is closed, and
  this would change its scores. An admin can reopen it from the Leaderboard." The
  database trigger raises the same sentence.

`src/lib/king-of-court/month.ts` gains two small helpers: `isMonth(value)` (a real
`YYYY-MM`) and `monthOfDate("2026-09-03")`, which returns `"2026-09"`.

### 3. Closed-month checks on the server — `src/lib/king-of-court/lock.ts`

Server-only helpers that take the admin Supabase client.

```ts
/** The message to refuse with when this month ("YYYY-MM") is closed; null when it is open */
export async function closedMonthBlock(admin, month: string): Promise<string | null>;

/**
 * The message to refuse with when the date's month is closed and any of these players
 * holds a score for this session occurrence; null when the change may go ahead.
 */
export async function closedMonthScoreBlock(
  admin,
  occurrence: { schedule_session_id: string; session_date: string },
  playerIds: string[]
): Promise<string | null>;
```

- The refusal is `closedMonthMessage(month)`.
- Neither helper throws. If the check itself fails, it returns "Couldn't check whether
  the leaderboard is closed: …", so the caller refuses rather than going ahead unchecked.

### 4. Server actions — `src/app/_actions/king-of-court.ts`

**`saveKingOfCourtScores`** gains one check, after the future-date check: if
`closedMonthBlock` returns a message for the session date's month, return it with
`reload: true`, so the Scores tab reloads into its read-only state.

**`closeLeaderboardMonth(month: string)`** returns
`{ success: true; awards: number } | { error: string }`. It runs these steps in order:

1. Check the caller is an admin.
2. Validate `month` as `YYYY-MM` and check `canCloseMonth(month, cairoMonthKey(new Date()))`.
3. **Lock first:** insert the `leaderboard_month_closes` row with `closed_by`. A
   primary-key conflict returns "September 2026 is already closed".
4. Load the month with `loadLeaderboard(month, null)`. The scores can no longer change.
5. Compute `monthAwards(scores)`, and give each award a notification id generated in the
   action (`crypto.randomUUID()`).
6. Insert the `leaderboard_awards` rows, each carrying its `notification_id`.
7. Insert one notification per award under those ids, with type `'system'` and link
   `/player/achievements`. They are inserted directly rather than through
   `createNotification`, which would also send an email from the app. This is the last
   write, and one insert, so nobody is notified unless the whole close succeeded.
8. Revalidate `/admin/leaderboard`, `/coach/leaderboard`, `/player/leaderboard`,
   `/player/achievements`, `/player/dashboard` and `/admin/daily-report`.

If step 4, 5, 6 or 7 fails, the action deletes the close row (the awards cascade) and
returns the error. The month is then open again, as if nothing had happened.

**`reopenLeaderboardMonth(month: string)`** returns
`{ success: true } | { error: string }`:

1. Check the caller is an admin.
2. Read the month's awards to collect their `notification_id`s. If the month has no close
   row, return "September 2026 isn't closed".
3. Delete the close row. The awards cascade.
4. Delete those notifications where `is_read` is false. A failure here is logged and
   doesn't fail the reopen: the month is already open.
5. Revalidate the same paths as closing.

### 5. Attendance in a closed month — `src/app/_actions/training.ts`

The database refuses any attendance change that would delete a closed month's score. Two
actions check first, so that they refuse before doing anything:

- **`removeAttendanceRecords`:** call `closedMonthScoreBlock` for `data.player_ids`
  **before** restoring session credits, and return its message as `{ error }`. Without
  this, the credits would be restored and the delete then refused, leaving a player with
  both the attendance and the credit.
- **`submitAttendance`:** call `closedMonthScoreBlock` for the players whose incoming
  status isn't `present`, before the per-player loop, and return its message as
  `{ error }`. Without this, the loop would save the earlier players and fail part-way.

`updateAttendanceRecord` is a single update, so it relies on the trigger, whose message
comes back through its existing `{ error: error.message }`.

Attendance for players with no score in that session is unaffected. Marking more players
present in a closed month still works; they just can't be scored until the month is
reopened.

### 6. Leaderboard — `src/lib/king-of-court/load.ts` and `leaderboard-view.tsx`

**`loadLeaderboard`** also reads the month's close row. `LeaderboardData` gains
`closedAt: string | null`.

**`LeaderboardView`** gains a `canClose?: boolean` prop, passed only by the admin page.

- **Header, second row:** the subtitle stays on the left. On the right:
  - a **Closed** badge with a lock icon when `closedAt` is set, for every viewer;
  - for admins, **Reopen** (outline) when closed, or **Close month** when open and
    `canCloseMonth(month, currentMonth)`.

  On phones the right side wraps under the subtitle.
- **Close confirmation** (`ConfirmDialog`, primary, labelled "Close September"):
  - Title: "Close September 2026?"
  - One line per group with awards: the group name, then "1st: A & B (142 pts)" and
    "2nd: C (118 pts)", built with `monthAwards` and `joinNames`. Groups with no awards
    are listed as "No awards".
  - A sentence on what closing does: "Scores for September can't be changed until you
    reopen it, and these players are notified."
  - When the month is the current one, a warning: "September isn't over. Sessions still
    to come this month can't be scored while it's closed."
  - When nobody qualifies: "No scores were logged, so nobody is awarded."
- **Reopen confirmation** (`ConfirmDialog`, danger, labelled "Reopen"):
  - Title: "Reopen September 2026?"
  - Body: "This removes the month's N achievements and lets its scores be edited again.
    Notifications that players haven't read are removed. Close the month again to
    re-award."
- **After either action:** a toast ("September 2026 closed · 6 achievements awarded" or
  "September 2026 reopened"), then `router.refresh()`. An error shows in a toast and
  changes nothing.
- **Leader card:**
  - Its label reads "Winner" when the month is closed and "Leading" otherwise. This
    changes today's behaviour, where any past month reads "Winner".
  - When the month is closed and someone is ranked 2nd with points, a line below the
    winner reads "Runner-up: C · 118 pts" (co-runners-up joined with `joinNames`).

The coach and player pages need no change beyond what `LeaderboardView` does for them.

### 7. Daily Report → Scores tab — `scores-tab.tsx`

- The tab's load also reads `leaderboard_month_closes` for the month of `date`.
- When the month is closed:
  - A notice above the cards reads "The September 2026 leaderboard is closed, so these
    scores are read-only." with a link to `/admin/leaderboard?month=2026-09`.
  - Every points box is disabled.
  - The Save button and the Clear action are hidden. The Saved badge stays.
- A save refused by the server (the month was closed while the tab was open) shows the
  message in a toast and reloads the tab, which then shows the closed state.

### 8. Player portal

**Loader — `src/lib/king-of-court/awards-load.ts`**

```ts
export interface PlayerAward {
  id: string;
  month: string;        // "YYYY-MM"
  place: 1 | 2;
  points: number;
  sessions: number;
  group_name: string;
}

/** A player's awards, newest month first; 1st place before 2nd within a month */
export async function loadPlayerAwards(supabase, playerId: string): Promise<PlayerAward[]>;

/** The newest few, for the dashboard. Never throws: a failure gives no awards. */
export async function loadLatestAwards(supabase, playerId: string, limit: number): Promise<PlayerAward[]>;
```

- Both read `leaderboard_awards` joined to `groups(name)` with the player's own client, so
  RLS limits them to the player's rows.
- `loadPlayerAwards` throws when the read fails, as `loadLeaderboard` does.
- `loadLatestAwards` returns an empty list instead, so a problem with achievements can
  never take the dashboard down with it.

**Achievements page — `src/app/(portal)/player/achievements/page.tsx`** (server), with a
`loading.tsx` skeleton.

It follows the user's mockup, limited to the Monthly Awards section:

- **Header:** the title "Achievements" in the display font, with the subtitle "Your
  monthly leaderboard awards."
- **Section label:** "MONTHLY AWARDS", small, uppercase and letter-spaced.
- **Grid:** one column on phones, two from `sm` up.
- **Award card — `src/components/achievements/award-card.tsx`:**
  - Top row: a rounded trophy tile on the left and a pill on the right reading
    `placeLabel(place)`.
  - The month in the display font, uppercase ("SEPTEMBER 2026").
  - A line reading "Women's Team · 142 points from 8 sessions".
  - **1st place:** an amber border, a faint amber wash, an amber trophy tile and an amber
    pill.
  - **2nd place:** a plain white card, a slate trophy tile and a slate pill.
- **No awards:** an `EmptyState` with the `Award` icon, the title "No achievements yet",
  the description "Finish in the top 2 of your group's monthly leaderboard to earn one."
  and a link to `/player/leaderboard`.

The mockup's stat tiles, Badges section and "Share this award" button are not built.

**Dashboard card — `player/dashboard/page.tsx`**

- The page loads `loadLatestAwards(supabase, currentUser.id, 3)`.
- When there is at least one award, a full-width **Achievements** card sits below the
  two-column grid:
  - a heading with the `Award` icon, in the style of the other dashboard cards;
  - up to three rows, each with a small trophy tile (amber or slate), "1st place ·
    September 2026" and "Women's Team · 142 pts";
  - a "View all →" link to `/player/achievements`.
- When there are none, the card isn't rendered.

**Nav — `sidebar-layout.tsx`**

- Add `{ key: "achievements", label: "Achievements", href: "/player/achievements",
  section: "Competitions", badge: "New" }` to `playerNav`, after Leaderboard.
- Map the `Award` icon to `achievements` in the icon map.

## Edge cases

| Case | Behaviour |
|---|---|
| Two admins close the same month at once | The second insert hits the primary key and returns "already closed". |
| A score is being saved at the instant of closing | The trigger's table lock makes one wait for the other: the save either lands before the awards are ranked or is refused. |
| Closing fails after the month is locked | The action removes the close row and the awards with it, so the month is open again. Nobody was notified. |
| The code is deployed before the migration is applied | Attendance and score saves would be refused, because the closed-month check can't run. The migration must be applied to production first; it is safe to apply early, because nothing is closed until the button is used. |
| Close is pressed for a future month (e.g. by a stale tab) | The action refuses it. |
| A month with no scores is closed | It locks with no awards. The confirmation says nobody is awarded. |
| The scores change between loading the page and confirming | The awards follow the scores at the moment of closing. The page refreshes to show them. |
| A save reaches the server for a closed month | The action refuses with the closed message and the Scores tab reloads as read-only. |
| A scored player's attendance is changed or removed in a closed month | Refused with the closed message. Nothing is saved and no credit is restored. |
| An unscored player's attendance is changed in a closed month | Allowed. |
| A player is marked present in a closed month | Allowed. They can be scored only after a reopen. |
| A player is deleted | Their scores, awards and notifications go with them, in a closed month too. Other players' awards stay as awarded. |
| A group is switched off the leaderboard after a month was closed | Its past awards stay on players' Achievements pages. |
| A player moves group mid-month | They can be awarded in each group they scored in, as separate awards. |
| A player is awarded in two groups in one month | Two awards, two cards and two notifications. |
| A month is reopened and closed again | Unread notifications from the first close are removed. Read ones stay in the inbox, and the second close sends new ones. |
| A month is reopened after a player read their notification and then lost the award | The read notification stays in their inbox. The award is gone from their Achievements page. |
| The current month is closed early, then the month ends | It stays closed. Nothing reopens by itself. |
| Production email webhook | Every new notification is emailed by the database trigger, so awarded players in production also get an email. Staging sends none. |

## Testing

- **Unit tests** — `src/lib/king-of-court/awards.test.ts`, picked up by the existing
  `npm test` glob:
  - `monthAwards`:
    - a plain 1st and 2nd, with their points and sessions;
    - a tie for 1st (1, 1, 3) giving two 1st places and no 2nd;
    - a tie for 2nd (1, 2, 2) giving three awards;
    - a 2nd-ranked player on 0 points getting nothing;
    - a group where everyone scored 0 getting nothing;
    - two groups awarded independently, and a player awarded in both;
    - no scores giving no awards.
  - `canCloseMonth`: a past month, the current month and a future month.
  - `placeLabel` and `awardNotification`: both places, and the singular "1 session".
- **Database tests on staging** — added to `scripts/db/test-king-of-court.sql`, inside its
  roll-back transaction:
  - With a month closed, inserting, updating and deleting a score in it each fail, and
    the same operations in another month succeed.
  - Changing a scored player's attendance away from `present`, and deleting that
    attendance row, each fail and leave the attendance row and the score as they were.
  - Changing an unscored player's attendance in a closed month succeeds.
  - Deleting a player who has a score in a closed month succeeds.
  - Deleting the close row removes the month's awards and allows scoring again.
  - Under RLS: a player reads only their own awards, and a player or coach can't insert
    or delete a close row.
- **Manual check in the running app, on staging:**
  - Close the current month: check the warning, the listed winners, the Closed badge, the
    winner and runner-up card, and the toast.
  - As an awarded player: check the notification, the Achievements page at phone and
    desktop width, and the dashboard card.
  - As a player with no awards: check the empty state and that the dashboard has no card.
  - On the Daily Report: check the Scores tab is read-only for the closed month, and
    that marking a scored player absent is refused with the closed message.
  - Reopen: check the awards and the unread notification disappear, edit a score, close
    again, and check the awards follow the new scores.
  - As a coach: check the Closed badge shows and no button does.

## Out of scope

- The mockup's stat tiles (Awards, Badges earned, Competitions won, Sessions attended),
  the Badges section and "Share this award".
- Closing a month automatically when it ends.
- Showing a player's achievements to admins or coaches, for example on the admin player
  page.
- Achievements for anything other than the monthly leaderboard.
- A dedicated notification type or email template for awards.
