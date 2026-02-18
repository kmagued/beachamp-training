/**
 * Seed script — populates the database with test data.
 *
 * Usage:  npx tsx scripts/seed.ts
 *         (or: set -a && source .env.local && set +a && npm run db:seed)
 *
 * All test accounts use password: Test1234!
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

const PASSWORD = "Test1234!";

// ── Test users ──────────────────────────────────────────
const users = [
  { email: "admin@beachamp.com", first_name: "Ahmed", last_name: "Fahmy", role: "admin" as const, phone: "01001234567" },
  { email: "coach@beachamp.com", first_name: "Mohamed", last_name: "Hassan", role: "coach" as const, phone: "01012345678" },
  { email: "player1@test.com", first_name: "Omar", last_name: "Sherif", role: "player" as const, phone: "01112345678", area: "Maadi", level: "advanced", goals: "Competitive training" },
  { email: "player2@test.com", first_name: "Youssef", last_name: "Ali", role: "player" as const, phone: "01223456789", area: "Zamalek", level: "intermediate", goals: "Improve Fitness" },
  { email: "player3@test.com", first_name: "Kareem", last_name: "Mostafa", role: "player" as const, phone: "01098765432", area: "New Cairo", level: "beginner", goals: "Learn the basics" },
  { email: "player4@test.com", first_name: "Nour", last_name: "Ibrahim", role: "player" as const, phone: "01198765432", area: "6th October", level: "professional", goals: "Prepare for a season" },
  { email: "player5@test.com", first_name: "Tarek", last_name: "Saad", role: "player" as const, phone: "01298765432", area: "Heliopolis", level: "intermediate", goals: "Participate in tournaments" },
  { email: "player6@test.com", first_name: "Marwan", last_name: "Adel", role: "player" as const, phone: "01098712345", area: "Nasr City", level: "beginner", goals: "Learn the basics" },
];

async function getOrCreateUser(u: (typeof users)[number]): Promise<string> {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find((eu) => eu.email === u.email);
  if (found) {
    console.log(`  ↳ ${u.email} already exists (${found.id})`);
    return found.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: u.first_name, last_name: u.last_name, role: u.role, phone: u.phone },
  });
  if (error) throw new Error(`Failed to create ${u.email}: ${error.message}`);
  console.log(`  ✓ Created ${u.email} (${data.user.id})`);
  return data.user.id;
}

async function main() {
  console.log("\n🌱 Seeding Beachamp Training database...\n");

  // ── 1. Create auth users & collect IDs ──
  console.log("1. Creating auth users...");
  const ids: string[] = [];
  for (const u of users) {
    ids.push(await getOrCreateUser(u));
  }
  const [adminId, coachId, player1, player2, player3, player4, player5, player6] = ids;

  // ── 2. Upsert profiles directly (trigger may not fire for admin-created users) ──
  console.log("\n2. Upserting profiles...");
  const allProfiles = [
    { id: adminId, first_name: "Ahmed", last_name: "Fahmy", role: "admin", email: "admin@beachamp.com", phone: "01001234567", is_active: true, profile_completed: true },
    { id: coachId, first_name: "Mohamed", last_name: "Hassan", role: "coach", email: "coach@beachamp.com", phone: "01012345678", is_active: true, profile_completed: true },
    { id: player1, first_name: "Omar", last_name: "Sherif", role: "player", email: "player1@test.com", phone: "01112345678", area: "Maadi", playing_level: "advanced", training_goals: "Competitive training", is_active: true, profile_completed: true },
    { id: player2, first_name: "Youssef", last_name: "Ali", role: "player", email: "player2@test.com", phone: "01223456789", area: "Zamalek", playing_level: "intermediate", training_goals: "Improve Fitness", is_active: true, profile_completed: true },
    { id: player3, first_name: "Kareem", last_name: "Mostafa", role: "player", email: "player3@test.com", phone: "01098765432", area: "New Cairo", playing_level: "beginner", training_goals: "Learn the basics", is_active: true, profile_completed: true },
    { id: player4, first_name: "Nour", last_name: "Ibrahim", role: "player", email: "player4@test.com", phone: "01198765432", area: "6th October", playing_level: "professional", training_goals: "Prepare for a season", is_active: true, profile_completed: true },
    { id: player5, first_name: "Tarek", last_name: "Saad", role: "player", email: "player5@test.com", phone: "01298765432", area: "Heliopolis", playing_level: "intermediate", training_goals: "Participate in tournaments", is_active: true, profile_completed: true },
    { id: player6, first_name: "Marwan", last_name: "Adel", role: "player", email: "player6@test.com", phone: "01098712345", area: "Nasr City", playing_level: "beginner", training_goals: "Learn the basics", is_active: true, profile_completed: false },
  ];

  for (const p of allProfiles) {
    const { error } = await supabase.from("profiles").upsert(p, { onConflict: "id" });
    if (error) console.warn(`  ⚠ Profile ${p.email}: ${error.message}`);
    else console.log(`  ✓ ${p.email} (${p.role})`);
  }

  // ── 3. Get package IDs (use whatever packages exist) ──
  console.log("\n3. Fetching packages...");
  const { data: packages } = await supabase.from("packages").select("id, name, session_count, price, validity_days").order("sort_order");
  if (!packages || packages.length === 0) throw new Error("No packages found — run migration first");
  console.log(`  ✓ Found: ${packages.map((p) => `${p.name} (${p.session_count} sessions / ${p.price} EGP)`).join(", ")}`);

  // Use first 3 packages by sort order (small, medium, large)
  const pkgSmall = packages[0];
  const pkgMedium = packages.length > 1 ? packages[1] : packages[0];
  const pkgLarge = packages.length > 2 ? packages[2] : packages[packages.length - 1];

  // ── 4. Get group IDs ──
  console.log("\n4. Fetching groups...");
  const { data: groups } = await supabase.from("groups").select("id, name, level").order("name");
  if (!groups || groups.length === 0) throw new Error("No groups found — run migration first");
  console.log(`  ✓ Found ${groups.length} groups: ${groups.map((g) => g.name).join(", ")}`);

  // ── 5. Create subscriptions ──
  console.log("\n5. Creating subscriptions...");

  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString().split("T")[0];
  const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000).toISOString().split("T")[0];

  const subscriptions = [
    // Player 1 — active large subscription (used some sessions)
    {
      player_id: player1,
      package_id: pkgLarge.id,
      sessions_total: pkgLarge.session_count,
      sessions_remaining: Math.max(pkgLarge.session_count - 6, 1),
      start_date: daysAgo(20),
      end_date: daysFromNow(40),
      status: "active",
    },
    // Player 1 — past expired small subscription
    {
      player_id: player1,
      package_id: pkgSmall.id,
      sessions_total: pkgSmall.session_count,
      sessions_remaining: 0,
      start_date: daysAgo(90),
      end_date: daysAgo(60),
      status: "expired",
      created_at: new Date(today.getTime() - 90 * 86400000).toISOString(),
    },
    // Player 2 — pending medium subscription (awaiting payment confirmation)
    {
      player_id: player2,
      package_id: pkgMedium.id,
      sessions_total: pkgMedium.session_count,
      sessions_remaining: pkgMedium.session_count,
      status: "pending",
    },
    // Player 3 — cancelled (rejected payment) small subscription
    {
      player_id: player3,
      package_id: pkgSmall.id,
      sessions_total: pkgSmall.session_count,
      sessions_remaining: pkgSmall.session_count,
      status: "cancelled",
    },
    // Player 4 — active medium subscription (used 4 sessions)
    {
      player_id: player4,
      package_id: pkgMedium.id,
      sessions_total: pkgMedium.session_count,
      sessions_remaining: Math.max(pkgMedium.session_count - 4, 1),
      start_date: daysAgo(15),
      end_date: daysFromNow(30),
      status: "active",
    },
    // Player 5 — expired small subscription
    {
      player_id: player5,
      package_id: pkgSmall.id,
      sessions_total: pkgSmall.session_count,
      sessions_remaining: Math.max(pkgSmall.session_count - 6, 0),
      start_date: daysAgo(45),
      end_date: daysAgo(15),
      status: "expired",
    },
  ];

  const subIds: string[] = [];
  for (const sub of subscriptions) {
    const { data, error } = await supabase.from("subscriptions").insert(sub).select("id").single();
    if (error) {
      console.warn(`  ⚠ Sub for ${sub.player_id}: ${error.message}`);
      subIds.push("");
    } else {
      console.log(`  ✓ Subscription ${data.id} (${sub.status}) — ${sub.sessions_remaining}/${sub.sessions_total} sessions`);
      subIds.push(data.id);
    }
  }

  const [sub1Active, sub1Expired, sub2Pending, sub3Rejected, sub4Active, sub5Expired] = subIds;

  // ── 6. Create payments ──
  console.log("\n6. Creating payments...");

  const payments = [
    // Player 1 — confirmed payment for active sub
    sub1Active && {
      player_id: player1,
      subscription_id: sub1Active,
      amount: pkgLarge.price,
      method: "instapay",
      status: "confirmed",
      confirmed_by: adminId,
      confirmed_at: new Date(today.getTime() - 20 * 86400000).toISOString(),
      created_at: new Date(today.getTime() - 21 * 86400000).toISOString(),
    },
    // Player 1 — confirmed payment for old expired sub
    sub1Expired && {
      player_id: player1,
      subscription_id: sub1Expired,
      amount: pkgSmall.price,
      method: "instapay",
      status: "confirmed",
      confirmed_by: adminId,
      confirmed_at: new Date(today.getTime() - 89 * 86400000).toISOString(),
      created_at: new Date(today.getTime() - 90 * 86400000).toISOString(),
    },
    // Player 2 — pending payment
    sub2Pending && {
      player_id: player2,
      subscription_id: sub2Pending,
      amount: pkgMedium.price,
      method: "instapay",
      status: "pending",
    },
    // Player 3 — rejected payment
    sub3Rejected && {
      player_id: player3,
      subscription_id: sub3Rejected,
      amount: pkgSmall.price,
      method: "instapay",
      status: "rejected",
      rejection_reason: "Screenshot is unclear, please upload a readable payment confirmation",
      confirmed_by: adminId,
      confirmed_at: new Date(today.getTime() - 2 * 86400000).toISOString(),
    },
    // Player 4 — confirmed payment
    sub4Active && {
      player_id: player4,
      subscription_id: sub4Active,
      amount: pkgMedium.price,
      method: "instapay",
      status: "confirmed",
      confirmed_by: adminId,
      confirmed_at: new Date(today.getTime() - 14 * 86400000).toISOString(),
      created_at: new Date(today.getTime() - 15 * 86400000).toISOString(),
    },
    // Player 5 — confirmed payment for expired sub
    sub5Expired && {
      player_id: player5,
      subscription_id: sub5Expired,
      amount: pkgSmall.price,
      method: "instapay",
      status: "confirmed",
      confirmed_by: adminId,
      confirmed_at: new Date(today.getTime() - 44 * 86400000).toISOString(),
      created_at: new Date(today.getTime() - 45 * 86400000).toISOString(),
    },
  ].filter((p): p is Exclude<typeof p, false | "" | 0 | null | undefined> => Boolean(p));

  for (const pay of payments) {
    const { error } = await supabase.from("payments").insert(pay);
    if (error) console.warn(`  ⚠ Payment: ${error.message}`);
    else console.log(`  ✓ Payment (${pay.status}) — ${pay.amount} EGP`);
  }

  // ── 7. Assign players to groups ──
  console.log("\n7. Assigning players to groups...");

  const groupAssignments = [
    { group_id: groups[0].id, player_id: player1 },
    { group_id: groups[0].id, player_id: player4 },
    { group_id: groups[Math.min(1, groups.length - 1)].id, player_id: player2 },
    { group_id: groups[Math.min(1, groups.length - 1)].id, player_id: player5 },
    { group_id: groups[Math.min(2, groups.length - 1)].id, player_id: player3 },
    { group_id: groups[Math.min(2, groups.length - 1)].id, player_id: player6 },
  ];

  for (const ga of groupAssignments) {
    const { error } = await supabase.from("group_players").upsert(ga, { onConflict: "group_id,player_id" });
    if (error) console.warn(`  ⚠ Group assign: ${error.message}`);
    else console.log(`  ✓ Assigned player to group`);
  }

  // ── 8. Attendance (skip if table doesn't exist) ──
  console.log("\n8. Creating attendance records...");
  const { error: attCheck } = await supabase.from("attendance").select("id").limit(1);
  if (attCheck) {
    console.log(`  ↳ Skipped (attendance table not found — run attendance migration first)`);
  } else {
    const attendanceRecords = [
      ...[3, 5, 7, 10, 14, 17].map((d) => ({
        player_id: player1, group_id: groups[0].id, session_date: daysAgo(d), session_time: "17:00:00", status: "present", marked_by: coachId,
      })),
      ...[3, 7, 10, 14].map((d) => ({
        player_id: player4, group_id: groups[0].id, session_date: daysAgo(d), session_time: "17:00:00", status: "present", marked_by: coachId,
      })),
      ...[16, 20, 23, 27, 30, 34].map((d) => ({
        player_id: player5, group_id: groups[Math.min(1, groups.length - 1)].id, session_date: daysAgo(d), session_time: "18:00:00", status: "present", marked_by: coachId,
      })),
      { player_id: player1, group_id: groups[0].id, session_date: daysAgo(12), session_time: "17:00:00", status: "excused", marked_by: coachId, notes: "Family event" },
    ];

    const { error: attErr } = await supabase.from("attendance").insert(attendanceRecords);
    if (attErr) console.warn(`  ⚠ Attendance: ${attErr.message}`);
    else console.log(`  ✓ Created ${attendanceRecords.length} attendance records`);
  }

  // ── 9. Feedback (skip if table doesn't exist) ──
  console.log("\n9. Creating feedback entries...");
  const { error: fbCheck } = await supabase.from("feedback").select("id").limit(1);
  if (fbCheck) {
    console.log(`  ↳ Skipped (feedback table not found — run feedback migration first)`);
  } else {
    const feedbackEntries = [
      { player_id: player1, coach_id: coachId, session_date: daysAgo(3), rating: 5, comment: "Excellent performance today. Great spikes and defense." },
      { player_id: player1, coach_id: coachId, session_date: daysAgo(7), rating: 4, comment: "Good effort, needs to work on serve consistency." },
      { player_id: player4, coach_id: coachId, session_date: daysAgo(3), rating: 5, comment: "Outstanding game awareness and leadership on the court." },
      { player_id: player4, coach_id: coachId, session_date: daysAgo(10), rating: 4, comment: "Strong blocking, keep working on footwork." },
      { player_id: player5, coach_id: coachId, session_date: daysAgo(20), rating: 3, comment: "Making progress. Focus on passing technique." },
    ];

    const { error: fbErr } = await supabase.from("feedback").insert(feedbackEntries);
    if (fbErr) console.warn(`  ⚠ Feedback: ${fbErr.message}`);
    else console.log(`  ✓ Created ${feedbackEntries.length} feedback entries`);
  }

  // ── Done ──
  console.log("\n✅ Seed complete!\n");
  console.log("Test accounts (password: Test1234!):");
  console.log("  Admin:   admin@beachamp.com");
  console.log("  Coach:   coach@beachamp.com");
  console.log("  Players: player1@test.com through player6@test.com\n");
  console.log("Player scenarios:");
  console.log(`  player1 — Active ${pkgLarge.name} sub, sessions used, has attendance history`);
  console.log(`  player2 — Pending ${pkgMedium.name} sub, awaiting payment confirmation`);
  console.log(`  player3 — Rejected ${pkgSmall.name} sub (unclear screenshot)`);
  console.log(`  player4 — Active ${pkgMedium.name} sub, sessions used, has attendance history`);
  console.log(`  player5 — Expired ${pkgSmall.name} sub`);
  console.log("  player6 — No subscription (new user, profile incomplete)\n");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
