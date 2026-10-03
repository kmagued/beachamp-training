import Link from "next/link";
import { Cake } from "lucide-react";
import { Card } from "@/components/ui";
import type { BirthdayEntry } from "@/lib/birthdays/celebrations";
import { ageLine, shortDate, timeLabel } from "@/lib/birthdays/format";

interface BirthdaysCardProps {
  entries: BirthdayEntry[];
  /** Today in Cairo (YYYY-MM-DD) */
  today: string;
}

export function BirthdaysCard({ entries, today }: BirthdaysCardProps) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2">
          <Cake className="w-5 h-5 text-secondary" />
          Birthdays to celebrate
        </h2>
        <span className="text-xs text-primary-700/50">Next 7 days</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-primary-700/60">No birthdays in the next 7 days.</p>
      ) : (
        <ul className="divide-y divide-primary-100/60">
          {entries.map((e) => (
            <li
              key={`${e.player.id}_${e.birthday}`}
              className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/players/${e.player.id}`}
                  className="font-medium text-primary-900 hover:underline"
                >
                  {e.player.firstName} {e.player.lastName}
                </Link>
                <span className="text-sm text-primary-700/60"> {ageLine(e, today)}</span>
              </div>

              {e.session ? (
                <Link
                  href={`/admin/sessions/${e.session.id}?date=${e.session.date}`}
                  className="text-sm text-primary-800 hover:underline sm:text-right shrink-0"
                >
                  {e.session.date === today && (
                    <span className="mr-1.5 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Today
                    </span>
                  )}
                  {e.session.label} · {shortDate(e.session.date)} · {timeLabel(e.session.startTime)}
                </Link>
              ) : (
                <span className="text-sm text-primary-700/50 sm:text-right shrink-0">No session this week</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
