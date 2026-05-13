/**
 * Seed starter WhatsApp templates.
 *
 * Idempotent: skips any template whose `name` already exists.
 *
 * Usage:  set -a && source .env.local && set +a && npx tsx scripts/seed-whatsapp-templates.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface TemplateSeed {
  name: string;
  body: string;
}

const templates: TemplateSeed[] = [
  {
    name: "Welcome",
    body: `Hi {{first_name}}, welcome to Beachamp Training! 🏐

We're glad to have you on board. Your profile is set up and you can sign in any time.

If you have any questions about your training package or schedule, just reply to this message.`,
  },
  {
    name: "Renewal reminder",
    body: `Hi {{first_name}},

You have {{sessions_remaining}} sessions left in your {{package_name}} package, expiring on {{subscription_end_date}}.

Want to renew? Let me know and I'll set it up for you.`,
  },
  {
    name: "Low sessions warning",
    body: `Hi {{first_name}},

Just a heads up — you have only {{sessions_remaining}} sessions left in your current package.

Let me know if you'd like to renew before your next session.`,
  },
  {
    name: "Next session reminder",
    body: `Hi {{first_name}},

Reminder: your next session is on {{next_session_date}} at {{next_session_time}}.

See you on the court! 🏐`,
  },
  {
    name: "Payment pending",
    body: `Hi {{first_name}},

We're still waiting to confirm your payment for the {{package_name}} package. Could you share the payment receipt or let us know if you've sent it?

Thanks!`,
  },
  {
    name: "Missed session check-in",
    body: `Hi {{first_name}},

We missed you at the last session. Hope everything's okay!

If you need to adjust your schedule or pause your subscription, just let me know.`,
  },
  {
    name: "Schedule change",
    body: `Hi {{first_name}},

Heads up — there's a change to the schedule that affects your group. Please check the app for the updated times.

Let me know if the new time doesn't work for you.`,
  },
  {
    name: "Welcome back",
    body: `Hi {{first_name}}, welcome back!

Your subscription is active again and you have {{sessions_remaining}} sessions ready to use. Looking forward to seeing you on the court!`,
  },
];

async function main() {
  console.log("\n🌱 Seeding WhatsApp templates...\n");

  // Fetch existing template names so we don't duplicate
  const { data: existing } = await supabase
    .from("whatsapp_templates")
    .select("name");
  const existingNames = new Set((existing || []).map((t: { name: string }) => t.name));

  // Find an admin to attribute the created_by to (best-effort)
  const { data: admin } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const createdBy = (admin as { id: string } | null)?.id ?? null;

  // Find the current max sort_order so new templates get sorted at the end
  const { data: maxRow } = await supabase
    .from("whatsapp_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = (((maxRow as { sort_order: number } | null)?.sort_order) ?? -1) + 1;

  let created = 0;
  let skipped = 0;

  for (const t of templates) {
    if (existingNames.has(t.name)) {
      console.log(`  ↳ skip "${t.name}" (already exists)`);
      skipped++;
      continue;
    }
    const { error } = await supabase.from("whatsapp_templates").insert({
      name: t.name,
      body: t.body,
      is_active: true,
      sort_order: nextOrder,
      created_by: createdBy,
    });
    if (error) {
      console.warn(`  ⚠ "${t.name}": ${error.message}`);
    } else {
      console.log(`  ✓ created "${t.name}"`);
      created++;
      nextOrder++;
    }
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
