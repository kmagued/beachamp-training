# Quick Wins Batch — Design Spec

**Date:** 2026-05-07
**Scope:** Three small, independent features bundled into a single spec because each is small enough that separate specs would be ceremony-heavy.

---

## Features in scope

1. **Active player consistency** — unify the "active" definition across dashboard stat, players table, and player detail badge.
2. **Gender-based auto-assignment** — when a new player registers, automatically place them in the configured default men's or women's group based on their gender. Make gender required at registration.
3. **Occupation field** — add an optional free-text "occupation" field to player registration and display it on the player detail page.

## Out of scope

- Backfilling `gender` for existing players (decision: leave existing nulls alone; admin can edit manually).
- A dedicated settings page (default-group toggles live inline on the groups page).
- WhatsApp templates page / template picker (separate spec).
- Schedule blocking for admin/coach (separate spec).

---

## Feature A — Active player consistency

### Problem

Three surfaces classify a player as "active" using different predicates:

| Surface | Current predicate | File |
|---|---|---|
| Players list | Attended a session in last 30 days | `src/app/(portal)/admin/players/_components/types.ts:67-75` |
| Dashboard stat | Same as players list (attendance-based) | `src/app/(portal)/admin/dashboard/page.tsx:134-143` |
| Player detail badge | Has subscription with `status IN ('active','pending')` AND `sessions_remaining > 0` AND (`end_date IS NULL` OR `end_date >= today`) | `src/app/(portal)/admin/players/[id]/_components/player-header.tsx:22-23` |

A player can have an active subscription but no recent attendance — they show as "inactive" in the list, "active" in the detail page.

### Unified definition

A player is **active** if **either** of these is true:

- They have an attendance record in the last 30 days with `status = 'present'`, **OR**
- They have a subscription with `status IN ('active','pending')` AND `sessions_remaining > 0` AND (`end_date IS NULL` OR `end_date >= CURRENT_DATE`).

This is the most inclusive definition and captures both "currently training" and "currently a paying member."

### Implementation

Single source of truth as a Postgres view. All three surfaces read from it.

```sql
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
      AND s.status IN ('active','pending')
      AND s.sessions_remaining > 0
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  ) AS is_currently_active
FROM profiles p
WHERE p.role = 'player';
```

### Files to change

- `src/app/(portal)/admin/dashboard/page.tsx` — replace ad-hoc attendance count with `SELECT count(*) FROM players_with_status WHERE is_currently_active = true`.
- `src/app/(portal)/admin/players/_components/types.ts` — `getActivityStatus` reads `is_currently_active` from the joined view row instead of recomputing from `last_attended`.
- `src/app/(portal)/admin/players/[id]/_components/player-header.tsx` — read `is_currently_active` from the view (page.tsx fetches it). Drop the local `hasActiveSubscription` boolean.
- The query that loads the players list (in `src/app/(portal)/admin/players/page.tsx` or its loader) must select from `players_with_status` rather than `profiles`.
- The player detail loader (`src/app/(portal)/admin/players/[id]/page.tsx`) must do the same.

### Indexes

Ensure these exist (add if missing):

```sql
CREATE INDEX IF NOT EXISTS idx_attendance_player_date ON attendance(player_id, session_date);
-- subscriptions(player_id, status) likely already exists; confirm during implementation.
```

---

## Feature B — Gender-based auto-assignment

### Data model

New table for system-wide settings. Generic key/value so future config (WhatsApp templates settings, etc.) reuses it.

```sql
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage system_settings" ON system_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

Two well-known keys are written by the admin UI:

- `default_male_group_id` → `{ "group_id": "<uuid>" }`
- `default_female_group_id` → `{ "group_id": "<uuid>" }`

### Admin UI

No new page. On the existing groups list at `src/app/(portal)/admin/groups/`, each group row gains two small toggles:

- **Default for men** — when toggled on, writes the group's id to `default_male_group_id` in `system_settings`. Toggling it on for a different group automatically replaces the previous default (single-row semantics per gender, enforced by `UPSERT` on the primary key).
- **Default for women** — symmetric for `default_female_group_id`.

Visual treatment: small badge / outline-style toggle next to the existing group actions.

### Auto-assignment helper

New file `src/lib/players/auto-assign-group.ts`:

```ts
export type AutoAssignResult =
  | { assigned: true; groupId: string }
  | { assigned: false; reason: 'no_default' | 'group_full' };

export async function autoAssignGenderGroup(
  playerId: string,
  gender: 'male' | 'female'
): Promise<AutoAssignResult>;
```

Logic:

1. Read `default_<gender>_group_id` from `system_settings`. If unset → return `{ assigned: false, reason: 'no_default' }`.
2. Count existing rows in `group_players` for that group. Compare to `groups.max_players`.
3. If full → return `{ assigned: false, reason: 'group_full' }`.
4. Otherwise insert into `group_players (group_id, player_id, joined_at, is_active)` and return `{ assigned: true, groupId }`.

### Wiring

The helper is called immediately after a successful profile insert in:

- `src/app/(auth)/register/page.tsx` (self-signup)
- `src/app/(portal)/admin/players/add/_components/add-player-form.tsx` (admin add)

If the helper returns `assigned: false`, create an admin notification using the existing notifications system:

- `notifications.type = 'system'`
- Targeted at all admins (same fan-out pattern existing system notifications use)
- Body: `"New player {first_name} {last_name} could not be auto-assigned: {no default group set for {gender} | group {group_name} is full}"`
- Link to the player detail page so admin can resolve in one click

### Gender required at registration

Both forms must mark the gender select as required and block submission with a clear error:

> "Gender is required so we can assign you to the right training group."

The `profiles.gender` DB column **stays nullable** — required is enforced at the application layer only. This preserves the no-backfill decision: existing players with `gender = NULL` are not blocked from logging in or being edited.

### Failure semantics

The helper failing **must not** roll back the player creation. The player is created either way. The notification is the recovery mechanism. (Implementation: wrap the helper in `try/catch`; log failures of the helper itself and create a notification, but never throw upward.)

---

## Feature C — Occupation field

### Migration

```sql
ALTER TABLE profiles ADD COLUMN occupation TEXT;
```

Type update in `src/types/database.ts`: add `occupation: string | null` to `profiles` Row, Insert, and Update.

### UI

Plain text input, optional, free-form (matches the `area` field pattern). Label: "Occupation (optional)". Placeholder: "e.g. Engineer, Student, Doctor".

Locations:

- `src/app/(auth)/register/page.tsx` — alongside the other optional profile fields (near area / training goals).
- `src/app/(portal)/admin/players/add/_components/add-player-form.tsx` — same placement pattern as other optional fields (around lines 217-289).
- `src/app/(portal)/admin/players/[id]/` — render in the read view next to area; only shown if non-null.
- If a player profile edit page exists, add the field there too. Confirm during implementation.

---

## Migration file

Single migration, additive only:

```
supabase/migrations/20260507000000_quick_wins.sql
```

Contents: the `ALTER TABLE` for occupation, the `system_settings` table + RLS policy, the `players_with_status` view, the attendance index. No destructive operations. Safe to apply against production with no downtime.

---

## Rollout order

1. Apply migration.
2. Regenerate `Database` types.
3. Ship Feature C (occupation) first — smallest blast radius, useful as a warm-up to validate the migration path.
4. Ship Feature A — switch the three surfaces to read from `players_with_status`.
5. Ship Feature B — settings UI on groups page → auto-assign helper → wire into both registration code paths → require gender on forms.

Each feature can ship as its own PR if the client prefers smaller reviews.

---

## Manual verification checklist

This project does not have an automated test suite. Each feature gets manual verification before merge.

### Feature A

| Scenario | Expected `is_currently_active` |
|---|---|
| Has valid subscription, no recent attendance | true |
| No subscription, attended 5 days ago | true |
| No subscription, attended 40 days ago | false |
| Expired subscription, attended 40 days ago | false |
| Has subscription with `sessions_remaining = 0` | false (unless attended in last 30d) |

Confirm dashboard stat, players list filter, and player detail badge all return the same classification for the same player.

### Feature B

- Configure a group as "Default for men" via the toggle. Register a male player. Confirm a `group_players` row was created.
- Repeat for female.
- Clear the male default. Register a male player. Confirm registration succeeds and an admin notification was created with the `no_default` message.
- Fill a default group to its `max_players`. Register another player of that gender. Confirm registration succeeds and a `group_full` notification was created.
- Try to submit registration with no gender selected. Confirm the form blocks with the required-field error.
- Repeat the form-required check for the admin add-player form.

### Feature C

- Register with an occupation value. Confirm it appears on the player detail page.
- Register with no occupation. Confirm no errors and no occupation field renders on the detail page.
- Admin-create a player with occupation. Confirm same behavior.

---

## Open questions

None at this point. All design decisions are resolved.
