import { redirect } from "next/navigation";

/**
 * Payments now lives as a tab inside Finances. This route stays as a redirect because
 * links to it are already stored in admin notifications (see player/subscribe/actions.ts)
 * and on the dashboard, and those must keep working. Query params are carried across so
 * `?statusFilter=Pending` still lands on the pending list.
 */
export default async function AdminPaymentsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) params.set(key, v);
  }
  params.set("tab", "payments");
  redirect(`/admin/finances?${params.toString()}`);
}
