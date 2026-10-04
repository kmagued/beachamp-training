# Private Session Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- The player's dashboard shows their pending private-session requests and upcoming sessions.
- The player who booked a session pays for it after confirmation, through the subscribe flow, with the payment linked to the session.
- Admins see each session's payment state.
- Attendance charges only the payer: from the linked payment first, and never the other players.

**Architecture:**
- **The link.** A new `subscriptions.private_session_id` links a payment to a private `schedule_sessions` row.
  - A partial unique index allows one live payment per session.
  - A trigger stops a signed-in non-admin from writing the link.
- **The rules.** Pure helpers in `src/lib/private-sessions/payment.ts` hold who pays, what it costs and where a payment stands.
- **The consumers.** The dashboard loader, the subscribe action, the admin page, notifications and both attendance screens all use those helpers.
- **The database.** `log_attendance_with_deduction` applies the same charging rule.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres, RLS, PostgREST), TypeScript, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-04-private-session-payment-design.md`

## Global Constraints

- Never edit a committed migration; add new ones. They must be safe to apply ahead of the code.
- Verification:
  - run `npm test` and `npx tsc --noEmit -p .`
  - then run `git checkout tsconfig.tsbuildinfo`
  - don't run `next build`
- A server action is a public POST endpoint: anything writing with the service role checks its caller and its input.
- Use Cairo time (`cairoToday()`). Never use `new Date().toISOString().split("T")[0]` for a day.
- **Copy:**
  - Pay button: "Pay 1,000 EGP"
  - pending state: "Payment under review"
  - paid state: "Paid"
  - other player: "{Payer's first name} pays for this session"
  - attendance: "Not charged · {payer} pays"
  - refusal: "This session is already paid or under review"
  - payer notification: "Your private session on Sat 10 Oct at 8:00 PM is confirmed. You can pay 1,000 EGP from your dashboard."
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Paying twice.** A double-click or two tabs on Pay must never create two live payments for one session. The action check and the unique index both refuse, and a unique violation reads as "This session is already paid or under review", not a raw database error.
2. **Paying for someone else's session, or the wrong package.** `submitSubscription` must refuse:
   - a session where the caller isn't the session's `player_id`
   - a package that doesn't match the session's player count
   - a deleted (inactive) session
3. **The partner's balance.** Marking the partner present, absent again, or removing their attendance must never change any of their subscriptions. This holds on both attendance screens and in the database.
4. **The plan card.** A paid private session must not replace the player's group plan on the dashboard, or trigger a renewal banner.
5. **Normal subscriptions are unchanged.** With no `privateSession` parameter, the subscribe page and `submitSubscription` behave exactly as before. In particular, they never send `private_session_id`.

---

### Task 1: The payment rules

**Files:**
- Create: `src/lib/private-sessions/payment.ts`, `src/lib/private-sessions/payment.test.ts`
- Modify: `package.json`, adding `src/lib/private-sessions/*.test.ts` to the `test` script

**Interfaces:**
- Produces:
  - `type PaymentState = "unpaid" | "pending" | "paid"`
  - `paymentState(linkedStatuses: string[]): PaymentState`
  - `privatePackageFor<T extends { private_session_players: number | null }>(playerCount: number, packages: T[]): T | null`
  - `isChargedOnSession(session: { session_type: string; player_id: string | null }, playerId: string): boolean`
  - `privatePaymentProblem(input: { callerId: string; session: { session_type: string; is_active: boolean; player_id: string | null } | null; playerCount: number; packagePlayers: number | null; hasLivePayment: boolean }): string | null`
  - `ALREADY_PAID: string`
  - `sessionWhen(date: string, time: string): string`
  - `paymentPrompt(when: string, price: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALREADY_PAID,
  isChargedOnSession,
  paymentPrompt,
  paymentState,
  privatePackageFor,
  privatePaymentProblem,
  sessionWhen,
} from "./payment";

test("paymentState: nothing linked, or only rejected (cancelled) payments, is unpaid", () => {
  assert.equal(paymentState([]), "unpaid");
  assert.equal(paymentState(["cancelled"]), "unpaid");
});

test("paymentState: a payment under review is pending", () => {
  assert.equal(paymentState(["pending"]), "pending");
  assert.equal(paymentState(["pending_payment"]), "pending");
});

test("paymentState: confirmed, used or frozen is paid", () => {
  assert.equal(paymentState(["active"]), "paid");
  assert.equal(paymentState(["expired"]), "paid");
  assert.equal(paymentState(["frozen"]), "paid");
});

test("paymentState: a rejected payment beside a new one under review", () => {
  assert.equal(paymentState(["cancelled", "pending"]), "pending");
});

const individual = { id: "p1", private_session_players: 1 };
const team = { id: "p2", private_session_players: 2 };
const monthly = { id: "m", private_session_players: null };

test("privatePackageFor: the package tagged for that many players", () => {
  assert.equal(privatePackageFor(1, [monthly, individual, team]), individual);
  assert.equal(privatePackageFor(2, [monthly, individual, team]), team);
});

test("privatePackageFor: three or more players have no package", () => {
  assert.equal(privatePackageFor(3, [monthly, individual, team]), null);
});

test("isChargedOnSession: on a private session only the payer is charged", () => {
  const session = { session_type: "private", player_id: "booker" };
  assert.equal(isChargedOnSession(session, "booker"), true);
  assert.equal(isChargedOnSession(session, "partner"), false);
});

test("isChargedOnSession: group sessions, and private sessions with no payer, charge everyone", () => {
  assert.equal(isChargedOnSession({ session_type: "group", player_id: null }, "anyone"), true);
  assert.equal(isChargedOnSession({ session_type: "private", player_id: null }, "anyone"), true);
});

const ok = {
  callerId: "booker",
  session: { session_type: "private", is_active: true, player_id: "booker" },
  playerCount: 1,
  packagePlayers: 1,
  hasLivePayment: false,
};

test("privatePaymentProblem: the booker paying the matching package", () => {
  assert.equal(privatePaymentProblem(ok), null);
});

test("privatePaymentProblem: a missing, deleted or group session", () => {
  assert.equal(privatePaymentProblem({ ...ok, session: null }), "This private session no longer exists");
  assert.equal(privatePaymentProblem({ ...ok, session: { ...ok.session, is_active: false } }), "This private session no longer exists");
  assert.equal(privatePaymentProblem({ ...ok, session: { ...ok.session, session_type: "group" } }), "This private session no longer exists");
});

test("privatePaymentProblem: only the payer pays", () => {
  assert.equal(privatePaymentProblem({ ...ok, callerId: "partner" }), "Only the player who booked this session can pay for it");
});

test("privatePaymentProblem: the package must fit the session", () => {
  assert.equal(privatePaymentProblem({ ...ok, playerCount: 2 }), "This package doesn't match the session");
  assert.equal(privatePaymentProblem({ ...ok, packagePlayers: null }), "This package doesn't match the session");
});

test("privatePaymentProblem: one live payment per session", () => {
  assert.equal(privatePaymentProblem({ ...ok, hasLivePayment: true }), ALREADY_PAID);
  assert.equal(ALREADY_PAID, "This session is already paid or under review");
});

test("sessionWhen: the day and the time, read without timezone shifts", () => {
  assert.equal(sessionWhen("2026-10-10", "20:00:00"), "Sat 10 Oct at 8:00 PM");
  assert.equal(sessionWhen("2026-10-10", "09:30"), "Sat 10 Oct at 9:30 AM");
});

test("paymentPrompt: what the payer is told on confirmation", () => {
  assert.equal(
    paymentPrompt("Sat 10 Oct at 8:00 PM", 1000),
    "Your private session on Sat 10 Oct at 8:00 PM is confirmed. You can pay 1,000 EGP from your dashboard."
  );
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx tsx --test src/lib/private-sessions/payment.test.ts`

Expected: FAIL (`Cannot find module './payment'`).

- [ ] **Step 3: Implement**

```ts
// Paying for a private session: who pays, which package and where the payment stands.
// A private session is a schedule_sessions row (session_type 'private'). Its player_id is
// the player who pays: the one who requested it, or the first player an admin added.

import { formatDay, formatTime } from "@/lib/king-of-court/format";
import { egp } from "@/lib/merch/format";

export type PaymentState = "unpaid" | "pending" | "paid";

const PAID = ["active", "expired", "frozen"];
const UNDER_REVIEW = ["pending", "pending_payment"];

/** Where a session's payment stands, from the statuses of the subscriptions linked to it.
 *  Rejecting a payment cancels its subscription, which then no longer counts. */
export function paymentState(linkedStatuses: string[]): PaymentState {
  if (linkedStatuses.some((s) => PAID.includes(s))) return "paid";
  if (linkedStatuses.some((s) => UNDER_REVIEW.includes(s))) return "pending";
  return "unpaid";
}

/** The private package for a session with this many players, or null (three or more) */
export function privatePackageFor<T extends { private_session_players: number | null }>(
  playerCount: number,
  packages: T[]
): T | null {
  return packages.find((p) => p.private_session_players === playerCount) ?? null;
}

/** Is this player charged for attending? On a private session only its payer is; on a
 *  group session, or a private one with no payer, everyone is. */
export function isChargedOnSession(
  session: { session_type: string; player_id: string | null },
  playerId: string
): boolean {
  return session.session_type !== "private" || !session.player_id || session.player_id === playerId;
}

export const ALREADY_PAID = "This session is already paid or under review";

/** Why this player can't pay for this private session with this package, or null */
export function privatePaymentProblem(input: {
  callerId: string;
  session: { session_type: string; is_active: boolean; player_id: string | null } | null;
  playerCount: number;
  packagePlayers: number | null;
  hasLivePayment: boolean;
}): string | null {
  const { session } = input;
  if (!session || session.session_type !== "private" || !session.is_active) {
    return "This private session no longer exists";
  }
  if (session.player_id !== input.callerId) return "Only the player who booked this session can pay for it";
  if (input.packagePlayers !== input.playerCount) return "This package doesn't match the session";
  if (input.hasLivePayment) return ALREADY_PAID;
  return null;
}

/** "Sat 10 Oct at 8:00 PM" */
export function sessionWhen(date: string, time: string): string {
  return `${formatDay(date)} at ${formatTime(time)}`;
}

/** What the payer is told when their session is confirmed */
export function paymentPrompt(when: string, price: number): string {
  return `Your private session on ${when} is confirmed. You can pay ${egp(price)} from your dashboard.`;
}
```

Add `src/lib/private-sessions/*.test.ts` to the end of the `test` script in `package.json`.

- [ ] **Step 4: Run all tests, to watch the new ones pass**

Run: `npm test`

Expected: all pass, including the 14 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/private-sessions package.json
git commit -m "feat(private-sessions): who pays, which package and where a payment stands"
```

### Task 2: The migration

**Files:**
- Create: `supabase/migrations/20261004200000_private_session_payment.sql`
- Create (scratch): `$SCRATCH/exec/checks-private-payment.sql`

**Interfaces:**
- Produces:
  - `subscriptions.private_session_id UUID REFERENCES schedule_sessions(id) ON DELETE SET NULL`
  - the unique index `idx_subscriptions_private_session_live`
  - the trigger `subscriptions_guard_private_session`
  - `log_attendance_with_deduction`, same signature: a non-payer on a private session gets `reason = 'not_charged'`, and the payer's linked subscription is preferred

- [ ] **Step 1: Write the checks**

These run in one transaction that is rolled back, after a full replay. Reuse `pg_temp.as_user` and `pg_temp.check` from `checks-admins-who-play.sql`. Add a `pg_temp.try(stmt)` that returns `'ran'`, `'unique'` (on `unique_violation`) or `'refused'` (on `insufficient_privilege`).

**Fixtures:**
- **People:** players `booker`, `partner` and `solo`, and an `admin`.
- **Packages:**
  - individual (1 player, 1 session)
  - team (2 players, 1 session)
  - monthly (8 sessions)
- **Group session:** a group `G` and a group session `SG`.
- **Private session `SP`:** `player_id = booker`, with players booker and partner.
- **Subscriptions:**
  - booker: a linked team subscription (pending, 1/1, `private_session_id = SP`, created first), then a monthly one (active, 8/8, created after it)
  - partner: monthly (active, 8/8)

**Checks:**

```text
1. index: a second live linked subscription for SP → 'unique'
2. guard: booker inserts their own subscription with private_session_id = SP → 'refused'
3. guard: booker sets private_session_id on their monthly subscription → 'refused'
4. guard: the admin sets private_session_id on solo's subscription → 'ran'
5. attendance, booker present on SP, no subscription passed → subscription_id = the linked one;
   linked 0/1, monthly still 8
6. attendance, partner present on SP → reason 'not_charged', subscription_id null, partner monthly still 8
7. partner corrected to absent → partner monthly still 8
8. partner on the group session SG, present → deducted, partner monthly 7 (unchanged behaviour)
9. cancel the linked subscription → a new live linked one inserts ('ran')
```

- [ ] **Step 2: Run the checks before the migration exists, to watch them fail**

Run: `$SCRATCH/exec/replay.sh $SCRATCH/exec/checks-private-payment.sql`

Expected: FAIL (`column "private_session_id" … does not exist`).

- [ ] **Step 3: Write the migration**

The header explains the link, the one-live-payment rule, the attendance rule and why it's safe early. The column and index are as in the spec.

The guard:

```sql
CREATE OR REPLACE FUNCTION guard_subscription_private_session()
RETURNS TRIGGER AS $$
DECLARE
  v_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.private_session_id IS NOT NULL;
  ELSE
    v_changed := NEW.private_session_id IS DISTINCT FROM OLD.private_session_id;
  END IF;
  -- A signed-in user who isn't an admin; the service role has no auth.uid()
  IF v_changed AND auth.uid() IS NOT NULL AND auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin or the server links a subscription to a private session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS subscriptions_guard_private_session ON subscriptions;
CREATE TRIGGER subscriptions_guard_private_session
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION guard_subscription_private_session();
```

`log_attendance_with_deduction` is replaced with `CREATE OR REPLACE` and the same nine parameters. The body is the one from `20260905000000_fix_attendance_deduction.sql`, plus:

- **New variables:**
  - `v_private BOOLEAN`
  - `v_payer UUID`
  - `v_charged BOOLEAN := true`
  - `v_preferred UUID := p_subscription_id`
- **First, decide the charging.**

```sql
SELECT session_type = 'private', player_id INTO v_private, v_payer
FROM schedule_sessions WHERE id = p_schedule_session_id;

IF v_private AND v_payer IS NOT NULL THEN
  IF p_player_id <> v_payer THEN
    v_charged := false;
  ELSIF v_preferred IS NULL THEN
    SELECT id INTO v_preferred FROM subscriptions
    WHERE private_session_id = p_schedule_session_id
      AND player_id = p_player_id
      AND status <> 'cancelled'
    LIMIT 1;
  END IF;
END IF;
```

- **Every `pick_deductible_subscription(p_player_id, p_subscription_id)`** becomes `pick_deductible_subscription(p_player_id, v_preferred)`.
- **Both deduction paths** (correction to present, and a new present row): when `NOT v_charged`, skip the deduction, and set `v_reason := 'not_charged'` and `v_sub_id := NULL`.
- **Correction from present:** call `restore_session_credit` and set `v_reason := 'recredited'` only when `v_charged OR v_old_sub IS NOT NULL`. Otherwise `v_reason` stays `'no_change'`.
- **Re-save with no status change:** `v_reason` becomes `'not_charged'` when present, not charged, and with no recorded subscription. Otherwise it's `'already_deducted'`, or `'no_change'` when not present.

- [ ] **Step 4: Replay with the migration, to watch it pass**

Run: `$SCRATCH/exec/replay.sh $SCRATCH/exec/checks-private-payment.sql`

Expected: every migration replays, and the checks apply with no FAIL.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004200000_private_session_payment.sql
git commit -m "feat(private-sessions): link payments to sessions; only the payer is charged"
```

### Task 3: Paying from the subscribe page

**Files:**
- Modify: `src/types/database.ts`
  - `packages`: `private_session_players: number | null` (Row), `private_session_players?: number | null` (Insert/Update)
  - `subscriptions`: `private_session_id: string | null` (Row), `private_session_id?: string | null` (Insert/Update)
- Modify: `src/app/(portal)/player/subscribe/actions.ts` (`submitSubscription`)
- Modify: `src/app/(portal)/player/subscribe/page.tsx`

**Interfaces:**
- Consumes: `privatePaymentProblem`, `ALREADY_PAID`, `sessionWhen` (Task 1); the column and index (Task 2)
- Produces: a `private_session_id` form field accepted by `submitSubscription`, and the `?privateSession=<id>` page parameter

- [ ] **Step 1: `submitSubscription`**

Read `const privateSessionId = (formData.get("private_session_id") as string) || null;`.

After the package is loaded, when `privateSessionId` is set, use the service role to load three things in parallel:
- the session: `session_type, is_active, player_id, end_date, start_time`
- the count of its `schedule_session_players`
- the count of its live linked subscriptions (`private_session_id = id`, `status <> 'cancelled'`)

Then:

```ts
const problem = privatePaymentProblem({
  callerId: user.id,
  session,
  playerCount: playerCount ?? 0,
  packagePlayers: pkg.private_session_players ?? null,
  hasLivePayment: (liveCount ?? 0) > 0,
});
if (problem) return { error: problem };
```

**Writing the subscription.** Both the free and the pending paths insert through `const subWriter = privateSessionId ? createAdminClient() : supabase`. The link is added only when set:

```ts
...(privateSessionId ? { private_session_id: privateSessionId } : {})
```

A normal subscription never sends the new column. On an insert error with `code === "23505"`, return `{ error: ALREADY_PAID }`.

**The admin notification.** For a linked payment, the body reads `${playerName} paid for their private session on ${sessionWhen(session.end_date, session.start_time)}. Payment pending review.`

- [ ] **Step 2: The subscribe page**

- **Reading the parameter:** `const privateSessionId = searchParams.get("privateSession");`.
- **Loading,** when it's set:
  - keep only the preselected package
  - fetch the session's `end_date, start_time`; players can read `schedule_sessions`
  - store `sessionWhen(...)` in `privateWhen`
- **Header:** the title is "Pay for your private session", with the line `For your private session on ${privateWhen}`.
- **Current subscription card:** hidden.
- **Form data:** `if (privateSessionId) formData.set("private_session_id", privateSessionId);`.
- **Success screen:**
  - title "Payment Submitted", with the line "Your payment for your private session is awaiting review. You'll be notified once the admin confirms it."
  - when free: "Your promo code covered the full price, so your private session is paid."
  - a button back to the dashboard

- [ ] **Step 3: Type check, run all tests, commit**

Run: `npm test && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: all pass, tsc clean.

```bash
git add src/types/database.ts "src/app/(portal)/player/subscribe"
git commit -m "feat(private-sessions): pay for a confirmed private session from the subscribe page"
```

### Task 4: The dashboard card

**Files:**
- Create: `src/lib/private-sessions/load.ts`
- Create: `src/app/(portal)/player/dashboard/_components/private-sessions-card.tsx`
- Modify: `src/app/(portal)/player/dashboard/page.tsx`

**Interfaces:**
- Consumes: `paymentState`, `privatePackageFor`, `sessionWhen` (Task 1)
- Produces: `loadPlayerPrivateSessions(admin, playerId: string, today: string): Promise<PlayerPrivateSessions>`

```ts
interface PendingRequest { id: string; when: string; coach: string | null }
interface UpcomingSession {
  id: string;
  when: string;
  coach: string | null;
  others: string[];               // the other players' full names
  payerFirstName: string | null;
  youPay: boolean;
  state: PaymentState | null;     // null: no package fits or no payer
  pay: { packageId: string; price: number } | null; // the payer's Pay button, when unpaid
}
interface PlayerPrivateSessions { pending: PendingRequest[]; upcoming: UpcomingSession[] }
```

- [ ] **Step 1: The loader**

Everything is read with the service role and limited to the caller.

1. **Pending requests:**
   - Query `private_session_requests` where `player_id = playerId` and `status = 'pending'`, oldest first.
   - Select the coach through `profiles!private_session_requests_coach_id_fkey(first_name, last_name)`.
   - `when` is `sessionWhen(requested_date, requested_time)` when there's a date. Otherwise it's `"${DAY[requested_day_of_week]} at ${formatTime(requested_time)}"`, where `DAY` is Sun–Sat.
2. **Session ids:** the player's `schedule_session_players.schedule_session_id`.
3. **Sessions:** `schedule_sessions` with those ids, filtered to `session_type = 'private'`, `is_active` and `end_date >= today`, ordered by `end_date` then `start_time`.
   - Select `id, player_id, end_date, start_time`.
   - Select the coach through `coach:profiles!schedule_sessions_coach_id_fkey(first_name, last_name)`.
   - Select the players through `private_players:schedule_session_players(player_id, profiles!schedule_session_players_player_id_fkey(first_name, last_name))`.
4. **Cancellations:** drop sessions with a `schedule_session_cancellations` row for their `end_date`, then keep the first 3.
5. **Payment details:** load the linked subscriptions (`private_session_id, status`) for the kept ids, and the active private packages (`id, price, private_session_players`).
6. **Each session:**
   - `pkg = privatePackageFor(players.length, packages)`
   - `state = pkg && player_id ? paymentState(statuses) : null`
   - `youPay = player_id === playerId`
   - `pay = youPay && state === "unpaid" && pkg ? { packageId: pkg.id, price: pkg.price } : null`

- [ ] **Step 2: The card**

A server component, `PrivateSessionsCard({ data }: { data: PlayerPrivateSessions })`. It renders nothing when both lists are empty. It's a `Card` titled "Private sessions" (the dashboard's h2 style, with the `CalendarClock` icon) and a "View all" link to `/player/private-sessions`.

- **Upcoming rows** show:
  - `when`
  - "with {coach}"
  - "and {others}" for a team session
  - on the right, the payment state:
    - Pay: a `Link` to `/player/subscribe?package=${pay.packageId}&privateSession=${id}`, styled as a small primary button, reading `Pay ${egp(price)}`
    - pending: a `warning` Badge reading "Payment under review"
    - paid: a `success` Badge reading "Paid"
  - for another player, the line "{payerFirstName} pays for this session"
- **"Waiting for confirmation"** is a sub-heading with each request's `when` and coach, linking to `/player/private-sessions`.

- [ ] **Step 3: The dashboard page**

- Both subscription queries add `.is("private_session_id", null)`, so the plan card ignores linked payments.
- Load `loadPlayerPrivateSessions(createAdminClient(), currentUser.id, cairoToday())`.
- Render `<PrivateSessionsCard data={...} />` right after the top grid of plan, streak and credits.

- [ ] **Step 4: Type check, run all tests, commit**

Run: `npm test && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: all pass, tsc clean.

```bash
git add src/lib/private-sessions/load.ts "src/app/(portal)/player/dashboard"
git commit -m "feat(private-sessions): the player dashboard shows private sessions and their payment"
```

### Task 5: The admin page and notifications

**Files:**
- Modify: `src/app/(portal)/admin/private-sessions/page.tsx`
- Modify: `src/app/_actions/private-sessions.ts` (`confirmPrivateSessionRequest`, `createAdminPrivateSession`)

**Interfaces:**
- Consumes: `paymentState`, `privatePackageFor`, `paymentPrompt`, `sessionWhen` (Task 1)

- [ ] **Step 1: The admin page**

- The scheduled select adds `player_id`.
- Also load the linked subscriptions for the scheduled ids (`private_session_id, status`) and the private packages (`id, private_session_players`).
- For each session, `payment = pkg && s.player_id ? paymentState(...) : null`.
- A Payment column (desktop) and a badge (mobile) show:
  - "Unpaid" (`neutral`)
  - "Payment pending" (`warning`)
  - "Paid" (`success`)
  - "—" when null

- [ ] **Step 2: The notifications**

**Both actions** load the active private packages and pick the one for the player count:
- `confirmPrivateSessionRequest`: 1, or 2 with a partner
- `createAdminPrivateSession`: `playerIds.length`

**The payer** (the requester, or `playerIds[0]`) gets these when a package fits:
- body: `paymentPrompt(sessionWhen(date, startTime), pkg.price)`
- link: `/player/dashboard`

**Unchanged:** the titles, and the other players' notifications. With no package, the payer's notification is unchanged too.

- [ ] **Step 3: Type check, run all tests, commit**

Run: `npm test && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: all pass, tsc clean.

```bash
git add "src/app/(portal)/admin/private-sessions/page.tsx" src/app/_actions/private-sessions.ts
git commit -m "feat(private-sessions): admins see payment state; the payer is told how to pay"
```

### Task 6: Attendance charges only the payer

**Files:**
- Modify: `src/app/_actions/training.ts` (`removeAttendanceRecords`)
- Modify: `src/components/coach/SessionDetail.tsx` (keep `player_id` as `payer_id`, and pass `privatePayerId`)
- Modify: `src/components/coach/AttendanceTab.tsx`
- Modify: `src/app/(portal)/admin/daily-report/_components/attendance-tab.tsx`

**Interfaces:**
- Consumes: `isChargedOnSession` (Task 1); `private_session_id` (Task 2)

- [ ] **Step 1: `removeAttendanceRecords`**

Load the session's `session_type, player_id`. In the restore loop, skip a present row that has no `subscription_id` and whose player isn't charged on this session:

```ts
// Nothing was taken from another player on a private session; the fallback would credit one of theirs
if (!record.subscription_id && sessionRow && !isChargedOnSession(sessionRow, record.player_id)) continue;
```

- [ ] **Step 2: `AttendanceTab`**

- **The new prop:** `privatePayerId?: string | null`, passed by `SessionDetail` as `session.session_type === "private" ? session.payer_id : null`.
- **The payer's linked subscription comes first.** The subscriptions select adds `private_session_id`. A sub whose `private_session_id === scheduleSessionId` is `unshift`ed into the player's list, so the default pick is the linked one.
- **Rows for other players** (`privatePayerId` set, and `isChargedOnSession` false) get:
  - `subscriptions: []`
  - `sessions_remaining: null`
  - `charge_note: "Not charged · {payer first name} pays"`
- **Where the note applies:**
  - Each row shows `charge_note` in place of the subscription line.
  - `getZeroBalancePresentPlayers` skips rows with a `charge_note`.

- [ ] **Step 3: The Daily Report**

- **The data:** `PlayerSubscription` gains `private_session_id: string | null`, and both subscription selects add it.
- **A helper:** `linkedSub(session, playerId)` returns the payer's live linked subscription for this session.
- **Other players** (`!isChargedOnSession(session, pid)`):
  - `getZeroBalancePresentPlayers` and `getMultiSubPresentPlayers` skip them
  - their row shows "Not charged · {payer first name} pays"
- **The payer with a linked subscription:**
  - `getMultiSubPresentPlayers` skips them, so there's no picker
  - `executeSave` sends `linkedSub(...).id` for them, and never another session's leftover `chosenSubs` value

- [ ] **Step 4: Type check, run all tests, commit**

Run: `npm test && npx tsc --noEmit -p . ; git checkout tsconfig.tsbuildinfo`. Expected: all pass, tsc clean.

```bash
git add src/app/_actions/training.ts src/components/coach "src/app/(portal)/admin/daily-report/_components/attendance-tab.tsx"
git commit -m "feat(private-sessions): attendance charges the payer's payment and never the partner"
```
