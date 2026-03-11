"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { Card, Button, Input, Select, Drawer, Toast } from "@/components/ui";
import { Calendar, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { createScheduleSession, updateScheduleSession, deleteScheduleSession } from "@/app/_actions/training";
import { formatTime } from "../../_components/types";
import type { ScheduleRow, CoachRow } from "./types";

const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ScheduleSectionProps {
  groupId: string;
  schedule: ScheduleRow[];
  coaches: CoachRow[];
  onRefresh: () => void;
}

export function ScheduleSection({ groupId, schedule, coaches, onRefresh }: ScheduleSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [editingSession, setEditingSession] = useState<ScheduleRow | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);
  const [endMode, setEndMode] = useState<"date" | "weeks">("date");
  const [numWeeks, setNumWeeks] = useState<string>("12");

  const expiredSchedules = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return new Set(schedule.filter((s) => s.end_date && s.end_date < today).map((s) => s.id));
  }, [schedule]);

  function resolveEndDate(formData: FormData) {
    if (endMode === "weeks") {
      const weeks = parseInt(numWeeks) || 12;
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + weeks * 7);
      formData.set("end_date", endDate.toISOString().split("T")[0]);
    }
    // If mode is "date", the form input already sets end_date
  }

  function handleCreateSession(formData: FormData) {
    setError(null);
    formData.set("group_id", groupId);
    resolveEndDate(formData);
    startTransition(async () => {
      const result = await createScheduleSession(formData);
      if ("error" in result) setError(result.error);
      else {
        setShowSessionDrawer(false);
        setToast({ message: "Session created", variant: "success" });
        onRefresh();
      }
    });
  }

  function handleUpdateSession(formData: FormData) {
    if (!editingSession) return;
    setError(null);
    resolveEndDate(formData);
    startTransition(async () => {
      const result = await updateScheduleSession(editingSession.id, formData);
      if ("error" in result) setError(result.error);
      else {
        setEditingSession(null);
        setToast({ message: "Session updated", variant: "success" });
        onRefresh();
      }
    });
  }

  function handleDeleteSession(id: string) {
    startTransition(async () => {
      const res = await deleteScheduleSession(id);
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed to delete session", variant: "error" });
      } else {
        setToast({ message: "Session deleted", variant: "success" });
      }
      onRefresh();
    });
  }

  function openAdd() {
    setEditingSession(null);
    setError(null);
    setEndMode("date");
    setNumWeeks("12");
    setShowSessionDrawer(true);
  }

  function openEdit(session: ScheduleRow) {
    setEditingSession(session);
    setError(null);
    setEndMode("date");
    setNumWeeks("12");
    setShowSessionDrawer(false);
  }

  const showForm = showSessionDrawer || editingSession !== null;

  return (
    <Card>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          Weekly Schedule
          <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{schedule.length}</span>
        </h2>
        <Button size="sm" onClick={openAdd}>
          <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Session</span><span className="sm:hidden">Add</span></span>
        </Button>
      </div>

      {schedule.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No schedule set. Add session slots for this group.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Day</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Time</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Coach</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Location</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Ends</th>
                  <th className="py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedule.map((s) => {
                  const isExpired = expiredSchedules.has(s.id);
                  return (
                  <tr key={s.id} className={isExpired ? "opacity-50 bg-slate-50/50" : "hover:bg-slate-50/50"}>
                    <td className="py-2.5 font-medium text-slate-900">{DAY_NAMES_FULL[s.day_of_week]}</td>
                    <td className="py-2.5 text-slate-600">{formatTime(s.start_time)} — {formatTime(s.end_time)}</td>
                    <td className="py-2.5 text-slate-600">{s.coach_name || "—"}</td>
                    <td className="py-2.5 text-slate-500">{s.location || "—"}</td>
                    <td className="py-2.5 text-slate-500">
                      {s.end_date ? (
                        <span className={isExpired ? "text-red-500 font-medium" : ""}>
                          {new Date(s.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {isExpired && <span className="text-[10px] ml-1">(ended)</span>}
                        </span>
                      ) : (
                        <span className="text-amber-500 flex items-center gap-1 text-xs">
                          <AlertCircle className="w-3 h-3" /> No end date
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="text-slate-400 hover:text-slate-600 p-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSession(s.id)}
                          disabled={isPending}
                          className="text-slate-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {schedule.map((s) => {
              const isExpired = expiredSchedules.has(s.id);
              return (
              <div key={s.id} className={`border border-slate-100 rounded-lg p-3 ${isExpired ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-900 text-sm">{DAY_NAMES_FULL[s.day_of_week]}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-slate-600 p-1">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s.id)}
                      disabled={isPending}
                      className="text-slate-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Time</span>
                    <p className="text-slate-700 font-medium">{formatTime(s.start_time)} — {formatTime(s.end_time)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Coach</span>
                    <p className="text-slate-700 font-medium">{s.coach_name || "—"}</p>
                  </div>
                  {s.location && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Location</span>
                      <p className="text-slate-700 font-medium">{s.location}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-slate-400">Ends</span>
                    {s.end_date ? (
                      <p className={isExpired ? "text-red-500 font-medium" : "text-slate-700 font-medium"}>
                        {new Date(s.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {isExpired && " (ended)"}
                      </p>
                    ) : (
                      <p className="text-amber-500 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> No end date
                      </p>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add/Edit Session Drawer */}
      <Drawer
        open={showForm}
        onClose={() => { setShowSessionDrawer(false); setEditingSession(null); }}
        title={editingSession ? "Edit Session" : "New Session Slot"}
      >
        <form action={editingSession ? handleUpdateSession : handleCreateSession} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Day</label>
            <Select name="day_of_week" defaultValue={editingSession?.day_of_week ?? ""}>
              {DAY_NAMES_FULL.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Start Time</label>
              <Input name="start_time" type="time" required defaultValue={editingSession?.start_time?.slice(0, 5) || ""} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">End Time</label>
              <Input name="end_time" type="time" required defaultValue={editingSession?.end_time?.slice(0, 5) || ""} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Coach</label>
            <Select name="coach_id" defaultValue={editingSession?.coach_id || ""}>
              <option value="">No coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
            <Input name="location" placeholder="e.g. Court 1" defaultValue={editingSession?.location || ""} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Ends</label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setEndMode("date")}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  endMode === "date"
                    ? "bg-primary-50 border-primary text-primary font-medium"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                End Date
              </button>
              <button
                type="button"
                onClick={() => setEndMode("weeks")}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  endMode === "weeks"
                    ? "bg-primary-50 border-primary text-primary font-medium"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                Number of Weeks
              </button>
            </div>
            {endMode === "date" ? (
              <Input
                name="end_date"
                type="date"
                required
                defaultValue={editingSession?.end_date || ""}
                min={new Date().toISOString().split("T")[0]}
              />
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={104}
                  value={numWeeks}
                  onChange={(e) => setNumWeeks(e.target.value)}
                  className="w-24"
                />
                <span className="text-xs text-slate-500">weeks from today</span>
              </div>
            )}
          </div>
          <Button type="submit" fullWidth disabled={isPending}>
            {isPending ? "Saving..." : editingSession ? "Update Session" : "Add Session"}
          </Button>
        </form>
      </Drawer>
    </Card>
  );
}
