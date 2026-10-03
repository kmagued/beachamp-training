# Players Who Coach — Design

**Date:** 2026-10-03
**Status:** Design approved; spec awaiting review
**Branch:** `feat/player-coaches`, cut from `main` at `3cbda64c`

## Summary

An admin can make an **existing player** a coach from **People → Coaches**, keeping the
player's own account. No second login is created. A player who coaches has two views,
**Player** and **Coach**, and switches between them from the menu. Creating a brand-new
coach account ("Add Coach" → New account) stays exactly as it is today.

- The player keeps `role = 'player'`. Coach access comes from the existing `is_coach` flag.
- One new migration makes coach access in the database key on "can coach"
  (`role = 'coach'` or `is_coach`), not on `role`.
- The two views are the existing `/player` and `/coach` portals. The switch is a link
  between them, and each device remembers the last view used.
- Removing coach access from a player keeps their account and history. It never deletes
  them.

## Decisions (settled during brainstorming)

1. **Approach: the `is_coach` flag.** A player who coaches is `role = 'player'` and
   `is_coach = true`. The admin player lists (Players, Groups, Payments, Private Sessions,
   Feedback) filter on `role = 'player'`, and the Leaderboard goes by group membership,
   so they keep showing them as a player and nothing there changes. Turning `role` into a set of
   roles was rejected: it would rewrite about 40 role checks in the app and around 60
   database rules, with no current need.
2. **Admins assign from the Coaches page.** "Add Coach" gets two tabs: **Existing
   player** (the default) and **New account** (today's form).
3. **Login lands in the last view used** on that device. The first time, it lands in
   the player view.
4. **Removing coach access ends their group assignments.** Their `coach_groups` rows are
   made inactive, so no group lists a coach who can't open it. Sessions already on the
   schedule keep their name until an admin reassigns them, so past records and pay stay
   correct.
5. **Accounts made with "Add Coach" stay coach-only.** They get no player view.
6. **Admins who coach keep what they have today:** "My Groups" in the admin portal, with
   no switch.

## Existing context (verified)

- `profiles.role` is one of `player | coach | admin`.
- `profiles.is_coach` (migration `20260513000000`) was added so admins could coach too.
  Every "who are the coaches" query already filters on `is_coach = true`, including:
  - the Coaches page and coach detail page
  - the group coach picker and the schedule coach list
  - Private Sessions and the Daily Report coaches tab
  - the player's Feedback and private-session request pages
  - coach pay export
- Staging on 2026-10-03: 307 players, all with `is_coach = false`. The only accounts with
  `is_coach = true` are 3 admins and 2 coaches.
- The coach portal reads its data through the browser and server Supabase clients, so
  **row-level security (RLS) is what lets a coach see data.** Six rules give coaches
  access based on `role`:

  | Table | Rule | Today |
  |---|---|---|
  | `profiles` | Coaches can view player profiles | `auth_role() = 'coach'` |
  | `group_players` | Coaches can view group players | `auth_role() = 'coach'` |
  | `subscriptions` | Coaches can view subscriptions | `auth_role() = 'coach'` |
  | `attendance` | Coaches and admins can manage attendance | `role IN ('coach','admin')` |
  | `feedback` | Coaches and admins can manage feedback | `role IN ('coach','admin')` |
  | `session_plans` | Coaches and admins can manage session plans | `role IN ('coach','admin')` |

  A seventh rule, "Players can view coach profiles" on `profiles`, shows players only the
  `role IN ('coach','admin')` accounts. A player who coaches would be missing from other
  players' coach lists.
- Rules keyed on `coach_id = auth.uid()` already work for any account:
  - `coach_groups`
  - `coach_blocks`
  - `private_session_requests`
  - `coach_feedback`
  - `coach_attendance`
- The app checks `role` in these places:
  - `src/middleware.ts`: portal access, and the redirect away from `/login`
  - `src/app/(portal)/coach/layout.tsx`
  - `src/lib/actions/auth.ts`: `login()` and `verifyEmailOtp()`
  - `src/app/auth/callback/route.ts`
  - `requireCoachOrAdmin` in `src/app/_actions/training.ts`
  - `getBirthdays` in `src/app/_actions/birthdays.ts`
  - `createFeedback` in `src/app/(portal)/admin/feedback/actions.ts`
- `deleteCoach` deletes the **auth user**. For a player who coaches, that would delete
  their player account and everything that cascades from it.
- `SidebarLayout` already has a development-only `DevPortalSwitcher` in three places:
  - the bottom of the desktop sidebar
  - the bottom of the phone slide-out menu (coach and admin)
  - the footer of the player's "More" sheet (`MobileTabBar`)

## Database

New migration `supabase/migrations/20261003200000_player_coaches.sql`. Earlier migrations
are never edited. The header notes it is **safe to apply ahead of the code**: today every
`is_coach = true` account is a coach or an admin, and both already have this access. So
nobody gains or loses anything until a player is made a coach.

```sql
CREATE OR REPLACE FUNCTION auth_can_coach()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'coach' OR is_coach FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
```

`SECURITY DEFINER` works the same way as `auth_role()`: rules on `profiles` can call it
without recursing.

Each rule is dropped and recreated with the same name and command:

| Rule | New condition |
|---|---|
| Coaches can view player profiles | `auth_can_coach()` |
| Coaches can view group players | `auth_can_coach()` |
| Coaches can view subscriptions | `auth_can_coach()` |
| Coaches and admins can manage attendance | `auth_role() = 'admin' OR auth_can_coach()` |
| Coaches and admins can manage feedback | `auth_role() = 'admin' OR auth_can_coach()` |
| Coaches and admins can manage session plans | `auth_role() = 'admin' OR auth_can_coach()` |
| Players can view coach profiles | `auth_role() = 'player' AND (role IN ('coach','admin') OR is_coach)` |

`coaches_view` (still `role IN ('coach','admin')`) is not used by the app and is left
alone.

**Access belongs to the account, not the view.** A player who coaches has coach-level
read access even while in the player view, exactly as coaches do today. Their profile
also becomes visible to other players, as every coach's is.

## Shared code: `src/lib/auth/portals.ts`

These are pure functions with no Supabase calls, so they can be unit-tested.

```ts
export type Portal = "player" | "coach" | "admin";
type Account = { role: "player" | "coach" | "admin"; is_coach: boolean };

/** The cookie that remembers which view a player who coaches used last */
export const VIEW_COOKIE = "beachamp-view";

/** Can do coach work: a coach account, or a player or admin with coach access */
export function canCoach(a: Account): boolean;

/** The views this account can open, in switcher order:
 *  admin → [admin]; coach → [coach]; player → [player], plus coach when is_coach */
export function portalsFor(a: Account): Portal[];

/** "/coach/groups/1" → "coach"; anything outside the portals → null */
export function portalOfPath(pathname: string): Portal | null;

/** Where login lands: the remembered view if this account has it, else its first view */
export function homePath(a: Account, lastView: string | undefined): string;
```

## Access checks in the app

- **Middleware.** For portal routes, select `role, is_coach`:
  - Admins pass, as today.
  - For anyone else, a path whose portal isn't in `portalsFor` redirects to `homePath`.
  - When the account has more than one view and opens `/player/…` or `/coach/…`, set
    `VIEW_COOKIE` to that view:
    - path `/`, one year, `sameSite: lax`, `httpOnly`
    - written only when the value changes
    - also written in development, before the existing development bypass, so "last
      view" can be tried locally
- **Coach layout.** Allow `role === 'admin' || canCoach(profile)`. Everyone else goes to
  `homePath`. The player layout is unchanged: a player who coaches is still
  `role = 'player'`.
- **Server actions.**
  - `requireCoachOrAdmin` (`training.ts`), `getBirthdays` and `createFeedback` select
    `is_coach` and accept `role === 'admin' || canCoach(...)`.
  - Admin-only checks are unchanged.
- **Login.** `login()`, `verifyEmailOtp()`, the auth callback and the middleware's bounce
  away from `/login`, `/register` and `/verify-email` all select `role, is_coach`, read
  `VIEW_COOKIE` and redirect to `homePath(...)`.

## Switching views

- `DevPortalSwitcher` becomes `PortalSwitcher`. It sits in the same three places and
  links to `/<portal>/dashboard`.
  - **Production:** it shows only when the account has more than one view (Player |
    Coach).
  - **Development:** it shows all three portals, as today.
- Each layout passes `portals={portalsFor(profile)}` to `SidebarLayout`.
- The section heading reads "Switch view" for players who coach. In development it keeps
  "Switch Portal".
- **Notification bell in the coach view.** There is no `/coach/notifications` page, so
  for players who coach the bell links to `/player/notifications`.
- **After coach access is removed,** the switch disappears on their next page load, and
  any `/coach` page sends them to the player dashboard.

## Admin: People → Coaches

### Add Coach drawer

The drawer has two tabs at the top: **Existing player** (opens first) and **New
account**.

- **Existing player tab:**
  - A search box over active players who aren't coaches yet
    (`role = 'player'`, `is_coach = false`, `is_active = true`), matching name, email or
    phone. The search works like the promote-to-admin search on the Admins page: the
    first and last name split for "John Doe", and results are limited to 20.
  - Each result shows name, email and phone. Picking one highlights it.
  - The footer button reads **Make {first name} a coach** and calls
    `assignPlayerAsCoach`.
  - On success, the drawer closes, the list reloads with the new coach's row
    highlighted, and a note says they'll see the Coach view next time they open the app.
  - No password is shown: they log in as they always have.
- **New account tab:** today's form and "Create Coach Account", unchanged.

### Coaches table and detail page

- `fetchCoaches` also selects `role`. `CoachRow` gains `is_player: boolean`
  (`role === 'player'`).
- Players who coach get a small neutral **Player** tag beside their name, in the table
  and on `/admin/coaches/[id]`.

### Coach drawer, for a player who coaches

- **Remove coach access** replaces Delete. The confirmation reads:
  > {Name} stops being a coach and loses the Coach view. Their player account,
  > subscriptions and history stay. They're taken off the groups they coach; sessions
  > already on the schedule keep their name until you reassign them. Export their pay
  > first if you still need it.
- A **Player profile** link opens `/admin/players/{id}`.
- The edit view hides the Active/Inactive switch. That status belongs to their player
  account and is managed from Players.

### Bulk delete

- Players who coach are skipped, as admins already are.
- The confirmation reads "Admin and player accounts are skipped".
- The notice reads "N coaches couldn't be deleted (admin and player accounts are
  skipped)".

### Server actions (`src/app/_actions/training.ts`)

- **`assignPlayerAsCoach(playerId)`**
  - Admin only.
  - Refuses if the target is missing, not `role = 'player'`, inactive, or already a
    coach.
  - Sets `is_coach = true`.
  - Revalidates `/admin/coaches`.
- **`removeCoachAccess(coachId)`**
  - Admin only.
  - Refuses unless the target is `role = 'player'` and `is_coach = true`.
  - First sets their active `coach_groups` rows to `is_active = false`, then
    `is_coach = false`. In that order, a failure partway leaves them a coach whom the
    admin can retry.
  - Revalidates `/admin/coaches` and `/admin/groups`.
- **`deleteCoach`** also refuses `role = 'player'`: "This coach is also a player. Use
  Remove coach access instead."
- **`updateCoach`** ignores `is_active` when the target is `role = 'player'`.

## Player portal

A player who coaches is also on the coach lists that players see, so they must not be
able to choose themselves:

- The coach lists on `/player/feedback` and `/player/private-sessions/request` leave out
  the current user.
- The player's coach-feedback action and `createPrivateSessionRequest` refuse a
  `coach_id` equal to the caller.

## Edge cases

- **They play in a group they coach.** They appear in that group's attendance list like
  any other player. There is no special handling.
- **Deactivated from Players.** They drop out of the active coach pickers, as any
  inactive coach does today.
- **Made an admin later** through the Admins page. `is_coach` stays, so they become an
  admin who coaches, with "My Groups" and no player view. This is today's behaviour for
  admins.
- **Role changed to "player" on the Admins page.** `updateUserRole` already clears
  `is_coach`, so they lose coach access. This is unchanged.
- **Shared device.** The view cookie counts only when it names a view the signed-in
  account has. Otherwise login falls back to that account's first view.
- **Coach access removed while they're on a coach page.** Their next navigation
  redirects them, and coach actions refuse them on the server.
- **Pending private-session requests** that name them stay as they are. The admin
  confirms or rejects them in Private Sessions.

## Testing

**Unit tests** (`node:test`), with `src/lib/auth/*.test.ts` added to the `npm test`
script:

- `canCoach`: coach; player with and without `is_coach`; admin with and without
  `is_coach`
- `portalsFor`: each role; a player who coaches → `["player", "coach"]`
- `portalOfPath`: each portal, nested paths, `/`, `/login`, and `/coaching` (a lookalike
  prefix → null)
- `homePath`:
  - remembered view honoured when allowed
  - remembered view ignored when not allowed
  - missing or unknown cookie value
  - coach-only and admin accounts

**Database check.** Replay the migrations on the local `public.ecr.aws/supabase/postgres`
image. Older migrations don't replay cleanly from scratch, so they need:

- a `storage.buckets` and `storage.objects` stub
- the `frozen` subscription status added by hand
- an `auth.users.phone` column

Then, as a plain player, a player who coaches, a coach and an admin
(`SET ROLE authenticated` with `request.jwt.claims`), check:

- the three coach read rules
- writes to `attendance`, `feedback` and `session_plans`
- that a plain player sees a player who coaches in the coach list
- that a plain player still can't read other players' profiles

**Verification before claiming done:**

- `npm test`
- `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
- No ESLint config exists, and `next build` is skipped while the dev server is running.

**Manual check (staging, after the migration is applied):**

1. On Coaches → Add Coach → Existing player, make a test player a coach. They show with
   the Player tag.
2. Log in as them. The first landing is the player dashboard, and the switch shows
   Player | Coach.
3. Switch to Coach. Assign them a group from the group page, then open a session and
   mark attendance. Players' subscription balances appear, not "No active
   subscription".
4. Log out and back in. They land in the coach view.
5. As another player, the new coach appears in the Feedback and Private Session coach
   lists. As the player who coaches, they don't appear in their own lists.
6. Remove coach access. Their group assignment ends, the switch disappears, and
   `/coach/dashboard` redirects to the player dashboard. Their subscriptions are intact.
7. Bulk delete with a player who coaches selected. They're skipped, and the notice says
   so.

## Out of scope

- A player view for accounts made with "Add Coach"
- A separate Coach view for admins who coach (they keep "My Groups")
- A Coach tag on the Players list
- A coach notifications page. The coach view's bell links to `/coach/notifications`,
  which doesn't exist. This is an existing issue, fixed here only for players who coach.
- Letting an account hold several roles in general
