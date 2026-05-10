# Coach Schedule Blocking — Design Spec

**Date:** 2026-05-11
**Scope:** Admin and coaches can mark time as "blocked" so the booking system doesn't propose those slots. One feature, one spec.

---

## Goals

A coach (or an admin acting on a coach's behalf) can mark time as unavailable. The system uses these blocks to:

1. Prevent players from picking blocked slots when requesting a private session.
2. Reject admin attempts to confirm a private session into a blocked slot.
3. Surface conflicts (existing sessions overlapping a new block) as warnings — never auto-cancel.

---

## Out of scope

- **Court/global blocks** (facility closures, holidays). Coach-owned only.
- **Auto-cancellation of conflicting sessions** when a block is created. Conflicts are surfaced as warnings; admin/coach handles them manually.
- **Editing existing blocks.** Delete + recreate is the only mutation path.
- **Block notifications.** The creator knows; no broadcast.
- **Group-session enforcement.** If a coach blocks time that overlaps a recurring group session, that's surfaced as a warning but the group session is not modified.
- **Block templates / copy-from-previous-week.** YAGNI.

---

## Use cases

| Case | Block shape |
|---|---|
| "Out 14:00-15:00 next Tuesday" (dentist appointment) | one-time, single date, time range |
| "Vacation Jun 1-7" (full days) | one-time, date range, no times |
| "Day job, every weekday 9-17" | weekly, one row per day_of_week |
| "Mon evenings off, only this semester" | weekly, with `effective_until` set |

---

## Data model

### New table: `coach_blocks`

```sql
CREATE TYPE block_kind AS ENUM ('one_time', 'weekly');

CREATE TABLE coach_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind            block_kind NOT NULL,

  -- One-time fields
  start_date      DATE,
  end_date        DATE,

  -- Weekly fields
  day_of_week     INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  effective_from  DATE,
  effective_until DATE,

  -- Common (NULL for one-time = all-day; always set for weekly)
  start_time      TIME,
  end_time        TIME,

  reason          TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_time_shape CHECK (
    (kind = 'one_time' AND start_date IS NOT NULL AND day_of_week IS NULL) OR
    (kind = 'weekly'   AND day_of_week IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL)
  ),
  CONSTRAINT one_time_dates CHECK (
    kind <> 'one_time' OR (end_date IS NULL OR end_date >= start_date)
  ),
  -- Times must be symmetric: either both NULL (all-day, one_time only) or both set
  CONSTRAINT times_symmetric CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX idx_coach_blocks_coach_date ON coach_blocks(coach_id, start_date);
CREATE INDEX idx_coach_blocks_coach_dow  ON coach_blocks(coach_id, day_of_week);

CREATE TRIGGER coach_blocks_updated_at
  BEFORE UPDATE ON coach_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Row-level security

```sql
ALTER TABLE coach_blocks ENABLE ROW LEVEL SECURITY;

-- Coaches read/write their own
CREATE POLICY "coach manages own blocks"
  ON coach_blocks FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Admins read/write all
CREATE POLICY "admins manage all blocks"
  ON coach_blocks FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Players: no policy → no access
GRANT SELECT, INSERT, UPDATE, DELETE ON coach_blocks TO authenticated;
```

The player-facing private-session picker calls a server action that uses the admin client (service role) to read blocks for the chosen coach — players never query `coach_blocks` directly, so the lack of a player-read policy is intentional.

---

## Conflict-checking helper

New file: `src/lib/scheduling/coach-availability.ts`. Pure functions over fetched rows — no SQL functions, matches the existing pattern in [request-form-page.tsx:118-190](../../src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx#L118-L190).

```ts
export type CoachBlock = {
  id: string;
  coach_id: string;
  kind: 'one_time' | 'weekly';
  start_date: string | null;
  end_date: string | null;
  day_of_week: number | null;
  effective_from: string | null;
  effective_until: string | null;
  start_time: string | null;  // HH:MM:SS
  end_time: string | null;
  reason: string | null;
};

export type Conflict = {
  type: 'group_session' | 'private_session_request' | 'scheduled_private';
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  label: string;
};

/** Does this block apply to (date, [t1,t2])? Pure predicate over a single block. */
export function blockMatches(
  block: CoachBlock,
  date: string,        // YYYY-MM-DD
  startTime: string,   // HH:MM
  endTime: string
): boolean;

/** Is the coach blocked at this exact slot? Fetches blocks then runs blockMatches. */
export async function isCoachBlocked(
  coachId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ blocked: boolean; matchingBlock?: { id: string; reason: string | null } }>;

/** Fetch blocks (raw rows) overlapping a date range — used by the calendar render layer. */
export async function getCoachBlocksInRange(
  coachId: string,
  fromDate: string,
  toDate: string
): Promise<CoachBlock[]>;

/** Find existing sessions/requests that overlap a proposed block. Used at create time. */
export async function findConflictsForBlock(input: {
  coachId: string;
  kind: 'one_time' | 'weekly';
  start_date?: string | null;
  end_date?: string | null;
  day_of_week?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}): Promise<Conflict[]>;
```

### Predicate definition

A `coach_blocks` row matches `(coachId, date, [t1, t2])` iff:

- `block.coach_id === coachId`, AND
- **One-time branch:** `kind === 'one_time'` AND `start_date <= date <= COALESCE(end_date, start_date)` AND ((times are both NULL = all-day) OR (`block.start_time < t2 AND block.end_time > t1`))
- **Weekly branch:** `kind === 'weekly'` AND `day_of_week === EXTRACT(dow FROM date)` AND (`effective_from IS NULL OR effective_from <= date`) AND (`effective_until IS NULL OR effective_until >= date`) AND (`block.start_time < t2 AND block.end_time > t1`)

Time overlap uses the standard half-open interval check.

### `findConflictsForBlock` algorithm

1. Compute the block's "envelope" — the absolute date range it could fire in.
   - One-time: `[start_date, COALESCE(end_date, start_date)]`
   - Weekly: `[COALESCE(effective_from, today), COALESCE(effective_until, today + 90 days)]` — capped to a 90-day forward window for unbounded weekly blocks (anything further is the user's problem to handle as it approaches).
2. Fetch existing data in the envelope:
   - `schedule_sessions` where `coach_id = block.coach_id` AND `is_active = true` AND (`end_date IS NULL OR end_date >= envelope_start`).
   - `private_session_requests` where `coach_id = block.coach_id` AND `status IN ('pending','confirmed')` AND (`requested_date BETWEEN envelope_start AND envelope_end` OR weekly day_of_week match).
3. For each candidate, materialize the actual occurrences inside the envelope (group sessions are recurring weekly), then run `blockMatches` against each occurrence.
4. Return one `Conflict` per overlapping occurrence.

The 90-day cap is a deliberate pragmatic choice — group sessions can be recurring forever; conflict-checking infinitely is wasteful and provides no marginal value to the warning UI.

---

## Server actions

New file: `src/app/_actions/coach-blocks.ts`.

```ts
export async function createCoachBlock(input: CreateBlockInput): Promise<
  { success: true; id: string; conflicts: Conflict[] } | { error: string }
>;

export async function deleteCoachBlock(id: string): Promise<{ success: true } | { error: string }>;
```

Permission rules (enforced in the action, on top of RLS):
- Coach can CRUD their own blocks.
- Admin can CRUD any coach's blocks. The `coach_id` parameter is honored.
- Player has no entry point.

`createCoachBlock` always creates the row. If `findConflictsForBlock` returns a non-empty array, those conflicts are returned alongside `success: true` so the UI can show a warning toast/banner.

---

## Integration with private-session booking

### Player request form

[request-form-page.tsx:118-190](../../src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx#L118-L190) computes a `reservedSlots` array per chosen date. Extend it:

1. After fetching existing reservations, also fetch the chosen coach's `coach_blocks` for the chosen date.
2. For each slot in the picker, if `blockMatches(block, date, slot.start, slot.end)` is true for any block, mark the slot as unavailable.
3. The slot UI uses the same red treatment but the tooltip says "Coach unavailable" instead of "Already booked." If `block.reason` is set, the tooltip includes it.

This is the only player-facing surface that needs to read blocks; the server action that fetches blocks for the player runs as the admin client (service role) so the lack of a player-read RLS policy doesn't block it.

### Admin private-session confirm

[private-sessions.ts](../../src/app/_actions/private-sessions.ts) — `confirmPrivateSessionRequest` gains a check before inserting `schedule_sessions`:

```ts
const { blocked, matchingBlock } = await isCoachBlocked(
  coachId, sessionDate, startTime, endTime
);
if (blocked) {
  return {
    error: `Coach is blocked at this time${matchingBlock?.reason ? ` (${matchingBlock.reason})` : ''}. Pick a different time or remove the block first.`
  };
}
```

Same check applies to `createAdminPrivateSession` (the direct admin-create path) once it goes through the same code path, or by inlining the check.

### Group session creation

Out of scope per the design — admin can create a `schedule_sessions` row that conflicts with a coach block. The conflict fires as a warning when the *block* is created, not when the *session* is created. (Group sessions are typically created before blocks; blocks are added later when the coach has a conflict.)

---

## UI

### Calendar render layer

[ScheduleCalendar.tsx](../../src/components/coach/ScheduleCalendar.tsx) — same week-grid layout, new render layer underneath the session cards.

For the visible week, fetch `getCoachBlocksInRange(coachId, weekStart, weekEnd)`. For each block, paint the matching cells with a gray hatched background:

- One-time block: cells from `start_date` to `end_date`, time range `start_time`-`end_time` (or full day if NULL).
- Weekly block: cells matching `day_of_week`, time range `start_time`-`end_time`, only if the visible week falls within `effective_from`/`effective_until`.

The hatched cells render *behind* any session cards in that slot. Hover (or tap on mobile) shows a small tooltip with `reason` if set.

Below the calendar, a "Blocks" list shows:
- Next 30 days of one-time blocks.
- All weekly blocks (grouped by recurrence pattern).
- Each row has a delete button (with a confirm).

### "Block Time" drawer

Visible to coach on `/coach/schedule` (no coach selector — defaults to self) and to admin on `/admin/schedule` (coach selector at top, defaults to first coach in alphabetical order).

```
┌─ Block Time ─────────────────────┐
│ Coach: [Ali Hassan ▼]  ← admin only
│                                  │
│ Type: ◉ One-time   ○ Recurring weekly
│                                  │
│ ── One-time ──────────────────── │
│ From: [date]   To: [date]        │
│ ☐ All day                        │
│ Time: [start] – [end]            │
│                                  │
│ ── Recurring weekly ──────────── │
│ Days: [✓ Mon][✓ Tue]…[ Sat][ Sun]│
│ Time: [start] – [end]            │
│ Active from: [optional date]     │
│ Active until: [optional date]    │
│                                  │
│ Reason (optional): [_________]   │
│                                  │
│ [Cancel]            [Create]     │
└──────────────────────────────────┘
```

Behavior:
- Selecting multiple weekdays in recurring mode creates one row per day (UI convenience; data model stays clean — one `coach_blocks` row per `day_of_week`).
- "All day" toggle nulls out the times for one-time blocks.
- On submit: call `createCoachBlock` (or fan out N calls for multi-day weekly). For each, surface returned conflicts in a single aggregated toast: "Block created. 2 sessions during this block — review and cancel manually if needed."

---

## Manual verification

1. **One-time, intra-day** — Coach blocks 14:00-15:00 today. The cell renders gray hatched. A player trying to book that slot sees it red with "Coach unavailable." Admin confirm fails for that slot.
2. **One-time, full day, multi-day** — Block "all day" Jun 1-7. Calendar shows hatched bars across all 7 days. Player picker disables the entire range.
3. **Weekly, day-job pattern** — Coach selects Mon-Fri, 09:00-17:00. Five rows are created. Each visible week shows hatched cells on those days/times. Player picker disables those slots permanently.
4. **Weekly with bound** — Coach blocks Wednesday 18:00-21:00, `effective_until = 2026-12-31`. Calendar shows hatch only through year-end.
5. **Conflict warning on create** — Pre-create a `schedule_sessions` row at Mon 19:00-20:00. Coach creates a weekly Mon 18:00-22:00 block. Toast shows "Block created. 1 session during this block — review and cancel manually."
6. **Server-side enforcement** — Player tries to book a blocked slot via direct API call (bypassing UI). Confirm action returns the "Coach is blocked" error.
7. **Permission boundary** — Coach A tries to delete Coach B's block via direct API call. RLS rejects.
8. **Delete** — Coach deletes a block. The hatched cells disappear. Previously-blocked slots become bookable.

---

## Open questions

None at this point.
