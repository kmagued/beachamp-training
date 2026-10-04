"use client";

import { useState } from "react";
import Link from "next/link";
import { Cake, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { WhatsappSendDrawer } from "@/components/whatsapp/WhatsappSendDrawer";
import type { BirthdayEntry } from "@/lib/birthdays/celebrations";
import { ageLine, shortDate, timeLabel } from "@/lib/birthdays/format";

interface BirthdaysCardProps {
  entries: BirthdayEntry[];
  /** Today in Cairo (YYYY-MM-DD) */
  today: string;
}

export function BirthdaysCard({ entries, today }: BirthdaysCardProps) {
  // Clicking a birthday opens the WhatsApp drawer with the birthday template, to their phone
  const [wishing, setWishing] = useState<BirthdayEntry | null>(null);

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
              className="py-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4"
            >
              <button
                type="button"
                onClick={() => setWishing(e)}
                title="Send birthday wishes on WhatsApp"
                className="min-w-0 -mx-2 px-2 py-1 rounded-lg text-left flex items-center gap-2 hover:bg-sand/40 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-primary-900">
                    {e.player.firstName} {e.player.lastName}
                  </span>
                  <span className="text-sm text-primary-700/60"> {ageLine(e, today)}</span>
                </span>
              </button>

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

      <WhatsappSendDrawer
        open={wishing !== null}
        onClose={() => setWishing(null)}
        playerId={wishing?.player.id ?? ""}
        playerName={wishing ? `${wishing.player.firstName} ${wishing.player.lastName}` : ""}
        playerPhone={wishing?.player.phone ?? null}
        preferPurpose="birthday"
        profileHref={wishing ? `/admin/players/${wishing.player.id}` : undefined}
      />
    </Card>
  );
}
