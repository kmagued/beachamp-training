# Players Who Coach & Coach Invites — Design

**Date:** 2026-10-03
**Status:** Players-who-coach spec approved. The invite design was approved in chat and
added afterwards; its written form is reviewed with the plan.
**Branch:** `feat/player-coaches`, cut from `main` at `3cbda64c`

## Summary

Two changes to how coaches join, both on **People → Coaches**:

1. **Players who coach.** An admin can make an **existing player** a coach, keeping the
   player's own account. No second login is created. A player who coaches has two views,
   **Player** and **Coach**, and switches between them from the menu.
2. **Coach invites.** A brand-new coach is no longer created by an admin with a generated
   password. The admin sends an **invite link** instead. The coach opens it, creates their
   own account and verifies their email. They then land in the coach portal, and the
   admin assigns their groups.

Summary of the mechanics:

- A player who coaches keeps `role = 'player'`. Coach access comes from the existing
  `is_coach` flag.
- One new migration makes coach access in the database key on "can coach"
  (`role = 'coach'` or `is_coach`), not on `role`. A second migration adds the
  `coach_invites` table.
- The two views are the existing `/player` and `/coach` portals. The switch is a link
  between them, and each device remembers the last view used.
- Removing coach access from a player keeps their account and history. It never deletes
  them.

## Decisions (settled during brainstorming)

1. **Approach: the `is_coach` flag.** A player who coaches is `role = 'player'` and
   `is_coach = true`.
   - The admin player lists (Players, Groups, Payments, Private Sessions, Feedback)
     filter on `role = 'player'`, and the Leaderboard goes by group membership. So they
     keep showing them as a player, and nothing there changes.
   - Turning `role` into a set of roles was rejected. It would rewrite about 40 role
     checks in the app and around 60 database rules, with no current need.
2. **Admins add coaches from the Coaches page.** "Add Coach" has two tabs: **Existing
   player** (the default) and **Invite coach**.
3. **Login lands in the last view used** on that device. The first time, it lands in
   the player view.
4. **Removing coach access ends their group assignments.** Their `coach_groups` rows are
   made inactive, so no group lists a coach who can't open it. Sessions already on the
   schedule keep their name until an admin reassigns them, so past records and pay stay
   correct.
5. **Coaches who join by invite are coach-only accounts.** They get no player view.
6. **Admins who coach keep what they have today:** "My Groups" in the admin portal, with
   no switch.
7. **Invites replace admin-set passwords.**
   - The `createCoach` action and its form are removed.
   - The invite link can be copied or sent on WhatsApp. If the admin gives an email
     address, the app emails the link too.
   - A link works once, expires after 7 days and can be revoked.
8. **Groups are assigned after the invite is accepted, on the group page as today.**
   Admins get a notification when a coach accepts.

## Existing context (verified)

**Roles and the coach flag**

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

**Database rules (row-level security)**

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

- A seventh rule, "Players can view coach profiles" on `profiles`, shows players only the
  `role IN ('coach','admin')` accounts. A player who coaches would be missing from other
  players' coach lists.
- Rules keyed on `coach_id = auth.uid()` already work for any account:
  - `coach_groups`
  - `coach_blocks`
  - `private_session_requests`
  - `coach_feedback`
  - `coach_attendance`
- Verified on a local replay of all 64 migrations: before the new migration, a player
  who coaches reads 3 of 5 seeded profiles; after it, all 5.

**Where the app checks `role`**

- `src/middleware.ts`: portal access, and the redirect away from `/login`
- `src/app/(portal)/coach/layout.tsx`
- `src/lib/actions/auth.ts`: `login()` and `verifyEmailOtp()`
- `src/app/auth/callback/route.ts`
- `requireCoachOrAdmin` in `src/app/_actions/training.ts`
- `getBirthdays` in `src/app/_actions/birthdays.ts`
- `createFeedback` in `src/app/(portal)/admin/feedback/actions.ts`

**Creating and deleting coaches today**

- `createCoach` (`training.ts`) creates an auth user with an admin-chosen password and
  writes the profile.
- `deleteCoach` deletes the **auth user**. For a player who coaches, that would delete
  their player account and everything that cascades from it.

**Signup, email and links**

- Player signup (`register()`) calls `supabase.auth.signUp`, writes the profile with the
  service role and sends people to `/verify-email`. There, a code finishes signup and
  `verifyEmailOtp()` redirects by role.
- The signup trigger that copied a role from user metadata was dropped in
  `20260218100000`, so a role can't be set from the browser.
- `sendEmail()` (`src/lib/email/send.ts`) sends branded email with a button over SMTP.
- `buildWhatsAppUrl(phone, text)` builds `wa.me` links.
- `notifyAdmins()` creates in-app notifications for every admin, and emails them.
- `NEXT_PUBLIC_APP_URL`, which the email code uses for absolute links, isn't in
  `.env.local` or `.env.prod`. Invite links are therefore built from the request's own
  host.

**Navigation**

- `SidebarLayout` already has a development-only `DevPortalSwitcher` in three places:
  - the bottom of the desktop sidebar
  - the bottom of the phone slide-out menu (coach and admin)
  - the footer of the player's "More" sheet (`MobileTabBar`)
- The notification bell is a Next.js `<Link>`, so Next.js prefetches its target in the
  background.

## Database

Two new migrations. Earlier migrations are never edited. Both headers say **safe to
apply ahead of the code**.

### `20261003200000_player_coaches.sql`

Today every `is_coach = true` account is a coach or an admin, and both already pass
these rules. So nobody gains or loses anything until a player is made a coach.

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

### `20261003210000_coach_invites.sql`

A new table that nothing reads yet:

```sql
CREATE TABLE coach_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ
);
```

- It has a partial index for the open invites.
- RLS allows only admins: "Admins can manage coach invites", using the usual
  `EXISTS (… role = 'admin')` check.
- The invite page and its signup action use the service role.
- The token is stored as-is, so admins can copy the link again later. It only grants
  "create a coach account", which admins can already grant, and only admins can read the
  table.

### `20261003220000_protect_profile_access.sql` (added after review)

"Users can update own profile" let a signed-in user update every column of their own row
through the API. That included `role` (making themselves an admin), `is_coach` and
`is_active`. A `BEFORE UPDATE` trigger now refuses changes to those three columns unless
an admin or the server makes them. The server is the service role, with no signed-in
user. Players still edit the rest of their profile.

The app only changes these columns from admin sessions or with the service role, so the
migration is safe to apply ahead of the code.

## Shared code

### `src/lib/auth/portals.ts`

These are pure functions with no Supabase calls, so they can be unit-tested.

```ts
export type Portal = "player" | "coach" | "admin";
export interface Account { role: "player" | "coach" | "admin"; is_coach: boolean }

/** The cookie that remembers which view a player who coaches used last */
export const VIEW_COOKIE = "beachamp-view";
export const VIEW_COOKIE_OPTIONS; // path "/", one year, sameSite lax, httpOnly, secure in production

/** A profile row (or none) as an Account: a missing or unknown role is a player, as before */
export function accountOf(profile): Account;
/** Can do coach work: a coach account, or a player or admin with coach access */
export function canCoach(a: Account): boolean;
/** May use coach tools: an admin, or anyone who can coach */
export function coachOrAdmin(a: Account): boolean;
/** The views this account can open, in switcher order:
 *  admin → [admin]; coach → [coach]; player → [player], plus coach when is_coach */
export function portalsFor(a: Account): Portal[];
/** "/coach/groups/1" → "coach"; "/coaching", "/admin-setup", "/" → null */
export function portalOfPath(pathname: string): Portal | null;
/** Where login lands: the remembered view if this account has it, else its first view */
export function homePath(a: Account, lastView: string | undefined): string;
/** The view to remember for this visit, or null to leave the cookie alone (always null for a prefetch) */
export function viewToRemember(a: Account, pathname: string, current: string | undefined, headers: Headers): Portal | null;
/** A background prefetch, not a visit (Next.js link prefetch, browser prefetch hints) */
export function isPrefetch(headers: Headers): boolean;
```

### `src/lib/coaches/invites.ts`

```ts
export const INVITE_DAYS = 7;
export type InviteState = "pending" | "expired" | "accepted" | "revoked";
export function inviteExpiry(now: Date): Date;
/** Accepted beats revoked beats expired */
export function inviteState(invite, now: Date): InviteState;
export function inviteUrl(origin: string, token: string): string;
/** The site's address from the request's host and protocol headers */
export function originFrom(host: string | null, proto: string | null): string | null;
/** The WhatsApp and email text: name, link, and the expiry as a Cairo date ("Sat 10 Oct") */
export function inviteMessage(firstName: string, url: string, expiresAt: string): string;
/** What's wrong with an invite form or signup form, or null when it's fine */
export function inviteProblem(input): string | null;
export function signupProblem(input): string | null;
```

### `src/lib/coaches/player-search.ts`

`playerSearch(query)` turns what the admin typed into the search the Existing player tab
runs:

- "John Doe" matches first name John… and last name Doe…
- A single word matches first name, last name, email or phone.
- Commas and brackets are dropped, because they would break the PostgREST `or()` filter.
- Fewer than 2 characters searches nothing.

`anyFieldFilter(text)` builds that `or()` filter.

## Access checks in the app

- **Middleware.** For portal routes, select `role, is_coach`:
  - When the account has more than one view and the request isn't a prefetch, set
    `VIEW_COOKIE` to `viewToRemember(...)`. This also happens in development, before the
    existing development bypass.
  - Admins pass, as today.
  - For anyone else, a path whose portal isn't in `portalsFor` redirects to `homePath`.
    `/admin-setup` keeps being bounced for signed-in non-admins, as today.
  - `/invite/…` paths are public.
- **Coach layout.** Allow `coachOrAdmin(account)`. Everyone else goes to
  `/player/dashboard`. The player layout is unchanged: a player who coaches is still
  `role = 'player'`.
- **Server actions.**
  - `requireCoachOrAdmin` (`training.ts`), `getBirthdays` and `createFeedback` select
    `is_coach` and accept `coachOrAdmin(...)`.
  - Admin-only checks are unchanged.
- **Login.** `login()`, `verifyEmailOtp()`, the auth callback and the middleware's bounce
  away from `/login`, `/register` and `/verify-email` all select `role, is_coach`, read
  `VIEW_COOKIE` and redirect to `homePath(...)`.

## Switching views

This section was revised after the first build, at the user's request.

- **Player | Coach switch in the top bar.** A player who coaches gets a small switch at
  the left of the top bar, on every page, on phones and desktop. It links to
  `/player/dashboard` and `/coach/dashboard`, with the current view filled in.
  - On phones the logo shrinks beside it.
  - On the narrowest phones (under 360px) the logo is left out, so they don't overlap.
- **Dev switcher is admins only.** The three-portal "Switch Portal" control stays in the
  sidebar, the phone menu and the More sheet, but only for admins and only in
  development.
- `switchesFor(role, portals, dev)` in `portals.ts` decides which switches show.
- Each layout passes `portals={portalsFor(accountOf(profile))}` to `SidebarLayout`.
- **Coach tab bar on phones.** The coach portal gets the same bottom tab bar as the other
  portals, replacing the slide-out menu.
  - All five of its pages are tabs: Home, Schedule, My Groups, Leaderboard, Feedback.
  - The tab bar shows More only when some pages are left over, so coaches have none.
- **Notification bell in the coach view.** There is no `/coach/notifications` page, so
  for players who coach the bell links to `/player/notifications`.
- **After coach access is removed,** the switch disappears on their next page load, and
  any `/coach` page sends them to the player dashboard.

## Admin: People → Coaches

### Add Coach drawer

The drawer has two tabs at the top: **Existing player** (opens first) and **Invite
coach**.

**Existing player tab**

- A search box over active players who aren't coaches yet
  (`role = 'player'`, `is_coach = false`, `is_active = true`), using `playerSearch`. A
  newer search replaces an older one that answers late. Results are limited to 20.
- Each result shows name, email and phone. Picking one highlights it.
- The footer button reads **Make {first name} a coach** and calls
  `assignPlayerAsCoach`.
- On success:
  - the drawer closes and the list reloads
  - a toast says "{Name} is now a coach. They'll see the Coach view next time they open
    the app."
  - no password is shown: they log in as they always have

**Invite coach tab**

- A form with first name, last name and phone (all required) and email (optional), then
  **Create Invite**, which calls `createCoachInvite`.
- An email that already belongs to an account is refused: "This email already has an
  account. Use Existing player instead."
- After creating, the drawer shows **Invite ready**:
  - the link, read-only
  - **Copy link**
  - **Send on WhatsApp**, which opens `buildWhatsAppUrl(phone, inviteMessage(...))`
  - a line saying it was emailed to the address, or that the email couldn't be sent
  - a **Done** button

### Pending invites

- A card above the coaches table lists open invites (not accepted, not revoked), newest
  first. Each shows:
  - name
  - phone and email
  - "Expires Sat 10 Oct", or an **Expired** tag
  - **Copy link**, **WhatsApp** and **Revoke**. An expired invite has a dead link, so it
    shows only **Remove**.
- Revoke and Remove ask for confirmation, then call `revokeCoachInvite`.
- The card is hidden when there are no open invites.

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

### Server actions

In `src/app/_actions/training.ts`:

- **`assignPlayerAsCoach(playerId)`**
  - Admin only.
  - Refuses if the target is missing, not `role = 'player'`, inactive, or already a
    coach.
  - Sets `is_coach = true`.
- **`removeCoachAccess(coachId)`**
  - Admin only.
  - Refuses unless the target is `role = 'player'` and `is_coach = true`.
  - First sets their active `coach_groups` rows to `is_active = false`, then
    `is_coach = false`. In that order, a failure partway leaves them a coach whom the
    admin can retry.
- **`deleteCoach`** also refuses `role = 'player'`: "This coach is also a player. Use
  Remove coach access instead."
- **`updateCoach`** leaves `is_active` alone when the target is `role = 'player'`.
- **`createCoach`** is removed.

In the new file `src/app/_actions/coach-invites.ts`:

- **`createCoachInvite(formData)`**
  1. Admin only. Validates the form with `inviteProblem` and refuses an email already on
     a profile.
  2. Inserts a row with a random 24-byte base64url token and `inviteExpiry(now)`.
  3. Builds the URL from the request host (`originFrom`).
  4. Emails it when an email was given.
  5. Returns `{ url, phone, firstName, expiresAt, emailed }`, where `emailed` is
     `null` when there was no email.
- **`revokeCoachInvite(inviteId)`**: admin only. Sets `revoked_at` on an open invite.
- **`acceptCoachInvite(token, formData)`**: the coach's signup.
  1. Validate with `signupProblem`.
  2. Refuse if someone is signed in.
  3. **Claim** the invite with one conditional update: set `accepted_at` where it is
     still null, not revoked and not expired. Nothing matched means "This invite link is
     no longer valid".
  4. `supabase.auth.signUp`. Supabase answers an already-registered email with a user
     that has no identities; that, or an error, releases the claim and returns "This
     email already has an account. Ask the academy to make that account a coach.", or
     the error message.
  5. Upsert the profile with the service role: `role = 'coach'`, `is_coach = true`,
     `is_active = true`, `profile_completed = true`. On failure, delete the auth user and
     release the claim.
  6. Set `accepted_by`.
  7. Notify admins: "Coach invite accepted" / "{Name} created their coach account.
     Assign them to a group." with a link to `/admin/groups`.
  8. Redirect to `/verify-email?email=…`.

## Coach invite page: `/invite/[token]`

The page lives in the `(auth)` group, in the same card style as Login. It loads the
invite with the service role and shows one of:

| State | Shows |
|---|---|
| No such token, or revoked | "This invite link isn't valid" / "Ask the academy for a new one." |
| Expired | "This invite has expired" / "Ask the academy for a new link." |
| Accepted | "This invite has already been used" / a link to Log in |
| Open, but someone is signed in | "You're signed in as {email}" / "Log out, then open this link again." with a Log out button |
| Open | "Join as a Coach" / "Create your Beachamp Academy coach account", and the signup form |

- The signup form has first name, last name, email, phone and password, prefilled from
  the invite. It calls `acceptCoachInvite`.
- After the email code, `verifyEmailOtp()` lands them in the coach portal, because their
  role is coach.

## Player portal

A player who coaches is also on the coach lists that players see, so they must not be
able to choose themselves:

- The coach lists on `/player/feedback` and `/player/private-sessions/request` leave out
  the current user.
- `createCoachFeedback` and `createPrivateSessionRequest` refuse a `coach_id` equal to
  the caller.

## Edge cases

**Players who coach**

- **They play in a group they coach.** They appear in that group's attendance list like
  any other player. There is no special handling.
- **Deactivated from Players.** They drop out of the active coach pickers, as any
  inactive coach does today.
- **Made an admin later** through the Admins page. `is_coach` stays, so they become an
  admin who coaches, with "My Groups" and no player view. This is today's behaviour for
  admins.
- **Role changed to "player" on the Admins page.** `updateUserRole` already clears
  `is_coach`, so they lose coach access. This is unchanged.
- **Coach access removed while they're on a coach page.** Their next navigation
  redirects them, and coach actions refuse them on the server.

**View switching**

- **Shared device.** The view cookie counts only when it names a view the signed-in
  account has. Otherwise login falls back to that account's first view.
- **Prefetches.** A prefetch never changes the remembered view, so the bell's link to
  `/player/notifications` in the coach view doesn't flip it.

**Invites**

- **Pending private-session requests** that name a coach stay as they are. The admin
  confirms or rejects them in Private Sessions.
- **Two people submit the same invite at once.** Only one claim matches. The other is
  told the link is no longer valid.
- **The coach never enters their email code.** Their account exists, unverified, and
  shows on the Coaches page. They can finish later from `/verify-email`, as players do.
- **Expired invites** stay listed as Expired until revoked. To try again, the admin
  creates a new invite.

## Testing

**Unit tests** (`node:test`), with `src/lib/auth/*.test.ts` and
`src/lib/coaches/*.test.ts` added to the `npm test` script:

- **`portals`**
  - `accountOf`
  - `canCoach`, `coachOrAdmin`, `portalsFor`
  - `portalOfPath`: each portal, nested paths, `/`, `/login`, `/coaching`, `/admin-setup`
  - `homePath`: remembered view honoured when allowed and ignored when not; missing or
    unknown cookie; coach-only and admin accounts
  - `viewToRemember`
  - `isPrefetch`
- **`invites`**
  - `inviteExpiry`
  - `inviteState`, including precedence
  - `inviteUrl`, including a trailing slash
  - `originFrom`
  - `inviteMessage`, including the Cairo date near midnight
  - `inviteProblem`
  - `signupProblem`
- **`player-search`**
  - full name
  - one word
  - too short
  - commas and brackets
  - `anyFieldFilter`

**Database check.** This is a throwaway harness, already proven on 2026-10-03:

- Replay all migrations on the local `public.ecr.aws/supabase/postgres:17.6.1.167` image.
  Older migrations need these stubs to replay:
  - a `storage` schema with `buckets` and `objects` tables and `foldername`, `filename`
    and `extension` functions
  - the `frozen` subscription status added by hand
  - an `auth.users.phone` column
- Then run two check scripts, as seeded users signed in through
  `request.jwt.claim.sub` (`SET LOCAL ROLE authenticated`):
  - **Players who coach:**
    - a player who coaches reads every profile, group members and subscriptions, and
      writes attendance, feedback and plans
    - a plain player sees the three coaches but never another plain player, and can't
      write attendance
    - coach and admin keep their access
    - after coach access is removed, a player who coached is back to a plain player
    - each rebuilt rule exists exactly once
  - **Invites:** only admins read or create them, the claim succeeds once, and deleting
    the admin who made one keeps the invite.

**Verification before claiming done:**

- `npm test`
- `npx tsc --noEmit -p .`, then `git checkout tsconfig.tsbuildinfo`
- No ESLint config exists, and `next build` is skipped while the dev server is running.

**Manual check (staging, after the three migrations are applied):**

1. Coaches → Add Coach → Existing player: make a test player a coach. They show with the
   Player tag.
2. Log in as them. The first landing is the player dashboard, and the top bar shows the
   Player | Coach switch, on a phone too.
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
8. Invite coach with a phone and your own email. Check:
   - the link copies
   - WhatsApp opens with the message
   - the email arrives
   - the invite is listed as pending
9. Open the link in a private window and sign up. Enter the email code. You land in the
   coach portal, admins have the "Coach invite accepted" notification, the invite has
   left the pending list, and the new coach is in the table with no groups.
10. Open the same link again: "already been used". Revoke another invite and open it:
    "isn't valid".
11. On a phone, the coach portal has the bottom tab bar with five tabs (Home, Schedule,
    My Groups, Leaderboard, Feedback) and no More.
12. In development, only an admin sees "Switch Portal". A plain player or a player who
    coaches doesn't.
13. As a plain player, in the browser console, try to update your own `role` through
    the Supabase client. The database refuses it.

## Out of scope

- A player view for coaches who joined by invite
- A separate Coach view for admins who coach (they keep "My Groups")
- A Coach tag on the Players list
- Assigning groups from the coach drawer, or choosing groups in the invite
- Renewing an expired invite (create a new one)
- A coach notifications page. The coach view's bell links to `/coach/notifications`,
  which doesn't exist. This is an existing issue, fixed here only for players who coach.
- Letting an account hold several roles in general
