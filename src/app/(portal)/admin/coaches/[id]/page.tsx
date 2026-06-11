import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Users, Clock, CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday-first (Egypt locale)

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

interface CoachSession {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  session_type: string | null;
  groups: { id: string; name: string } | null;
}

export default async function CoachDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [{ data: profile }, { data: groupRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, area, is_active, created_at")
      .eq("id", id)
      .eq("is_coach", true)
      .single(),
    supabase
      .from("coach_groups")
      .select("is_active, groups(id, name, level)")
      .eq("coach_id", id)
      .eq("is_active", true),
    supabase
      .from("schedule_sessions")
      .select("id, day_of_week, start_time, end_time, session_type, groups(id, name)")
      .eq("coach_id", id)
      .eq("is_active", true)
      .order("start_time"),
  ]);

  if (!profile) notFound();

  const coach = profile as {
    id: string; first_name: string; last_name: string; email: string | null;
    phone: string | null; area: string | null; is_active: boolean; created_at: string;
  };
  const groups = ((groupRows || []) as { groups: { id: string; name: string; level: string } | null }[])
    .map((r) => r.groups)
    .filter((g): g is { id: string; name: string; level: string } => Boolean(g));
  const sessions = ((sessionRows || []) as CoachSession[]).slice().sort(
    (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time)
  );
  const initials = `${coach.first_name?.[0] ?? ""}${coach.last_name?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <Link
        href="/admin/coaches"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700/60 hover:text-primary-900 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Coaches
      </Link>

      {/* Header */}
      <Card className="mb-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0 bg-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl tracking-tight text-slate-900 truncate">
              {coach.first_name} {coach.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={coach.is_active ? "success" : "neutral"}>
                {coach.is_active ? "Active" : "Inactive"}
              </Badge>
              <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Joined {formatDate(coach.created_at)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{groups.length}</p>
            <p className="text-xs text-slate-400 mt-1">Group{groups.length === 1 ? "" : "s"}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{sessions.length}</p>
            <p className="text-xs text-slate-400 mt-1">Weekly session{sessions.length === 1 ? "" : "s"}</p>
          </div>
        </Card>
      </div>

      {/* Contact */}
      <Card className="mb-4 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Information</p>
        </div>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Email</p>
              {coach.email ? (
                <a href={`mailto:${coach.email}`} className="text-sm text-primary hover:underline">{coach.email}</a>
              ) : (
                <p className="text-sm text-slate-700">—</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Phone</p>
              {coach.phone ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-700">{coach.phone}</span>
                  <a
                    href={buildWhatsAppUrl(coach.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    WhatsApp
                  </a>
                </div>
              ) : (
                <p className="text-sm text-slate-700">—</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <p className="text-xs text-slate-400">Area</p>
              <p className="text-sm text-slate-700 capitalize">{coach.area || "—"}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Groups */}
      <Card className="mb-4 p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned Groups</p>
        </div>
        {groups.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/admin/groups/${g.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-medium text-slate-900">{g.name}</span>
                <Badge variant="info" className="capitalize">{g.level}</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">Not assigned to any group yet</p>
        )}
      </Card>

      {/* Weekly schedule */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Weekly Schedule</p>
        </div>
        {sessions.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-semibold text-slate-500 w-10 shrink-0">{DAY_NAMES[s.day_of_week]?.slice(0, 3)}</span>
                  <span className="text-sm font-medium text-slate-900 truncate">
                    {s.session_type === "private" ? "Private session" : (s.groups?.name || "Session")}
                  </span>
                </div>
                <span className="text-xs text-slate-500 inline-flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatTime(s.start_time)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">No sessions scheduled</p>
        )}
      </Card>
    </div>
  );
}
