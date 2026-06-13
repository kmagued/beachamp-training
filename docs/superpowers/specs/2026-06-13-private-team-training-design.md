# Private Team Training (2 Players) — Design

**Date:** 2026-06-13
**Status:** Approved

## Summary

Let a player requesting a private session choose between two session types and see
the price up front:

- **Private Session** — 1 player, 800 EGP
- **Private Team Training (2 Players only)** — 2 players, 1000 EGP

For team training the requester searches the registered players and selects one
partner. Prices are driven by the `packages` table (admin-editable). Pricing is
**display-only** at request time — actual charging continues through the existing
attendance → pending-payment flow.

## Decisions (settled during brainstorming)

1. **Partner is chosen at request time** by the requester; no acceptance step. The
   partner is recorded on the request, added to the session on confirmation, and
   notified then.
2. **Pricing is display-only.** No payment is created when the request is made or
   confirmed.
3. **Private packages are hidden from the player "Buy Packages" page** (they are
   price references, not buyable subscriptions). They remain visible/editable in the
   admin Packages CRUD.
4. **Prices come from the `packages` table**, looked up by player count, so admins
   can change them without code changes.

## Existing context (verified)

- Request flow: player submits → `private_session_requests` row (`status='pending'`)
  → admin confirms → creates a `schedule_sessions` (`session_type='private'`) row +
  `schedule_session_players` junction rows.
  - `src/app/(portal)/player/private-sessions/request/page.tsx` (server: loads coaches)
  - `src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx` (form)
  - `src/app/_actions/private-sessions.ts` — `createPrivateSessionRequest` (~L276),
    `confirmPrivateSessionRequest` (~L381)
- `schedule_session_players` junction already supports multiple players per session.
- `packages` table: `id, name, session_count, validity_days, price, description,
  is_active, sort_order`. No "Private Session"/"Private Team Training" rows exist yet.
- **RLS:** a player can read only their own profile + coach/admin profiles, **not**
  other players. So partner search must run server-side with the admin client.
- Admin Packages CRUD exists: `src/app/(portal)/admin/packages/page.tsx` + `actions.ts`.
- Player Buy Packages page: `src/app/(portal)/player/packages/page.tsx` queries
  `packages` where `is_active=true`.
- Existing search-as-you-type player picker (admin): `src/app/(portal)/admin/
  private-sessions/_components/create-private-session-button.tsx`.

## Architecture

One nullable column on each of two existing tables carries the whole feature; the
rest is wiring the request UI, a search action, and the confirm step.

### 1. Database

New migration `supabase/migrations/20260613100000_private_team_training.sql`:

```sql
-- Packages: mark private-session price packages and encode their player count.
-- NULL = normal subscription package; 1 = individual private; 2 = team private.
ALTER TABLE packages
  ADD COLUMN private_session_players INTEGER
  CHECK (private_session_players IS NULL OR private_session_players IN (1, 2));

-- Seed the two private price packages (idempotent on name).
INSERT INTO packages (name, session_count, validity_days, price, description, is_active, sort_order, private_session_players)
SELECT 'Private Session', 1, 30, 800.00, 'Single-player private session', TRUE, 100, 1
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Private Session');

INSERT INTO packages (name, session_count, validity_days, price, description, is_active, sort_order, private_session_players)
SELECT 'Private Team Training (2 Players only)', 1, 30, 1000.00, 'Two-player private team training', TRUE, 101, 2
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Private Team Training (2 Players only)');

-- Requests: optional second player for team training (NULL = solo).
ALTER TABLE private_session_requests
  ADD COLUMN partner_player_id UUID REFERENCES profiles(id);
```

- `private_session_players` does double duty: flags the package as private and
  encodes the player count for price lookup (rename-safe).
- `partner_player_id` NULL → "Private Session"; set → "Private Team Training".

### 2. Hide private packages from the player Buy Packages page

In `src/app/(portal)/player/packages/page.tsx`, add `.is("private_session_players", null)`
to the active-packages query. Admin Packages CRUD and admin-side package pickers are
left unchanged (admins can still edit prices and charge private sessions manually).

### 3. Partner search server action

`searchPlayersForPartner(query: string)` in `src/app/_actions/private-sessions.ts`:

- Auth: `getCurrentUser()`; any authenticated player.
- Returns `[]` if `query.trim().length < 2` (avoid dumping the roster).
- Admin client: `profiles` where `role='player'`, `is_active=true`, `id != user.id`,
  `(first_name || ' ' || last_name) ILIKE %query%`, `limit 20`, ordered by first name.
- Returns `{ id: string; name: string }[]` (no contact info).

### 4. Request form (`request-form-page.tsx`)

Add a **Session Type** step (above coach selection) and a conditional partner picker.

- Two selectable cards driven by props `individualPrice`/`teamPrice`:
  - "Private Session — {individualPrice} EGP" (default selected)
  - "Private Team Training (2 players) — {teamPrice} EGP"
- New state: `sessionType: "individual" | "team"`, `partnerId: string | null`,
  `partnerName: string | null`, plus search query/results/loading.
- When `sessionType === "team"`, render a search input. On input (debounced or
  on-change), call `searchPlayersForPartner` and show a dropdown of results;
  selecting sets `partnerId`/`partnerName` and shows a removable chip.
- The selected type's price is shown in the "Confirm Details" card.
- `handleSubmit` validation: if `sessionType === "team"` and no `partnerId`, set an
  error ("Please select a second player"); otherwise include
  `partner_player_id: partnerId ?? undefined` in the payload to
  `createPrivateSessionRequest`.

### 5. Request page (`request/page.tsx`)

In addition to coaches, fetch the two private packages and pass prices/names to the
form:

```ts
const { data: privatePackages } = await supabase
  .from("packages")
  .select("name, price, private_session_players")
  .in("private_session_players", [1, 2]);
```

Map to `individualPrice` (players=1) and `teamPrice` (players=2); pass as props.
Falls back gracefully (e.g. show "—") if a row is missing.

### 6. `createPrivateSessionRequest`

- Extend the input type with `partner_player_id?: string`.
- If present: verify it is a distinct active player (admin client lookup;
  `role='player'`, `is_active`, `id !== user.id`); reject with a clear error
  otherwise.
- Persist `partner_player_id` on the inserted request row.
- Admin notification body notes "team training (2 players)" when a partner is set.

### 7. `confirmPrivateSessionRequest`

- Include `partner_player_id` in the request `select`.
- After creating the `schedule_sessions` row, insert junction rows for **both** the
  requester and (if set) the partner into `schedule_session_players`.
- If a partner is set, also `createNotification` for the partner ("You've been added
  to a private session …").
- `schedule_sessions.player_id` stays the requester (back-compat), unchanged.

### 8. Admin visibility

On the admin private-sessions request list
(`src/app/(portal)/admin/private-sessions/page.tsx` and its request query), fetch the
partner's name and display "Team training with: \<partner name\>" on requests that
have a `partner_player_id`, so the admin sees it's a 2-player session before
confirming.

### 9. Types

`private_session_players` and `partner_player_id` are not in the generated
`src/types/database.ts`. Use `as any` at the new touch-points (the established
convention in these files) rather than blocking on `npm run db:types`.

## Data flow

1. Player opens request page → server loads coaches + private package prices.
2. Player picks type; if Team, searches and selects a partner (server action,
   admin client).
3. Submit → `createPrivateSessionRequest` validates partner and inserts the request
   with `partner_player_id`.
4. Admin sees the request (with partner name) → confirms → session created, both
   players added to the junction, partner notified.

## Error handling

- Partner search: `< 2` chars returns empty; network/DB errors surface as "no
  results" (non-blocking).
- Submit without a partner on Team type: inline validation error, no server call.
- `createPrivateSessionRequest`: invalid/duplicate/non-player partner →
  `{ error }` rendered inline (existing error pattern).
- Missing price package row: request page shows "—" and the type is still
  selectable (display-only price never blocks submission).

## Testing

No automated test harness exists in this repo; verify via `npm run lint`,
`npm run build`, and manual browser testing:

- Buy Packages page no longer lists the two private packages; admin Packages page
  still does.
- Request page shows both type cards with 800 / 1000 EGP from the packages table.
- Team type: searching shows other players (not self), selecting + submitting
  persists `partner_player_id`.
- Solo type: submitting works exactly as before (no partner).
- Admin request list shows "Team training with: \<name\>"; confirming adds both
  players to `schedule_session_players` and notifies the partner.
- Editing a private package's price in admin changes the price shown on the request
  page.

## Out of scope (YAGNI)

- Partner acceptance/invite flow.
- Checking the partner's own schedule for conflicts (availability stays coach-based).
- Creating a payment/charge at request or confirm time (display-only).
- 3+ player sessions.
- Hiding private packages from admin-side package pickers.
