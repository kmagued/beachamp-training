# Private Sessions: See the Next One, Pay After Confirmation — Design

**Date:** 2026-10-04
**Status:** Design approved in chat; spec awaiting review
**Branch:** `feat/player-coaches`

## Summary

A player requests a private session and an admin confirms it. Then two things are
missing:

- The player's dashboard doesn't show the session.
- Nothing asks the player to pay.

Admins record the payment by hand, and nothing ties it to the session. On production,
one confirmed session's payment was recorded 8 times.

After this change:

- **The dashboard shows it.** A "Private sessions" card lists the player's requests
  waiting for confirmation and their upcoming sessions, each with its payment state.
- **The player pays after confirmation**, from that card, through the existing subscribe
  flow. The payment is tied to the session.
- **Admins see the payment state.** Each session on Private Sessions shows Unpaid,
  Payment pending or Paid.
- **Attendance charges the right thing.** The session's payment is used first, and only
  the player who pays is ever charged for a private session.

## Decisions

1. **Pay after confirmation.** There's nothing to pay while a request is pending.
2. **Admins confirm**, as today, on Private Sessions.
3. **The player who booked pays**: the team price for a team session. The other player
   is never charged for it.
4. **Reuse the subscribe flow** (InstaPay screenshot or cash, reviewed by an admin).
   There's no new payment form.
5. **The payment links to the private session, not the request.** This changed while
   writing the spec. Admins can schedule a private session directly, with no request,
   and linking to the session covers both kinds. A request already points at its session.
6. **The duplicate-payment warning** in New Payment, already on this branch, stays as a
   second line of defence.

## Existing context (verified)

- **Private sessions** are `schedule_sessions` rows with `session_type = 'private'`.
  - Each is dated by its `end_date`.
  - Its players are in `schedule_session_players`.
  - `player_id` is the player who requested it. For a session an admin scheduled, it's
    the first player the admin picked.
- **Two ways to create one:**
  - Confirming a request creates the session, sets the request's
    `schedule_session_id`, and notifies the player and partner.
  - "New private session" (`createAdminPrivateSession`) has no request and takes any
    number of players. Staging has 11 sessions with two or more players; one has three.
- **Deleting** a private session sets `is_active = false`.
- **Packages on production**, tagged by `packages.private_session_players`:
  - "Private Session": 1 player, 1 session, 1,000 EGP
  - "Private Team Training (2 Players only)": 2 players, 1 session, 1,200 EGP
- **The subscribe flow:**
  - `/player/subscribe?package=<id>` preselects a package.
  - `submitSubscription` creates a pending subscription and a pending payment. When a
    promo code makes it free, it creates an active subscription with no payment.
  - Confirming a payment activates its subscription. Rejecting it cancels the
    subscription. `updatePayment` keeps the two in step the same way.
- **A single-session subscription becomes `expired`** once attendance uses it, but only
  after it's active. So a paid, used private session's subscription is `expired`, not
  `active`.
- **Attendance** (session page and Daily Report) calls `log_attendance_with_deduction`.
  - The screen passes the subscription it picked. By default that's the player's newest
    usable one, of any package. With none passed, the database picks the newest usable
    one.
  - Nothing is aware of private sessions. A partner with a group package is charged a
    group session. A partner with no subscription is offered a pending payment.
  - On staging, attended team sessions charged the booker the team package and never
    charged the partner. Decision 3 matches that practice.
- **The player dashboard** has nothing about private sessions. Its plan card shows the
  newest active subscription of any package, so a paid private session would replace
  the player's group plan there.
- **Row-level security:**
  - Players can read every `schedule_sessions` and `schedule_session_players` row.
  - They can read only their own requests and their own subscriptions.
  - They can't read other players' profiles.
- **An existing hole, reported separately.** Players can insert and update their own
  subscriptions with any values, because the policies check only `player_id`. This
  design doesn't depend on fixing that, and it doesn't widen it (see Database).

## Database

New migration `20261004200000_private_session_payment.sql`:

```sql
-- The private session a subscription pays for
ALTER TABLE subscriptions
  ADD COLUMN private_session_id UUID
  REFERENCES schedule_sessions(id) ON DELETE SET NULL;

-- One live payment per session. Rejecting a payment cancels its subscription,
-- so the session can then be paid again.
CREATE UNIQUE INDEX idx_subscriptions_private_session_live
  ON subscriptions(private_session_id)
  WHERE private_session_id IS NOT NULL AND status <> 'cancelled';
```

The migration also does two more things.

**A guard on the link.** A BEFORE INSERT OR UPDATE trigger refuses a signed-in non-admin
who sets or changes `private_session_id`. It follows the pattern of
`guard_profile_access_columns()`. The server writes linked subscriptions with the
service role.

**Attendance.** `log_attendance_with_deduction` is replaced, keeping its signature:

- **Other players.** On a private session, a player other than the session's
  `player_id` is recorded without a charge: `reason = 'not_charged'`, no subscription.
  Correcting them to absent gives nothing back, unless their row recorded a
  subscription from before this change.
- **The payer.** When the screen passes no subscription, the session's live linked
  subscription is used first.
- **No `player_id`.** A private session without one is charged as today.

**Why it's safe to apply ahead of the code:**

- The column, index and guard go unused until the code ships.
- The attendance change takes effect immediately: on private sessions, only the
  session's `player_id` is charged. That is decision 3, and it matches how staging shows
  team sessions being charged.

## The payment state

A session's payment state comes from its live linked subscription:

| Linked subscription | State |
|---|---|
| none, or only cancelled ones | Unpaid |
| `pending` or `pending_payment` | Payment pending |
| `active`, `expired` (used) or `frozen` | Paid |

New `src/lib/private-sessions/payment.ts` holds two pure, tested functions:

- **`paymentState(linkedStatuses)`** returns `"unpaid"`, `"pending"` or `"paid"`.
- **`privatePackageFor(playerCount, packages)`** returns the package tagged for that many
  players, or null. It's null for three or more players.

## Player

### The dashboard "Private sessions" card

The card shows when the player has a pending request or an upcoming private session.

**Waiting for confirmation**

- Lists the player's own pending requests, with the requested date (or day), time and
  coach.
- Links to Private Sessions, where a request can be cancelled.
- A partner doesn't see pending requests. They can't read them, and they're told when
  the session is confirmed.

**Upcoming**

- Lists the private sessions the player is in that are:
  - dated today or later, in Cairo
  - not deleted
  - not cancelled for their date
- Nearest first, at most 3.
- Each shows its date, time and coach, and the other player for a team session.
- **What the payer sees:**
  - **Unpaid:** a **Pay 1,000 EGP** button (**Pay 1,200 EGP** for a team session), using
    the matching package's price.
  - **Payment pending:** "Payment under review".
  - **Paid:** a "Paid" tag.
- **What the other players see:** "{Payer's first name} pays for this session" and the
  same state, with no Pay button.
- **No payment state** shows when no package matches (three or more players) or the
  session has no `player_id`.

**Loading.** Names and payment states load with the service role, limited to the
caller's own sessions, because a partner can't read the payer's subscription or profile.

**The plan card** ignores subscriptions linked to a private session.

### Paying

**Pay** opens `/player/subscribe?package=<id>&privateSession=<session id>`.

**The page:**

- shows only that package, under the title "Pay for your private session"
- shows "For your private session on Sat 10 Oct at 8:00 PM"
- handles promo codes and the first-time training questions as for any package

**`submitSubscription` checks:**

- the session is an active private session
- the caller is the session's `player_id`
- the package is the one for the session's player count
- the session has no live linked subscription. Otherwise it refuses with "This session
  is already paid or under review". The unique index backs this up against double
  submits.

**What it creates:**

- The subscription is linked to the session and written with the service role.
- The payment is created as today.
- Dates follow the usual single-session rules.

## Admin

- **Private Sessions** shows Unpaid, Payment pending or Paid on each scheduled session,
  Upcoming and Past.
- **Notifications.** Confirming a request, or scheduling a session directly, now tells
  the payer: "Your private session on Sat 10 Oct at 8:00 PM is confirmed. You can pay
  1,000 EGP from your dashboard." It links to the dashboard.
  - Other players' notifications don't change.
  - With no matching package, the payer's notification doesn't change either.
- **Payments** lists the new payment as pending for review, as today.
- **Attendance** (session page and Daily Report), on a private session:
  - The payer's linked subscription is preselected.
  - Other players show "Not charged · {payer} pays". They get no subscription picker
    and aren't offered a pending payment.
  - **Removing attendance** gives nothing back for another player's row that recorded
    no subscription. Today's fallback would credit one of their subscriptions instead.

## Edge cases

- **A payment is rejected.** Its subscription is cancelled, the session shows Unpaid,
  and the player can pay again.
- **A paid session is deleted.** The link stays, and the paid subscription remains a
  usable single session. The admin refunds or reuses it, as with any subscription today.
- **A session is rescheduled.** The link follows the session, because it's the same row.
- **A session is attended before it's paid.** The payer is handled as today: charged
  from a usable subscription, or offered a pending payment. The other players aren't
  charged. Once the date has passed, the dashboard stops showing the session.
- **A payment is recorded by hand in New Payment.** It isn't linked, so the session
  shows Unpaid. The duplicate warning still helps. Linking manual payments is out of
  scope.
- **A rejected payment is re-opened while another payment for the session is live.**
  The unique index refuses it, so the admin rejects one of them first.

## Testing

- **Unit:**
  - `paymentState`:
    - none → unpaid
    - only cancelled → unpaid
    - `pending` or `pending_payment` → pending
    - `active`, `expired` or `frozen` → paid
    - cancelled plus pending → pending
  - `privatePackageFor`: 1 → individual; 2 → team; 3 → null
- **Database** (replay the migrations locally):
  - **The index** refuses a second live linked subscription, and allows a new one once
    the first is cancelled.
  - **The guard** refuses a player who sets `private_session_id`, and allows the service
    role and admins.
  - **Attendance on a team session:**
    - The payer is charged from the linked subscription, even when they have a newer
      group subscription.
    - The other player isn't charged.
    - Correcting them to absent restores nothing.
    - Group sessions are unchanged.
- **Manual (staging):**
  1. As a player, request a session. The dashboard shows it waiting for confirmation.
  2. As an admin, confirm it. The player's notification mentions paying, and the
     dashboard shows the session with Pay 1,000 EGP.
  3. Pay with an InstaPay screenshot. The dashboard shows "Payment under review", and
     Private Sessions shows Payment pending. Opening the Pay link again is refused.
  4. As an admin, confirm the payment. The dashboard shows Paid, and the plan card still
     shows the group plan.
  5. In a team session, the booker pays 1,200 EGP. The partner's dashboard shows
     "{Booker} pays for this session" and the state.
  6. Take attendance for the team session. The booker is charged from the paid session,
     and the partner shows "Not charged".
  7. Reject a payment. The session shows Unpaid, and the player can pay again.
  8. Schedule a session directly from Private Sessions. The first player sees it with a
     Pay button.

## Out of scope

- Linking payments recorded in New Payment, or created at attendance, to a session
- Refunds
- Coaches confirming requests
- Listing admin-scheduled sessions on the player's Private Sessions page, which lists
  requests. The dashboard card shows the upcoming ones.
- Closing the existing hole that lets players write their own subscriptions' status and
  balance (reported separately)
