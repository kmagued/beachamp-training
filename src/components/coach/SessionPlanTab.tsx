"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Input, Textarea, Button, Badge, Skeleton } from "@/components/ui";
import { upsertSessionPlan } from "@/app/_actions/training";
import { Check, Target } from "lucide-react";

interface SessionPlanTabProps {
  scheduleSessionId: string;
  sessionDate: string;
}

export function SessionPlanTab({ scheduleSessionId, sessionDate }: SessionPlanTabProps) {
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [savedGoal, setSavedGoal] = useState("");
  const [savedDescription, setSavedDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("session_plans")
        .select("goal, description")
        .eq("schedule_session_id", scheduleSessionId)
        .eq("session_date", sessionDate)
        .maybeSingle();
      const g = data?.goal || "";
      const d = data?.description || "";
      setGoal(g);
      setDescription(d);
      setSavedGoal(g);
      setSavedDescription(d);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSessionId, sessionDate]);

  const hasChanges = goal !== savedGoal || description !== savedDescription;
  const showSaved = justSaved && !hasChanges;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await upsertSessionPlan({
        schedule_session_id: scheduleSessionId,
        session_date: sessionDate,
        goal: goal.trim() || null,
        description: description.trim() || null,
      });
      if ("error" in res) {
        setError((res as { error: string }).error);
        return;
      }
      setSavedGoal(goal);
      setSavedDescription(description);
      setJustSaved(true);
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-4 w-32 mt-2" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-slate-500">
        <Target className="w-4 h-4" />
        <p className="text-xs">Set the goal and the workouts/trainings for this session.</p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Goal</label>
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Improve serve consistency and net play"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Workouts &amp; trainings</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder={"List the workouts and trainings to do, e.g.\n- 10 min warm-up\n- Serve drills\n- 3v3 game play"}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        {showSaved ? (
          <Badge variant="success">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          </Badge>
        ) : (
          <Button onClick={handleSave} disabled={!hasChanges || isPending}>
            {isPending ? "Saving..." : "Save Plan"}
          </Button>
        )}
      </div>
    </div>
  );
}
