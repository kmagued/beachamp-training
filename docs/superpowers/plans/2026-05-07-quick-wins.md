# Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small features — unified active-player status, gender-based auto-assignment to default groups, and an optional Occupation field for player profiles.

**Architecture:** One additive Supabase migration (`occupation` column, `system_settings` key-value table, `players_with_status` view) + TypeScript wiring across the registration form, admin add-player form, players list, dashboard, and player detail page. The active-status predicate lives in the Postgres view so all surfaces read the same boolean. Auto-assignment runs after profile insert and falls back to an admin notification on failure (group full / no default configured). All changes are additive; no destructive operations.

**Tech Stack:** Next.js 15 (app router), TypeScript, Supabase (postgres + auth + admin client), existing notification helpers in `src/app/_actions/notifications.ts`.

**Spec:** See [docs/superpowers/specs/2026-05-07-quick-wins-design.md](../specs/2026-05-07-quick-wins-design.md) for the full design rationale and decision log.

**No test suite:** This project has no automated test runner. Each task ends with a **manual verification** step, not a `pytest` invocation. Treat verification steps as required gates before commit.

---

## File Structure

### New files
- `supabase/migrations/20260507000000_quick_wins.sql` — additive schema migration.
- `src/lib/settings/system-settings.ts` — typed client helpers `getSystemSetting()` / `setSystemSetting()` / `clearSystemSetting()`.
- `src/lib/players/auto-assign-group.ts` — `autoAssignGenderGroup()` helper called from both registration paths.

### Modified files
- `src/types/database.ts` — add `occupation` to `profiles` Row/Insert/Update; add `system_settings` table type; add `players_with_status` view type.
- `src/app/(auth)/register/page.tsx` — gender becomes required; new occupation input; client-side validation message.
- `src/lib/actions/auth.ts` — `register()` accepts `occupation`, calls `autoAssignGenderGroup` after profile insert.
- `src/app/(portal)/admin/players/add/_components/add-player-form.tsx` — gender required select; new occupation textarea/input; FormData includes occupation.
- `src/app/(portal)/admin/players/add/actions.ts` — `addSinglePlayer()` accepts `occupation`, calls `autoAssignGenderGroup` after profile insert.
- `src/app/(portal)/admin/players/_components/types.ts` — `PlayerRow` gains `is_currently_active: boolean`; `getActivityStatus` reads from it.
- `src/app/(portal)/admin/players/page.tsx` — query against the view; merge `is_currently_active`.
- `src/app/(portal)/admin/players/[id]/page.tsx` — fetch `is_currently_active` for the detail page.
- `src/app/(portal)/admin/players/[id]/_components/player-header.tsx` — prop renamed `isCurrentlyActive: boolean`; same UI.
- `src/app/(portal)/admin/dashboard/page.tsx` — replace ad-hoc attendance count with one read against the view.
- `src/app/(portal)/admin/groups/page.tsx` — add inline "Default for men" / "Default for women" toggles; load current defaults on mount.
- `src/app/(portal)/admin/players/[id]/` — display `occupation` next to `area` in the read view (find the relevant component during Task 6).

### Test files
None — manual verification only.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260507000000_quick_wins.sql`

- [ ] **Step 1: Create the migration file with all schema changes**

Write `supabase/migrations/20260507000000_quick_wins.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- Quick Wins Batch (2026-05-07)
--   1. profiles.occupation — optional free-text field
--   2. system_settings — generic key/value config table
--   3. players_with_status — unified active-status view
--   4. attendance index for the view's EXISTS subquery
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Occupation column on profiles ─────────────────────────
ALTER TABLE profiles ADD COLUMN occupation TEXT;

-- ─── 2. system_settings key/value store ───────────────────────
CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage system_settings"
  ON system_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 3. Unified active-status view ────────────────────────────
-- A player is "currently active" if they attended in the last 30 days
-- OR have a valid subscription with sessions remaining.
CREATE OR REPLACE VIEW players_with_status AS
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
      AND s.status IN ('active', 'pending')
      AND s.sessions_remaining > 0
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  ) AS is_currently_active
FROM profiles p
WHERE p.role = 'player';

-- Allow the same access pattern as profiles
GRANT SELECT ON players_with_status TO authenticated;

-- ─── 4. Supporting index ──────────────────────────────────────
-- Speeds up the EXISTS subquery on attendance.
CREATE INDEX IF NOT EXISTS idx_attendance_player_date_status
  ON attendance(player_id, session_date, status);
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or `npx supabase migration up` depending on local setup; check `package.json` scripts for the project convention — there may be `npm run db:push` or similar).

Expected: migration applied without errors, no warnings about missing tables/columns.

- [ ] **Step 3: Manual verification — query the view directly**

Open the Supabase SQL editor (or `psql`) and run:

```sql
SELECT id, first_name, last_name, is_currently_active
FROM players_with_status
LIMIT 10;
```

Expected: returns rows with a boolean `is_currently_active` column. No errors.

Also verify the new tables/columns exist:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'occupation';
-- Expected: 1 row.

SELECT * FROM system_settings;
-- Expected: empty result, no error.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260507000000_quick_wins.sql
git commit -m "feat(db): occupation column, system_settings, players_with_status view"
```

---

## Task 2: Update Database TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `occupation` to the `profiles` table type**

In `src/types/database.ts`, in the `profiles` block (lines ~24-102):

- In `Row`: add `occupation: string | null;` after the `gender` field.
- In `Insert`: add `occupation?: string | null;` after the `gender` field.
- In `Update`: add `occupation?: string | null;` after the `gender` field.

So the `Row` snippet becomes:
```ts
gender: Gender | null;
occupation: string | null;
is_active: boolean;
```

Apply the same insertion pattern to `Insert` and `Update`.

- [ ] **Step 2: Add `system_settings` table type**

In the `Tables` object in `src/types/database.ts`, add a new entry alongside `profiles`:

```ts
system_settings: {
  Row: {
    key: string;
    value: Record<string, unknown>;
    updated_at: string;
    updated_by: string | null;
  };
  Insert: {
    key: string;
    value: Record<string, unknown>;
    updated_at?: string;
    updated_by?: string | null;
  };
  Update: {
    key?: string;
    value?: Record<string, unknown>;
    updated_at?: string;
    updated_by?: string | null;
  };
  Relationships: [];
};
```

- [ ] **Step 3: Add `players_with_status` view type**

If the file has a `Views` section, add the view there. If not, add one. Mirror `profiles.Row` and add `is_currently_active`:

```ts
Views: {
  players_with_status: {
    Row: {
      // mirrors profiles.Row exactly
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string | null;
      phone: string | null;
      email: string | null;
      role: UserRole;
      area: string | null;
      playing_level: PlayingLevel | null;
      training_goals: string | null;
      health_conditions: string | null;
      preferred_package_id: string | null;
      avatar_url: string | null;
      height: number | null;
      weight: number | null;
      preferred_hand: PreferredHand | null;
      preferred_position: PreferredPosition | null;
      guardian_name: string | null;
      guardian_phone: string | null;
      gender: Gender | null;
      occupation: string | null;
      is_active: boolean;
      profile_completed: boolean;
      created_at: string;
      updated_at: string;
      // view-only column
      is_currently_active: boolean;
    };
    Relationships: [];
  };
};
```

If the existing `Database` interface doesn't currently have a `Views` key, add it as a sibling of `Tables` inside `public`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: clean output (or no new errors compared to the pre-task baseline). If existing unrelated errors are present, confirm they pre-existed by `git stash`-ing your changes, running tsc, and comparing.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add occupation, system_settings, players_with_status"
```

---

## Task 3: Occupation field — self-registration form

**Files:**
- Modify: `src/app/(auth)/register/page.tsx`
- Modify: `src/lib/actions/auth.ts`

- [ ] **Step 1: Add `occupation` to the form state in `register/page.tsx`**

Find the `useState` form initializer at lines ~21-31 and add `occupation: ""`:

```tsx
const [form, setForm] = useState({
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  email: "",
  phone: "",
  area: "",
  occupation: "",
  password: "",
  confirm_password: "",
});
```

- [ ] **Step 2: Add the occupation input to the form markup**

Place it directly after the `area` field block (lines ~167-181). Match the `area` field's pattern exactly except no `required` and no datalist:

```tsx
<div>
  <Label>Occupation</Label>
  <Input
    type="text"
    value={form.occupation}
    onChange={(e) => updateField("occupation", e.target.value)}
    placeholder="e.g. Engineer, Student, Doctor"
  />
</div>
```

Note: the existing `area` field uses `<Label required>` — we omit `required` here because occupation is optional.

- [ ] **Step 3: Verify the FormData submit loop already includes occupation**

The submit handler (lines ~52-75) iterates `Object.entries(form)` and sets every key except `confirm_password`, so `occupation` is automatically included. No change required.

- [ ] **Step 4: Update the `register` server action to read and persist occupation**

Open `src/lib/actions/auth.ts`. In the `register` function (lines ~50-94), after the existing `gender` extraction, add:

```ts
const occupation = formData.get("occupation") as string;
```

Then in the profile insert object, add the field after `gender`:

```ts
gender: gender || null,
occupation: occupation || null,
role: "player",
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

1. Open the registration page.
2. Fill out the form including a value in the new "Occupation" field (e.g., "Engineer").
3. Submit. Expected: registration succeeds, user redirects to `/verify-email`.
4. In the Supabase SQL editor: `SELECT id, first_name, occupation FROM profiles ORDER BY created_at DESC LIMIT 1;`
   Expected: the new row has `occupation = 'Engineer'`.
5. Repeat with the occupation field left empty. Expected: `occupation` is `NULL`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/register/page.tsx src/lib/actions/auth.ts
git commit -m "feat(auth): occupation field in self-registration"
```

---

## Task 4: Occupation field — admin add-player form

**Files:**
- Modify: `src/app/(portal)/admin/players/add/_components/add-player-form.tsx`
- Modify: `src/app/(portal)/admin/players/add/actions.ts`

- [ ] **Step 1: Add the `occupation` state hook**

In `add-player-form.tsx`, near the other useState declarations (lines ~20-42), add after `gender`:

```tsx
const [occupation, setOccupation] = useState("");
```

- [ ] **Step 2: Add the occupation input near other optional fields**

Place it adjacent to the existing `area` or `playing_level` field markup (search for `setArea` to locate). Match the existing optional-field pattern (single-column `div`, `<Label>`, `<Input>`):

```tsx
<div>
  <Label>Occupation</Label>
  <Input
    type="text"
    value={occupation}
    onChange={(e) => setOccupation(e.target.value)}
    placeholder="e.g. Engineer, Student, Doctor"
  />
</div>
```

- [ ] **Step 3: Include `occupation` in the FormData submit**

In `handleSubmit` (lines ~80-141), after `formData.set("gender", gender);` add:

```ts
formData.set("occupation", occupation);
```

Also reset it in the success handler — find the `setFirstName("");` reset block and add `setOccupation("");` alongside it.

- [ ] **Step 4: Update `addSinglePlayer` server action**

Open `src/app/(portal)/admin/players/add/actions.ts`. After the `gender` extraction (line ~24):

```ts
const occupation = (formData.get("occupation") as string)?.trim() || null;
```

In the profile insert object (after `gender`):

```ts
gender,
occupation,
playing_level: playingLevel,
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

1. Log in as admin, navigate to the add-player page.
2. Create a player with an occupation value.
3. SQL check: `SELECT first_name, occupation FROM profiles WHERE first_name = '<your test name>';`
   Expected: occupation is set.
4. Create another without occupation. Expected: `occupation = NULL`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(portal\)/admin/players/add/_components/add-player-form.tsx src/app/\(portal\)/admin/players/add/actions.ts
git commit -m "feat(admin): occupation field in add-player form"
```

---

## Task 5: Display occupation on player detail page

**Files:**
- Modify: a component under `src/app/(portal)/admin/players/[id]/` that renders the read view of profile fields

- [ ] **Step 1: Locate the component that renders `area`**

Run: `grep -rn '"area"' src/app/\(portal\)/admin/players/\[id\]/` and `grep -rn 'player.area' src/app/\(portal\)/admin/players/\[id\]/`.

The grep result identifies the component. (Likely `_components/player-info.tsx` or similar — confirm by inspecting.)

- [ ] **Step 2: Render occupation next to area, only when set**

In that component, find the JSX block that conditionally renders `player.area`. Directly after it, add the same pattern for occupation. Example, if the existing pattern is:

```tsx
{player.area && (
  <div>
    <span className="label">Area</span>
    <span>{player.area}</span>
  </div>
)}
```

Add:

```tsx
{player.occupation && (
  <div>
    <span className="label">Occupation</span>
    <span>{player.occupation}</span>
  </div>
)}
```

Use the **exact same JSX/CSS classes** the surrounding code uses for `area` — do not invent new styling. The goal is parity, not custom markup.

- [ ] **Step 3: Confirm the player query selects `occupation`**

Open `src/app/(portal)/admin/players/[id]/page.tsx` and find the profile fetch (the `from("profiles").select(...)` call). Confirm the select string includes `occupation`. If it uses `*` or `select()` with no args, no change. If it lists specific columns, add `occupation`.

Also confirm the `PlayerProfile` type used by the page includes `occupation: string | null`. If it's a local interface, add the field. If it imports from `database.ts`, no change (Task 2 already added it).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`

1. Visit a player who has occupation set (use the test player from Task 3 or 4). Expected: occupation appears next to area.
2. Visit a player with `occupation = NULL`. Expected: occupation row does not render.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(portal\)/admin/players/\[id\]/
git commit -m "feat(admin): show occupation on player detail page"
```

---

## Task 6: Refactor `getActivityStatus` to use the view

**Files:**
- Modify: `src/app/(portal)/admin/players/_components/types.ts`

- [ ] **Step 1: Add `is_currently_active` to the `PlayerRow` interface**

In `src/app/(portal)/admin/players/_components/types.ts` (lines ~1-32), add the field. Place it next to `is_active`:

```ts
is_active: boolean;
is_currently_active: boolean;
created_at: string;
```

You can keep `last_attended` and `subscriptions` for now — other UI may still use them — but the activity predicate no longer reads them.

- [ ] **Step 2: Replace `getActivityStatus` body**

Replace the function (lines ~67-75) with:

```ts
/**
 * Player is active if they trained in last 30 days OR have a valid subscription.
 * Predicate is computed by the `players_with_status` Postgres view.
 */
export function getActivityStatus(player: PlayerRow): ActivityStatus {
  return player.is_currently_active ? "active" : "inactive";
}
```

(Delete the now-unused 30-day arithmetic.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: any new errors will be in callers that don't yet supply `is_currently_active` — that's fixed in Task 7. Note them; proceed.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/admin/players/_components/types.ts
git commit -m "refactor(players): getActivityStatus reads is_currently_active from view"
```

---

## Task 7: Players list page — fetch from view

**Files:**
- Modify: `src/app/(portal)/admin/players/page.tsx`

- [ ] **Step 1: Add a parallel fetch of `players_with_status`**

In `fetchPlayers` (lines ~77-96), add a fourth parallel query alongside the existing three:

```ts
const [{ data: profileData }, { data: attendanceData }, { data: groupPlayerData }, { data: statusRows }] = await Promise.all([
  supabase
    .from("profiles")
    .select("id, first_name, last_name, email, phone, date_of_birth, area, gender, occupation, playing_level, training_goals, health_conditions, height, weight, preferred_hand, preferred_position, guardian_name, guardian_phone, is_active, created_at, subscriptions(id, status, sessions_remaining, sessions_total, start_date, end_date, packages(name))")
    .eq("role", "player")
    .order("created_at", { ascending: false }),
  supabase
    .from("attendance")
    .select("player_id, session_date")
    .eq("status", "present")
    .gte("session_date", thirtyDaysAgo)
    .order("session_date", { ascending: false }),
  supabase
    .from("group_players")
    .select("player_id, groups(id, name)")
    .eq("is_active", true),
  supabase
    .from("players_with_status")
    .select("id, is_currently_active"),
]);
```

Note: I've also added `occupation` to the select on profiles.

- [ ] **Step 2: Build a status lookup map and merge into the player rows**

After the four queries return, before the existing mapping into `PlayerRow`s, build:

```ts
const statusById = new Map<string, boolean>(
  (statusRows || []).map((r: { id: string; is_currently_active: boolean }) => [r.id, r.is_currently_active])
);
```

Then where the code constructs each `PlayerRow`, add `is_currently_active: statusById.get(profile.id) ?? false`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`

1. Log in as admin, open the players list.
2. Note which players show as "active" and which as "inactive."
3. Pick a player with an active subscription but no recent attendance — confirm they now show as **active** (this was the original bug; previously they showed inactive).
4. Pick a player with no subscription and no recent attendance — confirm **inactive**.
5. Pick a player who attended a session in the last 30 days — confirm **active** regardless of subscription status.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/admin/players/page.tsx
git commit -m "feat(players): list reads is_currently_active from view"
```

---

## Task 8: Player detail page — fetch and display

**Files:**
- Modify: `src/app/(portal)/admin/players/[id]/page.tsx`
- Modify: `src/app/(portal)/admin/players/[id]/_components/player-header.tsx`

- [ ] **Step 1: Fetch `is_currently_active` from the view**

In `src/app/(portal)/admin/players/[id]/page.tsx`, alongside the existing parallel fetches, add a fetch for the status:

```ts
const { data: statusRow } = await supabase
  .from("players_with_status")
  .select("is_currently_active")
  .eq("id", id)
  .maybeSingle();

const isCurrentlyActive = !!statusRow?.is_currently_active;
```

- [ ] **Step 2: Remove the local `activeSubs` predicate (or repurpose it)**

The current code (line ~84) computes `activeSubs` and presumably feeds `hasActiveSubscription` into the header. Replace the prop value passed to `<PlayerHeader>` from `hasActiveSubscription={activeSubs.length > 0}` to `isCurrentlyActive={isCurrentlyActive}`.

If `activeSubs` is used elsewhere on the page (e.g., showing subscription details), keep that usage but rename clearly to avoid confusion (`validSubs` or leave as-is — the variable doesn't conflict).

- [ ] **Step 3: Rename the prop in `player-header.tsx`**

In `src/app/(portal)/admin/players/[id]/_components/player-header.tsx` (lines 5-34):

Change the interface:
```tsx
interface PlayerHeaderProps {
  player: PlayerProfile;
  isCurrentlyActive: boolean;
  actions?: React.ReactNode;
}
```

Change the destructuring and Badge:
```tsx
export function PlayerHeader({ player, isCurrentlyActive, actions }: PlayerHeaderProps) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        {/* ... */}
        <Badge variant={isCurrentlyActive ? "success" : "neutral"}>
          {isCurrentlyActive ? "Active" : "Inactive"}
        </Badge>
        {/* ... */}
      </div>
      {actions}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: clean. If anything else references `hasActiveSubscription` on `<PlayerHeader>`, fix those call sites.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

1. Visit a player with valid subscription, no recent attendance. Expected badge: **Active** (matches the list).
2. Visit a player with recent attendance, no subscription. Expected: **Active**.
3. Visit a player with neither. Expected: **Inactive**.

Confirm the badge state matches the players-list classification for the same player.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(portal\)/admin/players/\[id\]/page.tsx src/app/\(portal\)/admin/players/\[id\]/_components/player-header.tsx
git commit -m "feat(players): detail badge reads is_currently_active from view"
```

---

## Task 9: Dashboard active-player count from view

**Files:**
- Modify: `src/app/(portal)/admin/dashboard/page.tsx`

- [ ] **Step 1: Replace the attendance-based set with one query**

Find the block at lines ~134-143 that builds `playerIdSet` and `activeIds`. Delete that entire block. In its place, add one query above (alongside the other dashboard fetches):

```ts
const { count: activePlayerCount } = await supabase
  .from("players_with_status")
  .select("id", { count: "exact", head: true })
  .eq("is_currently_active", true);
```

If the dashboard already has a list of parallel fetches in a `Promise.all`, integrate the query there instead. Match the surrounding style.

If `activeProfiles` and `recentAttendance` were only used by the deleted block, remove their queries too. If they're used elsewhere on the dashboard, leave them.

- [ ] **Step 2: Use `activePlayerCount` (now a number | null) in the stat card**

The stat card render expects a number. Replace any references that previously read `activeIds.size` with `activePlayerCount ?? 0`.

- [ ] **Step 3: Type-check & manual verification**

Run: `npx tsc --noEmit`

Run: `npm run dev` → open the dashboard.

Cross-check: count the rows in the players list with badge "Active." That number must equal the dashboard "Active players" stat. (Before this task, those numbers could differ.)

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/admin/dashboard/page.tsx
git commit -m "feat(dashboard): active-player count from players_with_status view"
```

---

## Task 10: `system_settings` typed helper

**Files:**
- Create: `src/lib/settings/system-settings.ts`

- [ ] **Step 1: Write the helper module**

Create `src/lib/settings/system-settings.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type SystemSettingKey = "default_male_group_id" | "default_female_group_id";

/** Read a setting. Returns null if unset. */
export async function getSystemSetting<T = Record<string, unknown>>(
  key: SystemSettingKey
): Promise<T | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? null;
}

/** Write a setting. Upserts on key. */
export async function setSystemSetting(
  key: SystemSettingKey,
  value: Record<string, unknown>
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("system_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) return { error: error.message };
  return {};
}

/** Delete a setting. */
export async function clearSystemSetting(
  key: SystemSettingKey
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("system_settings").delete().eq("key", key);
  if (error) return { error: error.message };
  return {};
}
```

The `as any` casts mirror the existing pattern used elsewhere in this codebase (e.g., `src/lib/actions/auth.ts`) where the admin client lacks generated types. If the project later regenerates types from the new schema, these can be tightened.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/settings/system-settings.ts
git commit -m "feat(settings): typed system_settings helper"
```

---

## Task 11: Default-group toggles on the groups page

**Files:**
- Modify: `src/app/(portal)/admin/groups/page.tsx`
- Possibly modify: a child component that renders an individual group card/row

- [ ] **Step 1: Load current defaults on mount**

In the groups page component, add new state:

```ts
const [defaultMaleGroupId, setDefaultMaleGroupId] = useState<string | null>(null);
const [defaultFemaleGroupId, setDefaultFemaleGroupId] = useState<string | null>(null);
```

Inside the existing `fetchGroups` function, after the parallel fetches return, also fetch the two settings:

```ts
const [maleSetting, femaleSetting] = await Promise.all([
  getSystemSetting<{ group_id: string }>("default_male_group_id"),
  getSystemSetting<{ group_id: string }>("default_female_group_id"),
]);
setDefaultMaleGroupId(maleSetting?.group_id ?? null);
setDefaultFemaleGroupId(femaleSetting?.group_id ?? null);
```

Import: `import { getSystemSetting, setSystemSetting, clearSystemSetting } from "@/lib/settings/system-settings";`

- [ ] **Step 2: Add toggle handlers**

```ts
async function toggleDefault(gender: "male" | "female", groupId: string) {
  const key = gender === "male" ? "default_male_group_id" : "default_female_group_id";
  const currentId = gender === "male" ? defaultMaleGroupId : defaultFemaleGroupId;

  if (currentId === groupId) {
    // Clicking the active default clears it
    await clearSystemSetting(key);
    if (gender === "male") setDefaultMaleGroupId(null);
    else setDefaultFemaleGroupId(null);
  } else {
    await setSystemSetting(key, { group_id: groupId });
    if (gender === "male") setDefaultMaleGroupId(groupId);
    else setDefaultFemaleGroupId(groupId);
  }
}
```

- [ ] **Step 3: Render the toggles on each group row**

Find the JSX that renders an individual group (likely a `.map` over `groups` returning a card or row). In each group's action area, add:

```tsx
<button
  type="button"
  onClick={() => toggleDefault("male", group.id)}
  className={`text-xs px-2 py-1 rounded border ${
    defaultMaleGroupId === group.id
      ? "bg-blue-50 border-blue-500 text-blue-700"
      : "border-gray-300 text-gray-500 hover:border-gray-400"
  }`}
  aria-pressed={defaultMaleGroupId === group.id}
>
  {defaultMaleGroupId === group.id ? "★ Default for men" : "Set as default for men"}
</button>
<button
  type="button"
  onClick={() => toggleDefault("female", group.id)}
  className={`text-xs px-2 py-1 rounded border ${
    defaultFemaleGroupId === group.id
      ? "bg-pink-50 border-pink-500 text-pink-700"
      : "border-gray-300 text-gray-500 hover:border-gray-400"
  }`}
  aria-pressed={defaultFemaleGroupId === group.id}
>
  {defaultFemaleGroupId === group.id ? "★ Default for women" : "Set as default for women"}
</button>
```

If the codebase has a `Button` component used elsewhere on this page, use that with appropriate variants instead of raw `<button>`. Look at sibling action buttons on the same page and match.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`

1. Open the groups page as admin.
2. Click "Set as default for men" on Group A. Expected: button changes to "★ Default for men".
3. Click "Set as default for men" on Group B. Expected: B becomes the default; A reverts to "Set as default for men". (Single-default semantics.)
4. Click the active default again. Expected: clears.
5. SQL check: `SELECT key, value FROM system_settings;` reflects the latest state.
6. Reload the page. Expected: the active defaults persist.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(portal\)/admin/groups/
git commit -m "feat(groups): default group toggles for men/women"
```

---

## Task 12: `autoAssignGenderGroup` helper

**Files:**
- Create: `src/lib/players/auto-assign-group.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/players/auto-assign-group.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSystemSetting } from "@/lib/settings/system-settings";
import { notifyAdmins } from "@/app/_actions/notifications";

export type AutoAssignResult =
  | { assigned: true; groupId: string; groupName: string }
  | { assigned: false; reason: "no_default" | "group_full"; groupName?: string };

/**
 * Assigns a newly-registered player to the configured default group for their gender.
 * On failure (no default set or group full), creates an admin notification but does
 * NOT throw — caller should not roll back the player creation.
 */
export async function autoAssignGenderGroup(
  playerId: string,
  playerName: string,
  gender: "male" | "female"
): Promise<AutoAssignResult> {
  const settingKey = gender === "male" ? "default_male_group_id" : "default_female_group_id";
  const setting = await getSystemSetting<{ group_id: string }>(settingKey);

  if (!setting?.group_id) {
    await notifyAdmins({
      title: "Auto-assign skipped: no default group",
      body: `${playerName} (${gender}) registered but no default ${gender} group is configured. Open the groups page to set one.`,
      type: "system",
      link: "/admin/groups",
    });
    return { assigned: false, reason: "no_default" };
  }

  const groupId = setting.group_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Look up the group's max_players + name in parallel with the current count.
  const [{ data: group }, { count: currentCount }] = await Promise.all([
    admin.from("groups").select("name, max_players").eq("id", groupId).maybeSingle(),
    admin
      .from("group_players")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("is_active", true),
  ]);

  if (!group) {
    // Configured group was deleted out from under us — treat as no_default.
    await notifyAdmins({
      title: "Auto-assign failed: default group missing",
      body: `${playerName} (${gender}) registered but the configured default ${gender} group no longer exists. Reconfigure on the groups page.`,
      type: "system",
      link: "/admin/groups",
    });
    return { assigned: false, reason: "no_default" };
  }

  if ((currentCount ?? 0) >= (group.max_players ?? 0)) {
    await notifyAdmins({
      title: "Auto-assign skipped: group full",
      body: `${playerName} (${gender}) could not be auto-assigned because group "${group.name}" is at capacity (${currentCount}/${group.max_players}). Assign manually or set a different default group.`,
      type: "system",
      link: `/admin/players/${playerId}`,
    });
    return { assigned: false, reason: "group_full", groupName: group.name };
  }

  const { error } = await admin.from("group_players").insert({
    group_id: groupId,
    player_id: playerId,
    is_active: true,
  });

  if (error) {
    console.error("[auto-assign] insert failed:", error);
    await notifyAdmins({
      title: "Auto-assign failed",
      body: `${playerName} (${gender}) could not be auto-assigned to "${group.name}": ${error.message}`,
      type: "system",
      link: `/admin/players/${playerId}`,
    });
    return { assigned: false, reason: "group_full", groupName: group.name };
  }

  return { assigned: true, groupId, groupName: group.name };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/players/auto-assign-group.ts
git commit -m "feat(players): autoAssignGenderGroup helper with admin-notify fallback"
```

---

## Task 13: Wire helper into self-registration

**Files:**
- Modify: `src/lib/actions/auth.ts`

- [ ] **Step 1: Call the helper after a successful profile insert**

In `register()` (lines ~50-94), after the profile insert succeeds and before the `redirect`, add:

```ts
if (data.user && (gender === "male" || gender === "female")) {
  try {
    await autoAssignGenderGroup(
      data.user.id,
      `${firstName} ${lastName}`,
      gender as "male" | "female"
    );
  } catch (e) {
    // Helper handles its own error notifications; never block registration.
    console.error("[register] auto-assign threw:", e);
  }
}
```

Add the import at the top:

```ts
import { autoAssignGenderGroup } from "@/lib/players/auto-assign-group";
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`

Pre-req: at least one default group is configured (use Task 11 if not).

1. Register a new male player. Expected: registration succeeds.
2. SQL check: `SELECT * FROM group_players WHERE player_id = '<new-id>';` — expect 1 row pointing at the male default group.
3. Clear the male default (toggle off in admin UI). Register another male player.
4. Expected: registration still succeeds. Check `SELECT * FROM notifications WHERE type = 'system' ORDER BY created_at DESC LIMIT 1;` — expect "Auto-assign skipped: no default group" addressed to admin(s).

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/auth.ts
git commit -m "feat(auth): auto-assign new registrants to gender default group"
```

---

## Task 14: Wire helper into admin add-player

**Files:**
- Modify: `src/app/(portal)/admin/players/add/actions.ts`

- [ ] **Step 1: Call the helper after profile insert succeeds**

In `addSinglePlayer()`, after the profile insert succeeds and before the subscription block (around the existing `if (profileError) return ...` check), add:

```ts
if (gender === "male" || gender === "female") {
  try {
    await autoAssignGenderGroup(
      userId,
      `${firstName} ${lastName}`,
      gender as "male" | "female"
    );
  } catch (e) {
    console.error("[addSinglePlayer] auto-assign threw:", e);
  }
}
```

Import at the top:

```ts
import { autoAssignGenderGroup } from "@/lib/players/auto-assign-group";
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`

1. Admin-create a new female player (with a default female group configured). Expected: row created in `group_players` for the default female group.
2. Admin-create a player with no gender. Expected: no `group_players` row, no notification.
3. Fill the default group to its `max_players`, then create another female player. Expected: profile created, "Auto-assign skipped: group full" notification.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(portal\)/admin/players/add/actions.ts
git commit -m "feat(admin): auto-assign newly-added players to gender default group"
```

---

## Task 15: Make gender required on both forms

**Files:**
- Modify: `src/app/(auth)/register/page.tsx`
- Modify: `src/app/(portal)/admin/players/add/_components/add-player-form.tsx`

- [ ] **Step 1: Mark the gender label `required` in the registration form**

In `src/app/(auth)/register/page.tsx`, update the gender field block (lines ~134-144) to use `<Label required>`:

```tsx
<div>
  <Label required>Gender</Label>
  <Select
    value={form.gender}
    onChange={(e) => updateField("gender", e.target.value)}
  >
    <option value="">Select...</option>
    <option value="male">Male</option>
    <option value="female">Female</option>
  </Select>
</div>
```

- [ ] **Step 2: Add gender to the registration form's `validate()` function**

Find the existing `validate()` function in `register/page.tsx`. Add a check (placement should match existing required-field checks):

```ts
if (!form.gender) {
  return "Gender is required so we can assign you to the right training group.";
}
```

- [ ] **Step 3: Mark the gender label `required` in the admin add-player form**

In `add-player-form.tsx`, update the gender block (lines ~200-207):

```tsx
<div>
  <Label required>Gender</Label>
  <Select value={gender} onChange={(e) => setGender(e.target.value)}>
    <option value="">Select...</option>
    <option value="male">Male</option>
    <option value="female">Female</option>
  </Select>
</div>
```

- [ ] **Step 4: Add a gender check to admin form's submit guard**

In `handleSubmit` of `add-player-form.tsx`, find the existing pre-submit validation block (e.g., the check for `firstName`/`lastName`/`email`). Add:

```ts
if (!gender) {
  setError("Gender is required to assign the player to a training group.");
  return;
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

1. Open the registration page. Submit with gender unset. Expected: form blocks, error message shown.
2. Open the admin add-player form. Submit with gender unset. Expected: form blocks, error shown.
3. Fill gender and resubmit. Expected: succeeds.
4. Confirm existing players (with `gender = NULL`) still load fine on the players list and detail pages — we did NOT add a DB constraint, so legacy data is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/register/page.tsx src/app/\(portal\)/admin/players/add/_components/add-player-form.tsx
git commit -m "feat(forms): require gender on registration and admin add-player"
```

---

## Task 16: End-to-end verification

- [ ] **Step 1: Active-status consistency check**

For three test players (one with subscription only, one with attendance only, one with neither), confirm:

| Player | Players list badge | Detail page badge | Counted in dashboard "active"? |
|---|---|---|---|
| Subscription only | active | Active | yes |
| Attendance only | active | Active | yes |
| Neither | inactive | Inactive | no |

All three values per row must match.

- [ ] **Step 2: Auto-assign happy path**

1. Configure default male group = Group A (max 20).
2. Register a male player via the public form.
3. Confirm `group_players` row created with `group_id = Group A.id`.

Repeat for female with a different group.

- [ ] **Step 3: Auto-assign failure paths**

1. Clear the male default. Register a male player → confirm notification, no `group_players` row.
2. Re-set the default to a group at max capacity. Register → confirm notification, no `group_players` row.

In both cases the player profile is still created — the failure must be soft.

- [ ] **Step 4: Occupation field**

1. Register with occupation "Software Engineer" → appears on detail page.
2. Register without occupation → field does not render on detail page.
3. Admin-create with occupation → appears.

- [ ] **Step 5: Gender required**

1. Submit either form without gender → blocked with the error message.
2. Existing player records with `gender = NULL` are still listable / viewable / editable.

- [ ] **Step 6: Final type-check and build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run build`
Expected: build succeeds. (If pre-existing errors are present unrelated to this work, note them but do not block.)

- [ ] **Step 7: Final commit if any verification cleanup was needed**

If anything needed touching during verification, commit it as `chore: post-verification cleanup`. Otherwise, this task ends with no commit — verification is the deliverable.

---

## Self-review notes

- **Spec coverage:** all three features (Active-status unification, gender auto-assign + required, Occupation field) have implementing tasks. No spec section is unaddressed.
- **No placeholders:** every step contains either runnable code or a runnable command with expected output.
- **Type consistency:** `is_currently_active` (snake_case from DB) is used consistently in DB types, `PlayerRow`, queries, and the page logic. The header prop is `isCurrentlyActive` (camelCase, idiomatic for React props).
- **Failure semantics:** the auto-assign helper is wrapped in try/catch at every call site so a thrown error never blocks registration. The helper itself returns a result type rather than throwing for expected failures (no_default, group_full).
- **Migration ordering:** the `20260507000000` timestamp post-dates the most recent migration (`20260317100000`) and the in-progress `20260504000000_clash_court_reservations.sql` already in the repo. No collision.
