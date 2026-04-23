"use client";

import { useState, useEffect, useTransition } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Textarea, Label, Button, Select } from "@/components/ui";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createCoachFeedback } from "../actions";

interface CoachOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface NewCoachFeedbackDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  coaches: CoachOption[];
}

export function NewCoachFeedbackDrawer({ open, onClose, onSuccess, coaches }: NewCoachFeedbackDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [selectedCoachId, setSelectedCoachId] = useState("");

  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedCoachId("");
      setRating(null);
      setHoverRating(null);
      setComment("");
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit() {
    setError("");
    if (!selectedCoachId) {
      setError("Please select a coach");
      return;
    }
    if (!comment.trim()) {
      setError("Please enter feedback");
      return;
    }
    startTransition(async () => {
      const res = await createCoachFeedback({
        coach_id: selectedCoachId,
        comment: comment.trim(),
        rating,
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
      title="Give Feedback to Coach"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Sending...
              </span>
            ) : (
              "Send Feedback"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <Label required>Coach</Label>
          <Select
            value={selectedCoachId}
            onChange={(e) => setSelectedCoachId(e.target.value)}
          >
            <option value="">
              {coaches.length === 0 ? "No coaches available" : "Select a coach"}
            </option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Rating</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = (hoverRating ?? rating ?? 0) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? null : n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1"
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >
                  <Star
                    className={cn(
                      "w-6 h-6 transition-colors",
                      active ? "fill-yellow-400 text-yellow-400" : "text-slate-300",
                    )}
                  />
                </button>
              );
            })}
            {rating != null && (
              <button
                type="button"
                onClick={() => setRating(null)}
                className="ml-2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div>
          <Label required>Feedback</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts with your coach..."
            rows={6}
          />
        </div>

        {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}
      </div>
    </Drawer>
  );
}
