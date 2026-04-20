"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Card, Textarea, Skeleton } from "@/components/ui";
import { ArrowLeft, Loader2, Calendar } from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { createPrivateSessionRequest } from "@/app/_actions/private-sessions";

interface Coach {
  id: string;
  first_name: string;
  last_name: string;
}

interface ScheduleSlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

// Saturday-first week (Egypt locale)
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Generate 30-min time labels from 06:00 to 22:00
const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 22) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function formatLabel(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return m === "00" ? `${h12} ${ampm}` : `${h12}:${m}`;
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function isBusy(day: number, slotTime: string, busyByDay: Map<number, ScheduleSlot[]>) {
  const slots = busyByDay.get(day);
  if (!slots) return false;
  const slotStart = toMinutes(slotTime);
  const slotEnd = slotStart + 30;
  return slots.some((s) => {
    const bStart = toMinutes(s.start_time);
    const bEnd = toMinutes(s.end_time);
    return slotStart < bEnd && slotEnd > bStart;
  });
}

export function RequestFormPage({ coaches }: { coaches: Coach[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [coachSchedule, setCoachSchedule] = useState<ScheduleSlot[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ day: number; time: string } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (!selectedCoachId) {
      setCoachSchedule([]);
      return;
    }
    setLoadingSchedule(true);
    setSelectedSlot(null);
    async function fetchSchedule() {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("schedule_sessions")
        .select("day_of_week, start_time, end_time")
        .eq("coach_id", selectedCoachId)
        .eq("is_active", true)
        .or(`end_date.is.null,end_date.gte.${today}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slots: ScheduleSlot[] = (data || []).map((s: any) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
      }));

      setCoachSchedule(slots);
      setLoadingSchedule(false);
    }
    fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoachId]);

  const busyByDay = useMemo(() => {
    const map = new Map<number, ScheduleSlot[]>();
    for (const slot of coachSchedule) {
      const existing = map.get(slot.day_of_week) || [];
      existing.push(slot);
      map.set(slot.day_of_week, existing);
    }
    return map;
  }, [coachSchedule]);

  function handleSlotClick(day: number, time: string) {
    if (isBusy(day, time, busyByDay)) return;
    setSelectedSlot({ day, time });
  }

  function handleSubmit(formData: FormData) {
    setError(null);

    const dayOfWeek = selectedSlot
      ? selectedSlot.day
      : Number(formData.get("requested_day_of_week"));
    const time = selectedSlot
      ? selectedSlot.time
      : (formData.get("requested_time") as string);

    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !time) {
      setError("Please select a day and time");
      return;
    }

    const data = {
      coach_id: (formData.get("coach_id") as string) || undefined,
      requested_day_of_week: dayOfWeek,
      requested_time: time,
      duration_minutes: Number(formData.get("duration_minutes")) || 60,
      notes: (formData.get("notes") as string) || undefined,
    };

    startTransition(async () => {
      const result = await createPrivateSessionRequest(data);
      if ("error" in result) {
        setError(result.error ?? "Failed to create request");
      } else {
        router.push("/player/private-sessions");
      }
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <Link
        href="/player/private-sessions"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Private Sessions
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Request Private Session</h1>
        <p className="text-slate-500 text-sm">Choose a coach, pick a time slot, and submit your request</p>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Step 1: Coach */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">1. Choose a Coach</h2>
          <Select
            name="coach_id"
            value={selectedCoachId}
            onChange={(e) => setSelectedCoachId(e.target.value)}
          >
            <option value="">Any available coach</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </Select>
        </Card>

        {/* Step 2: Schedule Grid */}
        {selectedCoachId && (
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 mb-1">2. Pick an Available Slot</h2>
            <p className="text-xs text-slate-400 mb-3">Tap a white cell to select a time. Red cells are busy with group sessions.</p>

            {loadingSchedule ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-100 px-2 py-2 text-slate-400 font-medium border-b border-r border-slate-200 w-14"></th>
                        {DAY_ORDER.map((d) => (
                          <th
                            key={d}
                            className="bg-slate-100 px-1 py-2 text-slate-500 font-semibold border-b border-slate-200 min-w-[48px] text-center"
                          >
                            {DAY_LABELS[d]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map((time) => {
                        const isHour = time.endsWith(":00");
                        return (
                          <tr key={time}>
                            <td className={`sticky left-0 z-10 bg-white px-2 py-0 text-slate-400 font-medium border-r border-slate-200 text-right whitespace-nowrap ${isHour ? "border-t border-slate-100" : ""}`}>
                              {isHour ? formatLabel(time) : ""}
                            </td>
                            {DAY_ORDER.map((d) => {
                              const busy = isBusy(d, time, busyByDay);
                              const isSelected = selectedSlot?.day === d && selectedSlot?.time === time;
                              return (
                                <td
                                  key={d}
                                  onClick={() => handleSlotClick(d, time)}
                                  className={`
                                    h-6 border-slate-100 text-center transition-colors
                                    ${isHour ? "border-t" : ""}
                                    ${busy
                                      ? "bg-red-100 cursor-not-allowed"
                                      : isSelected
                                        ? "bg-primary text-white cursor-pointer"
                                        : "bg-white hover:bg-emerald-50 cursor-pointer"
                                    }
                                  `}
                                />
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" /> Busy</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-slate-200 inline-block" /> Available</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" /> Selected</span>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Details */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            {selectedCoachId ? "3. Confirm Details" : "2. Session Details"}
          </h2>
          <div className="space-y-4">
            {selectedSlot ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-emerald-800">
                  {DAY_LABELS_FULL[selectedSlot.day]} at {formatLabel(selectedSlot.time)}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">Tap a different slot above to change</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Day</label>
                  <Select name="requested_day_of_week" defaultValue="">
                    <option value="" disabled>Select day...</option>
                    {DAY_LABELS_FULL.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Time</label>
                  <Input name="requested_time" type="time" required />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Duration</label>
              <Select name="duration_minutes" defaultValue="60">
                <option value="30">30 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">120 min</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Notes (optional)</label>
              <Textarea name="notes" placeholder="Any special requests or details..." rows={3} />
            </div>
          </div>
        </Card>

        <Button type="submit" fullWidth disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
            </span>
          ) : "Submit Request"}
        </Button>
      </form>
    </div>
  );
}
