"use server";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Resolve all known variable keys for a player.
 * Keys are always present in the returned map; values are null when unresolved.
 */
export async function resolvePlayerVariables(playerId: string): Promise<Map<string, string | null>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);

  const [profileRes, subsRes, gpRes, privRes] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name, last_name, phone, email, area, playing_level, gender, occupation")
      .eq("id", playerId)
      .maybeSingle(),

    admin
      .from("subscriptions")
      .select("sessions_remaining, sessions_total, end_date, packages(name)")
      .eq("player_id", playerId)
      .in("status", ["active", "pending"])
      .gt("sessions_remaining", 0)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(1),

    admin
      .from("group_players")
      .select("group_id, groups(schedule_sessions(day_of_week, start_time, end_date, is_active))")
      .eq("player_id", playerId)
      .eq("is_active", true),

    admin
      .from("schedule_sessions")
      .select("end_date, start_time, day_of_week, is_active")
      .eq("session_type", "private")
      .eq("player_id", playerId)
      .eq("is_active", true)
      .gte("end_date", today)
      .order("end_date", { ascending: true })
      .limit(1),
  ]);

  const vars = new Map<string, string | null>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profileRes.data as any | null;
  vars.set("first_name", p?.first_name ?? null);
  vars.set("last_name", p?.last_name ?? null);
  vars.set(
    "full_name",
    p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : (p?.first_name ?? p?.last_name ?? null)
  );
  vars.set("phone", p?.phone ?? null);
  vars.set("email", p?.email ?? null);
  vars.set("area", p?.area ?? null);
  vars.set("playing_level", p?.playing_level ?? null);
  vars.set("gender", p?.gender ?? null);
  vars.set("occupation", p?.occupation ?? null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (subsRes.data as any[] | null)?.[0];
  vars.set("sessions_remaining", sub ? String(sub.sessions_remaining) : null);
  vars.set("sessions_total", sub ? String(sub.sessions_total) : null);
  vars.set("package_name", sub?.packages?.name ?? null);
  vars.set("subscription_end_date", sub?.end_date ?? null);

  // Next session: take the earliest of group-recurring next occurrence + next private
  let bestDate: string | null = null;
  let bestTime: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = (privRes.data as any[] | null)?.[0];
  if (priv?.end_date && priv?.start_time) {
    bestDate = priv.end_date as string;
    bestTime = (priv.start_time as string).slice(0, 5);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gpRows = (gpRes.data as any[] | null) || [];
  for (const row of gpRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions: any[] = row?.groups?.schedule_sessions ?? [];
    for (const s of sessions) {
      if (!s?.is_active) continue;
      const now = new Date();
      for (let i = 0; i < 14; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        if (d.getDay() !== s.day_of_week) continue;
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (s.end_date && ymd > s.end_date) break;
        const candTime = (s.start_time as string).slice(0, 5);
        if (
          bestDate === null ||
          ymd < bestDate ||
          (ymd === bestDate && candTime < (bestTime ?? "99:99"))
        ) {
          bestDate = ymd;
          bestTime = candTime;
        }
        break;
      }
    }
  }

  vars.set("next_session_date", bestDate);
  vars.set("next_session_time", bestTime);

  return vars;
}
