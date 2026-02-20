"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Badge, Skeleton } from "@/components/ui";
import { submitFeedback, updateFeedback, deleteFeedback } from "@/app/_actions/training";
import {
  Star,
  Send,
  X,
  CheckCircle2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";

const QUICK_TAGS = [
  "Great Improvement",
  "Needs Practice",
  "Strong Serves",
  "Work on Footwork",
  "Good Teamwork",
  "Low Energy",
];

interface PlayerWithFeedback {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  existing_feedback: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
  } | null;
}

interface FeedbackTabProps {
  scheduleSessionId: string;
  groupId: string;
  sessionDate: string;
  coachId: string;
  isAdmin: boolean;
}

function StarRating({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          disabled={!onChange}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            className={`${sizeClass} ${
              star <= value ? "text-amber-400 fill-amber-400" : "text-slate-200"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function FeedbackTab({
  groupId,
  sessionDate,
  coachId,
  isAdmin,
}: FeedbackTabProps) {
  const [players, setPlayers] = useState<PlayerWithFeedback[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [editMode, setEditMode] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string; playerId?: string } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function loadPlayers() {
      setLoadingPlayers(true);
      setExpandedPlayer(null);
      setResult(null);

      // Get attendance records for this session/date marked as present
      const { data: attendees } = await supabase
        .from("attendance")
        .select("player_id, profiles!attendance_player_id_fkey(id, first_name, last_name, avatar_url)")
        .eq("group_id", groupId)
        .eq("session_date", sessionDate)
        .eq("status", "present");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let playerList: { id: string; first_name: string; last_name: string; avatar_url: string | null }[];

      if (!attendees || attendees.length === 0) {
        // Fallback: load all players in the group
        const { data: groupPlayers } = await supabase
          .from("group_players")
          .select("player_id, profiles!group_players_player_id_fkey(id, first_name, last_name, avatar_url)")
          .eq("group_id", groupId)
          .eq("is_active", true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        playerList = (groupPlayers || []).map((gp: any) => ({
          id: gp.profiles?.id || "",
          first_name: gp.profiles?.first_name || "",
          last_name: gp.profiles?.last_name || "",
          avatar_url: gp.profiles?.avatar_url,
        })).filter((p) => p.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        playerList = attendees.map((a: any) => ({
          id: a.profiles?.id || "",
          first_name: a.profiles?.first_name || "",
          last_name: a.profiles?.last_name || "",
          avatar_url: a.profiles?.avatar_url,
        })).filter((p) => p.id);
      }

      // Fetch existing feedback for these players on this session date
      const playerIds = playerList.map((p) => p.id);
      const feedbackMap = new Map<string, { id: string; rating: number; comment: string | null; created_at: string }>();

      if (playerIds.length > 0) {
        let feedbackQuery = supabase
          .from("feedback")
          .select("id, player_id, rating, comment, created_at")
          .eq("session_date", sessionDate)
          .in("player_id", playerIds);

        if (!isAdmin) {
          feedbackQuery = feedbackQuery.eq("coach_id", coachId);
        }

        const { data: existingFeedback } = await feedbackQuery;
        if (existingFeedback) {
          for (const f of existingFeedback) {
            feedbackMap.set(f.player_id, {
              id: f.id,
              rating: f.rating,
              comment: f.comment,
              created_at: f.created_at,
            });
          }
        }
      }

      setPlayers(
        playerList.map((p) => ({
          ...p,
          existing_feedback: feedbackMap.get(p.id) || null,
        }))
      );
      setLoadingPlayers(false);
    }

    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, sessionDate]);

  function openNewFeedback(playerId: string) {
    setExpandedPlayer(playerId);
    setRating(0);
    setComment("");
    setEditMode(false);
    setResult(null);
  }

  function openEditFeedback(player: PlayerWithFeedback) {
    if (!player.existing_feedback) return;
    setExpandedPlayer(player.id);
    setRating(player.existing_feedback.rating);
    setComment(player.existing_feedback.comment || "");
    setEditMode(true);
    setResult(null);
  }

  function closeForm() {
    setExpandedPlayer(null);
    setRating(0);
    setComment("");
    setEditMode(false);
  }

  function addQuickTag(tag: string) {
    setComment((prev) => {
      if (prev.includes(tag)) return prev;
      return prev ? `${prev}, ${tag}` : tag;
    });
  }

  function handleSubmit(player: PlayerWithFeedback) {
    if (rating === 0) return;

    startTransition(async () => {
      if (editMode && player.existing_feedback) {
        const res = await updateFeedback(player.existing_feedback.id, {
          rating,
          comment: comment.trim() || undefined,
        });
        if ("error" in res) {
          setResult({ error: (res as { error: string }).error, playerId: player.id });
        } else {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === player.id
                ? { ...p, existing_feedback: { ...p.existing_feedback!, rating, comment: comment.trim() || null } }
                : p
            )
          );
          setResult({ success: true, playerId: player.id });
          closeForm();
          setTimeout(() => setResult(null), 3000);
        }
      } else {
        const res = await submitFeedback({
          player_id: player.id,
          session_date: sessionDate,
          rating,
          comment: comment.trim() || undefined,
        });
        if ("error" in res) {
          setResult({ error: (res as { error: string }).error, playerId: player.id });
        } else {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === player.id
                ? {
                    ...p,
                    existing_feedback: {
                      id: Date.now().toString(),
                      rating,
                      comment: comment.trim() || null,
                      created_at: new Date().toISOString(),
                    },
                  }
                : p
            )
          );
          setResult({ success: true, playerId: player.id });
          closeForm();
          setTimeout(() => setResult(null), 3000);
        }
      }
    });
  }

  function handleDelete(player: PlayerWithFeedback) {
    if (!player.existing_feedback || !confirm("Delete this feedback?")) return;
    startTransition(async () => {
      const res = await deleteFeedback(player.existing_feedback!.id);
      if ("error" in res) {
        setResult({ error: (res as { error: string }).error, playerId: player.id });
      } else {
        setPlayers((prev) =>
          prev.map((p) => (p.id === player.id ? { ...p, existing_feedback: null } : p))
        );
      }
    });
  }

  const feedbackCount = players.filter((p) => p.existing_feedback).length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-xs text-slate-400">{sessionDate}</p>
        {players.length > 0 && (
          <Badge variant={feedbackCount === players.length ? "success" : "info"}>
            {feedbackCount}/{players.length} reviewed
          </Badge>
        )}
      </div>

      {loadingPlayers ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          No players found. Log attendance first to see players here.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {players.map((player) => {
            const isExpanded = expandedPlayer === player.id;
            const hasFeedback = !!player.existing_feedback;
            const canEdit =
              hasFeedback &&
              (isAdmin ||
                (Date.now() - new Date(player.existing_feedback!.created_at).getTime()) /
                  (1000 * 60 * 60) <=
                  48);
            const justSubmitted = result?.success && result?.playerId === player.id;

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
                    {hasFeedback ? (
                      <div className="flex items-center gap-2">
                        <StarRating value={player.existing_feedback!.rating} size="sm" />
                        {player.existing_feedback!.comment && (
                          <span className="text-xs text-slate-400 truncate hidden sm:inline max-w-[200px]">
                            {player.existing_feedback!.comment}
                          </span>
                        )}
                      </div>
                    ) : justSubmitted ? (
                      <span className="text-xs text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Submitted
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No feedback yet</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {hasFeedback ? (
                      canEdit && (
                        <>
                          <button
                            onClick={() => isExpanded && editMode ? closeForm() : openEditFeedback(player)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
                            title="Edit feedback"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(player)}
                            disabled={isPending}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                            title="Delete feedback"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )
                    ) : (
                      <button
                        onClick={() => isExpanded ? closeForm() : openNewFeedback(player.id)}
                        className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                          isExpanded
                            ? "bg-primary text-white"
                            : "bg-primary-50 text-primary hover:bg-primary-100"
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span className="hidden sm:inline">Add Feedback</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3 sm:hidden" /> : <ChevronDown className="w-3 h-3 sm:hidden" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline feedback form */}
                {isExpanded && (
                  <div className="mt-3 ml-0 sm:ml-12 bg-slate-50 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Rating</label>
                      <StarRating value={rating} onChange={setRating} />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1.5 block">Quick Tags</label>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TAGS.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => addQuickTag(tag)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              comment.includes(tag)
                                ? "bg-primary-50 border-primary text-primary-700"
                                : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Comment</label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={`How did ${player.first_name} perform?`}
                        rows={2}
                        className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none bg-white"
                      />
                    </div>

                    {result?.error && result?.playerId === player.id && (
                      <p className="text-xs text-red-600">{result.error}</p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSubmit(player)}
                        disabled={rating === 0 || isPending}
                        size="sm"
                        fullWidth
                        className="sm:w-auto"
                      >
                        <span className="flex items-center justify-center gap-1.5">
                          <Send className="w-3.5 h-3.5" />
                          {isPending ? "Saving..." : editMode ? "Update" : "Submit"}
                        </span>
                      </Button>
                      <Button variant="secondary" size="sm" onClick={closeForm} disabled={isPending}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Result Toast */}
      {result?.success && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-sm bg-emerald-50 border-emerald-200 border rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-700">Feedback saved!</p>
            <button onClick={() => setResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
