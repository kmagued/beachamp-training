import { Badge } from "@/components/ui";
import type { PlayerProfile } from "./types";

interface PlayerHeaderProps {
  player: PlayerProfile;
  actions?: React.ReactNode;
}

export function PlayerHeader({ player, actions }: PlayerHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {player.first_name} {player.last_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-500">
            {player.email && <span>{player.email}</span>}
            {player.email && player.phone && <span className="text-slate-300">&middot;</span>}
            {player.phone && <span>{player.phone}</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={player.is_active ? "success" : "neutral"}>
              {player.is_active ? "Active" : "Inactive"}
            </Badge>
            <span className="text-xs text-slate-400">
              Registered {new Date(player.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {actions}
      </div>
    </div>
  );
}
