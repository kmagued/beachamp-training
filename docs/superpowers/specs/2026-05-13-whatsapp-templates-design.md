# WhatsApp Templates — Design Spec

**Date:** 2026-05-13
**Scope:** Admin creates and manages a library of reusable WhatsApp message templates with variable substitution. When clicking the WhatsApp button on a player, admin picks a template, previews the substituted message, optionally edits, then sends via `wa.me`.

---

## Goals

1. Admin can author and manage a flat library of message templates (`/admin/whatsapp-templates`).
2. Templates support variable substitution from player profile + subscription + next-session context.
3. The WhatsApp send action on player surfaces opens a picker: pick template → see preview with substituted text → edit if needed → open in WhatsApp with pre-filled body.
4. An escape hatch ("Send raw WhatsApp") preserves the existing one-click `wa.me` behavior for ad-hoc messages.

---

## Out of scope

- **Sent-message log.** `wa.me` doesn't tell us what was actually sent; logging would be misleading.
- **Categories / tags / multi-language.** Flat list with manual sort order is enough until ~20 templates.
- **Templating beyond `{{var}}` substitution.** No conditionals, loops, or formatting.
- **Templates on coach/admin WhatsApp buttons.** Player surfaces only. Coach/admin tables keep raw `wa.me`.
- **Direct WhatsApp Business API integration.** Out of scope — `wa.me` deep links are all we use; the admin presses Send inside WhatsApp itself.

---

## Decisions (resolved during brainstorming)

| # | Question | Choice |
|---|---|---|
| 1 | Where does the picker appear? | Player surfaces only (player detail drawer + players table row action). Coach/admin tables keep raw `wa.me`. |
| 2 | Variable scope | Profile + subscription/session context. No payment variables. |
| 3 | Picker flow | Pick → preview & edit → open in WhatsApp. Plus "Send raw WhatsApp" escape hatch. |
| 4 | Missing variables | Leave the literal `{{var}}` in the preview so admin sees what didn't resolve and edits inline. |

---

## Data model

### New table: `whatsapp_templates`

```sql
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
```

### RLS

Admin-only — no other role reads or writes:

```sql
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage templates"
  ON whatsapp_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_templates TO authenticated;
```

---

## Variable system

### Registry (fixed, in code)

`src/lib/whatsapp/variables.ts`:

```ts
export type WhatsappVariable = {
  key: string;
  label: string;
  description: string;
  example: string;
};

export const VARIABLES: WhatsappVariable[] = [
  // Profile
  { key: 'first_name',  label: 'First name',     description: "Player's first name",      example: 'Ahmed' },
  { key: 'last_name',   label: 'Last name',      description: "Player's last name",       example: 'Hassan' },
  { key: 'full_name',   label: 'Full name',      description: 'First + last',             example: 'Ahmed Hassan' },
  { key: 'phone',       label: 'Phone',          description: "Player's phone",           example: '01XXXXXXXXX' },
  { key: 'email',       label: 'Email',          description: "Player's email",           example: 'ahmed@example.com' },
  { key: 'area',        label: 'Area',           description: 'Area of residence',        example: 'Maadi' },
  { key: 'playing_level', label: 'Playing level',description: 'beginner / intermediate / advanced / professional', example: 'intermediate' },
  { key: 'gender',      label: 'Gender',         description: 'male / female',            example: 'male' },
  { key: 'occupation',  label: 'Occupation',     description: 'Player occupation',        example: 'Engineer' },

  // Subscription
  { key: 'sessions_remaining',    label: 'Sessions remaining',    description: 'Sessions left in current subscription', example: '4' },
  { key: 'sessions_total',        label: 'Sessions total',        description: 'Total sessions in current subscription', example: '12' },
  { key: 'package_name',          label: 'Package name',          description: 'Name of current package', example: 'Standard Monthly' },
  { key: 'subscription_end_date', label: 'Subscription end date', description: 'Current subscription end date (YYYY-MM-DD)', example: '2026-06-30' },

  // Next session
  { key: 'next_session_date', label: 'Next session date', description: 'Date of next scheduled session', example: '2026-05-15' },
  { key: 'next_session_time', label: 'Next session time', description: 'Time of next scheduled session', example: '18:00' },
];
```

### Resolver

`src/lib/whatsapp/resolver.ts` exports:

```ts
export async function resolvePlayerVariables(playerId: string): Promise<Map<string, string | null>>;
```

Implementation: one set of parallel queries (using the service-role admin client):

1. `profiles` row for the player — supplies `first_name`, `last_name`, `phone`, `email`, `area`, `playing_level`, `gender`, `occupation`. `full_name` is computed as `${first_name} ${last_name}`.
2. Latest "effectively active" subscription (status IN `'active','pending'`, `sessions_remaining > 0`, `end_date IS NULL OR end_date >= today`) joined to `packages(name)` — supplies `sessions_remaining`, `sessions_total`, `package_name`, `subscription_end_date`. If none, these resolve to `null`.
3. Next `schedule_sessions` occurrence the player attends. For group sessions, the player is in `group_players` for the session's group, on the next matching day_of_week (within the next 7 days). For private sessions, `schedule_sessions.player_id = playerId` and `end_date >= today`. Pick the earliest such session. Supplies `next_session_date` (YYYY-MM-DD) and `next_session_time` (HH:MM). If none, both `null`.

Returns a Map. Keys not in the map (unknown vars) and keys with `null`/empty values are treated as **unresolved** by the renderer.

### Renderer

`src/lib/whatsapp/render.ts`:

```ts
export function renderTemplate(body: string, vars: Map<string, string | null>): string;
```

Behavior:
- For each `{{key}}` token in `body`: if `vars.get(key)` is a non-empty string, replace the token with that string.
- Otherwise (unknown key, `null`, or empty string), **leave the literal `{{key}}` in place**.
- Tokens match `\{\{([a-z_][a-z0-9_]*)\}\}` (lowercase + underscore + digits). No whitespace tolerated inside braces — `{{ first_name }}` is treated as unrecognized text.

### URL builder

`src/lib/whatsapp/url.ts`:

```ts
export function buildWhatsAppUrl(phone: string, text?: string): string;
```

- Strips everything except digits and leading `+` from `phone`.
- If `text` is provided and non-empty: `https://wa.me/<cleaned>?text=<encodeURIComponent(text)>`.
- Else: `https://wa.me/<cleaned>`.

This helper centralizes the URL construction currently duplicated across 4 entry points.

---

## UI

### Templates admin page

Path: `/admin/whatsapp-templates`

Layout:
- Header: "WhatsApp Templates" + "+ New Template" button.
- Card containing the templates list. Each row: drag handle (⋮⋮), name, active/inactive badge, edit and delete buttons.
- Drag-reorder writes new `sort_order` values via a `reorderTemplates(orderedIds)` action that issues one bulk update.
- Empty state: "No templates yet — create your first one to start sending."

New/Edit drawer:
- **Name** input.
- **Body** textarea (monospace, min 6 rows).
- **Variables panel** on the right: every registry entry, each with an `[Insert]` button that pastes `{{key}}` at the textarea's caret position.
- **Live preview** at the bottom — uses the first active player in the DB as a stand-in for substitution preview. (Shown after the body has at least one character.)
- **Active** checkbox.
- Validation: name non-empty, body non-empty.

### Send picker drawer

Component: `src/components/whatsapp/WhatsappSendDrawer.tsx`

Props:
```ts
interface WhatsappSendDrawerProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;       // "Ahmed Hassan"
  playerPhone: string | null;
}
```

Body:
- **To:** `${playerName}` and the formatted phone (read-only, header only).
- **Template list** (active templates, ordered by `sort_order`): radio-style selectable list.
- **Preview & edit textarea** (auto-filled when a template is picked; freely editable thereafter).
- **Open in WhatsApp** button → calls `buildWhatsAppUrl(phone, text)` and `window.open(url, '_blank')`. Disabled if textarea is empty or phone is missing.
- **Send raw WhatsApp →** link at the bottom → opens `buildWhatsAppUrl(phone)` (no `text`). Always available regardless of textarea state.

Data loading: on `open=true`, fetch active templates and `resolvePlayerVariables(playerId)` in parallel. Cache for the drawer's lifetime; close+reopen refetches (cheap, low traffic).

If no phone is on file, the entire drawer is disabled with a message: "This player has no phone number on file."

### Where it's wired in

Replace the existing `<a href="https://wa.me/..." />` markup with a button that opens `WhatsappSendDrawer` in **two** places (per Q1):

1. `src/app/(portal)/admin/players/_components/player-drawer.tsx` (~line 501)
2. `src/app/(portal)/admin/players/_components/table.tsx` (~line 113)

The other two WhatsApp entry points (`coaches/_components/table.tsx`, `users/_components/table.tsx`) **stay unchanged** but switch to using `buildWhatsAppUrl(phone)` from the new helper instead of constructing the URL inline. Small consistency win; no behavior change.

### Nav addition

`src/components/layout/sidebar-layout.tsx` — add a "Messaging" section with one item:

```
Messaging
  WhatsApp Templates  →  /admin/whatsapp-templates
```

Place it between "Training" and "System."

---

## Server actions

`src/app/_actions/whatsapp-templates.ts`:

```ts
export async function listTemplates(opts?: { activeOnly?: boolean }): Promise<WhatsappTemplate[]>;
export async function createTemplate(input: { name: string; body: string; is_active: boolean }): Promise<{ id: string } | { error: string }>;
export async function updateTemplate(id: string, input: { name?: string; body?: string; is_active?: boolean }): Promise<{ success: true } | { error: string }>;
export async function deleteTemplate(id: string): Promise<{ success: true } | { error: string }>;
export async function reorderTemplates(orderedIds: string[]): Promise<{ success: true } | { error: string }>;
```

All actions require `role = 'admin'` (defense in depth on top of RLS). `reorderTemplates` issues one `UPDATE … SET sort_order = …` per id (small N, single round-trip via a generated SQL or sequence of `update().eq()` in a Promise.all).

---

## Migration file

`supabase/migrations/20260514000000_whatsapp_templates.sql` — the table, index, trigger, RLS policy, grant. Additive only.

---

## Manual verification

1. **Author flow** — Create 3 templates with different variables. Sort by drag. Toggle one inactive.
2. **Picker happy path** — Player with active subscription, picks a template using `{{first_name}}`, `{{sessions_remaining}}`, `{{package_name}}` → preview renders fully resolved.
3. **Picker missing-vars** — Player with no subscription, picks the same template → `{{sessions_remaining}}` and `{{package_name}}` stay as literal `{{…}}` in the preview. Admin edits the textarea, then sends.
4. **Open in WhatsApp** — `wa.me` opens in a new tab with `?text=...` populated.
5. **Raw escape hatch** — "Send raw WhatsApp" opens `wa.me` with no body.
6. **No phone** — Picker shows the disabled state with the explanatory message.
7. **Permission boundary** — A non-admin user (coach role) hitting `/admin/whatsapp-templates` is redirected/blocked.
8. **Coach/admin tables unchanged** — Clicking WhatsApp on a coach or admin row still opens raw `wa.me` (no picker).
9. **Inactive templates** — An inactive template is hidden from the send picker but visible (greyed) on the admin templates page.

---

## Open questions

None.
