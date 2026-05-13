# WhatsApp Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin creates reusable WhatsApp message templates with variable substitution; when sending WhatsApp to a player, admin picks a template, previews the substituted text, optionally edits, then opens `wa.me` with the body pre-filled.

**Architecture:** New `whatsapp_templates` table (admin-only RLS) + pure-TS variable registry, resolver, renderer, and URL builder under `src/lib/whatsapp/`. Server actions for template CRUD/reorder. A reusable `WhatsappSendDrawer` mounts on the two player-facing WhatsApp entry points (player detail drawer + players table); coach/admin tables keep raw `wa.me` links but adopt the shared URL builder.

**Tech Stack:** Next.js 15 (app router), TypeScript, Supabase (postgres + admin client). Reuses existing `Drawer`, `Button`, `Input`, `Textarea`, `Toast` UI primitives. No new dependencies.

**Spec:** See [docs/superpowers/specs/2026-05-13-whatsapp-templates-design.md](../specs/2026-05-13-whatsapp-templates-design.md).

**Spec deviation:** The spec sketches drag-handle reorder; this plan uses up/down arrow buttons instead. Achieves the same outcome with far less code and no new dependency (no `react-dnd`-class library exists in the project). For ~20 templates the UX is equivalent.

**No test suite:** Project has no automated test runner. Each task ends with a **manual verification** step.

---

## File Structure

### New files
- `supabase/migrations/20260514000000_whatsapp_templates.sql` — schema migration.
- `src/lib/whatsapp/variables.ts` — fixed registry of substitution variables.
- `src/lib/whatsapp/render.ts` — `renderTemplate(body, vars)` pure function.
- `src/lib/whatsapp/url.ts` — `buildWhatsAppUrl(phone, text?)` pure function.
- `src/lib/whatsapp/resolver.ts` — `resolvePlayerVariables(playerId)` (DB-backed).
- `src/app/_actions/whatsapp-templates.ts` — `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `reorderTemplates`.
- `src/app/(portal)/admin/whatsapp-templates/page.tsx` — templates list + drawer host.
- `src/app/(portal)/admin/whatsapp-templates/_components/template-drawer.tsx` — new/edit drawer with variable side panel.
- `src/components/whatsapp/WhatsappSendDrawer.tsx` — the player-side picker.

### Modified files
- `src/types/database.ts` — add `whatsapp_templates` table type + `WhatsappTemplate` convenience export.
- `src/components/layout/sidebar-layout.tsx` — add "Messaging → WhatsApp Templates" nav item.
- `src/app/(portal)/admin/players/_components/player-drawer.tsx` (~line 501) — swap raw `<a>` for a button that opens `WhatsappSendDrawer`.
- `src/app/(portal)/admin/players/_components/table.tsx` (~line 113) — same swap.
- `src/app/(portal)/admin/coaches/_components/table.tsx` (~line 85) — switch to `buildWhatsAppUrl` for consistency (no UX change).
- `src/app/(portal)/admin/users/_components/table.tsx` (~line 147) — same.

### Test files
None — manual verification only.

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/20260514000000_whatsapp_templates.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ═══════════════════════════════════════════════════════════════
-- WhatsApp Templates (2026-05-13)
--   Library of reusable message templates with variable substitution.
--   Admin-only CRUD.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE whatsapp_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_templates_active_sort
  ON whatsapp_templates(is_active, sort_order);

CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage templates"
  ON whatsapp_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_templates TO authenticated;
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:migrate`
Expected: applies without errors.

- [ ] **Step 3: SQL spot-check**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_templates';
-- Expected: 8 rows
SELECT * FROM whatsapp_templates;
-- Expected: empty, no error
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514000000_whatsapp_templates.sql
git commit -m "feat(db): whatsapp_templates table"
```

---

## Task 2: Database types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the table type**

In `src/types/database.ts`, in the `Tables` object alongside `coach_blocks`, add:

```ts
whatsapp_templates: {
  Row: {
    id: string;
    name: string;
    body: string;
    is_active: boolean;
    sort_order: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    name: string;
    body: string;
    is_active?: boolean;
    sort_order?: number;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    name?: string;
    body?: string;
    is_active?: boolean;
    sort_order?: number;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};
```

And add a convenience export at the bottom (near `CoachBlock`):

```ts
export type WhatsappTemplate = Database["public"]["Tables"]["whatsapp_templates"]["Row"];
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add whatsapp_templates table"
```

---

## Task 3: Variable registry

**Files:**
- Create: `src/lib/whatsapp/variables.ts`

- [ ] **Step 1: Write the registry**

Create `src/lib/whatsapp/variables.ts`:

```ts
export type WhatsappVariable = {
  key: string;
  label: string;
  description: string;
  example: string;
};

export const VARIABLES: WhatsappVariable[] = [
  // Profile
  { key: 'first_name',    label: 'First name',    description: "Player's first name",      example: 'Ahmed' },
  { key: 'last_name',     label: 'Last name',     description: "Player's last name",       example: 'Hassan' },
  { key: 'full_name',     label: 'Full name',     description: 'First + last',             example: 'Ahmed Hassan' },
  { key: 'phone',         label: 'Phone',         description: "Player's phone",           example: '01XXXXXXXXX' },
  { key: 'email',         label: 'Email',         description: "Player's email",           example: 'ahmed@example.com' },
  { key: 'area',          label: 'Area',          description: 'Area of residence',        example: 'Maadi' },
  { key: 'playing_level', label: 'Playing level', description: 'beginner / intermediate / advanced / professional', example: 'intermediate' },
  { key: 'gender',        label: 'Gender',        description: 'male / female',            example: 'male' },
  { key: 'occupation',    label: 'Occupation',    description: 'Player occupation',        example: 'Engineer' },

  // Subscription
  { key: 'sessions_remaining',    label: 'Sessions remaining',    description: 'Sessions left in current subscription', example: '4' },
  { key: 'sessions_total',        label: 'Sessions total',        description: 'Total sessions in current subscription', example: '12' },
  { key: 'package_name',          label: 'Package name',          description: 'Name of current package',                example: 'Standard Monthly' },
  { key: 'subscription_end_date', label: 'Subscription end date', description: 'Current subscription end date (YYYY-MM-DD)', example: '2026-06-30' },

  // Next session
  { key: 'next_session_date', label: 'Next session date', description: 'Date of next scheduled session', example: '2026-05-15' },
  { key: 'next_session_time', label: 'Next session time', description: 'Time of next scheduled session', example: '18:00' },
];

/** Quick lookup */
export const VARIABLE_KEYS: Set<string> = new Set(VARIABLES.map((v) => v.key));
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/variables.ts
git commit -m "feat(whatsapp): variable registry"
```

---

## Task 4: Template renderer

**Files:**
- Create: `src/lib/whatsapp/render.ts`

- [ ] **Step 1: Write the renderer**

Create `src/lib/whatsapp/render.ts`:

```ts
/**
 * Substitute {{key}} tokens in `body` using `vars`.
 * - If the key resolves to a non-empty string: substitute.
 * - Otherwise (unknown key, null, empty): leave the literal {{key}} in place
 *   so the admin sees what didn't resolve in the preview and can edit it.
 *
 * Tokens match /\{\{([a-z_][a-z0-9_]*)\}\}/ — no whitespace inside the braces.
 */
export function renderTemplate(body: string, vars: Map<string, string | null>): string {
  return body.replace(/\{\{([a-z_][a-z0-9_]*)\}\}/g, (full, key) => {
    const v = vars.get(key);
    if (v && v.trim().length > 0) return v;
    return full;
  });
}
```

- [ ] **Step 2: Sanity check**

This is a pure function. Add no test file (project has no test infra), but spot-verify in your head:

| body | vars | output |
|---|---|---|
| `Hi {{first_name}}` | `{first_name: 'Ahmed'}` | `Hi Ahmed` |
| `Hi {{first_name}}, {{area}} good?` | `{first_name: 'Ahmed', area: null}` | `Hi Ahmed, {{area}} good?` |
| `Hi {{unknown}}` | `{}` | `Hi {{unknown}}` |
| `{{first_name}} & {{first_name}}` | `{first_name: 'Ali'}` | `Ali & Ali` |
| `Hi { {first_name} }` | `{first_name: 'Ali'}` | `Hi { {first_name} }` (no match — spaces inside braces) |

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/whatsapp/render.ts
git commit -m "feat(whatsapp): renderTemplate pure substitution"
```

---

## Task 5: URL builder

**Files:**
- Create: `src/lib/whatsapp/url.ts`

- [ ] **Step 1: Write the builder**

Create `src/lib/whatsapp/url.ts`:

```ts
/**
 * Build a wa.me deep link.
 * - Strips all non-digits from the phone (preserves a leading + if present).
 *   Egyptian numbers starting with 0 are converted to 20 country code.
 * - If `text` is provided and non-empty, appends `?text=<encoded>`.
 */
export function buildWhatsAppUrl(phone: string, text?: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, "");
  // Egyptian local "0…" → "20…"
  if (cleaned.startsWith("0")) cleaned = "20" + cleaned.slice(1);
  // wa.me does not want a leading +
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);

  const base = `https://wa.me/${cleaned}`;
  if (text && text.trim().length > 0) {
    return `${base}?text=${encodeURIComponent(text)}`;
  }
  return base;
}
```

- [ ] **Step 2: Spot-check**

| input | output |
|---|---|
| `('01234567890')` | `https://wa.me/201234567890` |
| `('+201234567890')` | `https://wa.me/201234567890` |
| `('01234567890', 'Hi Ali')` | `https://wa.me/201234567890?text=Hi%20Ali` |
| `('+20 12 3456 7890')` | `https://wa.me/201234567890` |

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/lib/whatsapp/url.ts
git commit -m "feat(whatsapp): buildWhatsAppUrl helper"
```

---

## Task 6: Variable resolver

**Files:**
- Create: `src/lib/whatsapp/resolver.ts`

- [ ] **Step 1: Write the resolver**

Create `src/lib/whatsapp/resolver.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Resolve all known variable keys for a player.
 * Returns a Map: keys present even when value is null/empty (consumers
 * inspect for non-empty to decide substitution).
 */
export async function resolvePlayerVariables(playerId: string): Promise<Map<string, string | null>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: profile }, { data: subs }, { data: nextGroupSession }, { data: nextPrivate }] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name, last_name, phone, email, area, playing_level, gender, occupation")
      .eq("id", playerId)
      .maybeSingle(),

    // Latest effectively-active subscription (status active/pending, sessions remaining, not expired)
    admin
      .from("subscriptions")
      .select("sessions_remaining, sessions_total, end_date, packages(name)")
      .eq("player_id", playerId)
      .in("status", ["active", "pending"])
      .gt("sessions_remaining", 0)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(1),

    // Next group session this player belongs to in the next 14 days
    admin
      .from("group_players")
      .select("group_id, schedule_sessions:groups!inner(schedule_sessions(day_of_week, start_time, end_time, end_date, is_active))")
      .eq("player_id", playerId)
      .eq("is_active", true),

    // Next private session for this player on/after today
    admin
      .from("schedule_sessions")
      .select("end_date, start_time, day_of_week")
      .eq("session_type", "private")
      .eq("player_id", playerId)
      .eq("is_active", true)
      .gte("end_date", today)
      .order("end_date", { ascending: true })
      .limit(1),
  ]);

  const vars = new Map<string, string | null>();

  // Profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profile as any | null;
  vars.set("first_name", p?.first_name ?? null);
  vars.set("last_name",  p?.last_name ?? null);
  vars.set("full_name",  p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : (p?.first_name ?? p?.last_name ?? null));
  vars.set("phone",      p?.phone ?? null);
  vars.set("email",      p?.email ?? null);
  vars.set("area",       p?.area ?? null);
  vars.set("playing_level", p?.playing_level ?? null);
  vars.set("gender",     p?.gender ?? null);
  vars.set("occupation", p?.occupation ?? null);

  // Subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (subs as any[] | null)?.[0];
  vars.set("sessions_remaining", sub ? String(sub.sessions_remaining) : null);
  vars.set("sessions_total",     sub ? String(sub.sessions_total) : null);
  vars.set("package_name",       sub?.packages?.name ?? null);
  vars.set("subscription_end_date", sub?.end_date ?? null);

  // Next session — compute the earliest occurrence from either source
  let bestDate: string | null = null;
  let bestTime: string | null = null;

  // Private session: the end_date is the actual date of the single occurrence
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = (nextPrivate as any[] | null)?.[0];
  if (priv?.end_date && priv?.start_time) {
    bestDate = priv.end_date;
    bestTime = (priv.start_time as string).slice(0, 5);
  }

  // Group sessions: materialize the next occurrence for each session in the next 14 days
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpRows = (nextGroupSession as any[] | null) || [];
  for (const row of gpRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions: any[] = row?.schedule_sessions?.schedule_sessions ?? [];
    for (const s of sessions) {
      if (!s?.is_active) continue;
      // Compute the next date matching day_of_week, within 14 days
      const now = new Date();
      for (let i = 0; i < 14; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        if (d.getDay() !== s.day_of_week) continue;
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (s.end_date && ymd > s.end_date) break;
        if (bestDate === null || ymd < bestDate || (ymd === bestDate && (s.start_time as string).slice(0, 5) < (bestTime ?? "99:99"))) {
          bestDate = ymd;
          bestTime = (s.start_time as string).slice(0, 5);
        }
        break;
      }
    }
  }

  vars.set("next_session_date", bestDate);
  vars.set("next_session_time", bestTime);

  return vars;
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean. The supabase admin client is cast to `any` so no schema-level type errors should appear.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp/resolver.ts
git commit -m "feat(whatsapp): resolvePlayerVariables (profile + subscription + next session)"
```

---

## Task 7: Server actions

**Files:**
- Create: `src/app/_actions/whatsapp-templates.ts`

- [ ] **Step 1: Write the actions module**

Create `src/app/_actions/whatsapp-templates.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import type { WhatsappTemplate } from "@/types/database";

type Result<T> = (T & { success: true }) | { error: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (user.profile.role !== "admin") return { error: "Not authorized" as const };
  return { user };
}

export async function listTemplates(opts?: { activeOnly?: boolean }): Promise<WhatsappTemplate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  let query = admin.from("whatsapp_templates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (opts?.activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data || []) as WhatsappTemplate[];
}

export async function createTemplate(input: { name: string; body: string; is_active: boolean }): Promise<Result<{ id: string }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  if (!input.name?.trim()) return { error: "Name is required" };
  if (!input.body?.trim()) return { error: "Body is required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Pick a sort_order at the end of the list
  const { data: maxRow } = await admin
    .from("whatsapp_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await admin
    .from("whatsapp_templates")
    .insert({
      name: input.name.trim(),
      body: input.body,
      is_active: input.is_active,
      sort_order: nextOrder,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true, id: data.id };
}

export async function updateTemplate(
  id: string,
  input: { name?: string; body?: string; is_active?: boolean }
): Promise<Result<{}>> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  if (input.name !== undefined && !input.name.trim()) return { error: "Name cannot be empty" };
  if (input.body !== undefined && !input.body.trim()) return { error: "Body cannot be empty" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.body !== undefined) patch.body = input.body;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { error } = await admin.from("whatsapp_templates").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true };
}

export async function deleteTemplate(id: string): Promise<Result<{}>> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("whatsapp_templates").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true };
}

export async function reorderTemplates(orderedIds: string[]): Promise<Result<{}>> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Issue one update per id with the new sort_order in parallel
  const results = await Promise.all(
    orderedIds.map((id, idx) =>
      admin.from("whatsapp_templates").update({ sort_order: idx }).eq("id", id)
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const failures = results.filter((r: any) => r.error);
  if (failures.length > 0) return { error: `Failed to reorder ${failures.length} rows` };

  revalidatePath("/admin/whatsapp-templates");
  return { success: true };
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/_actions/whatsapp-templates.ts
git commit -m "feat(whatsapp): server actions for template CRUD + reorder"
```

---

## Task 8: Templates admin page — list view

**Files:**
- Create: `src/app/(portal)/admin/whatsapp-templates/page.tsx`

- [ ] **Step 1: Write the page (list view only — drawer in next task)**

Create `src/app/(portal)/admin/whatsapp-templates/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Card, Badge, Button, Toast, Skeleton } from "@/components/ui";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, MessageSquare } from "lucide-react";
import { listTemplates, deleteTemplate, reorderTemplates, updateTemplate } from "@/app/_actions/whatsapp-templates";
import type { WhatsappTemplate } from "@/types/database";
import { TemplateDrawer } from "./_components/template-drawer";

export default function WhatsappTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  const refresh = useCallback(async () => {
    const data = await listTemplates();
    setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function move(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= templates.length) return;
    const next = [...templates];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setTemplates(next);
    startTransition(async () => {
      const res = await reorderTemplates(next.map((t) => t.id));
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        refresh();
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteTemplate(id);
      setConfirmDeleteId(null);
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Template deleted", variant: "success" });
        refresh();
      }
    });
  }

  function handleToggleActive(t: WhatsappTemplate) {
    const next = !t.is_active;
    setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: next } : x));
    startTransition(async () => {
      const res = await updateTemplate(t.id, { is_active: next });
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        refresh();
      }
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">WhatsApp Templates</h1>
          <p className="text-slate-500 text-sm">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> New Template</span>
        </Button>
      </div>

      {loading ? (
        <Card><div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card>
      ) : templates.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No templates yet — create your first one to start sending.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {templates.map((t, idx) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || isPending}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                    title="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === templates.length - 1 || isPending}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                    title="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{t.name}</p>
                  <p className="text-xs text-slate-400 truncate">{t.body.slice(0, 80)}{t.body.length > 80 ? "…" : ""}</p>
                </div>
                <button
                  onClick={() => handleToggleActive(t)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                    t.is_active
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {t.is_active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => setEditing(t)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {confirmDeleteId === t.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={isPending}
                      className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                    >Delete</button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs font-medium px-2 py-1 rounded text-slate-500 hover:text-slate-700"
                    >Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(t.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <TemplateDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => { setShowCreate(false); refresh(); setToast({ message: "Template created", variant: "success" }); }}
        template={null}
      />
      <TemplateDrawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); setToast({ message: "Template updated", variant: "success" }); }}
        template={editing}
      />
    </div>
  );
}
```

- [ ] **Step 2: Stub the drawer** so the page compiles

Create `src/app/(portal)/admin/whatsapp-templates/_components/template-drawer.tsx`:

```tsx
"use client";

import type { WhatsappTemplate } from "@/types/database";

interface TemplateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: WhatsappTemplate | null;
}

export function TemplateDrawer(_props: TemplateDrawerProps) {
  // Real implementation in next task.
  return null;
}
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/app/\(portal\)/admin/whatsapp-templates/
git commit -m "feat(whatsapp): templates list page (no drawer yet)"
```

---

## Task 9: Template author drawer

**Files:**
- Modify: `src/app/(portal)/admin/whatsapp-templates/_components/template-drawer.tsx`

- [ ] **Step 1: Write the full drawer**

Replace the stubbed file:

```tsx
"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Drawer, Button, Input, Textarea } from "@/components/ui";
import { VARIABLES } from "@/lib/whatsapp/variables";
import { renderTemplate } from "@/lib/whatsapp/render";
import { createTemplate, updateTemplate } from "@/app/_actions/whatsapp-templates";
import type { WhatsappTemplate } from "@/types/database";

interface TemplateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: WhatsappTemplate | null;
}

// Sample values used for the live preview — one per variable, sourced from VARIABLES[].example.
const SAMPLE_VARS: Map<string, string | null> = new Map(VARIABLES.map((v) => [v.key, v.example]));

export function TemplateDrawer({ open, onClose, onSaved, template }: TemplateDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setName(template?.name ?? "");
      setBody(template?.body ?? "");
      setIsActive(template?.is_active ?? true);
    }
  }, [open, template]);

  function insertVariable(key: string) {
    const ta = bodyRef.current;
    if (!ta) {
      setBody((prev) => `${prev}{{${key}}}`);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const token = `{{${key}}}`;
    const next = `${before}${token}${after}`;
    setBody(next);
    // Restore focus + caret after token
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (!body.trim()) { setError("Body is required"); return; }

    startTransition(async () => {
      const res = template
        ? await updateTemplate(template.id, { name: name.trim(), body, is_active: isActive })
        : await createTemplate({ name: name.trim(), body, is_active: isActive });
      if ("error" in res) { setError(res.error); return; }
      onSaved();
    });
  }

  const preview = renderTemplate(body, SAMPLE_VARS);

  return (
    <Drawer open={open} onClose={onClose} title={template ? "Edit Template" : "New Template"} width="max-w-2xl">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Renewal reminder" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px] gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Body</label>
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, you have {{sessions_remaining}} sessions left."
              rows={8}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Variables</label>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary-50 text-slate-700 hover:text-primary border border-transparent hover:border-primary-200 transition-colors"
                  title={v.description}
                >
                  <span className="font-mono text-[11px] text-primary">{`{{${v.key}}}`}</span>
                  <span className="text-slate-400 ml-1 text-[10px]">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Active (visible in send picker)</span>
        </label>

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Live preview (sample values)</label>
          <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap min-h-[60px]">
            {body ? preview : <span className="text-slate-400">Write a body to see the preview…</span>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : (template ? "Save" : "Create")}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Verify Textarea component supports a ref**

Run: `grep -n "forwardRef\|export" src/components/ui/textarea.tsx`
If `Textarea` doesn't `forwardRef`, you'll get a TS error. If so, open that file and wrap with `forwardRef<HTMLTextAreaElement, …>` — the change is mechanical. If it already does, skip.

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/app/\(portal\)/admin/whatsapp-templates/_components/template-drawer.tsx
git commit -m "feat(whatsapp): author drawer with variable insertion + live preview"
```

---

## Task 10: Nav item

**Files:**
- Modify: `src/components/layout/sidebar-layout.tsx`

- [ ] **Step 1: Insert the new nav item**

Find the `adminNav` array (around line 83). After the `feedback` entry (last "Training" item) and before `users` (System), insert:

```ts
  { key: "whatsapp-templates", label: "WhatsApp Templates", href: "/admin/whatsapp-templates", section: "Messaging" },
```

So the relevant slice becomes:

```ts
  { key: "feedback", label: "Feedback", href: "/admin/feedback", section: "Training" },
  { key: "whatsapp-templates", label: "WhatsApp Templates", href: "/admin/whatsapp-templates", section: "Messaging" },
  { key: "users", label: "Admins", href: "/admin/users", section: "System" },
```

- [ ] **Step 2: Verify section ordering**

If the layout uses a fixed section order (e.g. an array `["People", "Finance", "Training", "Messaging", "System"]`), confirm "Messaging" is listed. If sections are derived from order-of-appearance, the order above ensures Messaging appears between Training and System.

Search: `grep -n 'section' src/components/layout/sidebar-layout.tsx | head -20`. If you find a hardcoded section list, add "Messaging" to it in the right position. If sections render in order of first appearance, no further edit is needed.

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add src/components/layout/sidebar-layout.tsx
git commit -m "feat(nav): add Messaging → WhatsApp Templates section"
```

---

## Task 11: WhatsappSendDrawer component

**Files:**
- Create: `src/components/whatsapp/WhatsappSendDrawer.tsx`

- [ ] **Step 1: Write the drawer**

Create `src/components/whatsapp/WhatsappSendDrawer.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { Drawer, Button, Textarea } from "@/components/ui";
import { ExternalLink } from "lucide-react";
import { listTemplates } from "@/app/_actions/whatsapp-templates";
import { resolvePlayerVariables } from "@/lib/whatsapp/resolver";
import { renderTemplate } from "@/lib/whatsapp/render";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import type { WhatsappTemplate } from "@/types/database";

interface WhatsappSendDrawerProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  playerPhone: string | null;
}

export function WhatsappSendDrawer({ open, onClose, playerId, playerName, playerPhone }: WhatsappSendDrawerProps) {
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [vars, setVars] = useState<Map<string, string | null>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setText("");
    setLoading(true);
    (async () => {
      const [tpl, v] = await Promise.all([
        listTemplates({ activeOnly: true }),
        resolvePlayerVariables(playerId),
      ]);
      setTemplates(tpl);
      setVars(v);
      setLoading(false);
    })();
  }, [open, playerId]);

  function handlePickTemplate(t: WhatsappTemplate) {
    setSelectedId(t.id);
    setText(renderTemplate(t.body, vars));
  }

  function handleOpenInWhatsApp() {
    if (!playerPhone) return;
    if (!text.trim()) return;
    const url = buildWhatsAppUrl(playerPhone, text);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  function handleRawOpen() {
    if (!playerPhone) return;
    window.open(buildWhatsAppUrl(playerPhone), "_blank", "noopener,noreferrer");
    onClose();
  }

  const noPhone = !playerPhone;

  return (
    <Drawer open={open} onClose={onClose} title="Send WhatsApp" width="max-w-lg">
      <div className="space-y-4">
        <div className="text-sm">
          <p className="text-xs text-slate-400 mb-0.5">To</p>
          <p className="text-slate-900 font-medium">{playerName}</p>
          <p className="text-slate-500 text-xs">{playerPhone ?? "(no phone on file)"}</p>
        </div>

        {noPhone ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
            This player has no phone number on file. Add one in the profile to send WhatsApp.
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-400 text-center py-6">Loading templates…</p>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Template</label>
              {templates.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No active templates. Create one on the WhatsApp Templates page.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handlePickTemplate(t)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        selectedId === t.id
                          ? "border-primary bg-primary-50 text-primary"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Preview & edit</label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Pick a template above to see the preview here. Edit freely before sending."
                rows={8}
              />
              <p className="text-[11px] text-slate-400 mt-1">Unresolved variables stay as <code>{`{{name}}`}</code> — edit them inline before sending.</p>
            </div>

            <Button onClick={handleOpenInWhatsApp} disabled={!text.trim()} fullWidth>
              <span className="flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4" />
                Open in WhatsApp
              </span>
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleRawOpen}
                className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
              >
                Or, send raw WhatsApp (no template) →
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --noEmit
git add src/components/whatsapp/WhatsappSendDrawer.tsx
git commit -m "feat(whatsapp): WhatsappSendDrawer (player picker + preview)"
```

---

## Task 12: Wire into player detail drawer

**Files:**
- Modify: `src/app/(portal)/admin/players/_components/player-drawer.tsx`

- [ ] **Step 1: Replace the raw `<a>` with a button that opens the drawer**

In `player-drawer.tsx` around lines 497-512, replace the existing WhatsApp `<a>` element with a button. First add a state hook near the top of the component (find existing `useState` calls):

```tsx
const [showWaSend, setShowWaSend] = useState(false);
```

And import at the top:

```tsx
import { WhatsappSendDrawer } from "@/components/whatsapp/WhatsappSendDrawer";
```

Now replace the WhatsApp `<a>...</a>` block (lines 500-508 in the original) with:

```tsx
<button
  type="button"
  onClick={() => setShowWaSend(true)}
  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
>
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  WhatsApp
</button>
```

- [ ] **Step 2: Mount the drawer**

At the bottom of the component's JSX (just inside the outer wrapper, alongside any existing drawers/modals), add:

```tsx
<WhatsappSendDrawer
  open={showWaSend}
  onClose={() => setShowWaSend(false)}
  playerId={player.id}
  playerName={`${player.first_name} ${player.last_name}`}
  playerPhone={player.phone}
/>
```

- [ ] **Step 3: Type check + manual click-through**

Run: `npx tsc --noEmit` — clean.

Manual: open the player drawer for any player → click WhatsApp → drawer opens → pick a template → preview fills → click Open in WhatsApp → wa.me opens.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(portal)/admin/players/_components/player-drawer.tsx'
git commit -m "feat(players): WhatsApp template picker on player drawer"
```

---

## Task 13: Wire into players table

**Files:**
- Modify: `src/app/(portal)/admin/players/_components/table.tsx`

- [ ] **Step 1: Hoist a single send-drawer to the table level**

The existing `ContactIcons` component is rendered per row. We don't want N drawers — instead, the table holds one drawer instance, and `ContactIcons` calls back with the player on click.

Find the existing `PlayersTableView` export. Add at the top of the component (near other `useState` declarations):

```tsx
const [waSendFor, setWaSendFor] = useState<{ id: string; name: string; phone: string | null } | null>(null);
```

Import at the top of the file:

```tsx
import { WhatsappSendDrawer } from "@/components/whatsapp/WhatsappSendDrawer";
```

- [ ] **Step 2: Change `ContactIcons` to accept an `onWhatsApp` callback**

In the same file, update the `ContactIcons` signature and replace the existing WhatsApp `<a>` block:

```tsx
function ContactIcons({
  phone,
  email,
  onWhatsApp,
}: {
  phone: string | null;
  email: string | null;
  onWhatsApp?: () => void;
}) {
  if (!phone && !email) return <span className="text-slate-300">—</span>;

  return (
    <div className="flex items-center gap-1">
      {phone && onWhatsApp && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onWhatsApp(); }}
          className="p-1 rounded hover:bg-green-50 transition-colors text-green-600 hover:text-green-700"
          title="WhatsApp"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </button>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-blue-50 transition-colors text-blue-500 hover:text-blue-600"
          title="Email"
        >
          <Mail className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `onWhatsApp` per row**

Find where the table renders `<ContactIcons phone={...} email={...} />` (search for `<ContactIcons`). Pass the callback:

```tsx
<ContactIcons
  phone={player.phone}
  email={player.email}
  onWhatsApp={player.phone ? () => setWaSendFor({
    id: player.id,
    name: `${player.first_name} ${player.last_name}`,
    phone: player.phone,
  }) : undefined}
/>
```

- [ ] **Step 4: Mount the drawer at the table level**

At the end of the `PlayersTableView` JSX, add:

```tsx
<WhatsappSendDrawer
  open={waSendFor !== null}
  onClose={() => setWaSendFor(null)}
  playerId={waSendFor?.id ?? ""}
  playerName={waSendFor?.name ?? ""}
  playerPhone={waSendFor?.phone ?? null}
/>
```

(`open` is `false` when `waSendFor` is null, so the empty-string defaults never matter.)

- [ ] **Step 5: Type check + manual click-through**

Run: `npx tsc --noEmit` — clean.

Manual: open the players list → click WhatsApp icon on a row with a phone → drawer opens for that player.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(portal)/admin/players/_components/table.tsx'
git commit -m "feat(players): WhatsApp template picker on players table"
```

---

## Task 14: Coach/admin tables use shared URL builder

**Files:**
- Modify: `src/app/(portal)/admin/coaches/_components/table.tsx`
- Modify: `src/app/(portal)/admin/users/_components/table.tsx`

No UX change here. Just dedup the URL construction by switching the existing `<a href={`https://wa.me/${cleanPhone}`}>` to `<a href={buildWhatsAppUrl(phone)}>`. This makes the phone-cleaning logic identical across all four entry points.

- [ ] **Step 1: Update coaches table**

In `src/app/(portal)/admin/coaches/_components/table.tsx`:

Add at the top:
```tsx
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
```

Find the WhatsApp link (around line 85) and change `href={`https://wa.me/${cleanPhone}`}` to `href={buildWhatsAppUrl(phone)}`. Remove the local `cleanPhone` calculation if it's no longer used elsewhere in the file (grep `cleanPhone` to confirm — if only used by the WhatsApp link, delete its definition).

- [ ] **Step 2: Update users/admins table**

Same pattern in `src/app/(portal)/admin/users/_components/table.tsx` (around line 147).

- [ ] **Step 3: Type check + commit**

```bash
npx tsc --noEmit
git add 'src/app/(portal)/admin/coaches/_components/table.tsx' 'src/app/(portal)/admin/users/_components/table.tsx'
git commit -m "refactor(whatsapp): coach/admin tables use buildWhatsAppUrl"
```

---

## Task 15: End-to-end verification

- [ ] **Step 1: Apply the migration**

If not done in Task 1 Step 2: `npm run db:migrate`.

- [ ] **Step 2: Coverage matrix**

| # | Scenario | Pass? |
|---|---|---|
| 1 | Create 3 templates with different variables | |
| 2 | Reorder via up/down arrows; refresh page — order persists | |
| 3 | Toggle template inactive — disappears from send picker | |
| 4 | Send picker on a player with active subscription — preview resolves all vars | |
| 5 | Send picker on a player with no subscription — unresolved vars stay literal | |
| 6 | "Open in WhatsApp" — wa.me opens in new tab with text pre-filled | |
| 7 | "Send raw WhatsApp" link — wa.me opens with no text | |
| 8 | Player with no phone — drawer shows the disabled state | |
| 9 | Coach/admin row WhatsApp icons still open raw wa.me (no picker) | |
| 10 | Non-admin (coach role) hitting `/admin/whatsapp-templates` redirected/blocked | |
| 11 | Delete a template — gone from list, gone from picker | |
| 12 | Templates page nav item visible under "Messaging" section | |

For #10: log in as a coach in a private window → navigate to `/admin/whatsapp-templates`. Should hit the standard admin-route guard (redirect to coach dashboard or 404; whichever the layout enforces).

- [ ] **Step 3: Final type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Both must exit 0.

- [ ] **Step 4: No final commit needed** unless verification surfaced fixes.

---

## Self-review notes

- **Spec coverage:** Every spec section implemented — table (Task 1), types (Task 2), variable registry (Task 3), renderer (Task 4), URL builder (Task 5), resolver (Task 6), server actions (Task 7), admin page list (Task 8), author drawer (Task 9), nav (Task 10), send drawer (Task 11), wiring into player drawer (Task 12) + players table (Task 13), shared URL builder in other tables (Task 14), verification (Task 15).
- **No placeholders.** Every TSX/SQL block is concrete.
- **Type consistency:** `WhatsappTemplate` is the canonical row type used everywhere. `VARIABLES`, `renderTemplate`, `buildWhatsAppUrl`, `resolvePlayerVariables` keep the same signatures across consumers. Server-action returns use the existing `{success: true}` / `{error: string}` discriminated-union pattern from `coach-blocks.ts`.
- **Drag → arrows:** Tactical deviation from the spec. Achieves the same outcome; spec can be updated retroactively if you want, or left as the original design intent.
- **Coach/admin table refactor (Task 14):** Optional polish, kept because it removes duplicated URL construction and the cost is minimal (one import + one `href=` swap per file).
