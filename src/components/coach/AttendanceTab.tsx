"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Badge, Skeleton, Drawer } from "@/components/ui";
import { submitAttendance, removeAttendanceRecords } from "@/app/_actions/training";
import { createPendingPaymentForSession } from "@/app/(portal)/admin/payments/actions";
import {
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  UserCheck,
  UserX,
  Clock,
  Search,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { AttendanceStatus } from "@/types/database";

interface PlayerSubscription {
  id: string;
  remaining: number;
  status: string;
  end_date: string | null;
  package_name: string;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  sessions_remaining: number | null;
  subscription_status: string | null;
  subscription_end_date: string | null;
  subscriptions: PlayerSubscription[];
}

interface AttendanceRecord {
  player_id: string;
  status: AttendanceStatus | null;
  notes: string;
}

interface AttendanceTabProps {
  scheduleSessionId: string;
  groupId: string | null;
  groupName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  privatePlayers?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }[] | null;
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function AttendanceTab({
  scheduleSessionId,
  groupId,
  groupName,
  sessionDate,
  startTime,
  endTime,
  privatePlayers = null,
}: AttendanceTabProps) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; warnings?: string[] } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingAttendance, setExistingAttendance] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [savedRecords, setSavedRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [packages, setPackages] = useState<{ id: string; price: number; name: string; session_count: number }[]>([]);
  const [paymentDialog, setPaymentDialog] = useState<{ players: PlayerRow[]; playerPackages: Record<string, string> } | null>(null);
  const [chosenSubs, setChosenSubs] = useState<Record<string, string>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function loadPlayers() {
      setLoadingPlayers(true);
      setResult(null);

      // Get the player list for this session (group players OR the private players)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let groupPlayers: any[] = [];
      if (privatePlayers && privatePlayers.length > 0) {
        groupPlayers = privatePlayers.map((p) => ({
          player_id: p.id,
          profiles: {
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            avatar_url: p.avatar_url,
          },
        }));
      } else if (groupId) {
        const { data } = await supabase
          .from("group_players")
          .select("player_id, profiles!group_players_player_id_fkey(id, first_name, last_name, avatar_url)")
          .eq("group_id", groupId)
          .eq("is_active", true);
        if (!data) {
          setLoadingPlayers(false);
          return;
        }
        groupPlayers = data;
      }

      // Get subscriptions for these players
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerIds = groupPlayers.map((gp: any) => gp.profiles?.id).filter(Boolean);

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("id, player_id, sessions_remaining, status, end_date, packages(name)")
        .in("player_id", playerIds.length > 0 ? playerIds : ["__none__"])
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false });

      const subMap = new Map<string, PlayerSubscription[]>();
      if (subscriptions) {
        for (const sub of subscriptions) {
          // Skip effectively expired subs (no sessions left or past end date)
          if (sub.sessions_remaining <= 0) continue;
          if (sub.end_date && new Date(sub.end_date).getTime() < Date.now()) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pkgName = (sub as any).packages?.name || "Package";
          const entry: PlayerSubscription = {
            id: sub.id,
            remaining: sub.sessions_remaining,
            status: sub.status,
            end_date: sub.end_date,
            package_name: pkgName,
          };
          const existing = subMap.get(sub.player_id) || [];
          existing.push(entry);
          subMap.set(sub.player_id, existing);
        }
      }

      // Check for existing attendance on this date + session
      let existingAttQuery = supabase
        .from("attendance")
        .select("player_id, status")
        .eq("session_date", sessionDate)
        .eq("schedule_session_id", scheduleSessionId);
      if (groupId) existingAttQuery = existingAttQuery.eq("group_id", groupId);
      const { data: existingAtt } = await existingAttQuery;

      const existingMap = new Map<string, string>();
      if (existingAtt) {
        for (const att of existingAtt) {
          existingMap.set(att.player_id, att.status);
        }
      }
      setExistingAttendance(existingMap);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerRows: PlayerRow[] = groupPlayers.map((gp: any) => {
        const subs = subMap.get(gp.profiles?.id) || [];
        const primarySub = subs[0] || null;
        const totalRemaining = subs.reduce((sum, s) => sum + s.remaining, 0);
        return {
          id: gp.profiles?.id || "",
          first_name: gp.profiles?.first_name || "",
          last_name: gp.profiles?.last_name || "",
          avatar_url: gp.profiles?.avatar_url,
          sessions_remaining: subs.length > 0 ? totalRemaining : null,
          subscription_status: primarySub?.status ?? null,
          subscription_end_date: primarySub?.end_date ?? null,
          subscriptions: subs,
        };
      }).filter((p: PlayerRow) => p.id);

      setPlayers(playerRows);

      // Initialize records — pre-fill from existing attendance or leave null
      const initialRecords = new Map<string, AttendanceRecord>();
      for (const p of playerRows) {
        const existingStatus = existingMap.get(p.id);
        initialRecords.set(p.id, {
          player_id: p.id,
          status: (existingStatus as AttendanceStatus) || null,
          notes: "",
        });
      }
      setRecords(initialRecords);
      setSavedRecords(new Map(Array.from(initialRecords.entries()).map(([k, v]) => [k, { ...v }])));

      // Fetch packages for payment creation
      const { data: pkgs } = await supabase
        .from("packages")
        .select("id, price, name, session_count")
        .eq("is_active", true)
        .order("session_count", { ascending: true });
      if (pkgs) setPackages(pkgs);

      setLoadingPlayers(false);
    }

    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, sessionDate, scheduleSessionId, privatePlayers]);

  function setPlayerStatus(playerId: string, status: AttendanceStatus) {
    setRecords((prev) => {
      const next = new Map(prev);
      const existing = next.get(playerId);
      if (existing) {
        next.set(playerId, { ...existing, status: existing.status === status ? null : status });
      }
      return next;
    });
  }

  function setPlayerNotes(playerId: string, notes: string) {
    setRecords((prev) => {
      const next = new Map(prev);
      const existing = next.get(playerId);
      if (existing) {
        next.set(playerId, { ...existing, notes });
      }
      return next;
    });
  }

  function selectAllPresent() {
    setRecords((prev) => {
      const next = new Map(prev);
      for (const [id, record] of next) {
        next.set(id, { ...record, status: "present" });
      }
      return next;
    });
  }

  function resetAll() {
    setRecords(new Map(Array.from(savedRecords.entries()).map(([k, v]) => [k, { ...v }])));
  }

  function clearAll() {
    setRecords((prev) => {
      const next = new Map(prev);
      for (const [id, record] of next) {
        next.set(id, { ...record, status: null, notes: "" });
      }
      return next;
    });
  }

  const markedRecords = Array.from(records.values()).filter((r) => r.status !== null);
  const presentCount = markedRecords.filter((r) => r.status === "present").length;
  const absentCount = markedRecords.filter((r) => r.status === "absent").length;
  const excusedCount = markedRecords.filter((r) => r.status === "excused").length;
  const unmarkedCount = players.length - markedRecords.length;
  const allMarked = unmarkedCount === 0 && players.length > 0;
  const hasExistingAttendance = existingAttendance.size > 0;
  const hasChanges = (() => {
    for (const [id, record] of records) {
      const saved = savedRecords.get(id);
      if (!saved) return true;
      if ((record.status || null) !== (saved.status || null)) return true;
    }
    for (const id of savedRecords.keys()) {
      if (!records.has(id)) return true;
    }
    return false;
  })();

  // Detect players whose status was removed (previously saved but now null)
  const removedPlayerIds = Array.from(savedRecords.entries())
    .filter(([, saved]) => saved.status !== null)
    .filter(([id]) => {
      const current = records.get(id);
      return !current || current.status === null;
    })
    .map(([id]) => id);

  function getZeroBalancePresentPlayers() {
    return players.filter((p) => {
      const record = records.get(p.id);
      const savedRecord = savedRecords.get(p.id);
      // Only flag newly marked present players
      if (record?.status !== "present" || savedRecord?.status === "present") return false;
      return p.sessions_remaining === null || p.sessions_remaining <= 0;
    });
  }

  function handleOpenConfirm() {
    if (markedRecords.length === 0 && removedPlayerIds.length === 0) return;
    setSubmitError(null);

    // Pre-compute zero-balance players so they show in the confirm drawer
    const zeroBalancePlayers = getZeroBalancePresentPlayers();
    const defaultPkg = packages.find((p) => p.session_count === 1) || packages[0];
    if (zeroBalancePlayers.length > 0 && defaultPkg) {
      const playerPackages: Record<string, string> = {};
      zeroBalancePlayers.forEach((p) => { playerPackages[p.id] = defaultPkg.id; });
      setPaymentDialog({ players: zeroBalancePlayers, playerPackages });
    } else {
      setPaymentDialog(null);
    }

    // Pre-select subscription for multi-sub players marked present
    const defaults: Record<string, string> = {};
    for (const player of players) {
      const record = records.get(player.id);
      if (record?.status !== "present") continue;
      const activeSubs = player.subscriptions.filter((s) => s.remaining > 0);
      if (activeSubs.length >= 1 && !chosenSubs[player.id]) {
        defaults[player.id] = activeSubs[0].id;
      }
    }
    if (Object.keys(defaults).length > 0) {
      setChosenSubs((prev) => ({ ...defaults, ...prev }));
    }

    setShowConfirm(true);
  }

  function handleConfirmSubmit() {
    executeSubmit(paymentDialog?.playerPackages || {});
  }

  function executeSubmit(playerPackages: Record<string, string> = {}) {
    startTransition(async () => {
      // Remove attendance for deselected players
      if (removedPlayerIds.length > 0) {
        const removeRes = await removeAttendanceRecords({
          group_id: groupId,
          schedule_session_id: scheduleSessionId,
          session_date: sessionDate,
          player_ids: removedPlayerIds,
        });
        if ("error" in removeRes) {
          setSubmitError(removeRes.error as string);
          return;
        }
      }

      // Submit remaining records (if any)
      if (markedRecords.length > 0) {
        const attendanceRecords = Array.from(records.values())
          .filter((r) => r.status !== null)
          .map((r) => ({
            player_id: r.player_id,
            status: r.status as "present" | "absent" | "excused",
            notes: r.notes || undefined,
            subscription_id: r.status === "present" ? chosenSubs[r.player_id] || undefined : undefined,
          }));

        const res = await submitAttendance({
          group_id: groupId,
          schedule_session_id: scheduleSessionId,
          session_date: sessionDate,
          records: attendanceRecords,
        });

        if ("error" in res) {
          setSubmitError((res as { error: string }).error);
          return;
        }

        const warnings: string[] = [];
        if ("results" in res) {
          for (const r of (res as { results: { player_id: string; sessions_remaining: number | null }[] }).results) {
            if (r.sessions_remaining !== null && r.sessions_remaining <= 0) {
              const player = players.find((p) => p.id === r.player_id);
              if (player) {
                warnings.push(`${player.first_name} ${player.last_name} has ${r.sessions_remaining} sessions remaining`);
              }
            }
          }
        }
        setResult({ success: true, warnings });
      } else {
        setResult({ success: true, warnings: [] });
      }

      // Create pending payments for zero-balance players
      let paymentsCreated = 0;
      const playerIds = Object.keys(playerPackages);
      if (playerIds.length > 0) {
        for (const playerId of playerIds) {
          const pkg = packages.find((p) => p.id === playerPackages[playerId]);
          if (!pkg) continue;
          const payRes = await createPendingPaymentForSession({
            player_id: playerId,
            package_id: pkg.id,
            amount: pkg.price,
            session_date: sessionDate,
          });
          if ("success" in payRes) paymentsCreated++;
        }
      }

      setShowConfirm(false);
      setSubmitError(null);
      setSavedRecords(new Map(Array.from(records.entries()).map(([k, v]) => [k, { ...v }])));

      if (paymentsCreated > 0) {
        setResult({
          success: true,
          warnings: [`${paymentsCreated} pending payment${paymentsCreated > 1 ? "s" : ""} created`],
        });
      }
    });
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400">
            {formatTime(startTime)} - {formatTime(endTime)} &middot; {sessionDate}
          </p>
          {markedRecords.length > 0 && (
            <div className="flex items-center gap-2.5 text-xs">
              <span className="flex items-center gap-1 text-emerald-600">
                <UserCheck className="w-3.5 h-3.5" /> {presentCount}
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <UserX className="w-3.5 h-3.5" /> {absentCount}
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <Clock className="w-3.5 h-3.5" /> {excusedCount}
              </span>
            </div>
          )}
        </div>
        {players.length > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={selectAllPresent} className="sm:w-auto">
              <span className="flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All Present
              </span>
            </Button>
            {hasChanges && (
              <Button size="sm" variant="secondary" onClick={resetAll} className="sm:w-auto">
                <span className="flex items-center justify-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </span>
              </Button>
            )}
            {markedRecords.length > 0 && (
              <Button size="sm" variant="secondary" onClick={clearAll} className="sm:w-auto">
                <span className="flex items-center justify-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </span>
              </Button>
            )}
            {result?.success && !hasChanges ? (
              <Badge variant="success">
                <span className="flex items-center gap-1">
                  <Check className="w-3 h-3" /> Saved
                </span>
              </Badge>
            ) : (
              <Button
                size="sm"
                onClick={handleOpenConfirm}
                disabled={(markedRecords.length === 0 && removedPlayerIds.length === 0) || isPending}
              >
                {isPending ? "Submitting..." : "Submit"}
              </Button>
            )}
          </div>
        )}
      </div>

      {hasExistingAttendance && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Attendance already logged for this session. Submitting will update existing records.
          </div>
        </div>
      )}

      {loadingPlayers ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="w-8 h-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          No players assigned to this group yet
        </div>
      ) : (
        <div>
          {players.length > 5 && (
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400"
              />
            </div>
          )}
        <div className="divide-y divide-slate-100">
          {[...players].sort((a, b) => {
            const aLogged = records.get(a.id)?.status !== null ? 0 : 1;
            const bLogged = records.get(b.id)?.status !== null ? 0 : 1;
            if (aLogged !== bLogged) return aLogged - bLogged;
            return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
          }).filter((p) => {
            const q = searchQuery.toLowerCase().trim();
            if (!q) return true;
            return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
          }).map((player) => {
            const record = records.get(player.id);
            const isExpanded = expandedNotes.has(player.id);
            const hasLowBalance = player.sessions_remaining !== null && player.sessions_remaining <= 2;
            const hasNoBalance = player.sessions_remaining !== null && player.sessions_remaining <= 0;

            return (
              <div key={player.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {player.first_name[0]}{player.last_name[0]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {player.first_name} {player.last_name}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {player.subscriptions.length > 1 ? (
                        <span className="text-xs text-slate-400">
                          {player.subscriptions.map((s) => {
                            const exp = s.end_date ? new Date(s.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
                            return `${s.package_name}: ${s.remaining}${exp ? ` (${exp})` : ""}`;
                          }).join(" · ")}
                        </span>
                      ) : player.sessions_remaining !== null ? (
                        <span className={`text-xs ${hasNoBalance ? "text-red-500 font-medium" : hasLowBalance ? "text-amber-500" : "text-slate-400"}`}>
                          {player.subscriptions[0]?.package_name ? `${player.subscriptions[0].package_name}: ` : ""}{player.sessions_remaining} sessions left
                          {player.subscription_end_date && ` · Exp ${new Date(player.subscription_end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No active subscription</span>
                      )}
                      {hasNoBalance && (
                        <Badge variant="danger">0 balance</Badge>
                      )}
                    </div>
                  </div>

                  {/* Status Buttons — desktop */}
                  <div className="hidden sm:flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setPlayerStatus(player.id, "present")}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        record?.status === "present"
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                      }`}
                      title="Present"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPlayerStatus(player.id, "absent")}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        record?.status === "absent"
                          ? "bg-red-500 text-white"
                          : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      }`}
                      title="Absent"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPlayerStatus(player.id, "excused")}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        record?.status === "excused"
                          ? "bg-amber-500 text-white"
                          : "bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                      }`}
                      title="Excused"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setExpandedNotes((prev) => {
                          const next = new Set(prev);
                          if (next.has(player.id)) next.delete(player.id);
                          else next.add(player.id);
                          return next;
                        });
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"
                      title="Add note"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Status Buttons — mobile */}
                <div className="sm:hidden flex gap-1.5 mt-2 ml-12">
                  <button
                    onClick={() => setPlayerStatus(player.id, "present")}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      record?.status === "present"
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPlayerStatus(player.id, "absent")}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      record?.status === "absent"
                        ? "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPlayerStatus(player.id, "excused")}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      record?.status === "excused"
                        ? "bg-amber-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setExpandedNotes((prev) => {
                        const next = new Set(prev);
                        if (next.has(player.id)) next.delete(player.id);
                        else next.add(player.id);
                        return next;
                      });
                    }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 text-slate-400 shrink-0 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Notes (expandable) */}
                {isExpanded && (
                  <div className="mt-2 ml-12">
                    <input
                      type="text"
                      value={record?.notes || ""}
                      onChange={(e) => setPlayerNotes(player.id, e.target.value)}
                      placeholder="Optional note..."
                      className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      )}

      {/* Summary Bar */}
      {players.length > 0 && markedRecords.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-emerald-600">
              <UserCheck className="w-4 h-4" /> {presentCount}
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <UserX className="w-4 h-4" /> {absentCount}
            </span>
            <span className="flex items-center gap-1 text-amber-500">
              <Clock className="w-4 h-4" /> {excusedCount}
            </span>
            {unmarkedCount > 0 && (
              <span className="text-slate-400">{unmarkedCount} unmarked</span>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Drawer */}
      <Drawer
        open={showConfirm}
        onClose={() => { setShowConfirm(false); setSubmitError(null); }}
        title="Confirm Attendance"
        footer={
          <div>
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleConfirmSubmit} disabled={isPending} fullWidth>
                {isPending ? "Submitting..." : paymentDialog ? "Confirm & Create Payments" : "Confirm"}
              </Button>
              <Button variant="secondary" onClick={() => { setShowConfirm(false); setSubmitError(null); }} disabled={isPending} fullWidth>
                Cancel
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            You&apos;re marking attendance for <span className="font-medium text-slate-900">{groupName}</span> — {formatTime(startTime)} session on {sessionDate}
          </p>
          <div className="flex items-center gap-4 text-sm bg-slate-50 rounded-lg p-3">
            <span className="text-emerald-600">{presentCount} present</span>
            <span className="text-red-500">{absentCount} absent</span>
            <span className="text-amber-500">{excusedCount} excused</span>
            {removedPlayerIds.length > 0 && (
              <span className="text-slate-400">{removedPlayerIds.length} removed</span>
            )}
          </div>
          {hasExistingAttendance && (
            <p className="text-xs text-amber-600">
              This will update existing attendance records.
            </p>
          )}

          {/* Multi-subscription selector */}
          {(() => {
            const multiSubPlayers = players.filter((p) => {
              const record = records.get(p.id);
              if (record?.status !== "present") return false;
              return p.subscriptions.filter((s) => s.remaining > 0).length > 1;
            });
            if (multiSubPlayers.length === 0) return null;
            return (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-xs font-medium text-slate-700">
                  Choose which package to deduct from:
                </p>
                <div className="space-y-2">
                  {multiSubPlayers.map((p) => {
                    const activeSubs = p.subscriptions.filter((s) => s.remaining > 0);
                    return (
                      <div key={p.id} className="bg-blue-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
                            {p.first_name[0]}{p.last_name[0]}
                          </div>
                          <span className="text-xs font-medium text-slate-700">
                            {p.first_name} {p.last_name}
                          </span>
                        </div>
                        <select
                          value={chosenSubs[p.id] || activeSubs[0]?.id || ""}
                          onChange={(e) => setChosenSubs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          {activeSubs.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.package_name} — {sub.remaining} sessions left
                              {sub.end_date && ` · Exp ${new Date(sub.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Zero-balance players inline */}
          {paymentDialog && paymentDialog.players.length > 0 && (() => {
            const total = paymentDialog.players.reduce((sum, p) => {
              const pkg = packages.find((pk) => pk.id === paymentDialog.playerPackages[p.id]);
              return sum + (pkg?.price ?? 0);
            }, 0);
            return (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-xs font-medium text-slate-700">
                  Players with no remaining sessions — a pending payment will be created:
                </p>
                <div className="space-y-2">
                  {paymentDialog.players.map((p) => {
                    const pkgId = paymentDialog.playerPackages[p.id];
                    const playerPkg = packages.find((pk) => pk.id === pkgId);
                    return (
                      <div key={p.id} className="bg-red-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-bold text-red-600 shrink-0">
                            {p.first_name[0]}{p.last_name[0]}
                          </div>
                          <span className="text-xs font-medium text-slate-700">
                            {p.first_name} {p.last_name}
                          </span>
                          {playerPkg && (
                            <span className="ml-auto text-[11px] font-medium text-slate-500">{playerPkg.price} EGP</span>
                          )}
                        </div>
                        <select
                          value={pkgId}
                          onChange={(e) => setPaymentDialog((prev) => prev ? {
                            ...prev,
                            playerPackages: { ...prev.playerPackages, [p.id]: e.target.value }
                          } : null)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          {packages.map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.name} — {pkg.price} EGP
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                {paymentDialog.players.length > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs font-medium text-slate-500">Total</span>
                    <span className="text-sm font-semibold text-slate-900">{total} EGP</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </Drawer>

      {/* Success Toast */}
      {result?.success && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-sm bg-emerald-50 border-emerald-200 border rounded-lg p-4 shadow-lg">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-700">
                Attendance submitted successfully!
              </p>
              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
