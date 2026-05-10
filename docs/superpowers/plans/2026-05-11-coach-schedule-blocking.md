# Coach Schedule Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches and admins can mark time as "blocked" so the booking system rejects conflicting private-session bookings and visualizes the unavailability on the schedule calendar.

**Architecture:** New `coach_blocks` table (one_time + weekly kinds). Pure-TS predicate `blockMatches` in a new helper module. Server actions for CRUD with admin/coach permission split. UI: a drawer on the existing schedule calendar plus a hatched render layer that overlays blocked cells. Player private-session picker and admin confirmation both consult the helper to refuse blocked slots.

**Tech Stack:** Next.js 15 (app router), TypeScript, Supabase (postgres + auth + admin client). Reuses existing `DatePicker` (no time picker — use native `<Input type="time">`), existing `notifyAdmins` helper.

**Spec:** See [docs/superpowers/specs/2026-05-11-coach-schedule-blocking-design.md](../specs/2026-05-11-coach-schedule-blocking-design.md).

**No test suite:** Project has no automated test runner. Each task ends with a **manual verification** step. Treat these as required gates before commit.

---

## File Structure

### New files
- `supabase/migrations/20260512000000_coach_blocks.sql` — schema migration.
- `src/lib/scheduling/coach-availability.ts` — predicate + queries for blocks.
- `src/app/_actions/coach-blocks.ts` — `createCoachBlock`, `deleteCoachBlock`.
- `src/components/coach/BlockTimeDrawer.tsx` — the create-block drawer.
- `src/components/coach/CoachBlocksList.tsx` — list-with-delete UI rendered below the calendar.

### Modified files
- `src/types/database.ts` — add `coach_blocks` table type.
- `src/components/coach/ScheduleCalendar.tsx` — block render layer, "Block Time" button, mount the drawer + list.
- `src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx` — fetch and respect coach blocks in `reserved`.
- `src/app/_actions/private-sessions.ts` — server-side block check in `confirmPrivateSessionRequest` and `createAdminPrivateSession`.

### Test files
None — manual verification only.

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260512000000_coach_blocks.sql`

- [ ] **Step 1: Write the migration file**

Write `supabase/migrations/20260512000000_coach_blocks.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- Coach Schedule Blocking (2026-05-11)
--   coach_blocks — one_time and weekly unavailability per coach
-- ═══════════════════════════════════════════════════════════════

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

  -- Common: NULL for one-time = all-day; always set for weekly
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

GRANT SELECT, INSERT, UPDATE, DELETE ON coach_blocks TO authenticated;
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:migrate`
Expected: migration applied, no errors.

- [ ] **Step 3: SQL spot-check**

In the SQL editor:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_blocks';
-- Expected: 13 rows
SELECT * FROM coach_blocks;
-- Expected: empty, no error
```

Insert a one-time block manually as a sanity check:
```sql
INSERT INTO coach_blocks (coach_id, kind, start_date, end_date)
VALUES ((SELECT id FROM profiles WHERE role = 'coach' LIMIT 1), 'one_time', '2026-05-20', '2026-05-20');
-- Expected: 1 row inserted
DELETE FROM coach_blocks;
```

Test the CHECK constraints:
```sql
-- Should fail (weekly without day_of_week)
INSERT INTO coach_blocks (coach_id, kind) VALUES ((SELECT id FROM profiles LIMIT 1), 'weekly');
-- Should fail (asymmetric times)
INSERT INTO coach_blocks (coach_id, kind, start_date, start_time)
VALUES ((SELECT id FROM profiles LIMIT 1), 'one_time', '2026-05-20', '14:00');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512000000_coach_blocks.sql
git commit -m "feat(db): coach_blocks table for schedule blocking"
```

---

## Task 2: Database types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `coach_blocks` table type**

In `src/types/database.ts`, in the `Tables` object alongside `system_settings`, add:

```ts
coach_blocks: {
  Row: {
    id: string;
    coach_id: string;
    kind: 'one_time' | 'weekly';
    start_date: string | null;
    end_date: string | null;
    day_of_week: number | null;
    effective_from: string | null;
    effective_until: string | null;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    coach_id: string;
    kind: 'one_time' | 'weekly';
    start_date?: string | null;
    end_date?: string | null;
    day_of_week?: number | null;
    effective_from?: string | null;
    effective_until?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    coach_id?: string;
    kind?: 'one_time' | 'weekly';
    start_date?: string | null;
    end_date?: string | null;
    day_of_week?: number | null;
    effective_from?: string | null;
    effective_until?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};
```

Also add a convenience export at the bottom of the file:

```ts
export type CoachBlock = Database["public"]["Tables"]["coach_blocks"]["Row"];
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add coach_blocks table"
```

---

## Task 3: Availability helper module

**Files:**
- Create: `src/lib/scheduling/coach-availability.ts`

This module is the single source of truth for "is a coach blocked at time T on date D?". Three callers depend on it: the player picker, the admin confirm action, and the block-create flow (for the conflict-warning list).

- [ ] **Step 1: Create the helper file**

Write `src/lib/scheduling/coach-availability.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { CoachBlock } from "@/types/database";

export type Conflict = {
  type: 'group_session' | 'private_session_request' | 'scheduled_private';
  id: string;
  date: string;        // YYYY-MM-DD
  start_time: string;  // HH:MM
  end_time: string;
  label: string;       // Human-readable (group name, player name, etc.)
};

export type CreateBlockInput = {
  coach_id: string;
  kind: 'one_time' | 'weekly';
  start_date?: string | null;
  end_date?: string | null;
  day_of_week?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
};

// ─── Time utilities ─────────────────────────────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Normalize "HH:MM" or "HH:MM:SS" to minutes since midnight. */
function timeStrToMinutes(t: string): number {
  return toMinutes(t.slice(0, 5));
}

/** Half-open overlap: [s1, e1) intersects [s2, e2). */
function intervalsOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

/** Day of week (0=Sun..6=Sat) for a YYYY-MM-DD date string. */
function dowOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Compare YYYY-MM-DD strings lexically (works because format is fixed). */
function dateLte(a: string, b: string): boolean { return a <= b; }
function dateGte(a: string, b: string): boolean { return a >= b; }

// ─── Predicate ──────────────────────────────────────────────────

/** Pure predicate: does this block apply to (date, [t1,t2])? */
export async function blockMatches(
  block: CoachBlock,
  date: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const t1 = toMinutes(startTime);
  const t2 = toMinutes(endTime);

  if (block.kind === 'one_time') {
    if (!block.start_date) return false;
    const endDate = block.end_date ?? block.start_date;
    if (!dateGte(date, block.start_date)) return false;
    if (!dateLte(date, endDate)) return false;

    // All-day block (no times)
    if (block.start_time === null && block.end_time === null) return true;

    // Intra-day block
    if (block.start_time === null || block.end_time === null) return false;
    return intervalsOverlap(timeStrToMinutes(block.start_time), timeStrToMinutes(block.end_time), t1, t2);
  }

  // Weekly
  if (block.day_of_week === null || block.day_of_week === undefined) return false;
  if (block.start_time === null || block.end_time === null) return false;

  if (block.day_of_week !== dowOf(date)) return false;
  if (block.effective_from && !dateGte(date, block.effective_from)) return false;
  if (block.effective_until && !dateLte(date, block.effective_until)) return false;

  return intervalsOverlap(timeStrToMinutes(block.start_time), timeStrToMinutes(block.end_time), t1, t2);
}

// ─── Queries ────────────────────────────────────────────────────

/** Is a coach blocked at this exact slot? */
export async function isCoachBlocked(
  coachId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ blocked: boolean; matchingBlock?: { id: string; reason: string | null } }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Fetch only relevant rows: coach's blocks where one_time covers the date OR weekly matches dow
  const dow = dowOf(date);
  const { data } = await admin
    .from("coach_blocks")
    .select("*")
    .eq("coach_id", coachId)
    .or(`and(kind.eq.one_time,start_date.lte.${date},or(end_date.is.null,end_date.gte.${date})),and(kind.eq.weekly,day_of_week.eq.${dow})`);

  const blocks = (data || []) as CoachBlock[];
  for (const b of blocks) {
    if (await blockMatches(b, date, startTime, endTime)) {
      return { blocked: true, matchingBlock: { id: b.id, reason: b.reason } };
    }
  }
  return { blocked: false };
}

/** Fetch raw blocks overlapping the inclusive [fromDate, toDate] envelope. Used by calendar render. */
export async function getCoachBlocksInRange(
  coachId: string,
  fromDate: string,
  toDate: string
): Promise<CoachBlock[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data } = await admin
    .from("coach_blocks")
    .select("*")
    .eq("coach_id", coachId)
    .or(
      `and(kind.eq.one_time,start_date.lte.${toDate},or(end_date.is.null,end_date.gte.${fromDate})),` +
      `and(kind.eq.weekly,or(effective_from.is.null,effective_from.lte.${toDate}),or(effective_until.is.null,effective_until.gte.${fromDate}))`
    );

  return (data || []) as CoachBlock[];
}

/** For a proposed new block, find existing sessions/requests it would overlap. */
export async function findConflictsForBlock(input: CreateBlockInput): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  // Compute envelope (window of dates this block could fire in)
  const today = new Date().toISOString().slice(0, 10);
  let envelopeStart: string;
  let envelopeEnd: string;

  if (input.kind === 'one_time') {
    if (!input.start_date) return [];
    envelopeStart = input.start_date;
    envelopeEnd = input.end_date ?? input.start_date;
  } else {
    envelopeStart = input.effective_from ?? today;
    if (input.effective_until) {
      envelopeEnd = input.effective_until;
    } else {
      // Cap unbounded weekly blocks at 90 days forward — see spec for rationale
      const d = new Date();
      d.setDate(d.getDate() + 90);
      envelopeEnd = d.toISOString().slice(0, 10);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Build list of dates the block fires on within the envelope
  const candidateDates: string[] = [];
  if (input.kind === 'one_time') {
    let d = envelopeStart;
    while (dateLte(d, envelopeEnd)) {
      candidateDates.push(d);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
  } else {
    let d = envelopeStart;
    while (dateLte(d, envelopeEnd)) {
      if (dowOf(d) === input.day_of_week) candidateDates.push(d);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
  }

  if (candidateDates.length === 0) return [];

  // Fetch group sessions assigned to this coach (recurring weekly)
  const { data: groupSessions } = await admin
    .from("schedule_sessions")
    .select("id, day_of_week, start_time, end_time, end_date, session_type, group_id, groups(name)")
    .eq("coach_id", input.coach_id)
    .eq("is_active", true)
    .or(`end_date.is.null,end_date.gte.${envelopeStart}`);

  // For each session, check each candidate date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (groupSessions || []) as any[]) {
    for (const date of candidateDates) {
      if (s.end_date && dateGte(date, s.end_date)) continue;
      if (s.day_of_week !== dowOf(date)) continue;

      const blockStart = input.start_time ? timeStrToMinutes(input.start_time) : 0;
      const blockEnd = input.end_time ? timeStrToMinutes(input.end_time) : 24 * 60;
      const sStart = timeStrToMinutes(s.start_time);
      const sEnd = timeStrToMinutes(s.end_time);

      if (intervalsOverlap(sStart, sEnd, blockStart, blockEnd)) {
        conflicts.push({
          type: s.session_type === 'private' ? 'scheduled_private' : 'group_session',
          id: s.id,
          date,
          start_time: s.start_time.slice(0, 5),
          end_time: s.end_time.slice(0, 5),
          label: s.groups?.name ?? (s.session_type === 'private' ? 'Private session' : 'Group session'),
        });
      }
    }
  }

  // Fetch private session requests in the envelope
  const { data: requests } = await admin
    .from("private_session_requests")
    .select("id, requested_date, requested_day_of_week, requested_time, duration_minutes, profiles!private_session_requests_player_id_fkey(first_name, last_name)")
    .eq("coach_id", input.coach_id)
    .in("status", ["pending", "confirmed"])
    .gte("requested_date", envelopeStart)
    .lte("requested_date", envelopeEnd);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (requests || []) as any[]) {
    const date = r.requested_date;
    if (!date) continue;
    if (!candidateDates.includes(date)) continue;

    const start = timeStrToMinutes(r.requested_time);
    const end = start + (r.duration_minutes || 60);
    const blockStart = input.start_time ? timeStrToMinutes(input.start_time) : 0;
    const blockEnd = input.end_time ? timeStrToMinutes(input.end_time) : 24 * 60;

    if (intervalsOverlap(start, end, blockStart, blockEnd)) {
      const playerName = r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'a player';
      const eh = Math.floor(end / 60) % 24;
      const em = end % 60;
      conflicts.push({
        type: 'private_session_request',
        id: r.id,
        date,
        start_time: r.requested_time.slice(0, 5),
        end_time: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
        label: `Private session with ${playerName}`,
      });
    }
  }

  return conflicts;
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduling/coach-availability.ts
git commit -m "feat(scheduling): coach-availability helper (predicate + queries + conflicts)"
```

---

## Task 4: Server actions

**Files:**
- Create: `src/app/_actions/coach-blocks.ts`

- [ ] **Step 1: Write the actions module**

Write `src/app/_actions/coach-blocks.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { findConflictsForBlock, type Conflict, type CreateBlockInput } from "@/lib/scheduling/coach-availability";

type ActionResult<T> = (T & { success: true }) | { error: string };

export async function createCoachBlock(
  input: CreateBlockInput
): Promise<ActionResult<{ id: string; conflicts: Conflict[] }>> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  // Permission: coach can only create their own; admin can create for anyone
  if (user.role !== 'admin' && input.coach_id !== user.id) {
    return { error: "You can only block your own time" };
  }

  // Shape validation (defense in depth — DB also enforces)
  if (input.kind === 'one_time') {
    if (!input.start_date) return { error: "Start date is required for one-time blocks" };
    if (input.day_of_week !== null && input.day_of_week !== undefined) {
      return { error: "day_of_week must be null for one-time blocks" };
    }
    if (input.end_date && input.end_date < input.start_date) {
      return { error: "End date must be on or after start date" };
    }
  } else {
    if (input.day_of_week === null || input.day_of_week === undefined) {
      return { error: "Day of week is required for weekly blocks" };
    }
    if (input.day_of_week < 0 || input.day_of_week > 6) {
      return { error: "Day of week must be 0-6" };
    }
    if (!input.start_time || !input.end_time) {
      return { error: "Start and end time are required for weekly blocks" };
    }
  }

  if (input.start_time && input.end_time && input.start_time >= input.end_time) {
    return { error: "End time must be after start time" };
  }

  // Find conflicts BEFORE inserting (so we can return them with the success)
  const conflicts = await findConflictsForBlock(input);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("coach_blocks")
    .insert({
      coach_id: input.coach_id,
      kind: input.kind,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      day_of_week: input.day_of_week ?? null,
      effective_from: input.effective_from ?? null,
      effective_until: input.effective_until ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      reason: input.reason ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/coach/schedule");
  revalidatePath("/admin/schedule");

  return { success: true, id: data.id, conflicts };
}

export async function deleteCoachBlock(id: string): Promise<ActionResult<{}>> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Fetch the block to check ownership
  const { data: block } = await admin
    .from("coach_blocks")
    .select("coach_id")
    .eq("id", id)
    .maybeSingle();

  if (!block) return { error: "Block not found" };

  if (user.role !== 'admin' && block.coach_id !== user.id) {
    return { error: "You can only delete your own blocks" };
  }

  const { error } = await admin.from("coach_blocks").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/coach/schedule");
  revalidatePath("/admin/schedule");

  return { success: true };
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/coach-blocks.ts
git commit -m "feat(scheduling): server actions for coach block create/delete"
```

---

## Task 5: Block creation drawer component

**Files:**
- Create: `src/components/coach/BlockTimeDrawer.tsx`

- [ ] **Step 1: Write the drawer component**

Write `src/components/coach/BlockTimeDrawer.tsx`:

```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { Drawer, Button, Input, Select, DatePicker, Textarea } from "@/components/ui";
import { createCoachBlock } from "@/app/_actions/coach-blocks";
import type { Conflict } from "@/lib/scheduling/coach-availability";

interface CoachOption { id: string; first_name: string; last_name: string }

interface BlockTimeDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Self-coach id (used when admin = false). For admin, the form has a coach selector. */
  defaultCoachId: string;
  isAdmin: boolean;
  coachOptions?: CoachOption[];
  onSuccess: (result: { conflictCount: number; conflicts: Conflict[] }) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BlockTimeDrawer({ open, onClose, defaultCoachId, isAdmin, coachOptions, onSuccess }: BlockTimeDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [coachId, setCoachId] = useState(defaultCoachId);
  const [kind, setKind] = useState<'one_time' | 'weekly'>('one_time');

  // One-time
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);

  // Weekly
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");

  // Common
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setError(null);
      setCoachId(defaultCoachId);
      setKind('one_time');
      setStartDate("");
      setEndDate("");
      setAllDay(false);
      setSelectedDays([]);
      setEffectiveFrom("");
      setEffectiveUntil("");
      setStartTime("");
      setEndTime("");
      setReason("");
    }
  }, [open, defaultCoachId]);

  function toggleDay(d: number) {
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  function handleSubmit() {
    setError(null);

    if (isAdmin && !coachId) { setError("Pick a coach"); return; }

    if (kind === 'one_time') {
      if (!startDate) { setError("Pick a start date"); return; }
      if (endDate && endDate < startDate) { setError("End date must be on or after start date"); return; }
      if (!allDay) {
        if (!startTime || !endTime) { setError("Pick start and end times, or check All Day"); return; }
        if (startTime >= endTime) { setError("End time must be after start time"); return; }
      }
    } else {
      if (selectedDays.length === 0) { setError("Pick at least one day"); return; }
      if (!startTime || !endTime) { setError("Pick start and end times"); return; }
      if (startTime >= endTime) { setError("End time must be after start time"); return; }
      if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom) {
        setError("Active until must be on or after active from"); return;
      }
    }

    startTransition(async () => {
      const allConflicts: Conflict[] = [];

      if (kind === 'one_time') {
        const res = await createCoachBlock({
          coach_id: coachId,
          kind: 'one_time',
          start_date: startDate,
          end_date: endDate || startDate,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          reason: reason.trim() || null,
        });
        if ('error' in res) { setError(res.error); return; }
        allConflicts.push(...res.conflicts);
      } else {
        // Fan-out: one row per selected day
        for (const day of selectedDays) {
          const res = await createCoachBlock({
            coach_id: coachId,
            kind: 'weekly',
            day_of_week: day,
            effective_from: effectiveFrom || null,
            effective_until: effectiveUntil || null,
            start_time: startTime,
            end_time: endTime,
            reason: reason.trim() || null,
          });
          if ('error' in res) { setError(res.error); return; }
          allConflicts.push(...res.conflicts);
        }
      }

      onSuccess({ conflictCount: allConflicts.length, conflicts: allConflicts });
      onClose();
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title="Block Time">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        {isAdmin && coachOptions && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Coach</label>
            <Select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">Select coach...</option>
              {coachOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('one_time')}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${
                kind === 'one_time' ? 'bg-primary-50 border-primary text-primary' : 'border-slate-200 text-slate-500'
              }`}
            >
              One-time
            </button>
            <button
              type="button"
              onClick={() => setKind('weekly')}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${
                kind === 'weekly' ? 'bg-primary-50 border-primary text-primary' : 'border-slate-200 text-slate-500'
              }`}
            >
              Recurring weekly
            </button>
          </div>
        </div>

        {kind === 'one_time' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">From</label>
                <DatePicker value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">To</label>
                <DatePicker value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End date (optional)" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>All day</span>
            </label>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Start time</label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">End time</label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Days</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, idx) => {
                  // Display Sat-first to match calendar; idx is 0=Sun..6=Sat
                  const dayValue = idx;
                  const selected = selectedDays.includes(dayValue);
                  return (
                    <button
                      key={dayValue}
                      type="button"
                      onClick={() => toggleDay(dayValue)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                        selected ? 'bg-primary-50 border-primary text-primary' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Start time</label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">End time</label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Active from (optional)</label>
                <DatePicker value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} placeholder="Forever" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Active until (optional)</label>
                <DatePicker value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} placeholder="Forever" />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Reason (optional)</label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vacation, Day job" rows={2} />
        </div>

        <Button type="button" fullWidth disabled={isPending} onClick={handleSubmit}>
          {isPending ? "Creating..." : "Create Block"}
        </Button>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/BlockTimeDrawer.tsx
git commit -m "feat(scheduling): BlockTimeDrawer component"
```

---

## Task 6: Coach blocks list component

**Files:**
- Create: `src/components/coach/CoachBlocksList.tsx`

- [ ] **Step 1: Write the list component**

Write `src/components/coach/CoachBlocksList.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCoachBlock } from "@/app/_actions/coach-blocks";
import type { CoachBlock } from "@/types/database";

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function describeBlock(b: CoachBlock): string {
  if (b.kind === 'one_time') {
    const dateStr = b.end_date && b.end_date !== b.start_date
      ? `${b.start_date} – ${b.end_date}`
      : (b.start_date ?? '');
    if (b.start_time === null) return `${dateStr} (all day)`;
    return `${dateStr} ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`;
  }
  const day = b.day_of_week !== null ? DAY_NAMES[b.day_of_week] : '?';
  const window = `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`;
  if (b.effective_until) return `Every ${day} ${window} (until ${b.effective_until})`;
  return `Every ${day} ${window}`;
}

interface CoachBlocksListProps {
  blocks: CoachBlock[];
  onChange: () => void;
}

export function CoachBlocksList({ blocks, onChange }: CoachBlocksListProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteCoachBlock(id);
      setConfirmId(null);
      if ('error' in res) {
        // Rendered by parent toast on next refresh; for now log
        console.error("[CoachBlocksList] delete failed:", res.error);
      }
      onChange();
    });
  }

  if (blocks.length === 0) {
    return (
      <div className="mt-6 p-4 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
        No blocks. Use "Block Time" to mark unavailability.
      </div>
    );
  }

  // Sort: one-time first by start_date, then weekly by day_of_week
  const sorted = [...blocks].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'one_time' ? -1 : 1;
    if (a.kind === 'one_time') return (a.start_date ?? '').localeCompare(b.start_date ?? '');
    return (a.day_of_week ?? 0) - (b.day_of_week ?? 0);
  });

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Blocks</h3>
      <div className="space-y-1">
        {sorted.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 bg-white text-sm">
            <div className="min-w-0">
              <p className="text-slate-900 truncate">{describeBlock(b)}</p>
              {b.reason && <p className="text-xs text-slate-400 truncate">{b.reason}</p>}
            </div>
            {confirmId === b.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={isPending}
                  className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  disabled={isPending}
                  className="text-xs font-medium px-2 py-1 rounded text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(b.id)}
                className="text-slate-400 hover:text-red-500 p-1.5 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/CoachBlocksList.tsx
git commit -m "feat(scheduling): CoachBlocksList component"
```

---

## Task 7: Integrate blocks into ScheduleCalendar

**Files:**
- Modify: `src/components/coach/ScheduleCalendar.tsx`

This task adds three things to the existing calendar: (1) load blocks for the visible week, (2) render hatched cells where blocks fire, (3) "Block Time" button + drawer + blocks list.

- [ ] **Step 1: Add imports**

In `src/components/coach/ScheduleCalendar.tsx`, add to the imports at the top:

```tsx
import { BlockTimeDrawer } from "./BlockTimeDrawer";
import { CoachBlocksList } from "./CoachBlocksList";
import { Ban } from "lucide-react";
import type { CoachBlock } from "@/types/database";
```

(`Ban` is already a lucide icon name; if it isn't available, use `Slash` instead.)

- [ ] **Step 2: Add block state and fetch**

In the component, after the existing state declarations (near `setRefreshKey`), add:

```tsx
const [blocks, setBlocks] = useState<CoachBlock[]>([]);
const [showBlockDrawer, setShowBlockDrawer] = useState(false);
const [blockDrawerCoachId, setBlockDrawerCoachId] = useState(coachId);
```

Then add a new `useEffect` (after the existing groups/coaches loader) to fetch blocks for the visible week:

```tsx
useEffect(() => {
  async function loadBlocks() {
    const weekStart = formatLocalDate(weekDates[0]);
    const weekEnd = formatLocalDate(weekDates[6]);

    // For coach view: just self. For admin view: all coaches' blocks for now (we filter client-side).
    let query = supabase
      .from("coach_blocks")
      .select("*");

    if (!isAdmin) {
      query = query.eq("coach_id", coachId);
    } else if (!showAll) {
      query = query.eq("coach_id", coachId);
    }

    // Pull anything potentially overlapping the week
    query = query.or(
      `and(kind.eq.one_time,start_date.lte.${weekEnd},or(end_date.is.null,end_date.gte.${weekStart})),` +
      `and(kind.eq.weekly,or(effective_from.is.null,effective_from.lte.${weekEnd}),or(effective_until.is.null,effective_until.gte.${weekStart}))`
    );

    const { data } = await query;
    setBlocks((data || []) as CoachBlock[]);
  }
  loadBlocks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [coachId, showAll, selectedSaturday, refreshKey, isAdmin]);
```

- [ ] **Step 3: Build a per-day blocks map**

In the render body, after the existing `sessionsByDay` map (search for `const sessionsByDay = new Map`), add:

```tsx
// Build a per-day list of blocks that fire on each day of this week
const blocksByDay = new Map<string, CoachBlock[]>();
for (const b of blocks) {
  for (const date of weekDates) {
    const dateStr = formatLocalDate(date);
    const dow = date.getDay();
    let fires = false;
    if (b.kind === 'one_time') {
      const endDate = b.end_date ?? b.start_date;
      if (b.start_date && dateStr >= b.start_date && endDate && dateStr <= endDate) fires = true;
    } else {
      if (b.day_of_week === dow) {
        const fromOk = !b.effective_from || dateStr >= b.effective_from;
        const untilOk = !b.effective_until || dateStr <= b.effective_until;
        if (fromOk && untilOk) fires = true;
      }
    }
    if (fires) {
      const list = blocksByDay.get(dateStr) || [];
      list.push(b);
      blocksByDay.set(dateStr, list);
    }
  }
}
```

- [ ] **Step 4: Render the hatched overlay in the desktop grid**

In the desktop grid render (search for `<div className="space-y-1.5">` inside the desktop grid map), add a block overlay block right above the existing `daySessions.length === 0` check:

```tsx
<div className="space-y-1.5">
  {(blocksByDay.get(formatLocalDate(dateForDay)) || []).map((b) => (
    <div
      key={`block-${b.id}`}
      className="rounded-lg p-2 border-l-3 border-l-slate-400 bg-slate-100 bg-opacity-60"
      style={{
        backgroundImage: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.15) 0, rgba(100,116,139,0.15) 4px, transparent 4px, transparent 10px)'
      }}
      title={b.reason ?? "Blocked"}
    >
      <div className="flex items-center gap-1">
        <Ban className="w-3 h-3 text-slate-500" />
        <p className="text-[11px] font-semibold text-slate-700">
          {b.start_time === null ? 'All day' : `${b.start_time.slice(0, 5)}–${b.end_time?.slice(0, 5)}`}
        </p>
      </div>
      {b.reason && <p className="text-[10px] text-slate-500 truncate">{b.reason}</p>}
    </div>
  ))}
  {daySessions.length === 0 ? (
    /* ... existing empty-state ... */
  )}
```

Place the block divs **before** the `daySessions.length === 0` ternary so they appear at the top of the day's stack. (The empty-state "—" should still render only when there are no sessions; if there are blocks but no sessions, suppress the "—" by checking `daySessions.length === 0 && (blocksByDay.get(...) || []).length === 0`.)

Update the empty-state check:
```tsx
) : (
  daySessions.length === 0 && (blocksByDay.get(formatLocalDate(dateForDay)) || []).length === 0 ? (
    <div className="text-center py-4 text-[10px] text-slate-300">—</div>
  ) : null
)}
```

Apply equivalent changes to the **mobile** day list (search for `daySessions.length === 0 ? (` in the mobile section) — render blocks above sessions, suppress "No sessions" when blocks exist.

- [ ] **Step 5: Add the "Block Time" button**

In the controls section (search for `<Button size="sm" onClick={openAdd}>` which renders the existing "Add Session"), add a sibling button right before it for the block action — visible to both coach and admin:

```tsx
<Button size="sm" variant="secondary" onClick={() => { setBlockDrawerCoachId(coachId); setShowBlockDrawer(true); }}>
  <span className="flex items-center gap-1.5"><Ban className="w-4 h-4" /> <span className="hidden sm:inline">Block Time</span></span>
</Button>
```

The existing `<Button>` component should accept `variant="secondary"` — if not, use the bare class string used elsewhere for secondary buttons in this file.

This button should render **outside** the `{isAdmin && (...)` wrapper that wraps the "Add Session" button — coaches need it too. Move it above the `{isAdmin && ...` block:

```tsx
<div className="flex items-center gap-2">
  <Button size="sm" variant="secondary" onClick={() => { setBlockDrawerCoachId(coachId); setShowBlockDrawer(true); }}>
    <span className="flex items-center gap-1.5"><Ban className="w-4 h-4" /> <span className="hidden sm:inline">Block Time</span></span>
  </Button>
  {isAdmin && (
    <>
      {/* existing All Sessions / My Sessions toggle and Add Session button */}
    </>
  )}
</div>
```

- [ ] **Step 6: Mount the drawer and the blocks list**

At the bottom of the component, **outside** the `{isAdmin && ...` wrapper that holds the existing drawers, mount the new components:

```tsx
<BlockTimeDrawer
  open={showBlockDrawer}
  onClose={() => setShowBlockDrawer(false)}
  defaultCoachId={blockDrawerCoachId}
  isAdmin={isAdmin}
  coachOptions={isAdmin ? coaches : undefined}
  onSuccess={({ conflictCount }) => {
    setToast({
      message: conflictCount === 0
        ? "Block created"
        : `Block created. ${conflictCount} session${conflictCount === 1 ? '' : 's'} during this block — review and cancel manually if needed.`,
      variant: "success",
    });
    setRefreshKey((k) => k + 1);
  }}
/>

<CoachBlocksList
  blocks={blocks.filter((b) => isAdmin && showAll ? true : b.coach_id === coachId)}
  onChange={() => setRefreshKey((k) => k + 1)}
/>
```

The `Toast` component is already mounted inside the `{isAdmin && ...` wrapper. Move it out (or duplicate) so the toast fires for non-admin coaches too. Simplest: move the `<Toast ...>` line to the top level of the return, right before the controls div.

- [ ] **Step 7: Type check + build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: both clean.

- [ ] **Step 8: Manual verification (requires migration applied)**

1. Log in as a coach. Open `/coach/schedule`. Confirm "Block Time" button appears.
2. Click it. Drawer opens. Pick "One-time", today's date, 14:00-15:00, reason "Test." Submit. Toast says "Block created."
3. The calendar shows a gray hatched cell at 14:00 today. Hover shows "Test."
4. The blocks list below the calendar shows one entry with a delete icon.
5. Click delete; confirm; the block disappears and the hatched cell is gone.
6. Repeat with a "Recurring weekly" block: pick Mon/Wed/Fri, 09:00-17:00. Confirm three list entries are created and three sets of cells are hatched per week.
7. Log in as admin → `/admin/schedule`. Confirm the drawer shows a coach selector at the top.

- [ ] **Step 9: Commit**

```bash
git add src/components/coach/ScheduleCalendar.tsx
git commit -m "feat(scheduling): block time UI in ScheduleCalendar"
```

---

## Task 8: Wire blocks into player private-session picker

**Files:**
- Modify: `src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx`

The picker today fetches `schedule_sessions` and `private_session_requests` and merges them into a `reserved` array. Add coach blocks to the same merge.

- [ ] **Step 1: Extend the `ReservedSlot` type**

Find the existing `ReservedSlot` interface (top of file) and extend the `kind` union:

```tsx
interface ReservedSlot {
  start_time: string;
  end_time: string;
  kind: "group" | "private" | "block";
  reason?: string | null;  // For blocks only
}
```

- [ ] **Step 2: Fetch blocks inside `fetchReservations`**

Inside the `fetchReservations` function (in the `useEffect` that depends on `selectedCoachId, selectedDate`), after fetching `requestRows`, add a third fetch for the chosen coach's blocks on the selected date:

```tsx
let blockReservations: ReservedSlot[] = [];
if (selectedCoachId) {
  const dateStr = formatDateISO(selectedDate);
  const dow = selectedDate.getDay();
  const { data: blockRows } = await supabase
    .from("coach_blocks")
    .select("kind, start_date, end_date, day_of_week, effective_from, effective_until, start_time, end_time, reason")
    .eq("coach_id", selectedCoachId)
    .or(
      `and(kind.eq.one_time,start_date.lte.${dateStr},or(end_date.is.null,end_date.gte.${dateStr})),` +
      `and(kind.eq.weekly,day_of_week.eq.${dow},or(effective_from.is.null,effective_from.lte.${dateStr}),or(effective_until.is.null,effective_until.gte.${dateStr}))`
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blockReservations = ((blockRows || []) as any[]).map((b) => {
    // All-day blocks → block 06:00-23:59 (the picker's full visible range)
    const start = b.start_time ? b.start_time.slice(0, 5) : '06:00';
    const end = b.end_time ? b.end_time.slice(0, 5) : '23:59';
    return { start_time: start, end_time: end, kind: 'block' as const, reason: b.reason };
  });
}

setReserved([...recurringReservations, ...requestReservations, ...blockReservations]);
```

The `setReserved` line already exists — replace it with the version above (adding the third spread).

Note: the picker only fetches blocks when `selectedCoachId` is set. If the player hasn't picked a coach yet (multi-coach studio), no blocks are loaded. This matches the existing behavior for `requestRows` and `scheduleRows` filtering.

- [ ] **Step 3: Differentiate the slot tooltip**

Find the slot rendering markup (search for `isSlotReserved` or the slot button). The existing markup likely calls `reservationAt(slot, reserved)` and shows a generic "Reserved" tooltip. Update it to differentiate blocks:

In the slot button's `title` attribute (or surrounding logic), use:
```ts
const r = reservationAt(slotTime, reserved);
const tooltip = r?.kind === 'block'
  ? (r.reason ? `Coach unavailable — ${r.reason}` : 'Coach unavailable')
  : (r ? 'Already booked' : '');
```

If the existing code doesn't yet pass a `title`, add one. Search for `isSlotReserved(time` in the file and surround that slot button — usually around lines 350-400 — with the title-derivation logic.

- [ ] **Step 4: Type check + build**

Run: `npx tsc --noEmit`
Run: `npm run build`

- [ ] **Step 5: Manual verification**

Pre-req: at least one coach has a block configured (use Task 7 verification).

1. As a player, open the private-session request form. Pick the coach who has the block. Pick the date the block fires on.
2. The slots overlapping the block should render as red/unavailable. Hover/long-press shows "Coach unavailable" (or with reason).
3. Pick a coach without a block on that date — slots are normal.
4. Pick an all-day block date — the entire slot grid for that date is red.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx'
git commit -m "feat(private-sessions): respect coach blocks in player picker"
```

---

## Task 9: Wire blocks into admin private-session confirmation

**Files:**
- Modify: `src/app/_actions/private-sessions.ts`

Add a server-side check that refuses to confirm/create a private session into a blocked slot. Defense-in-depth — UI prevents most cases but server enforces.

- [ ] **Step 1: Add the import**

At the top of `src/app/_actions/private-sessions.ts`, add:

```ts
import { isCoachBlocked } from "@/lib/scheduling/coach-availability";
```

- [ ] **Step 2: Add the check in `confirmPrivateSessionRequest`**

Inside `confirmPrivateSessionRequest`, after fetching the request and resolving the coach id, but **before** inserting the `schedule_sessions` row, add:

```ts
// Resolve coach id (uses opts.coachId override if provided, else request.coach_id)
const effectiveCoachId = opts?.coachId ?? request.coach_id;

if (effectiveCoachId) {
  // Compute end time from start + duration
  const [sh, sm] = (request.requested_time as string).split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = startMinutes + (request.duration_minutes || 60);
  const eh = Math.floor(endMinutes / 60) % 24;
  const em = endMinutes % 60;
  const endTimeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

  const { blocked, matchingBlock } = await isCoachBlocked(
    effectiveCoachId,
    sessionDate,
    (request.requested_time as string).slice(0, 5),
    endTimeStr
  );
  if (blocked) {
    return {
      error: `Coach is blocked at this time${matchingBlock?.reason ? ` (${matchingBlock.reason})` : ''}. Pick a different time or remove the block first.`
    };
  }
}
```

Adapt the variable names to match what the function actually uses (the exact variable for the request row may be `request`, `data`, etc. — read the file to confirm).

- [ ] **Step 3: Add the check in `createAdminPrivateSession`**

Inside `createAdminPrivateSession`, after validating inputs but before the `schedule_sessions` insert, add:

```ts
if (data.coach_id) {
  const { blocked, matchingBlock } = await isCoachBlocked(
    data.coach_id,
    data.session_date,
    data.start_time.slice(0, 5),
    data.end_time.slice(0, 5)
  );
  if (blocked) {
    return {
      error: `Coach is blocked at this time${matchingBlock?.reason ? ` (${matchingBlock.reason})` : ''}. Pick a different time or remove the block first.`
    };
  }
}
```

- [ ] **Step 4: Type check + build**

Run: `npx tsc --noEmit`
Run: `npm run build`

- [ ] **Step 5: Manual verification**

1. Pre-req: a coach has a block at, say, today 14:00-16:00.
2. As admin, try to confirm a pending private-session request for that coach into that date+time. The drawer should show the error "Coach is blocked at this time."
3. Use the admin "Create Private Session" flow to create a session for that coach at the blocked time. Same error.
4. Confirm/create a session for a non-blocked coach at the same time — succeeds.
5. Remove the block, retry the confirm — succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/_actions/private-sessions.ts
git commit -m "feat(private-sessions): server-side block check in confirm and admin-create"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Coverage matrix**

Walk the spec's manual-verification list and confirm each scenario passes:

| # | Scenario | Pass? |
|---|---|---|
| 1 | One-time, intra-day | |
| 2 | One-time, full day, multi-day | |
| 3 | Weekly, day-job pattern (5 rows) | |
| 4 | Weekly with `effective_until` bound | |
| 5 | Conflict warning toast on create | |
| 6 | Server-side enforcement on confirm | |
| 7 | Permission boundary (coach can't delete other coach's block) | |
| 8 | Delete block → cells disappear, slots become bookable | |

For #7: in the SQL editor, log in as Coach A's session, then try `DELETE FROM coach_blocks WHERE id = '<coach B's block id>'`. Expected: 0 rows affected (RLS blocks).

- [ ] **Step 2: Final type-check + build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Both must exit 0.

- [ ] **Step 3: No commit**

Verification is the deliverable. If anything needed touching during verification, commit it as `chore: post-verification fixes` and re-run the verification.

---

## Self-review notes

- **Spec coverage:** Every spec section has at least one task — schema (Task 1), types (Task 2), helper (Task 3), server actions (Task 4), drawer + list components (Tasks 5-6), calendar integration (Task 7), player picker integration (Task 8), admin server-side enforcement (Task 9), end-to-end verification (Task 10).
- **No placeholders:** all SQL, TS, and TSX code is concrete.
- **Type consistency:** `CoachBlock` is the canonical row type from `database.ts`. `Conflict`, `CreateBlockInput`, and `AutoAssignResult` are exported from `coach-availability.ts` and used unchanged in callers. `block_kind` enum values are `'one_time'` and `'weekly'` everywhere.
- **The 90-day envelope cap** for unbounded weekly blocks is in `findConflictsForBlock` and matches the spec.
- **Soft failure** for the warning path: `createCoachBlock` always inserts; conflicts are returned alongside `success: true`.
- **DatePicker reuse:** the existing `DatePicker` accepts `value`/`onChange` so we use it controlled. Time inputs use native `<Input type="time">` because no `TimePicker` exists in the codebase.
