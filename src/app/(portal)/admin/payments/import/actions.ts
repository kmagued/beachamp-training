"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PaymentImportRow, PaymentImportResult, PackageInfo } from "./_components/types";

// Parse dates like "2/11/2026 17:11:38" — defaults to M/D/YYYY, auto-detects D/M/YYYY
function parseDate(str: string): Date | null {
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, a, b, y, h, min, sec] = match;
    let month = Number(a);
    let day = Number(b);
    // If first number > 12, it must be a day → format is D/M/YYYY, swap
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Number(y), month - 1, day, Number(h || 0), Number(min || 0), Number(sec || 0));
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Format a Date as YYYY-MM-DD using local time (avoids UTC timezone shift)
function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getPackageMap(): Promise<PackageInfo[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("packages")
    .select("id, name, session_count, validity_days")
    .eq("is_active", true);
  return (data || []) as PackageInfo[];
}

export async function checkImportEmails(
  emails: string[]
): Promise<Record<string, string>> {
  if (emails.length === 0) return {};
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", emails.map((e) => e.toLowerCase()));

  const map: Record<string, string> = {};
  (data || []).forEach((p) => {
    if (p.email) map[p.email.toLowerCase()] = p.id;
  });
  return map;
}

export async function importBulkPayments(
  rows: PaymentImportRow[]
): Promise<PaymentImportResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const results: PaymentImportResult[] = [];

  // Pre-fetch all packages for name matching
  const { data: packages } = await admin
    .from("packages")
    .select("id, name, session_count, validity_days");
  const pkgMap = new Map<string, { id: string; session_count: number; validity_days: number }>();
  (packages || []).forEach((p: { id: string; name: string; session_count: number; validity_days: number }) => {
    pkgMap.set(p.name.toLowerCase(), { id: p.id, session_count: p.session_count, validity_days: p.validity_days });
  });

  // Pre-fetch all player emails
  const emails = [...new Set(rows.map((r) => r.email.toLowerCase()))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("email", emails);
  const playerMap = new Map<string, string>();
  (profiles || []).forEach((p: { id: string; email: string | null }) => {
    if (p.email) playerMap.set(p.email.toLowerCase(), p.id);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const row of rows) {
    const email = row.email.toLowerCase();
    const pkgName = row.package.toLowerCase();

    // Look up player
    const playerId = playerMap.get(email);
    if (!playerId) {
      results.push({ email, package: row.package, amount: row.amount, status: "error", error: "Player not found" });
      continue;
    }

    // Look up package
    const pkg = pkgMap.get(pkgName);
    if (!pkg) {
      results.push({ email, package: row.package, amount: row.amount, status: "error", error: "Package not found" });
      continue;
    }

    try {
      // Calculate dates
      const startDate = parseDate(row.date);
      if (!startDate) {
        results.push({ email, package: row.package, amount: row.amount, status: "error", error: "Invalid date" });
        continue;
      }

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + pkg.validity_days);

      // Subscription status based on end_date vs today
      const subStatus = endDate < today ? "expired" : "active";

      // Create subscription
      const { data: subscription, error: subError } = await admin
        .from("subscriptions")
        .insert({
          player_id: playerId,
          package_id: pkg.id,
          sessions_remaining: subStatus === "expired" ? 0 : pkg.session_count,
          sessions_total: pkg.session_count,
          start_date: formatDateYMD(startDate),
          end_date: formatDateYMD(endDate),
          status: subStatus,
        })
        .select("id")
        .single();

      if (subError) {
        results.push({ email, package: row.package, amount: row.amount, status: "error", error: subError.message });
        continue;
      }

      // Create payment (always confirmed for historical import)
      const method = row.method.toLowerCase().includes("instapay") ? "instapay" : "cash";
      const { error: payError } = await admin.from("payments").insert({
        player_id: playerId,
        subscription_id: subscription.id,
        amount: row.amount,
        method,
        status: "confirmed",
        confirmed_at: formatDateYMD(startDate) + "T00:00:00",
      });

      if (payError) {
        results.push({ email, package: row.package, amount: row.amount, status: "error", error: payError.message });
        continue;
      }

      results.push({ email, package: row.package, amount: row.amount, status: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      results.push({ email, package: row.package, amount: row.amount, status: "error", error: msg });
    }
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");

  return results;
}
