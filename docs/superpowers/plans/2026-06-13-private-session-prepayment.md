# Private Session Pre-Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require players to pay for a private session before attending: auto-create a pending payment on confirm, let the player pay via Instapay, and show a soft "unpaid" warning at attendance.

**Architecture:** A private-session charge is a standalone `payments` row linked to the session via a new `payments.schedule_session_id`. `confirmPrivateSessionRequest` creates it; the player uploads Instapay proof (reusing the existing card + a generalized upload action); the admin confirms it in the existing Payments screen. The attendance UI fetches the payment status via a server action and warns when unpaid, and private-session attendance neither deducts from subscriptions (RPC change) nor creates zero-balance pending payments.

**Tech Stack:** Next.js 15 (server actions), React 19, Supabase (Postgres + RLS + plpgsql RPC), Tailwind. No test framework — verify via `npx tsc --noEmit`, `npm run build`, and manual checks.

---

## Spec reference

`docs/superpowers/specs/2026-06-13-private-session-prepayment-design.md`

## File structure

- **Create** `supabase/migrations/20260613130000_payments_schedule_session.sql` — `payments.schedule_session_id` + index.
- **Create** `supabase/migrations/20260613140000_attendance_skip_private_deduction.sql` — `CREATE OR REPLACE` the RPC to skip subscription deduction for private sessions.
- **Modify** `src/app/_actions/private-sessions.ts` — create the pending payment on confirm; add `getSessionPaymentStatus`.
- **Modify** `src/app/(portal)/player/dashboard/actions.ts` — generalize `submitPendingPaymentScreenshot` for session payments.
- **Modify** `src/app/(portal)/admin/payments/actions.ts` — session-aware confirm notification.
- **Modify** `src/app/(portal)/player/private-sessions/page.tsx` — "Payment due" section reusing `PendingPaymentCard`.
- **Modify** `src/components/coach/AttendanceTab.tsx` — unpaid warning + suppress zero-balance pending payment for private.

## Conventions (verified)

- Server actions: `getCurrentUser()` / `getCurrentUserRole()` + a `require*` guard, write via `createAdminClient()`; new columns need `as any` on the insert object.
- `payments`: `player_id`/`subscription_id` nullable; `method` ∈ `instapay`|`cash`; `status` ∈ `pending`|`confirmed`|`rejected`. RLS: players read own payments; admins all; **coaches cannot** read payments (hence the server action for the warning).
- `confirmPayment` only activates a subscription when `payment.subscription_id` is set — standalone session payments are already handled.
- `PendingPaymentCard` (`src/app/(portal)/player/dashboard/_components/pending-payment-card.tsx`) is a client component `{ paymentId, packageName, amount, hasScreenshot }` that calls `submitPendingPaymentScreenshot` — reusable as-is.

---

## Task 1: Migration — `payments.schedule_session_id`

**Files:**
- Create: `supabase/migrations/20260613130000_payments_schedule_session.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Link a payment to a specific private session (per-session charge).
ALTER TABLE payments
  ADD COLUMN schedule_session_id UUID REFERENCES schedule_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_schedule_session ON payments(schedule_session_id);
```

- [ ] **Step 2: (DB apply is the user's step)** — do not run `db:migrate`; note it in the handoff.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613130000_payments_schedule_session.sql
git commit -m "feat(prepay): add payments.schedule_session_id"
```

---

## Task 2: Migration — RPC skips deduction for private sessions

**Files:**
- Create: `supabase/migrations/20260613140000_attendance_skip_private_deduction.sql`

- [ ] **Step 1: Write the migration** (full `CREATE OR REPLACE`, identical to the current function except it computes `v_is_private` and guards both `present` deduction branches with `AND NOT v_is_private`)

```sql
-- Private sessions are charged per-session (their own payment); attendance must
-- never deduct from a subscription for them. Otherwise identical to the prior
-- definition (20260421200000_private_schedule_sessions.sql).
CREATE OR REPLACE FUNCTION log_attendance_with_deduction(
  p_player_id UUID,
  p_group_id UUID,
  p_session_date DATE,
  p_session_time TIME,
  p_status TEXT,
  p_marked_by UUID,
  p_schedule_session_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_subscription_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_attendance_id UUID;
  v_remaining INTEGER;
  v_existing UUID;
  v_sub_id UUID;
  v_sub_total INTEGER;
  v_is_private BOOLEAN;
BEGIN
  SELECT session_type = 'private' INTO v_is_private
  FROM schedule_sessions WHERE id = p_schedule_session_id;
  v_is_private := COALESCE(v_is_private, false);

  SELECT id INTO v_existing
  FROM attendance
  WHERE player_id = p_player_id
    AND group_id IS NOT DISTINCT FROM p_group_id
    AND session_date = p_session_date
    AND schedule_session_id = p_schedule_session_id;

  IF v_existing IS NOT NULL THEN
    UPDATE attendance
    SET status = p_status::text, notes = p_notes, marked_by = p_marked_by
    WHERE id = v_existing
    RETURNING id INTO v_attendance_id;

    IF p_status = 'present' AND NOT v_is_private THEN
      SELECT sessions_remaining INTO v_remaining
      FROM subscriptions
      WHERE player_id = p_player_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1;

      RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', v_remaining, 'updated', true);
    END IF;

    RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', NULL, 'updated', true);
  END IF;

  INSERT INTO attendance (player_id, group_id, session_date, session_time, status, marked_by, schedule_session_id, notes)
  VALUES (p_player_id, p_group_id, p_session_date, p_session_time, p_status, p_marked_by, p_schedule_session_id, p_notes)
  RETURNING id INTO v_attendance_id;

  IF p_status = 'present' AND NOT v_is_private THEN
    IF p_subscription_id IS NOT NULL THEN
      v_sub_id := p_subscription_id;
      PERFORM 1 FROM subscriptions
      WHERE id = v_sub_id AND player_id = p_player_id AND status = 'active' AND sessions_remaining > 0;
      IF NOT FOUND THEN v_sub_id := NULL; END IF;
    ELSE
      SELECT id INTO v_sub_id
      FROM subscriptions
      WHERE player_id = p_player_id AND status = 'active' AND sessions_remaining > 0
      ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_sub_id IS NOT NULL THEN
      UPDATE subscriptions
      SET sessions_remaining = CASE WHEN sessions_total = 1 THEN 0 ELSE sessions_remaining - 1 END,
          status = CASE WHEN sessions_total = 1 THEN 'expired'::subscription_status ELSE status END,
          updated_at = NOW()
      WHERE id = v_sub_id
      RETURNING sessions_remaining, sessions_total INTO v_remaining, v_sub_total;
    ELSE
      v_remaining := 0;
    END IF;

    RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', COALESCE(v_remaining, 0), 'updated', false);
  END IF;

  RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', NULL, 'updated', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260613140000_attendance_skip_private_deduction.sql
git commit -m "feat(prepay): RPC skips subscription deduction for private sessions"
```

---

## Task 3: Create the pending payment on confirm

**Files:**
- Modify: `src/app/_actions/private-sessions.ts` (inside `confirmPrivateSessionRequest`, after the junction insert block)

- [ ] **Step 1: Add the charge + notification**

Find this block (added by the private-team feature):

```ts
  await admin.from("schedule_session_players").insert(junctionRows);
```

Immediately after it, add:

```ts
  // Pre-payment: create a pending charge for this private session, owed by the
  // requester (team training: requester pays full). Priced from the tagged
  // private package; if none is found, skip silently (never block confirmation).
  const playerCount = partnerPlayerId ? 2 : 1;
  const { data: pricePkg } = await admin
    .from("packages")
    .select("id, price")
    .eq("private_session_players", playerCount)
    .limit(1)
    .maybeSingle();
  if (pricePkg) {
    await admin.from("payments").insert({
      player_id: req.player_id,
      subscription_id: null,
      amount: pricePkg.price,
      method: "cash",
      status: "pending",
      schedule_session_id: created.id,
      note: `Private session — ${sessionDate}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await createNotification({
      user_id: req.player_id,
      title: "Payment required",
      body: `Please pay ${pricePkg.price} EGP for your private session on ${sessionDate} via Instapay.`,
      type: "payment",
      link: "/player/private-sessions",
    });
  }
```

(`partnerPlayerId`, `req`, `created`, `sessionDate`, `admin`, `createNotification` are all already in scope in this function.)

- [ ] **Step 2: Lint/type-check the file**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/private-sessions.ts
git commit -m "feat(prepay): create pending payment when confirming a private session"
```

---

## Task 4: Generalize the Instapay proof upload

**Files:**
- Modify: `src/app/(portal)/player/dashboard/actions.ts:31-40,63-64`

- [ ] **Step 1: Relax the subscription requirement + add revalidate**

Change the fetch + guard from:

```ts
  const { data: payment } = await admin
    .from("payments")
    .select("id, player_id, status, subscriptions(status)")
    .eq("id", paymentId)
    .single();

  if (!payment || payment.player_id !== user.id) return { error: "Payment not found" };
  if (payment.status !== "pending" || payment.subscriptions?.status !== "pending_payment") {
    return { error: "This payment can no longer be updated" };
  }
```

to:

```ts
  const { data: payment } = await admin
    .from("payments")
    .select("id, player_id, status, subscription_id, subscriptions(status)")
    .eq("id", paymentId)
    .single();

  if (!payment || payment.player_id !== user.id) return { error: "Payment not found" };
  // Subscription-linked payments must still be on a pending_payment sub; standalone
  // session payments (no subscription) just need to be pending.
  const subOk = !payment.subscription_id || payment.subscriptions?.status === "pending_payment";
  if (payment.status !== "pending" || !subOk) {
    return { error: "This payment can no longer be updated" };
  }
```

And add a revalidate for the private-sessions page next to the existing ones:

```ts
  revalidatePath("/player/dashboard");
  revalidatePath("/player/private-sessions");
  revalidatePath("/admin/payments");
  return { success: true };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/player/dashboard/actions.ts"
git commit -m "feat(prepay): accept Instapay proof for standalone session payments"
```

---

## Task 5: Session-aware confirm notification

**Files:**
- Modify: `src/app/(portal)/admin/payments/actions.ts` (the `confirmPayment` player notification)

- [ ] **Step 1: Make the notification correct for session payments**

In `confirmPayment`, change the player notification from:

```ts
    await createNotification({
      user_id: payment.player_id,
      title: "Payment Confirmed",
      body: "Your payment has been confirmed and your subscription is now active.",
      type: "payment",
      link: "/player/subscriptions",
    });
```

to:

```ts
    await createNotification({
      user_id: payment.player_id,
      title: "Payment Confirmed",
      body: payment.subscription_id
        ? "Your payment has been confirmed and your subscription is now active."
        : "Your private session payment has been confirmed.",
      type: "payment",
      link: payment.subscription_id ? "/player/subscriptions" : "/player/private-sessions",
    });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/admin/payments/actions.ts"
git commit -m "feat(prepay): session-aware payment-confirmed notification"
```

---

## Task 6: Player "Payment due" section

**Files:**
- Modify: `src/app/(portal)/player/private-sessions/page.tsx`

- [ ] **Step 1: Import the reusable card**

After the existing imports, add:

```ts
import { PendingPaymentCard } from "../dashboard/_components/pending-payment-card";
```

- [ ] **Step 2: Fetch the player's session-linked payments**

After the `requests` query, add:

```ts
  const { data: sessionPayments } = await supabase
    .from("payments")
    .select("id, schedule_session_id, amount, status, screenshot_url")
    .eq("player_id", currentUser.id)
    .not("schedule_session_id", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payBySession = new Map<string, any>();
  for (const p of (sessionPayments || [])) payBySession.set(p.schedule_session_id, p);

  // Confirmed sessions with a still-pending payment → show the pay surface.
  const due = items
    .filter((r) => r.status === "confirmed")
    .map((r) => ({ r, pay: payBySession.get((r as { schedule_session_id?: string }).schedule_session_id || "") }))
    .filter((x) => x.pay && x.pay.status === "pending");
```

- [ ] **Step 3: Render the section above the list**

Immediately after the page header `</div>` (the flex row with the title + "Request Session" button) and before the `{items.length === 0 ? (` block, add:

```tsx
      {due.length > 0 && (
        <div className="mb-6 space-y-3">
          {due.map(({ r, pay }) => (
            <Card key={pay.id} className="p-4 border-amber-200 bg-amber-50/40">
              <p className="text-xs font-medium text-slate-500 mb-2">
                Payment due — private session on {whenLabel(r)}
              </p>
              <PendingPaymentCard
                paymentId={pay.id}
                packageName={(r as { partner_player_id?: string | null }).partner_player_id ? "Private Team Training" : "Private Session"}
                amount={pay.amount}
                hasScreenshot={!!pay.screenshot_url}
              />
            </Card>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/player/private-sessions/page.tsx"
git commit -m "feat(prepay): player Payment-due section with Instapay upload"
```

---

## Task 7: `getSessionPaymentStatus` server action

**Files:**
- Modify: `src/app/_actions/private-sessions.ts` (append a new export)

- [ ] **Step 1: Add the action** (admin client so coaches can read payment status despite RLS)

```ts
// Coach/admin-only: the payment status of a private session (RLS hides payments
// from coaches, so this runs admin-side).
export async function getSessionPaymentStatus(scheduleSessionId: string): Promise<{
  hasPayment: boolean;
  paid: boolean;
  amount: number | null;
  status: string | null;
}> {
  const user = await getCurrentUser();
  if (!user || (user.profile.role !== "admin" && user.profile.role !== "coach")) {
    return { hasPayment: false, paid: false, amount: null, status: null };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("payments")
    .select("amount, status")
    .eq("schedule_session_id", scheduleSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { hasPayment: false, paid: false, amount: null, status: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return { hasPayment: true, paid: d.status === "confirmed", amount: d.amount, status: d.status };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/private-sessions.ts
git commit -m "feat(prepay): getSessionPaymentStatus action for attendance warning"
```

---

## Task 8: Attendance — unpaid warning + no double-charge

**Files:**
- Modify: `src/components/coach/AttendanceTab.tsx`

- [ ] **Step 1: Import the action**

Add to the imports from training actions / private-sessions:

```ts
import { getSessionPaymentStatus } from "@/app/_actions/private-sessions";
```

- [ ] **Step 2: Add payment-status state + fetch (private only)**

Add state near the other `useState`s:

```ts
  const [sessionPaid, setSessionPaid] = useState<{ paid: boolean; amount: number | null; status: string | null } | null>(null);
```

Add an effect after the existing load effect:

```ts
  useEffect(() => {
    if (!privatePlayers) { setSessionPaid(null); return; }
    let cancelled = false;
    getSessionPaymentStatus(scheduleSessionId).then((res) => {
      if (cancelled) return;
      setSessionPaid(res.hasPayment ? { paid: res.paid, amount: res.amount, status: res.status } : { paid: false, amount: null, status: null });
    });
    return () => { cancelled = true; };
  }, [privatePlayers, scheduleSessionId]);
```

- [ ] **Step 3: Render the warning banner**

Just inside the returned root (near the top, e.g. above the existing `hasExistingAttendance` banner), add:

```tsx
      {privatePlayers && sessionPaid && !sessionPaid.paid && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Payment not confirmed for this session{sessionPaid.amount != null ? ` (${sessionPaid.amount.toLocaleString()} EGP)` : ""}. You can still mark attendance.
          </div>
        </div>
      )}
```

(`AlertTriangle` is already imported in this file.)

- [ ] **Step 4: Suppress zero-balance pending-payment for private sessions**

In `handleOpenConfirm`, gate the zero-balance computation so it never runs for private sessions. Change:

```ts
    const zeroBalancePlayers = getZeroBalancePresentPlayers();
    const defaultPkg = packages.find((p) => p.session_count === 1) || packages[0];
    if (zeroBalancePlayers.length > 0 && defaultPkg) {
```

to:

```ts
    const zeroBalancePlayers = privatePlayers ? [] : getZeroBalancePresentPlayers();
    const defaultPkg = packages.find((p) => p.session_count === 1) || packages[0];
    if (zeroBalancePlayers.length > 0 && defaultPkg) {
```

(With `paymentDialog` left null for private sessions, `executeSubmit` creates no pending payments — the playerPackages map stays empty.)

- [ ] **Step 5: Lint + build (whole feature type-checks)**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: `tsc` exit 0; build compiles + type-checks (page-data collection may flake in this sandbox — type-check is the signal).

- [ ] **Step 6: Commit**

```bash
git add src/components/coach/AttendanceTab.tsx
git commit -m "feat(prepay): unpaid warning + no double-charge on private attendance"
```

---

## Task 9: Manual verification

Requires the migrations applied (Tasks 1–2) and the private packages tagged (the earlier price-fix migration).

- [ ] **Step 1:** Confirm a solo private request as admin → a pending **800 EGP** payment exists (admin Payments list + player Private Sessions "Payment due"). Team request → **1000 EGP**.
- [ ] **Step 2:** As the player, upload an Instapay screenshot on the Private Sessions page → method becomes `instapay`, status still pending, "Awaiting Confirmation" shows.
- [ ] **Step 3:** As admin, confirm the payment → status `confirmed`; player gets "Your private session payment has been confirmed."
- [ ] **Step 4:** Open the session's attendance (`/coach/sessions/[id]` or `/admin/sessions/[id]`) while **unpaid** → amber "Payment not confirmed" banner; marking present is allowed; **no second pending payment** is created and **no subscription is deducted** (check the player's `sessions_remaining` is unchanged).
- [ ] **Step 5:** Confirm the payment, reload attendance → no warning.
- [ ] **Step 6:** Mark attendance for a **group** session with a zero-balance player → the existing pending-payment prompt still works (unchanged).

---

## Self-review notes

- **Spec coverage:** charge on confirm (Task 3), `schedule_session_id` link (Task 1), Instapay pay (Tasks 4 + 6), admin confirm wording (Task 5), attendance warning (Tasks 7 + 8 steps 1-3), no double-charge / no deduction (Task 2 + Task 8 step 4). All covered.
- **Placeholder scan:** every code step is complete; no TBD/TODO.
- **Type consistency:** `getSessionPaymentStatus` returns `{ hasPayment, paid, amount, status }` and is consumed exactly so in Task 8; `payments.schedule_session_id` used consistently in Tasks 1/3/6/7; `submitPendingPaymentScreenshot` keeps its `(formData)` signature (form carries `payment_id`), so `PendingPaymentCard` is reused unchanged.
- **DB apply is the user's step** (writes are blocked for the agent): Tasks 1, 2 add migrations but must be applied by the user via `npm run db:migrate`.
- **Out of scope (unchanged):** hard block, admin-direct private sessions, split payments, group payment behavior.
