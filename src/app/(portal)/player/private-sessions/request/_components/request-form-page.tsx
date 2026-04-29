"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Card, Textarea, Skeleton } from "@/components/ui";
import { ArrowLeft, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils/cn";
import { createPrivateSessionRequest } from "@/app/_actions/private-sessions";

interface Coach {
  id: string;
  first_name: string;
  last_name: string;
}

interface ReservedSlot {
  start_time: string;
  end_time: string;
  kind: "group" | "private";
}

const DAY_LABELS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LABELS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// 30-min time slots from 06:00 through 24:00 (midnight)
const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 24; h++) {
  TIME_SLOTS.push(`${String(h % 24).padStart(2, "0")}:00`);
  if (h < 24) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const DAYS_TO_SHOW = 28;

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatLabel(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  if (hour === 0) return m === "00" ? "12 AM" : `12:${m} AM`;
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return m === "00" ? `${h12} ${ampm}` : `${h12}:${m} ${ampm}`;
}

function formatDateISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSlotReserved(slotTime: string, reserved: ReservedSlot[]) {
  const start = toMinutes(slotTime);
  const end = start + 30;
  return reserved.some((r) => {
    const rs = toMinutes(r.start_time);
    const re = toMinutes(r.end_time);
    return start < re && end > rs;
  });
}

function reservationAt(slotTime: string, reserved: ReservedSlot[]): ReservedSlot | undefined {
  const start = toMinutes(slotTime);
  const end = start + 30;
  return reserved.find((r) => {
    const rs = toMinutes(r.start_time);
    const re = toMinutes(r.end_time);
    return start < re && end > rs;
  });
}

export function RequestFormPage({ coaches }: { coaches: Coach[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [reserved, setReserved] = useState<ReservedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [dateRangeStart, setDateRangeStart] = useState<Date>(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const dateOptions = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const d = new Date(dateRangeStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [dateRangeStart]);

  useEffect(() => {
    setSelectedTime(null);
    if (!selectedCoachId && coaches.length > 1) {
      setReserved([]);
      return;
    }

    setLoading(true);
    async function fetchReservations() {
      const dateStr = formatDateISO(selectedDate);
      const dow = selectedDate.getDay();

      // 1. Recurring schedule sessions on that day-of-week
      let scheduleQuery = supabase
        .from("schedule_sessions")
        .select("id, day_of_week, start_time, end_time, end_date, is_active, session_type, coach_id")
        .eq("day_of_week", dow)
        .eq("is_active", true)
        .or(`end_date.is.null,end_date.gte.${dateStr}`);
      if (selectedCoachId) scheduleQuery = scheduleQuery.eq("coach_id", selectedCoachId);
      const { data: scheduleRows } = await scheduleQuery;

      const sessionIds = (scheduleRows || []).map((r: { id: string }) => r.id);

      // 2. Cancellations for those sessions on that date
      const cancelledSet = new Set<string>();
      if (sessionIds.length > 0) {
        const { data: cancellations } = await supabase
          .from("schedule_session_cancellations")
          .select("schedule_session_id")
          .in("schedule_session_id", sessionIds)
          .eq("cancelled_date", dateStr);
        for (const c of cancellations || []) cancelledSet.add(c.schedule_session_id as string);
      }

      const recurringReservations: ReservedSlot[] = (scheduleRows || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => !cancelledSet.has(r.id))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({
          start_time: r.start_time,
          end_time: r.end_time,
          kind: r.session_type === "private" ? "private" : "group",
        }));

      // 3. Pending/confirmed private session requests on this exact date (or matching dow legacy rows without a date)
      let reqQuery = supabase
        .from("private_session_requests")
        .select("id, coach_id, requested_day_of_week, requested_date, requested_time, duration_minutes, status")
        .in("status", ["pending", "confirmed"])
        .or(`requested_date.eq.${dateStr},and(requested_date.is.null,requested_day_of_week.eq.${dow})`);
      if (selectedCoachId) reqQuery = reqQuery.eq("coach_id", selectedCoachId);
      const { data: requestRows } = await reqQuery;

      const requestReservations: ReservedSlot[] = (requestRows || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => {
          const start = r.requested_time as string;
          const startMins = toMinutes(start);
          const endMins = startMins + (r.duration_minutes || 60);
          const eh = Math.floor(endMins / 60) % 24;
          const em = endMins % 60;
          const end = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
          return { start_time: start, end_time: end, kind: "private" as const };
        },
      );

      setReserved([...recurringReservations, ...requestReservations]);
      setLoading(false);
    }
    fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoachId, selectedDate]);

  function handleSlotClick(time: string) {
    if (isSlotReserved(time, reserved)) return;
    setSelectedTime(time);
  }

  function handleSubmit() {
    setError(null);
    if (!selectedTime) {
      setError("Please pick an available time slot");
      return;
    }

    const data = {
      coach_id: selectedCoachId || undefined,
      requested_date: formatDateISO(selectedDate),
      requested_day_of_week: selectedDate.getDay(),
      requested_time: selectedTime,
      duration_minutes: 90,
      notes: notes.trim() || undefined,
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

  const today = startOfDay(new Date());
  const isSelectedToday = selectedDate.getTime() === today.getTime();

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
        <p className="text-slate-500 text-sm">Pick a coach, choose a date, and select an available time</p>
      </div>

      <div className="space-y-6">
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

        {/* Step 2: Date picker */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">2. Pick a Date</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(dateRangeStart);
                  d.setDate(d.getDate() - 7);
                  if (d < today) {
                    setDateRangeStart(today);
                  } else {
                    setDateRangeStart(d);
                  }
                }}
                disabled={dateRangeStart.getTime() <= today.getTime()}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Earlier dates"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(dateRangeStart);
                  d.setDate(d.getDate() + 7);
                  setDateRangeStart(d);
                }}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                aria-label="Later dates"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {dateOptions.map((d) => {
              const isSelected = d.getTime() === selectedDate.getTime();
              const isToday = d.getTime() === today.getTime();
              const isPast = d.getTime() < today.getTime();
              return (
                <button
                  key={d.getTime()}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "shrink-0 w-14 sm:w-16 py-2 rounded-lg border text-center transition-all",
                    isPast && "opacity-30 cursor-not-allowed",
                    isSelected
                      ? "border-primary bg-primary text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                  )}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                    {DAY_LABELS_SHORT[d.getDay()]}
                  </div>
                  <div className="text-base font-bold leading-tight">{d.getDate()}</div>
                  <div className="text-[10px] opacity-70">
                    {d.toLocaleString("en-US", { month: "short" })}
                  </div>
                  {isToday && (
                    <div className="text-[9px] mt-0.5 uppercase tracking-wider opacity-80">Today</div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {DAY_LABELS_FULL[selectedDate.getDay()]},{" "}
            {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            {isSelectedToday && " · Today"}
          </p>
        </Card>

        {/* Step 3: Time slots */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">3. Pick a Time</h2>
          <p className="text-xs text-slate-400 mb-3">
            Tap a green slot to select it. Red slots are already reserved.
          </p>

          {loading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : !selectedCoachId && coaches.length > 1 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              Choose a coach to see availability for this date.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {TIME_SLOTS.slice(0, -1).map((time) => {
                  const reservation = reservationAt(time, reserved);
                  const reservedFlag = !!reservation;
                  const isSelected = selectedTime === time;
                  return (
                    <button
                      key={time}
                      type="button"
                      disabled={reservedFlag}
                      onClick={() => handleSlotClick(time)}
                      className={cn(
                        "px-2 py-2 rounded-md border text-xs font-medium transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : reservedFlag
                            ? "border-red-200 bg-red-50 text-red-400 cursor-not-allowed"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300",
                      )}
                      title={
                        reservedFlag
                          ? `Reserved (${reservation?.kind === "private" ? "private session" : "group session"})`
                          : "Available"
                      }
                    >
                      {formatLabel(time)}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 inline-block" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" />
                  Reserved
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-primary inline-block" />
                  Selected
                </span>
              </div>
            </>
          )}
        </Card>

        {/* Step 4: Notes & confirm */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">4. Confirm Details</h2>
          {selectedTime && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm font-medium text-emerald-800">
                {DAY_LABELS_FULL[selectedDate.getDay()]},{" "}
                {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} at{" "}
                {formatLabel(selectedTime)}
              </p>
            </div>
          )}
          <label className="text-xs font-medium text-slate-500 mb-1 block">
            Notes (optional)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special requests or details..."
            rows={3}
          />
        </Card>

        <Button onClick={handleSubmit} fullWidth disabled={isPending || !selectedTime}>
          {isPending ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
            </span>
          ) : (
            "Submit Request"
          )}
        </Button>
      </div>
    </div>
  );
}
