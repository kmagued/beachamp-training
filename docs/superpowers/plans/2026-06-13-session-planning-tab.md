# Session Planning Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Plan" tab to the session detail page where coaches and admins set a per-date training plan (a goal + a free-text list of workouts/trainings).

**Architecture:** Mirror the existing attendance feature. Store the plan in a new `session_plans` table keyed by `(schedule_session_id, session_date)`. Reads happen client-side via the browser Supabase client (gated by RLS); writes go through a `"use server"` action using the admin client after a `requireCoachOrAdmin` check. A new client component renders the form inside the existing tab shell in `SessionDetail.tsx`.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, Supabase (Postgres + RLS), Tailwind, lucide-react. No test framework exists in this repo — verification is via `npm run lint`, `npm run build` (type-check), and manual browser testing, matching how attendance was shipped.

---

## Spec reference

`docs/superpowers/specs/2026-06-13-session-planning-tab-design.md`

## File structure

- **Create** `supabase/migrations/20260613000000_session_plans.sql` — the table, unique index, RLS.
- **Modify** `src/app/_actions/training.ts` — add the `upsertSessionPlan` server action.
- **Create** `src/components/coach/SessionPlanTab.tsx` — the tab UI (load + edit + save).
- **Modify** `src/components/coach/SessionDetail.tsx` — register the tab and render it.

## Conventions to follow (verified in the codebase)

- Server actions live in `src/app/_actions/training.ts`, start with auth via `getCurrentUserRole()` + a `require*` guard, write through `createAdminClient() as any`, call `revalidatePath(...)`, and return `{ success: true }` or `{ error: string }`.
- `getCurrentUserRole()` returns `{ id, role }`; `requireCoachOrAdmin(user)` returns an error object or `null`.
- Upserts use `.upsert({...}, { onConflict: "col_a,col_b" })`.
- Client components read directly via `createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)`.
- Because `session_plans` is not yet in the generated `src/types/database.ts`, the new client/admin handles are cast with `as any` (same pattern used throughout this file and `SessionDetail.tsx`). Regenerating types is an optional follow-up, not a dependency.
- UI primitives come from `@/components/ui`: `Input`, `Textarea`, `Button`, `Badge`, `Skeleton`.

---

## Task 1: Database migration for `session_plans`

**Files:**
- Create: `supabase/migrations/20260613000000_session_plans.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260613000000_session_plans.sql` with exactly:

```sql
-- ═══════════════════════════════════════════
-- Session Plans — per-date training plan
-- (goal + free-text workouts) for a schedule session.
-- Coaches and admins only; mirrors the attendance pattern.
-- ═══════════════════════════════════════════

CREATE TABLE session_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  goal                TEXT,
  description         TEXT,
  updated_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One plan per session occurrence; also the upsert conflict target.
CREATE UNIQUE INDEX idx_session_plans_unique
  ON session_plans(schedule_session_id, session_date);

ALTER TABLE session_plans ENABLE ROW LEVEL SECURITY;

-- Coaches and admins can read and write. No player policy: players never see plans.
CREATE POLICY "Coaches and admins can manage session plans"
  ON session_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('coach', 'admin')
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected: Supabase applies the new migration with no errors.

(If the dev workflow uses a local stack, `npm run db:reset` is the equivalent. Use whichever this environment is configured for.)

- [ ] **Step 3: Verify the table exists**

Run (Supabase SQL editor or psql):
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'session_plans'
ORDER BY ordinal_position;
```
Expected: rows for `id, schedule_session_id, session_date, goal, description, updated_by, created_at, updated_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613000000_session_plans.sql
git commit -m "feat(session-plan): add session_plans table + RLS"
```

---

## Task 2: `upsertSessionPlan` server action

**Files:**
- Modify: `src/app/_actions/training.ts` (append a new section at the end of the file)

- [ ] **Step 1: Add the action**

Append to the end of `src/app/_actions/training.ts`:

```ts
// ═══════════════════════════════════════
// SESSION PLANS (Coach + Admin)
// ═══════════════════════════════════════

export async function upsertSessionPlan(data: {
  schedule_session_id: string;
  session_date: string;
  goal: string | null;
  description: string | null;
}) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("session_plans")
    .upsert(
      {
        schedule_session_id: data.schedule_session_id,
        session_date: data.session_date,
        goal: data.goal?.trim() || null,
        description: data.description?.trim() || null,
        updated_by: user!.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "schedule_session_id,session_date" },
    );

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  return { success: true };
}
```

- [ ] **Step 2: Type-check / lint the action**

Run: `npm run lint`
Expected: no new errors from `src/app/_actions/training.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/training.ts
git commit -m "feat(session-plan): add upsertSessionPlan server action"
```

---

## Task 3: `SessionPlanTab` component

**Files:**
- Create: `src/components/coach/SessionPlanTab.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/coach/SessionPlanTab.tsx` with exactly:

```tsx
"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Input, Textarea, Button, Badge, Skeleton } from "@/components/ui";
import { upsertSessionPlan } from "@/app/_actions/training";
import { Check, Target } from "lucide-react";

interface SessionPlanTabProps {
  scheduleSessionId: string;
  sessionDate: string;
}

export function SessionPlanTab({ scheduleSessionId, sessionDate }: SessionPlanTabProps) {
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [savedGoal, setSavedGoal] = useState("");
  const [savedDescription, setSavedDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("session_plans")
        .select("goal, description")
        .eq("schedule_session_id", scheduleSessionId)
        .eq("session_date", sessionDate)
        .maybeSingle();
      const g = data?.goal || "";
      const d = data?.description || "";
      setGoal(g);
      setDescription(d);
      setSavedGoal(g);
      setSavedDescription(d);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSessionId, sessionDate]);

  const hasChanges = goal !== savedGoal || description !== savedDescription;
  const showSaved = justSaved && !hasChanges;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await upsertSessionPlan({
        schedule_session_id: scheduleSessionId,
        session_date: sessionDate,
        goal: goal.trim() || null,
        description: description.trim() || null,
      });
      if ("error" in res) {
        setError((res as { error: string }).error);
        return;
      }
      setSavedGoal(goal);
      setSavedDescription(description);
      setJustSaved(true);
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-4 w-32 mt-2" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Target className="w-4 h-4" />
        <p className="text-xs">Set the goal and the workouts/trainings for this session.</p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Goal</label>
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Improve serve consistency and net play"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Workouts &amp; trainings</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder={"List the workouts and trainings to do, e.g.\n- 10 min warm-up\n- Serve drills\n- 3v3 game play"}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        {showSaved ? (
          <Badge variant="success">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          </Badge>
        ) : (
          <Button onClick={handleSave} disabled={!hasChanges || isPending}>
            {isPending ? "Saving..." : "Save Plan"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check / lint the component**

Run: `npm run lint`
Expected: no new errors from `src/components/coach/SessionPlanTab.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/SessionPlanTab.tsx
git commit -m "feat(session-plan): add SessionPlanTab component"
```

---

## Task 4: Wire the tab into `SessionDetail.tsx`

**Files:**
- Modify: `src/components/coach/SessionDetail.tsx` (import on line 7 and line 10, `TABS` at lines 40-42, render block after line 243)

- [ ] **Step 1: Add the `Target` icon to the lucide-react import**

In `src/components/coach/SessionDetail.tsx`, change line 7 from:

```tsx
import { ArrowLeft, Clock, MapPin, Users, Calendar, ClipboardCheck } from "lucide-react";
```

to:

```tsx
import { ArrowLeft, Clock, MapPin, Users, Calendar, ClipboardCheck, Target } from "lucide-react";
```

- [ ] **Step 2: Import the new component**

After the existing `import { AttendanceTab } from "./AttendanceTab";` (line 10), add:

```tsx
import { SessionPlanTab } from "./SessionPlanTab";
```

- [ ] **Step 3: Register the tab**

Change the `TABS` array (lines 40-42) from:

```tsx
const TABS = [
  { key: "attendance", label: "Attendance", icon: ClipboardCheck },
] as const;
```

to:

```tsx
const TABS = [
  { key: "attendance", label: "Attendance", icon: ClipboardCheck },
  { key: "plan", label: "Plan", icon: Target },
] as const;
```

(`activeTab` stays initialized to `"attendance"`, so Attendance remains the default tab.)

- [ ] **Step 4: Render the tab content**

Immediately after the closing `)}` of the `{activeTab === "attendance" && ( ... )}` block (ends at line 243, just before the closing `</Card>`), add:

```tsx
        {activeTab === "plan" && (
          <SessionPlanTab scheduleSessionId={session.id} sessionDate={dateParam} />
        )}
```

- [ ] **Step 5: Lint + build (type-check the whole change)**

Run: `npm run lint && npm run build`
Expected: lint passes; build completes with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/coach/SessionDetail.tsx
git commit -m "feat(session-plan): add Plan tab to session detail page"
```

---

## Task 5: Manual verification

No automated test harness exists, so verify in the running app.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: app starts (default `http://localhost:3000`).

- [ ] **Step 2: Verify as an admin**

1. Log in as an admin, open `/admin/schedule`, click into any session — URL is `/admin/sessions/<id>?date=<YYYY-MM-DD>`.
2. Confirm a **Plan** tab appears next to **Attendance**, with a target icon.
3. Open the Plan tab. Enter a Goal and a multi-line Workouts description. Click **Save Plan**.
4. Expected: button shows "Saving...", then a green **Saved** badge appears.
5. Reload the page, open the Plan tab again. Expected: the goal and description persist.

- [ ] **Step 3: Verify per-date independence**

1. From the same session, change the `?date=` query param to a different date (or navigate via the schedule to another occurrence of the same weekly slot).
2. Open the Plan tab. Expected: fields are empty (independent plan per date).
3. Enter a different plan, save, reload — confirm it persists and the original date's plan is unchanged.

- [ ] **Step 4: Verify as a coach**

1. Log in as a coach, open one of their sessions at `/coach/sessions/<id>?date=<...>`.
2. Confirm the Plan tab works identically (load, edit, save, persist).

- [ ] **Step 5: Verify the edit/save affordance**

1. With a saved plan showing the **Saved** badge, edit either field.
2. Expected: the badge is replaced by an enabled **Save Plan** button; saving again shows the badge.

- [ ] **Step 6 (optional): Confirm players have no access**

If convenient, query `session_plans` as a player-authenticated session (or check there is no player-facing UI surfacing it). Expected: RLS returns no rows for players; no player view references it.

---

## Self-review notes

- **Spec coverage:** per-date storage (Task 1 unique index + Task 2 conflict target), coach+admin write / player no-access (Task 1 RLS + Task 2 `requireCoachOrAdmin`), single free-text description (Task 3 `Textarea`), goal field (Task 3 `Input`), tab wiring for both `/admin` and `/coach` (Task 4, shared component). All covered.
- **No placeholders:** every code step contains complete, compilable code.
- **Type consistency:** action signature `upsertSessionPlan({ schedule_session_id, session_date, goal, description })` is called with exactly those keys from `SessionPlanTab`; conflict target `schedule_session_id,session_date` matches the unique index columns; read selects `goal, description` which exist on the table.
- **Out of scope (unchanged):** no structured workout items, no copy-last-week, no player display, no tab badge.
