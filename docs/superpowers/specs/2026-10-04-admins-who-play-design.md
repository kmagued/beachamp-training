# Admins Who Also Play — Design

**Date:** 2026-10-04
**Status:** Design approved in chat; spec awaiting review
**Branch:** `feat/player-coaches`, on top of the players-who-coach work

## Summary

Some admins are also players. Today an admin never appears in a player list, can't be
added to a group as a player, and can't open the player portal. Making a player an admin
quietly drops them from every player list.

The fix mirrors players who coach:

- An admin who plays keeps `role = 'admin'` and gets a new `is_player` flag.
- "Is a player" becomes `role = 'player'` or `is_player`, wherever players are listed,
  picked or counted, and in the player portal and player-only actions.
- An admin who plays gets the Admin | Player switch in the top bar.

## Decisions (settled during brainstorming)

1. **An `is_player` flag** on `profiles`, mirroring `is_coach`. Turning `role` into a set
   of roles was rejected again, for the same reasons as before.
2. **How an admin becomes a player:**
   - a "+ Player" toggle on the Admins page, beside "+ Coach"
   - promoting a player to admin keeps them a player
   - the migration marks existing admins who have player history (subscriptions, group
     memberships or attendance)
3. **The player view is reached with the Admin | Player switch** in the top bar, the one
   players who coach use. Login lands in the last view used on that device.
4. **Admin-only safety on the Players page.** An admin who plays is tagged "Admin" there.
   Their player drawer hides Delete and the Active/Inactive switch, and the server refuses
   to delete an admin from the player actions. Their account is managed on the Admins
   page.

## Existing context (verified)

- **Staging:** one of three admins has 2 subscriptions and a date of birth. They were
  probably a player who was made an admin, and that admin is missing from every player
  list today.
- **Eleven queries filter players with `.eq("role", "player")`.** Ten change:
  - `src/app/(portal)/admin/players/page.tsx`: the Players list
  - `src/app/(portal)/admin/players/[id]/page.tsx`: player detail
  - `src/app/(portal)/admin/groups/page.tsx`: group player picker
  - `src/app/(portal)/admin/groups/[id]/_components/players-section.tsx`: add to group
  - `src/app/(portal)/admin/payments/_components/new-payment-drawer.tsx`
  - `src/app/(portal)/admin/payments/_components/payment-drawer.tsx`
  - `src/app/(portal)/admin/private-sessions/page.tsx`
  - `src/app/(portal)/admin/feedback/_components/new-feedback-drawer.tsx`
  - `src/app/(portal)/admin/dashboard/page.tsx`: the players count
  - `src/app/_actions/private-sessions.ts`: `searchPlayersForPartner`

  The eleventh, the Add Coach "Existing player" search, stays players-only. Admins who
  coach are set on the Admins page.
- **Two player-only checks:**
  - `createCoachFeedback` refuses anyone whose `role` isn't `player`
  - the private-session partner check refuses a partner whose `role` isn't `player`
- **The player layout** sends anyone whose `role` isn't `player` to `/login`. Middleware
  already lets admins through to every portal.
- **The `players_with_status` view** (migration `20260917000000`) is `WHERE p.role =
  'player'`, so admins have no status there.
- **Players page actions** (`updatePlayer`, `deletePlayer`, …) are admin-only since this
  branch's security fix. `deletePlayer` deletes the auth user, so for an admin who plays
  it would delete an admin account.
- **The profile guard trigger** (migration `20261003220000`) protects `role`, `is_coach`
  and `is_active`. `is_player` needs the same protection.
- **`portalsFor`** gives admins `["admin"]`. The top-bar `ViewSwitch` shows whenever an
  account has two views.

## Database

New migration `20261004100000_admins_who_play.sql`, safe to apply ahead of the code:

```sql
ALTER TABLE profiles ADD COLUMN is_player BOOLEAN NOT NULL DEFAULT FALSE;

-- Admins with player history are players too
UPDATE profiles p SET is_player = TRUE
WHERE p.role = 'admin' AND (
  EXISTS (SELECT 1 FROM subscriptions s WHERE s.player_id = p.id)
  OR EXISTS (SELECT 1 FROM group_players g WHERE g.player_id = p.id)
  OR EXISTS (SELECT 1 FROM attendance a WHERE a.player_id = p.id)
);
```

- **`players_with_status`** is dropped and recreated with `WHERE p.role = 'player' OR
  p.is_player`. The columns change (`p.*` gains `is_player`), so it can't be replaced in
  place.
- **`guard_profile_access_columns()`** is replaced to also refuse a non-admin user
  changing `is_player`. The earlier migration is never edited.
- **Why it's safe early:** today's code ignores the new column. Its only visible effect
  is that the already-flagged admins get a status in the view, which the current Players
  list doesn't display for them anyway.

## Shared code

In `src/lib/auth/portals.ts`, `Account` gains `is_player: boolean`, and `accountOf` reads
it:

- `isPlayer(a)` is `role === "player" || is_player`.
- `portalsFor(admin who plays)` is `["admin", "player"]`. Admins who don't play keep
  `["admin"]`, and players and coaches are unchanged.
- `switchesFor` needs no change: two views already show the switch, and admins in
  development keep the dev switcher.
- `homePath`, `viewToRemember` and the middleware already work for any account with two
  views.

New `src/lib/players/filter.ts`:

- `PLAYERS_FILTER = "role.eq.player,is_player.eq.true"`, used as `.or(PLAYERS_FILTER)` by
  the ten queries.

## App changes

- **Player layout:** let in `isPlayer(account)`. Everyone else is still sent to `/login`,
  as today.
- **Player-only checks:** `createCoachFeedback` and the partner check use `isPlayer`.
  Both need `is_player` added to what they select.
- **Admins page:**
  - a "+ Player" / "✓ Player" toggle beside "+ Coach", calling
    `updateUserIsPlayer(userId, isPlayer)`, an admin-only action that mirrors
    `updateUserIsCoach`
  - promoting to admin through `updateUserRole` sets `is_player = true` when the user was
    a player
  - changing a role to player or coach clears `is_player`, because the role now covers it
- **Players list and player detail:**
  - an "Admin" tag beside the name for `role = 'admin'`
  - the player drawer and player page hide Delete and the Active/Inactive switch for them
  - `deletePlayer` refuses an admin: "This player is also an admin. Remove Player access
    on the Admins page instead."
  - `updatePlayer` leaves `is_active` alone for an admin

## Edge cases

- **An admin who plays and coaches** has `["admin", "player"]` views. Their coaching
  stays in the admin portal's My Groups, as today.
- **Removing Player access** (toggle off) keeps their subscriptions, attendance and group
  rows. They just stop appearing in player lists and lose the player view. Group
  memberships stay, so turning the toggle back on restores everything.
- **Player counts on the dashboard** include admins who play.

## Testing

- **Unit:**
  - `portals.test.ts`: `accountOf` reads `is_player`; `isPlayer`; `portalsFor(admin who
    plays)`; `homePath` and `viewToRemember` for an admin who plays
- **Database:** replay all migrations locally and check that:
  - a flagged admin appears in `players_with_status`
  - a non-admin can't change their own `is_player`, but an admin can
  - the backfill marks only admins with player history
- **Manual (staging):**
  1. On the Admins page, turn on "+ Player" for an admin. They appear in Players with the
     Admin tag, can be added to a group, and get a subscription through New Payment.
  2. As that admin, the top bar shows Admin | Player, and the player dashboard works.
  3. Their player drawer has no Delete or status switch.
  4. Promote a player to admin. They stay in the Players list, tagged Admin.

## Out of scope

- A coach view for admins
- Letting an admin delete another admin from the Players page
