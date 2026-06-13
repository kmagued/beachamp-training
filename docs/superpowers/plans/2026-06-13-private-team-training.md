# Private Team Training (2 Players) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player requesting a private session choose a 1-player ("Private Session", 800 EGP) or 2-player ("Private Team Training", 1000 EGP) session, search/select a partner for the 2-player option, and see package-driven prices on the request page.

**Architecture:** Add one nullable column to each of two existing tables — `packages.private_session_players` (1/2, NULL=subscription) and `private_session_requests.partner_player_id`. A server action searches players (admin client, RLS-safe). The request form gains a session-type selector + partner picker; the confirm action adds the partner to the session junction and notifies them. Pricing is display-only.

**Tech Stack:** Next.js 15 (server actions), React 19, Supabase (Postgres + RLS), Tailwind, lucide-react. No test framework — verify via `npm run lint`, `npm run build`, and manual browser testing.

---

## Spec reference

`docs/superpowers/specs/2026-06-13-private-team-training-design.md`

## File structure

- **Create** `supabase/migrations/20260613100000_private_team_training.sql` — both columns + seed packages.
- **Modify** `src/app/(portal)/player/packages/page.tsx` — hide private packages from Buy Packages.
- **Modify** `src/app/_actions/private-sessions.ts` — `searchPlayersForPartner`; partner in `createPrivateSessionRequest` + `confirmPrivateSessionRequest`.
- **Modify** `src/app/(portal)/player/private-sessions/request/page.tsx` — fetch private package prices.
- **Modify** `src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx` — session-type selector, partner picker, price display.
- **Modify** `src/app/(portal)/admin/private-sessions/page.tsx` — show partner on request rows.

## Conventions (verified)

- `getCurrentUser()` returns `{ id, profile: { first_name, last_name, role, ... } }`.
- `createAdminClient()` is typed to `<Database>`; new columns require `as any` on the insert object / read.
- `package.price` is a number (rendered via `.toLocaleString("en-US")`).
- Server pages cast `const supabase = (await createClient()) as any`.

---

## Task 1: Migration — columns + seed packages

**Files:**
- Create: `supabase/migrations/20260613100000_private_team_training.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260613100000_private_team_training.sql`:

```sql
-- ═══════════════════════════════════════════
-- Private Team Training (2 players)
-- ═══════════════════════════════════════════

-- Packages: flag private-session price packages and encode player count.
-- NULL = normal subscription package; 1 = individual private; 2 = team private.
ALTER TABLE packages
  ADD COLUMN private_session_players INTEGER
  CHECK (private_session_players IS NULL OR private_session_players IN (1, 2));

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

- [ ] **Step 2: Apply the migration**

Run: `npm run db:migrate`
Expected: applies with no errors.

- [ ] **Step 3: Verify**

Run (SQL):
```sql
SELECT name, price, private_session_players FROM packages WHERE private_session_players IS NOT NULL;
SELECT column_name FROM information_schema.columns
WHERE table_name='private_session_requests' AND column_name='partner_player_id';
```
Expected: two private package rows (800/1, 1000/2); `partner_player_id` exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613100000_private_team_training.sql
git commit -m "feat(private-team): add packages.private_session_players + requests.partner_player_id"
```

---

## Task 2: Hide private packages from the player Buy Packages page

**Files:**
- Modify: `src/app/(portal)/player/packages/page.tsx:16-20`

- [ ] **Step 1: Filter out private packages**

Change the query from:

```ts
  const { data: packages } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
```

to:

```ts
  const { data: packages } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .is("private_session_players", null)
    .order("sort_order", { ascending: true });
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/player/packages/page.tsx"
git commit -m "feat(private-team): hide private packages from Buy Packages page"
```

---

## Task 3: `searchPlayersForPartner` server action

**Files:**
- Modify: `src/app/_actions/private-sessions.ts` (append near the other request actions)

- [ ] **Step 1: Add the action**

Append to `src/app/_actions/private-sessions.ts`:

```ts
// Search registered players to pick a 2nd player for team training.
// Runs admin-side because RLS hides other players from a player's session.
export async function searchPlayersForPartner(query: string): Promise<{ id: string; name: string }[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Strip PostgREST-special chars so the .or() filter can't be manipulated.
  const safe = (query || "").replace(/[%,()]/g, " ").trim();
  if (safe.length < 2) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("role", "player")
    .eq("is_active", true)
    .neq("id", user.id)
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
    .order("first_name")
    .limit(20);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((p) => ({
    id: p.id as string,
    name: `${p.first_name} ${p.last_name}`,
  }));
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/private-sessions.ts
git commit -m "feat(private-team): add searchPlayersForPartner action"
```

---

## Task 4: Partner support in `createPrivateSessionRequest`

**Files:**
- Modify: `src/app/_actions/private-sessions.ts:276-343`

- [ ] **Step 1: Extend the input type**

Add `partner_player_id?: string;` to the `createPrivateSessionRequest` data param:

```ts
export async function createPrivateSessionRequest(data: {
  coach_id?: string;
  requested_day_of_week: number;
  requested_date?: string;
  requested_time: string;
  duration_minutes?: number;
  notes?: string;
  partner_player_id?: string;
}) {
```

- [ ] **Step 2: Validate the partner (insert before the existing insert block)**

Immediately before the `const { error } = await admin.from("private_session_requests").insert({...})` call, add:

```ts
  let partnerPlayerId: string | null = null;
  if (data.partner_player_id) {
    if (data.partner_player_id === user.id) {
      return { error: "You cannot select yourself as the second player." };
    }
    const { data: partner } = await admin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", data.partner_player_id)
      .single();
    if (!partner || partner.role !== "player" || !partner.is_active) {
      return { error: "Selected second player is not available." };
    }
    partnerPlayerId = partner.id;
  }
```

- [ ] **Step 3: Persist the partner**

Change the insert object to include the partner (cast `as any` — new column):

```ts
  const { error } = await admin.from("private_session_requests").insert({
    player_id: user.id,
    coach_id: data.coach_id || null,
    requested_day_of_week: data.requested_day_of_week,
    requested_date: data.requested_date || null,
    requested_time: data.requested_time,
    duration_minutes: data.duration_minutes || 60,
    notes: data.notes || null,
    partner_player_id: partnerPlayerId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
```

- [ ] **Step 4: Note team training in the admin notification**

Change the `notifyAdmins` body line from:

```ts
    body: `${playerName} requested a private session on ${whenLabel}`,
```

to:

```ts
    body: `${playerName} requested a private session${partnerPlayerId ? " (team training, 2 players)" : ""} on ${whenLabel}`,
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/_actions/private-sessions.ts
git commit -m "feat(private-team): accept partner_player_id when creating a request"
```

---

## Task 5: Partner support in `confirmPrivateSessionRequest`

**Files:**
- Modify: `src/app/_actions/private-sessions.ts:381-494`

- [ ] **Step 1: Select the partner column**

Change the request `select` from:

```ts
    .select("id, status, player_id, coach_id, requested_day_of_week, requested_time, duration_minutes, location")
```

to:

```ts
    .select("id, status, player_id, partner_player_id, coach_id, requested_day_of_week, requested_time, duration_minutes, location")
```

- [ ] **Step 2: Add both players to the session junction**

Replace the existing single-player junction insert:

```ts
  // Player-requested sessions are always single-player
  await admin.from("schedule_session_players").insert({
    schedule_session_id: created.id,
    player_id: req.player_id,
  });
```

with:

```ts
  // Requester is always added; team-training requests also add the partner.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerPlayerId = (req as any).partner_player_id as string | null;
  const junctionRows = [{ schedule_session_id: created.id, player_id: req.player_id }];
  if (partnerPlayerId) {
    junctionRows.push({ schedule_session_id: created.id, player_id: partnerPlayerId });
  }
  await admin.from("schedule_session_players").insert(junctionRows);
```

- [ ] **Step 3: Notify the partner**

Immediately after the existing requester `createNotification({ ... title: "Private Session Confirmed" ... })` call (and before `revalidatePath`), add:

```ts
  if (partnerPlayerId) {
    await createNotification({
      user_id: partnerPlayerId,
      title: "Added to a Private Session",
      body: `You've been added to a private team training on ${dayName} ${sessionDate} at ${startTime}.`,
      type: "private_session",
      link: "/player/private-sessions",
    });
  }
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/_actions/private-sessions.ts
git commit -m "feat(private-team): add partner to session + notify on confirm"
```

---

## Task 6: Request page fetches private package prices

**Files:**
- Modify: `src/app/(portal)/player/private-sessions/request/page.tsx`

- [ ] **Step 1: Fetch private packages and pass prices**

Replace the body after the coaches query with:

```ts
  const { data: privatePackages } = await supabase
    .from("packages")
    .select("price, private_session_players")
    .in("private_session_players", [1, 2]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkgs = (privatePackages || []) as any[];
  const individualPrice = pkgs.find((p) => p.private_session_players === 1)?.price ?? null;
  const teamPrice = pkgs.find((p) => p.private_session_players === 2)?.price ?? null;

  return (
    <RequestFormPage
      coaches={coaches || []}
      individualPrice={individualPrice}
      teamPrice={teamPrice}
    />
  );
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (RequestFormPage prop types updated in Task 7 — run lint after Task 7 if it flags missing props now).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(portal)/player/private-sessions/request/page.tsx"
git commit -m "feat(private-team): pass private package prices to the request form"
```

---

## Task 7: Request form — session type selector + partner picker + price

**Files:**
- Modify: `src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx`

- [ ] **Step 1: Update imports**

Change the lucide-react import (line 6) to add icons, and the actions import (line 9) to add the search action:

```tsx
import { ArrowLeft, Loader2, ChevronLeft, ChevronRight, Sunrise, Sun, Moon, User, Users, Search, X } from "lucide-react";
```

```tsx
import { createPrivateSessionRequest, getPrivateSessionAvailability, searchPlayersForPartner } from "@/app/_actions/private-sessions";
```

Also add `useRef` to the React import (line 3):

```tsx
import { useState, useEffect, useMemo, useTransition, useRef } from "react";
```

- [ ] **Step 2: Update the component signature/props**

Change `export function RequestFormPage({ coaches }: { coaches: Coach[] }) {` to:

```tsx
export function RequestFormPage({
  coaches,
  individualPrice,
  teamPrice,
}: {
  coaches: Coach[];
  individualPrice: number | null;
  teamPrice: number | null;
}) {
```

- [ ] **Step 3: Add state (after the existing `notes` state, ~line 113)**

```tsx
  const [sessionType, setSessionType] = useState<"individual" | "team">("individual");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerResults, setPartnerResults] = useState<{ id: string; name: string }[]>([]);
  const [partnerSearching, setPartnerSearching] = useState(false);
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false);
  const partnerPickerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 4: Add partner-search + outside-click effects (after the availability `useEffect`, ~line 157)**

```tsx
  // Debounced partner search (team training only).
  useEffect(() => {
    if (sessionType !== "team") return;
    const q = partnerQuery.trim();
    if (q.length < 2) {
      setPartnerResults([]);
      setPartnerSearching(false);
      return;
    }
    let cancelled = false;
    setPartnerSearching(true);
    const t = setTimeout(async () => {
      const res = await searchPlayersForPartner(q);
      if (cancelled) return;
      setPartnerResults(res);
      setPartnerSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [partnerQuery, sessionType]);

  // Close the partner dropdown on outside click.
  useEffect(() => {
    if (!partnerDropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (!partnerPickerRef.current) return;
      if (!partnerPickerRef.current.contains(e.target as Node)) {
        setPartnerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [partnerDropdownOpen]);
```

- [ ] **Step 5: Add partner helpers + selected price (before `handleSubmit`, ~line 164)**

```tsx
  function selectPartner(p: { id: string; name: string }) {
    setPartnerId(p.id);
    setPartnerName(p.name);
    setPartnerQuery("");
    setPartnerResults([]);
    setPartnerDropdownOpen(false);
  }

  function clearPartner() {
    setPartnerId(null);
    setPartnerName(null);
    setPartnerQuery("");
    setPartnerResults([]);
  }

  const selectedPrice = sessionType === "team" ? teamPrice : individualPrice;
```

- [ ] **Step 6: Enforce partner + send it in `handleSubmit`**

In `handleSubmit`, after the `if (!selectedTime) { ... }` guard, add:

```tsx
    if (sessionType === "team" && !partnerId) {
      setError("Please select a second player for team training");
      return;
    }
```

And add `partner_player_id` to the `data` object:

```tsx
    const data = {
      coach_id: selectedCoachId || undefined,
      requested_date: formatDateISO(selectedDate),
      requested_day_of_week: selectedDate.getDay(),
      requested_time: selectedTime,
      duration_minutes: BOOKING_MINUTES,
      notes: notes.trim() || undefined,
      partner_player_id: sessionType === "team" && partnerId ? partnerId : undefined,
    };
```

- [ ] **Step 7: Add the Session Type card (insert as the first card, before `{/* Step 1: Coach */}`, ~line 221)**

```tsx
        {/* Step 1: Session Type */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">1. Session Type</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setSessionType("individual"); clearPartner(); }}
              className={cn(
                "text-left rounded-lg border p-3 transition-all",
                sessionType === "individual"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Private Session</span>
                <User className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">1 player</p>
              <p className="text-sm font-bold text-primary mt-2">
                {individualPrice != null ? `${individualPrice.toLocaleString("en-US")} EGP` : "—"}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSessionType("team")}
              className={cn(
                "text-left rounded-lg border p-3 transition-all",
                sessionType === "team"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Private Team Training</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">2 players</p>
              <p className="text-sm font-bold text-primary mt-2">
                {teamPrice != null ? `${teamPrice.toLocaleString("en-US")} EGP` : "—"}
              </p>
            </button>
          </div>

          {sessionType === "team" && (
            <div className="mt-4" ref={partnerPickerRef}>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Second player</label>
              {partnerId ? (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full pl-3 pr-1.5 py-1">
                  {partnerName}
                  <button type="button" onClick={clearPartner} className="hover:bg-primary/20 rounded-full p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={partnerQuery}
                    onChange={(e) => { setPartnerQuery(e.target.value); setPartnerDropdownOpen(true); }}
                    onFocus={() => setPartnerDropdownOpen(true)}
                    placeholder="Search players by name..."
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400"
                  />
                  {partnerDropdownOpen && partnerQuery.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {partnerSearching ? (
                        <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>
                      ) : partnerResults.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-400">No players found</p>
                      ) : (
                        partnerResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectPartner(p)}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            {p.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
```

- [ ] **Step 8: Renumber the following cards**

Change the four existing headings:
- `1. Choose a Coach` → `2. Choose a Coach`
- `2. Pick a Date` → `3. Pick a Date`
- `3. Pick a Time` → `4. Pick a Time`
- `4. Confirm Details` → `5. Confirm Details`

- [ ] **Step 9: Show the price in the Confirm card**

In the Confirm card, replace the `{selectedTime && ( ... )}` summary block with one that includes the type + price:

```tsx
          {selectedTime && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm font-medium text-emerald-800">
                {DAY_LABELS_FULL[selectedDate.getDay()]},{" "}
                {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} at{" "}
                {formatLabel(selectedTime)}
              </p>
              <p className="text-xs font-medium text-emerald-700 mt-1">
                {sessionType === "team" ? "Private Team Training (2 players)" : "Private Session"}
                {selectedPrice != null ? ` · ${selectedPrice.toLocaleString("en-US")} EGP` : ""}
              </p>
            </div>
          )}
```

- [ ] **Step 10: Disable submit until a partner is chosen for team type**

Change the submit `Button` disabled prop from `disabled={isPending || !selectedTime}` to:

```tsx
        <Button onClick={handleSubmit} fullWidth disabled={isPending || !selectedTime || (sessionType === "team" && !partnerId)}>
```

- [ ] **Step 11: Lint + build**

Run: `npm run lint && npm run build`
Expected: lint passes; build type-checks with no errors.

- [ ] **Step 12: Commit**

```bash
git add "src/app/(portal)/player/private-sessions/request/_components/request-form-page.tsx"
git commit -m "feat(private-team): session type selector, partner picker, price on request form"
```

---

## Task 8: Show the partner on the admin request list

**Files:**
- Modify: `src/app/(portal)/admin/private-sessions/page.tsx:42-86,332-337,365+`

- [ ] **Step 1: Embed the partner in the requests query**

Change the requests `select` (lines 43-47) from:

```ts
      .select(`
        *,
        player:profiles!private_session_requests_player_id_fkey(first_name, last_name, phone),
        coach:profiles!private_session_requests_coach_id_fkey(first_name, last_name)
      `)
```

to:

```ts
      .select(`
        *,
        player:profiles!private_session_requests_player_id_fkey(first_name, last_name, phone),
        partner:profiles!private_session_requests_partner_player_id_fkey(first_name, last_name),
        coach:profiles!private_session_requests_coach_id_fkey(first_name, last_name)
      `)
```

- [ ] **Step 2: Add `partner` to the `items` type**

In the `const items = (requests || []) as {...}[]` type (lines 73-86), add after the `player` line:

```ts
    partner: { first_name: string; last_name: string } | null;
```

- [ ] **Step 3: Render the partner in the desktop row**

In the player name `<td>` (lines 332-337), after the player phone `<span>`, add:

```tsx
                        {r.partner && (
                          <span className="block text-[10px] text-primary font-medium">
                            + {r.partner.first_name} {r.partner.last_name} (team)
                          </span>
                        )}
```

- [ ] **Step 4: Render the partner in the mobile card**

In the mobile card (starting ~line 365), under the player name `<p className="text-sm font-semibold text-slate-900">`, add immediately after that `<p>`:

```tsx
                    {r.partner && (
                      <p className="text-[11px] text-primary font-medium">
                        + {r.partner.first_name} {r.partner.last_name} (team)
                      </p>
                    )}
```

(If the exact mobile markup differs, place the same snippet right after the player's name element.)

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: lint passes; build type-checks.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/admin/private-sessions/page.tsx"
git commit -m "feat(private-team): show team partner on admin request list"
```

---

## Task 9: Manual verification

No automated harness exists — verify in the running app.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: app starts.

- [ ] **Step 2: Buy Packages page**

As a player, open `/player/packages`. Expected: "Private Session" and "Private Team Training (2 Players only)" do NOT appear. As an admin, open `/admin/packages` — both DO appear (editable).

- [ ] **Step 3: Request page prices**

As a player, open `/player/private-sessions/request`. Expected: a "Session Type" step with two cards showing 800 EGP and 1,000 EGP.

- [ ] **Step 4: Solo request (regression)**

Leave "Private Session" selected, pick a date/time, submit. Expected: request created as before; admin list shows no partner line.

- [ ] **Step 5: Team request**

Select "Private Team Training", search for another player by name (confirm you don't appear in your own results), select them (chip shows), pick date/time, submit. Expected: success. Try submitting Team with no partner — expected: inline error and disabled submit.

- [ ] **Step 6: Admin confirm**

As admin, open `/admin/private-sessions`. Expected: the team request shows "+ \<partner\> (team)". Confirm it. Expected: the scheduled private session lists both players; the partner receives an "Added to a Private Session" notification.

- [ ] **Step 7: Price editability**

As admin, change "Private Team Training" price in `/admin/packages`. Reload the request page. Expected: the team card shows the new price.

---

## Self-review notes

- **Spec coverage:** packages column + seed (Task 1), hide from buy page (Task 2), RLS-safe partner search (Task 3), partner on request create + validation + admin notice (Task 4), partner added to junction + partner notification on confirm (Task 5), price props (Task 6), type selector + picker + price display + submit validation (Task 7), admin visibility (Task 8). All spec sections covered.
- **Placeholder scan:** every code step contains complete code; no TBD/TODO.
- **Type consistency:** input field `partner_player_id` (snake_case) flows page → action consistently; component props `individualPrice`/`teamPrice` match between Task 6 (page) and Task 7 (form); `private_session_players` used identically in migration, buy-page filter, and request-page lookup; `searchPlayersForPartner` returns `{ id, name }[]` and is consumed as such.
- **Out of scope (unchanged):** acceptance flow, partner availability check, payment creation, 3+ players, admin-picker filtering.
