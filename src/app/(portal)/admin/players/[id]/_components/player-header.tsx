import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils/format-date";
import type { PlayerProfile } from "./types";

interface PlayerHeaderProps {
  player: PlayerProfile;
  hasActiveSubscription: boolean;
  actions?: React.ReactNode;
}

export function PlayerHeader({ player, hasActiveSubscription, actions }: PlayerHeaderProps) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.18em]">
          Player Profile
        </p>
        <h1 className="font-display text-3xl sm:text-4xl text-primary-900 mt-1.5 tracking-tight">
          {player.first_name} {player.last_name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-primary-700/60">
          <Badge variant={hasActiveSubscription ? "success" : "neutral"}>
            {hasActiveSubscription ? "Active" : "Inactive"}
          </Badge>
          {player.email && <span>{player.email}</span>}
          {player.email && player.phone && <span className="text-primary-700/30">·</span>}
          {player.phone && <span>{player.phone}</span>}
          <span className="text-primary-700/40">· Registered {formatDate(player.created_at)}</span>
        </div>
      </div>
      {actions}
    </div>
  );
}
