/** Dates for a subscription as it becomes active. Shared by admin payment
 *  confirmation and self-service subscriptions that need no payment. */

/**
 * Compute the start date for a newly-activated subscription, chaining after
 * the player's existing active sub. If the existing sub is depleted (no
 * sessions remaining) before its end_date, the new sub starts the day after
 * the player's last attended session instead of waiting for the expiry date.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeRenewalStartDate(supabase: any, playerId: string, excludeSubId?: string): Promise<Date> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let query = supabase
    .from("subscriptions")
    .select("end_date, sessions_remaining, sessions_total")
    .eq("player_id", playerId)
    .eq("status", "active")
    .order("end_date", { ascending: false, nullsFirst: false })
    .limit(5);
  if (excludeSubId) query = query.neq("id", excludeSubId);
  const { data: existingList } = await query;

  // Skip single-session subs — they're open-ended and shouldn't push the renewal date out
  const existing = (existingList || []).find(
    (s: { sessions_total: number }) => s.sessions_total > 1,
  );

  if (!existing?.end_date) return today;

  const activeEndDate = new Date(existing.end_date);
  if (activeEndDate <= today) return today;

  // Depleted early — chain from last attendance instead of expiry
  if ((existing.sessions_remaining ?? 0) <= 0) {
    const { data: lastAtt } = await supabase
      .from("attendance")
      .select("session_date")
      .eq("player_id", playerId)
      .eq("status", "present")
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAtt?.session_date) {
      const lastDate = new Date(lastAtt.session_date);
      const nextDay = new Date(lastDate);
      nextDay.setDate(nextDay.getDate() + 1);
      if (nextDay < today) return today;
      if (nextDay > activeEndDate) {
        const chained = new Date(activeEndDate);
        chained.setDate(chained.getDate() + 1);
        return chained;
      }
      return nextDay;
    }
    return today;
  }

  // Not depleted — chain after expiry
  const chained = new Date(activeEndDate);
  chained.setDate(chained.getDate() + 1);
  return chained;
}
