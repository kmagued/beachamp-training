"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button, Drawer, DatePicker, Select, Input, Toast } from "@/components/ui";
import { createAdminPrivateSession } from "@/app/_actions/private-sessions";

interface Option { id: string; name: string }

interface Props {
  players: Option[];
  coaches: Option[];
}

export function CreatePrivateSessionButton({ players, coaches }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);
  const playerPickerRef = useRef<HTMLDivElement>(null);
  const [coachId, setCoachId] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const selectedPlayers = useMemo(
    () => playerIds.map((id) => players.find((p) => p.id === id)).filter((p): p is Option => Boolean(p)),
    [players, playerIds]
  );

  const filteredPlayers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    const available = players.filter((p) => !playerIds.includes(p.id));
    if (!q) return available.slice(0, 50);
    return available.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [players, playerQuery, playerIds]);

  useEffect(() => {
    if (!playerDropdownOpen) return;
    function onClick(e: MouseEvent) {
      if (!playerPickerRef.current) return;
      if (!playerPickerRef.current.contains(e.target as Node)) {
        setPlayerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [playerDropdownOpen]);

  function reset() {
    setPlayerIds([]);
    setPlayerQuery("");
    setPlayerDropdownOpen(false);
    setCoachId("");
    setSessionDate("");
    setStartTime("");
    setEndTime("");
    setLocation("");
    setError(null);
  }

  function addPlayer(id: string) {
    setPlayerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPlayerQuery("");
  }

  function removePlayer(id: string) {
    setPlayerIds((prev) => prev.filter((p) => p !== id));
  }

  function handleSubmit() {
    setError(null);
    if (playerIds.length === 0) return setError("Please add at least one player.");
    if (!sessionDate) return setError("Please pick a date.");
    if (!startTime || !endTime) return setError("Please set start and end times.");

    startTransition(async () => {
      const res = await createAdminPrivateSession({
        player_ids: playerIds,
        coach_id: coachId || null,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        location: location || null,
      });
      if ("error" in res) {
        setError(res.error ?? "Failed to create session");
      } else {
        setOpen(false);
        reset();
        setToast({ message: "Private session created", variant: "success" });
      }
    });
  }

  return (
    <>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />
      <Button size="sm" onClick={() => setOpen(true)}>
        <span className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Private Session</span>
        </span>
      </Button>

      <Drawer
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Create Private Session"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setOpen(false); reset(); }} disabled={isPending} fullWidth>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} fullWidth>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Players {playerIds.length > 0 && <span className="text-slate-400">({playerIds.length})</span>}
            </label>
            <div ref={playerPickerRef} className="relative">
              {selectedPlayers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedPlayers.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium rounded-full pl-2.5 pr-1 py-1"
                    >
                      {p.name}
                      <button
                        type="button"
                        onClick={() => removePlayer(p.id)}
                        className="rounded-full hover:bg-primary/20 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={playerQuery}
                  onFocus={() => setPlayerDropdownOpen(true)}
                  onChange={(e) => {
                    setPlayerQuery(e.target.value);
                    setPlayerDropdownOpen(true);
                  }}
                  placeholder={selectedPlayers.length > 0 ? "Add another player..." : "Search player..."}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400"
                />
              </div>
              {playerDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                  {filteredPlayers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">
                      {playerIds.length > 0 && !playerQuery ? "No more players" : "No players match"}
                    </div>
                  ) : (
                    filteredPlayers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addPlayer(p.id)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Date</label>
            <DatePicker value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Start Time</label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">End Time</label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Coach (optional)</label>
            <Select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">No coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Location (optional)</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Court 1" />
          </div>
        </div>
      </Drawer>
    </>
  );
}
