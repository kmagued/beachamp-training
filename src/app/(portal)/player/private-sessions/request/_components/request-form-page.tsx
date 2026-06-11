"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Card, Textarea, Skeleton } from "@/components/ui";
import { ArrowLeft, Loader2, ChevronLeft, ChevronRight, Sunrise, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { createPrivateSessionRequest, getPrivateSessionAvailability } from "@/app/_actions/private-sessions";

interface Coach {
  id: string;
  first_name: string;
  last_name: string;
}

interface ReservedSlot {
  start_time: string;
  end_time: string;
  kind: "group" | "private" | "block";
  reason?: string | null;
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

// A private session books a fixed-length window; availability must reflect the
// WHOLE window, not just the 30-min grid cell the player taps.
const BOOKING_MINUTES = 90;
const DAY_END_MIN = 24 * 60; // a booking must finish by midnight

function toMinutes(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/** Does a full booking starting at this slot finish before end of day? */
function bookingFits(slotTime: string) {
  return toMinutes(slotTime) + BOOKING_MINUTES <= DAY_END_MIN;
}

// Group the slot grid by part of day so it reads as a schedule, not a wall of buttons.
const TIME_PERIODS = [
  { label: "Morning", icon: Sunrise, from: 6 * 60, to: 12 * 60 },
  { label: "Afternoon", icon: Sun, from: 12 * 60, to: 17 * 60 },
  { label: "Evening", icon: Moon, from: 17 * 60, to: 24 * 60 },
] as const;

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
  const end = start + BOOKING_MINUTES;
  return reserved.some((r) => {
    const rs = toMinutes(r.start_time);
    const re = toMinutes(r.end_time);
    return start < re && end > rs;
  });
}

function reservationAt(slotTime: string, reserved: ReservedSlot[]): ReservedSlot | undefined {
  const start = toMinutes(slotTime);
  const end = start + BOOKING_MINUTES;
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
    // With multiple coaches and none chosen we can't resolve a single calendar,
    // so prompt the player to pick a coach first (server returns needsCoach too).
    if (!selectedCoachId && coaches.length > 1) {
      setReserved([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    (async () => {
      // Availability is computed server-side (admin client) because RLS hides
      // coach blocks and other players' requests from the player's own session.
      const { busy } = await getPrivateSessionAvailability({
        date: formatDateISO(selectedDate),
        coachId: selectedCoachId || undefined,
      });
      if (cancelled) return;
      setReserved(busy);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCoachId, selectedDate]);

  function handleSlotClick(time: string) {
    if (isSlotReserved(time, reserved) || !bookingFits(time)) return;
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
      duration_minutes: BOOKING_MINUTES,
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

  const availableCount = useMemo(
    () => TIME_SLOTS.slice(0, -1).filter((t) => bookingFits(t) && !reservationAt(t, reserved)).length,
    [reserved],
  );
  const showSlots = Boolean(selectedCoachId) || coaches.length <= 1;

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
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-900">3. Pick a Time</h2>
            {!loading && showSlots && (
              <span
                className={cn(
                  "text-[11px] font-medium tabular-nums",
                  availableCount > 0 ? "text-emerald-600" : "text-slate-400",
                )}
              >
                {availableCount > 0 ? `${availableCount} open` : "Fully booked"}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Sessions run 1 hr 30 min · choose an open start time
          </p>

          {loading ? (
            <div className="space-y-5">
              {[8, 6].map((count, gi) => (
                <div key={gi}>
                  <Skeleton className="h-3 w-20 rounded mb-3" />
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {Array.from({ length: count }).map((_, i) => (
                      <Skeleton key={i} className="h-10 rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : !showSlots ? (
            <p className="text-sm text-slate-400 text-center py-10">
              Choose a coach to see available times.
            </p>
          ) : (
            <div className="space-y-5">
              {TIME_PERIODS.map((period) => {
                const slots = TIME_SLOTS.slice(0, -1).filter((t) => {
                  const m = toMinutes(t);
                  return m >= period.from && m < period.to;
                });
                if (slots.length === 0) return null;
                const Icon = period.icon;
                return (
                  <div key={period.label}>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {period.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {slots.map((time) => {
                        const reservation = reservationAt(time, reserved);
                        const fits = bookingFits(time);
                        const unavailable = !!reservation || !fits;
                        const isSelected = selectedTime === time;
                        return (
                          <button
                            key={time}
                            type="button"
                            disabled={unavailable}
                            onClick={() => handleSlotClick(time)}
                            className={cn(
                              "px-2 py-2.5 rounded-lg border text-[13px] font-medium transition-all duration-150",
                              isSelected
                                ? "border-primary bg-primary text-white shadow-sm shadow-primary/25"
                                : unavailable
                                  ? "border-transparent bg-slate-50 text-slate-300 cursor-not-allowed"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-primary hover:text-primary hover:-translate-y-0.5 hover:shadow-sm",
                            )}
                            title={
                              reservation
                                ? reservation.kind === "block"
                                  ? "Coach unavailable"
                                  : `Reserved (${reservation.kind === "private" ? "private session" : "group session"})`
                                : !fits
                                  ? "Not enough time before midnight"
                                  : "Available"
                            }
                          >
                            {formatLabel(time)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
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
