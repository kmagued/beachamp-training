"use client";

import { useState, useTransition } from "react";
import { Card, Button, Input, Select, Drawer } from "@/components/ui";
import { Calendar, Plus, Pencil, Trash2 } from "lucide-react";
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

  function handleCreateSession(formData: FormData) {
    setError(null);
    formData.set("group_id", groupId);
    startTransition(async () => {
      const result = await createScheduleSession(formData);
      if ("error" in result) setError(result.error);
      else {
        setShowSessionDrawer(false);
        onRefresh();
      }
    });
  }

  function handleUpdateSession(formData: FormData) {
    if (!editingSession) return;
    setError(null);
    startTransition(async () => {
      const result = await updateScheduleSession(editingSession.id, formData);
      if ("error" in result) setError(result.error);
      else {
        setEditingSession(null);
        onRefresh();
      }
    });
  }

  function handleDeleteSession(id: string) {
    startTransition(async () => {
      await deleteScheduleSession(id);
      onRefresh();
    });
  }

  function openAdd() {
    setEditingSession(null);
    setShowSessionDrawer(true);
  }

  function openEdit(session: ScheduleRow) {
    setEditingSession(session);
    setShowSessionDrawer(false);
  }

  const showForm = showSessionDrawer || editingSession !== null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          Weekly Schedule
          <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{schedule.length}</span>
        </h2>
        <Button size="sm" onClick={openAdd}>
          <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Session</span>
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {schedule.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No schedule set. Add session slots for this group.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Day</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Time</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Coach</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Location</th>
                  <th className="py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedule.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 font-medium text-slate-900">{DAY_NAMES_FULL[s.day_of_week]}</td>
                    <td className="py-2.5 text-slate-600">{formatTime(s.start_time)} — {formatTime(s.end_time)}</td>
                    <td className="py-2.5 text-slate-600">{s.coach_name || "—"}</td>
                    <td className="py-2.5 text-slate-500">{s.location || "—"}</td>
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {schedule.map((s) => (
              <div key={s.id} className="border border-slate-100 rounded-lg p-3">
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
                </div>
              </div>
            ))}
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
          <Button type="submit" fullWidth disabled={isPending}>
            {isPending ? "Saving..." : editingSession ? "Update Session" : "Add Session"}
          </Button>
        </form>
      </Drawer>
    </Card>
  );
}
