import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Card, Badge, buttonVariants, buttonSizes } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { egp } from "@/lib/merch/format";
import type { PlayerPrivateSessions, UpcomingSession } from "@/lib/private-sessions/load";

/** Upcoming private sessions with where each payment stands, then requests waiting for an
 *  admin. Nothing at all when the player has neither. */
export function PrivateSessionsCard({ data }: { data: PlayerPrivateSessions }) {
  if (data.pending.length === 0 && data.upcoming.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary-700/50" />
          Private sessions
        </h2>
        <Link href="/player/private-sessions" className="text-xs font-medium text-primary hover:text-primary-700">
          View all
        </Link>
      </div>

      {data.upcoming.length > 0 && (
        <ul className="divide-y divide-primary-100">
          {data.upcoming.map((s) => (
            <UpcomingRow key={s.id} session={s} />
          ))}
        </ul>
      )}

      {data.pending.length > 0 && (
        <div className={cn(data.upcoming.length > 0 && "mt-4 pt-4 border-t border-primary-100")}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-700/50 mb-2">
            Waiting for confirmation
          </p>
          <ul className="space-y-1.5">
            {data.pending.map((r) => (
              <li key={r.id}>
                <Link
                  href="/player/private-sessions"
                  className="flex items-center justify-between gap-3 text-sm text-primary-900 hover:text-primary"
                >
                  <span>
                    {r.when}
                    {r.coach && <span className="text-primary-700/60"> · with {r.coach}</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-primary-700/40 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function UpcomingRow({ session: s }: { session: UpcomingSession }) {
  const details = [s.coach && `with ${s.coach}`, s.others.length > 0 && `and ${s.others.join(", ")}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary-900">{s.when}</p>
        {details && <p className="text-xs text-primary-700/60">{details}</p>}
        {!s.youPay && s.state && s.payerFirstName && (
          <p className="text-xs text-primary-700/60 mt-0.5">{s.payerFirstName} pays for this session</p>
        )}
      </div>
      <div className="shrink-0">
        {s.pay ? (
          <Link
            href={`/player/subscribe?package=${s.pay.packageId}&privateSession=${s.id}`}
            className={cn(buttonVariants.primary, buttonSizes.sm, "inline-flex items-center px-4")}
          >
            Pay {egp(s.pay.price)}
          </Link>
        ) : s.state === "pending" ? (
          <Badge variant="warning">Payment under review</Badge>
        ) : s.state === "paid" ? (
          <Badge variant="success">Paid</Badge>
        ) : s.state === "unpaid" ? (
          <Badge variant="neutral">Not paid yet</Badge>
        ) : null}
      </div>
    </li>
  );
}
