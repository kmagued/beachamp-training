"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { Card, Button, EmptyState, Toast } from "@/components/ui";
import { MessageSquare, Plus, Search, Trash2, Loader2, Star } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { NewFeedbackDrawer } from "./_components/new-feedback-drawer";
import { deleteFeedback } from "./actions";

interface CoachToPlayerRow {
  id: string;
  comment: string | null;
  created_at: string;
  player: { id: string; first_name: string; last_name: string } | null;
  coach: { first_name: string; last_name: string } | null;
}

interface PlayerToCoachRow {
  id: string;
  comment: string | null;
  rating: number | null;
  created_at: string;
  player: { id: string; first_name: string; last_name: string } | null;
  coach: { id: string; first_name: string; last_name: string } | null;
}

type Tab = "to-players" | "to-coaches";

export default function AdminFeedbackPage() {
  const [tab, setTab] = useState<Tab>("to-players");
  const [toPlayers, setToPlayers] = useState<CoachToPlayerRow[]>([]);
  const [toCoaches, setToCoaches] = useState<PlayerToCoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cp }, { data: pc }] = await Promise.all([
      supabase
        .from("feedback")
        .select(
          "id, comment, created_at, player:profiles!feedback_player_id_fkey(id, first_name, last_name), coach:profiles!feedback_coach_id_fkey(first_name, last_name)",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("coach_feedback")
        .select(
          "id, comment, rating, created_at, player:profiles!coach_feedback_player_id_fkey(id, first_name, last_name), coach:profiles!coach_feedback_coach_id_fkey(id, first_name, last_name)",
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (cp) setToPlayers(cp as unknown as CoachToPlayerRow[]);
    if (pc) setToCoaches(pc as unknown as PlayerToCoachRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filteredToPlayers = q
    ? toPlayers.filter((r) => {
        const name = r.player ? `${r.player.first_name} ${r.player.last_name}`.toLowerCase() : "";
        return name.includes(q) || (r.comment || "").toLowerCase().includes(q);
      })
    : toPlayers;
  const filteredToCoaches = q
    ? toCoaches.filter((r) => {
        const pn = r.player ? `${r.player.first_name} ${r.player.last_name}`.toLowerCase() : "";
        const cn = r.coach ? `${r.coach.first_name} ${r.coach.last_name}`.toLowerCase() : "";
        return pn.includes(q) || cn.includes(q) || (r.comment || "").toLowerCase().includes(q);
      })
    : toCoaches;

  function handleDelete(id: string) {
    if (!confirm("Delete this feedback? This cannot be undone.")) return;
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteFeedback(id);
      setDeletingId(null);
      if (res.error) {
        setToast({ message: res.error, variant: "error" });
      } else {
        setToast({ message: "Feedback deleted", variant: "success" });
        setToPlayers((prev) => prev.filter((r) => r.id !== id));
      }
    });
  }

  const emptyRows = tab === "to-players" ? toPlayers.length === 0 : toCoaches.length === 0;
  const filteredEmpty =
    tab === "to-players" ? filteredToPlayers.length === 0 : filteredToCoaches.length === 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Feedback</h1>
          <p className="text-slate-500 text-sm">All feedback exchanged in the platform</p>
        </div>
        {tab === "to-players" && (
          <Button onClick={() => setOpenNew(true)}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> New Feedback
            </span>
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-5 border-b border-slate-200">
        {(
          [
            { key: "to-players", label: `Player Feedback (${toPlayers.length})` },
            { key: "to-coaches", label: `Coach Feedback (${toCoaches.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or feedback..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {loading ? (
        <Card>
          <div className="py-10 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        </Card>
      ) : filteredEmpty ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="w-10 h-10" />}
            title={emptyRows ? "No Feedback Yet" : "No matches"}
            description={
              emptyRows
                ? tab === "to-players"
                  ? "Create your first feedback entry with the button above."
                  : "Players haven't sent feedback to coaches yet."
                : "Try a different search."
            }
          />
        </Card>
      ) : tab === "to-players" ? (
        <div className="space-y-3">
          {filteredToPlayers.map((fb) => (
            <Card key={fb.id}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-800 flex-shrink-0">
                  {fb.player?.first_name?.[0] || "?"}
                  {fb.player?.last_name?.[0] || ""}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {fb.player ? (
                        <Link
                          href={`/admin/players/${fb.player.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-primary-700"
                        >
                          {fb.player.first_name} {fb.player.last_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-slate-400">Unknown player</span>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatDate(fb.created_at)}
                        {fb.coach && (
                          <>
                            {" · by "}
                            {fb.coach.first_name} {fb.coach.last_name}
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(fb.id)}
                      disabled={isPending && deletingId === fb.id}
                      className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Delete"
                    >
                      {deletingId === fb.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {fb.comment && (
                    <p className="text-sm text-slate-700 leading-relaxed mt-2 whitespace-pre-wrap">
                      {fb.comment}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredToCoaches.map((fb) => (
            <Card key={fb.id}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-coach/10 flex items-center justify-center text-xs font-bold text-brand-coach flex-shrink-0">
                  {fb.coach?.first_name?.[0] || "C"}
                  {fb.coach?.last_name?.[0] || ""}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      To: {fb.coach?.first_name} {fb.coach?.last_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-0.5">
                      <span>{formatDate(fb.created_at)}</span>
                      {fb.player && (
                        <span>
                          from {fb.player.first_name} {fb.player.last_name}
                        </span>
                      )}
                      {fb.rating != null && (
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "w-3 h-3",
                                i < fb.rating! ? "fill-yellow-400 text-yellow-400" : "text-slate-300",
                              )}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  {fb.comment && (
                    <p className="text-sm text-slate-700 leading-relaxed mt-2 whitespace-pre-wrap">
                      {fb.comment}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewFeedbackDrawer
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSuccess={() => {
          setToast({ message: "Feedback saved", variant: "success" });
          load();
        }}
      />
    </div>
  );
}
