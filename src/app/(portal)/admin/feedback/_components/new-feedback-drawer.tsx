"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Drawer } from "@/components/ui/drawer";
import { Input, Textarea, Label, Button } from "@/components/ui";
import { Loader2, Search, X } from "lucide-react";
import { createFeedback } from "../actions";

interface PlayerOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface NewFeedbackDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewFeedbackDrawer({ open, onClose, onSuccess }: NewFeedbackDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerOption[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [comment, setComment] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPlayerSearch("");
      setPlayerResults([]);
      setSelectedPlayer(null);
      setShowResults(false);
      setComment("");
      setError("");
    }
  }, [open]);

  // Debounced player search
  useEffect(() => {
    if (!playerSearch.trim() || selectedPlayer) {
      setPlayerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const q = playerSearch.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      let query = supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("role", "player")
        .eq("is_active", true);
      if (words.length >= 2) {
        query = query.or(
          `and(first_name.ilike.%${words[0]}%,last_name.ilike.%${words[1]}%),and(first_name.ilike.%${words[1]}%,last_name.ilike.%${words[0]}%)`,
        );
      } else {
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
      }
      const { data } = await query.limit(8);
      if (data) {
        setPlayerResults(data as PlayerOption[]);
        setShowResults(true);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSearch, selectedPlayer]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelectPlayer(p: PlayerOption) {
    setSelectedPlayer({ id: p.id, name: `${p.first_name} ${p.last_name}` });
    setPlayerSearch("");
    setShowResults(false);
  }

  function handleSubmit() {
    setError("");
    if (!selectedPlayer) {
      setError("Please select a player");
      return;
    }
    if (!comment.trim()) {
      setError("Please enter feedback");
      return;
    }
    startTransition(async () => {
      const res = await createFeedback({
        player_id: selectedPlayer.id,
        comment: comment.trim(),
      });
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess();
        onClose();
      }
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New Feedback"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </span>
            ) : (
              "Save Feedback"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <Label required>Player</Label>
          {selectedPlayer ? (
            <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
              <span className="text-sm font-medium text-slate-900">{selectedPlayer.name}</span>
              <button
                onClick={() => {
                  setSelectedPlayer(null);
                  setPlayerSearch("");
                }}
                className="p-0.5 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  onFocus={() => playerResults.length > 0 && setShowResults(true)}
                  placeholder="Search by name or email..."
                  className="pl-9"
                />
              </div>
              {showResults && playerResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {playerResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPlayer(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {p.first_name} {p.last_name}
                      </p>
                      {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                    </button>
                  ))}
                </div>
              )}
              {showResults && playerSearch.trim() && playerResults.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-3 text-sm text-slate-400 text-center">
                  No players found
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <Label required>Feedback</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write feedback for the player..."
            rows={6}
          />
        </div>

        {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}
      </div>
    </Drawer>
  );
}
