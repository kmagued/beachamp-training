import { Card, Badge } from "@/components/ui";
import {
  Phone, Mail, MapPin, Calendar, User,
  Activity, Heart, Target, Ruler, Hand, Shield, Users,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { PlayerProfile } from "./types";

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-800 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-primary-900 mt-0.5 break-words">{value || "—"}</p>
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-primary-700/40">—</span>;
  switch (level) {
    case "beginner": return <Badge variant="info">Beginner</Badge>;
    case "intermediate": return <Badge variant="info">Intermediate</Badge>;
    case "advanced": return <Badge variant="success">Advanced</Badge>;
    case "professional": return <Badge variant="success">Professional</Badge>;
    default: return <Badge variant="neutral">{level}</Badge>;
  }
}

export function ProfileCard({ player }: { player: PlayerProfile }) {
  const isMinor = player.date_of_birth
    && Math.floor((Date.now() - new Date(player.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) < 16
    && (player.guardian_name || player.guardian_phone);

  return (
    <Card className="mb-6">
      <div className="grid sm:grid-cols-2 gap-6 sm:gap-8">
        {/* Personal Details */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-secondary" />
            <h2 className="font-display text-xl tracking-wide text-primary-900">Personal Details</h2>
          </div>
          <div className="space-y-3.5">
            <InfoItem icon={<Calendar className="w-4 h-4" />} label="Date of Birth" value={player.date_of_birth ? formatDate(player.date_of_birth) : null} />
            <InfoItem icon={<Phone className="w-4 h-4" />} label="Phone" value={player.phone} />
            <InfoItem icon={<Mail className="w-4 h-4" />} label="Email" value={player.email} />
            <InfoItem icon={<MapPin className="w-4 h-4" />} label="Area" value={player.area} />
            <InfoItem icon={<User className="w-4 h-4" />} label="Gender" value={player.gender ? player.gender.charAt(0).toUpperCase() + player.gender.slice(1) : null} />
          </div>
        </div>

        {/* Training Details */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-accent" />
            <h2 className="font-display text-xl tracking-wide text-primary-900">Training Details</h2>
          </div>
          <div className="space-y-3.5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-800 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">Playing Level</p>
                <div className="mt-1"><LevelBadge level={player.playing_level} /></div>
              </div>
            </div>
            <InfoItem icon={<Target className="w-4 h-4" />} label="Training Goals" value={player.training_goals} />
            <InfoItem icon={<Heart className="w-4 h-4" />} label="Health Conditions" value={player.health_conditions} />
            <InfoItem icon={<Ruler className="w-4 h-4" />} label="Height / Weight" value={`${player.height ? `${player.height} cm` : "—"} / ${player.weight ? `${player.weight} kg` : "—"}`} />
            <InfoItem icon={<Hand className="w-4 h-4" />} label="Preferred Hand" value={player.preferred_hand ? player.preferred_hand.charAt(0).toUpperCase() + player.preferred_hand.slice(1) : null} />
            <InfoItem icon={<Shield className="w-4 h-4" />} label="Preferred Position" value={player.preferred_position ? player.preferred_position.charAt(0).toUpperCase() + player.preferred_position.slice(1) : null} />
          </div>
        </div>
      </div>

      {/* Guardian info (under 16) */}
      {isMinor && (
        <div className="mt-6 pt-6 border-t border-primary-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full bg-accent-600" />
            <h2 className="font-display text-xl tracking-wide text-primary-900">Guardian Information</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoItem icon={<Users className="w-4 h-4" />} label="Guardian Name" value={player.guardian_name} />
            <InfoItem icon={<Phone className="w-4 h-4" />} label="Guardian Phone" value={player.guardian_phone} />
          </div>
        </div>
      )}
    </Card>
  );
}
