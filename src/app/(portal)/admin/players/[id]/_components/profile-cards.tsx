import { Card, Badge } from "@/components/ui";
import {
  Phone, Mail, MapPin, Calendar,
  Activity, Heart, Target,
} from "lucide-react";
import type { PlayerProfile } from "./types";

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-slate-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-700">{value || "—"}</p>
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-slate-400">—</span>;
  switch (level) {
    case "beginner": return <Badge variant="info">Beginner</Badge>;
    case "intermediate": return <Badge variant="info">Intermediate</Badge>;
    case "advanced": return <Badge variant="success">Advanced</Badge>;
    case "professional": return <Badge variant="success">Professional</Badge>;
    default: return <Badge variant="neutral">{level}</Badge>;
  }
}

export function ProfileCard({ player }: { player: PlayerProfile }) {
  return (
    <Card className="mb-6">
      <div className="grid sm:grid-cols-2 gap-6">
        {/* Personal Details */}
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Personal Details</h2>
          <div className="space-y-3">
            <InfoItem icon={<Calendar className="w-4 h-4" />} label="Date of Birth" value={player.date_of_birth ? new Date(player.date_of_birth).toLocaleDateString() : null} />
            <InfoItem icon={<Phone className="w-4 h-4" />} label="Phone" value={player.phone} />
            <InfoItem icon={<Mail className="w-4 h-4" />} label="Email" value={player.email} />
            <InfoItem icon={<MapPin className="w-4 h-4" />} label="Area" value={player.area} />
          </div>
        </div>

        {/* Training Details */}
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Training Details</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="text-slate-400 mt-0.5"><Activity className="w-4 h-4" /></div>
              <div>
                <p className="text-xs text-slate-400">Playing Level</p>
                <div className="mt-0.5"><LevelBadge level={player.playing_level} /></div>
              </div>
            </div>
            <InfoItem icon={<Target className="w-4 h-4" />} label="Training Goals" value={player.training_goals} />
            <InfoItem icon={<Heart className="w-4 h-4" />} label="Health Conditions" value={player.health_conditions} />
          </div>
        </div>
      </div>
    </Card>
  );
}
