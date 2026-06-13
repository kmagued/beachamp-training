# Private Session Pre-Payment — Design

**Date:** 2026-06-13
**Status:** Approved

## Summary

Require players to pay for a **private session** before attending. When an admin
confirms a private session request, the system auto-creates a **pending payment**
for the session price (800 solo / 1000 team). The player pays via **Instapay**
(upload proof), the admin confirms the payment in the existing Payments screen, and
at attendance time the coach/admin sees an **"unpaid" warning** if the session
hasn't been paid (they can still mark attendance — soft enforcement).

## Decisions (settled during brainstorming)

1. **Scope: private sessions only**, via the request → confirm flow. Group sessions
   keep today's behavior.
2. **Charge is auto-created on confirm**; the player pays via **Instapay** (reusing
   the existing proof-upload + admin-confirm flow).
3. **Enforcement is a warning, not a block.** At attendance the admin sees "unpaid"
   but can still mark the player present.
4. **Team (2 players): the requester pays the full price** (1000). The partner
   attends as a guest; no split.
5. **Charge model: a standalone payment linked to the session** (Approach A), not a
   throwaway subscription.
6. **Private-session attendance does NOT deduct from a subscription** (it is covered
   by its own payment), and **does not** trigger the generic zero-balance
   pending-payment creation — so a subscription holder is never double-charged.

## Existing context (verified)

- `confirmPrivateSessionRequest` (`src/app/_actions/private-sessions.ts`) creates the
  `schedule_sessions` row + `schedule_session_players`; it does **not** create any
  payment today.
- `payments` table: `player_id` (nullable), `subscription_id` (nullable),
  `amount`, `method` (`instapay` | `cash`), `screenshot_url`, `status`
  (`pending` | `confirmed` | `rejected`), `confirmed_by`, `note`. Standalone payments
  (no subscription) are already supported (`createStandalonePayment`).
- `confirmPayment` (`src/app/(portal)/admin/payments/actions.ts`) marks a payment
  confirmed and only activates a subscription **if** `payment.subscription_id` is set —
  so a session-linked payment with no subscription is handled cleanly. Its player
  notification currently says "your subscription is now active" (needs session wording).
- Instapay proof upload today: `submitPendingPaymentScreenshot`
  (`src/app/(portal)/player/dashboard/actions.ts`) requires a `pending_payment`
  subscription; it uploads to the `payment-screenshots` bucket and flips `method` to
  `instapay`. We will generalize it to operate on a payment id.
- Private package prices come from `packages` rows tagged `private_session_players`
  (1 = `Private Session` 800, 2 = `Private Team Training (2 Players only)` 1000).
- The coach/admin `SessionDetail` AttendanceTab (`src/components/coach/AttendanceTab.tsx`)
  drives private-session attendance and currently creates pending payments for
  zero-balance present players via `createPendingPaymentForSession`.

## Architecture

### 1. Data model

New migration: `payments.schedule_session_id UUID REFERENCES schedule_sessions(id) ON DELETE SET NULL`.

- Nullable; set only on private-session charges. `ON DELETE SET NULL` preserves the
  payment record if the session is later deleted.
- Index on `schedule_session_id` for the attendance-time lookup.

### 2. Auto-create the charge on confirm

In `confirmPrivateSessionRequest`, after the session + junction rows are created:

- Determine player count: `partner_player_id ? 2 : 1`.
- Look up the active package where `private_session_players = <count>`; read its
  `price`.
- If found, insert a payment:
  `{ player_id: requester, subscription_id: null, amount: price, method: 'cash',
     status: 'pending', schedule_session_id: created.id,
     note: 'Private session — <sessionDate>' }`.
- If no tagged/priced package is found, **skip** payment creation (never block
  confirmation) — log/return is unchanged.
- Notify the requester: "Payment required for your private session" with a link to
  `/player/private-sessions`.

### 3. Player pays via Instapay

- **Generalize** `submitPendingPaymentScreenshot` into a payment-id-based action
  (e.g. `submitPaymentScreenshot(paymentId, formData)`): validates the player owns
  the payment and it is `pending`, uploads to `payment-screenshots/{uid}/...`, sets
  `screenshot_url` + `method = 'instapay'`. Drop the hard requirement that a
  `pending_payment` subscription exist (keep that check only when a subscription is
  linked). Keep the existing dashboard card working by calling the generalized action.
- **Player Private Sessions page** (`src/app/(portal)/player/private-sessions/page.tsx`):
  for each confirmed session with a linked `pending` payment, show the amount + an
  "Pay via Instapay" affordance (Instapay handle/link from `src/lib/config/payment.ts`)
  and a proof-upload control that calls the generalized action. After upload, show
  "Awaiting confirmation."

### 4. Admin confirms

No new admin UI: the pending payment appears in the existing Payments list (player,
amount, note, screenshot). Admin uses the existing `confirmPayment`. Adjust its
player notification copy to be correct for a session payment (no subscription):
"Your private session payment has been confirmed."

### 5. Attendance warning + no double-charge

In the coach/admin `SessionDetail` AttendanceTab, for **private** sessions:

- Fetch the linked payment (`payments` where `schedule_session_id = session.id`),
  newest first. Compute paid = exists and `status = 'confirmed'`.
- If not paid, render an **"Unpaid — payment pending" warning banner**. Marking
  present remains enabled (override).
- **Suppress** the zero-balance → `createPendingPaymentForSession` path for private
  sessions (the session payment already covers it).
- Private-session attendance does **not** deduct from any subscription (it is
  covered by the session payment).

## Data flow

confirm → pending payment (linked to session) → player uploads Instapay proof →
admin confirms payment → session shows paid; if marked attended while unpaid, the
admin sees a warning but can proceed.

## Error handling

- Missing/untagged price package at confirm → skip payment creation; confirmation
  still succeeds.
- Upload: ownership + `pending` status checks; PNG/JPG under 5 MB (as today).
- Confirming a session payment with no subscription → handled by existing
  `confirmPayment` (subscription activation is conditional).
- Deleting a private session → `ON DELETE SET NULL` keeps the payment row.

## Testing

No automated harness; verify via `tsc --noEmit`, a build, and manual checks:

- Confirm a solo request → a pending 800 payment appears (admin Payments + player
  Private Sessions); team request → 1000.
- Player uploads Instapay proof → payment shows screenshot + `instapay`, still
  pending; admin confirms → confirmed; player notified with session wording.
- Attendance on an unpaid private session → warning shown, marking present allowed,
  no second pending payment created, no subscription deducted.
- Attendance on a paid private session → no warning.
- Group-session attendance unchanged (still creates zero-balance pending payments).

## Out of scope (YAGNI)

- Hard-blocking attendance when unpaid (warning only).
- Charging admin-direct private sessions (`createAdminPrivateSession`).
- Split / per-player payment for team sessions (requester pays full).
- Any change to group-session payment behavior.
- Refund/void automation when a paid session is cancelled.
