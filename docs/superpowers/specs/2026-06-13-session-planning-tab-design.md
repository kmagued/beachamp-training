# Session Planning Tab — Design

**Date:** 2026-06-13
**Status:** Approved

## Summary

Add a "Plan" tab to the session detail page where coaches and admins can set a
training plan for a specific session occurrence: a short **goal** and a free-text
**description** listing the workouts and trainings to do.

## Decisions

These were settled during brainstorming:

1. **Scope: per date (each occurrence).** A `schedule_sessions` row is a recurring
   weekly template; the detail page is always opened for a specific `date`. The
   plan is stored per `(schedule_session_id, session_date)`, exactly like
   attendance. The same weekly slot can have a different plan each week.
2. **Access: coaches + admins edit; players do not see it.** This is an internal
   coaching tool. No player-facing display.
3. **Data shape: single free-text description.** Goal is a short line; the
   workouts/trainings are one multiline free-text field (no structured item list).

## Architecture

The feature mirrors the existing **attendance** pattern, which already solves the
per-date storage problem for the same page.

- Reads happen client-side via the browser Supabase client (anon key), gated by
  RLS.
- Writes happen through a server action using the admin (service-role) client,
  after an explicit `requireCoachOrAdmin` auth check — the same approach as
  `submitAttendance`.

### 1. Database

New migration: `supabase/migrations/20260613000000_session_plans.sql`

```sql
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

-- Mirrors the attendance "Coaches and admins can manage" policy.
-- No player SELECT policy: players never see plans.
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

- `goal` and `description` are both nullable free-text.
- `ON DELETE CASCADE`: deleting a schedule session removes its plans.

### 2. Server action

`upsertSessionPlan` in `src/app/_actions/training.ts`:

```ts
upsertSessionPlan(data: {
  schedule_session_id: string;
  session_date: string;
  goal: string | null;
  description: string | null;
})
```

- Auth: `getCurrentUserRole()` then `requireCoachOrAdmin(user)` — return the auth
  error if present (same as `submitAttendance`).
- Write: `createAdminClient()`, `upsert` onto the
  `(schedule_session_id, session_date)` unique index (`onConflict`), setting
  `goal`, `description`, `updated_by = user.id`, `updated_at = now()`.
- Trim inputs; store empty strings as `null`.
- `revalidatePath` for the admin and coach session detail routes.
- Return `{ success: true }` or `{ error: string }`, matching existing actions.

### 3. New component

`src/components/coach/SessionPlanTab.tsx` (client component).

Props: `{ scheduleSessionId: string; sessionDate: string }`.

Behavior:
- On mount, load the existing plan for `(scheduleSessionId, sessionDate)` via the
  browser Supabase client; show a skeleton while loading.
- **Goal** — single-line `Input` (`@/components/ui`).
- **Description** — multiline `Textarea` (~8 rows) for the workouts/trainings list.
- Save UX mirrors `AttendanceTab`:
  - Track a "dirty" state by comparing current fields to the loaded/saved values.
  - A **Save** button that calls `upsertSessionPlan` inside `useTransition`.
  - When there are no unsaved changes after a successful save, show a **"Saved"**
    badge instead of the button.
  - Inline error message on failure.
- Empty/initial state is just the two empty fields with helpful placeholders.

### 4. Wire into the detail page

`src/components/coach/SessionDetail.tsx`:
- Import a `Target` icon from `lucide-react` and `SessionPlanTab`.
- Add `{ key: "plan", label: "Plan", icon: Target }` to the `TABS` array.
  Attendance remains first and stays the default `activeTab`.
- Add a conditional render block:
  ```tsx
  {activeTab === "plan" && (
    <SessionPlanTab scheduleSessionId={session.id} sessionDate={dateParam} />
  )}
  ```
- Works for both `/admin` and `/coach`, which already share this component.

### 5. Types

Regenerate `src/types/database.ts` via `npm run db:types` so the
`session_plans` row type is available. If type generation can't run locally,
hand-add the `session_plans` table type following the existing shape.

## Error handling

- Action returns `{ error }` on auth failure or DB error; the tab renders it
  inline (same pattern as `AttendanceTab`'s `submitError`).
- Load failure leaves empty fields; the coach can still create a plan.
- Upsert avoids duplicate-row errors via the unique index conflict target.

## Testing

- Manual: open a session detail page in both `/admin` and `/coach`, switch to the
  Plan tab, enter a goal + description, save, reload, confirm persistence.
- Confirm a different `?date=` for the same session shows an independent plan.
- Confirm a player account cannot read `session_plans` (RLS).

## Out of scope (YAGNI)

- Structured/repeatable workout items (single free-text field instead).
- "Copy last week's plan" / templates.
- Player-facing display of the plan.
- A "plan exists" indicator badge on the tab.
