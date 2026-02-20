"use client";

import { useState, useTransition } from "react";
import { Card, Badge, Button, Drawer } from "@/components/ui";
import { UserCheck, Plus, X, Star } from "lucide-react";
import { assignCoachToGroup, removeCoachFromGroup, setPrimaryCoach } from "@/app/_actions/training";
import type { CoachRow, AvailableCoach } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface CoachesSectionProps {
  groupId: string;
  coaches: CoachRow[];
  onRefresh: () => void;
  supabase: SupabaseClient;
}

export function CoachesSection({ groupId, coaches, onRefresh, supabase }: CoachesSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddCoach, setShowAddCoach] = useState(false);
  const [availableCoaches, setAvailableCoaches] = useState<AvailableCoach[]>([]);

  async function loadAvailableCoaches() {
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("role", ["coach", "admin"])
      .eq("is_active", true)
      .order("first_name");

    const currentCoachIds = new Set(coaches.map((c) => c.id));
    setAvailableCoaches(
      (data || []).filter((c: { id: string }) => !currentCoachIds.has(c.id))
    );
  }

  function handleAssignCoach(coachId: string, isPrimary: boolean) {
    startTransition(async () => {
      const result = await assignCoachToGroup(groupId, coachId, isPrimary);
      if ("error" in result) setError(result.error);
      else {
        setShowAddCoach(false);
        onRefresh();
      }
    });
  }

  function handleRemoveCoach(coachId: string) {
    startTransition(async () => {
      await removeCoachFromGroup(groupId, coachId);
      onRefresh();
    });
  }

  function handleSetPrimary(coachId: string) {
    startTransition(async () => {
      await setPrimaryCoach(groupId, coachId);
      onRefresh();
    });
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-slate-400" />
          Coaches
          <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{coaches.length}</span>
        </h2>
        <Button
          size="sm"
          onClick={() => { setShowAddCoach(true); loadAvailableCoaches(); }}
        >
          <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> Assign Coach</span>
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {coaches.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No coaches assigned yet</p>
      ) : (
        <div className="space-y-2">
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 text-sm">{c.first_name} {c.last_name}</span>
                  {c.is_primary && <Badge variant="info">Primary</Badge>}
                </div>
                {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
              </div>
              <div className="flex items-center gap-1">
                {!c.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(c.id)}
                    disabled={isPending}
                    className="text-xs px-2 py-1 text-slate-500 hover:text-primary hover:bg-primary-50 rounded"
                    title="Set as primary"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleRemoveCoach(c.id)}
                  disabled={isPending}
                  className="text-slate-400 hover:text-red-500 p-1"
                  title="Remove coach"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Coach Drawer */}
      <Drawer
        open={showAddCoach}
        onClose={() => setShowAddCoach(false)}
        title="Assign Coach"
      >
        {availableCoaches.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">All coaches are already assigned</p>
        ) : (
          <div className="space-y-2">
            {availableCoaches.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-slate-300">
                <div>
                  <span className="font-medium text-slate-900 text-sm">{c.first_name} {c.last_name}</span>
                  <span className="text-xs text-slate-400 ml-2 capitalize">{c.role}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleAssignCoach(c.id, true)}
                    disabled={isPending}
                    className="text-xs px-2.5 py-1.5 bg-primary-50 text-primary rounded-lg hover:bg-primary-100"
                  >
                    Primary
                  </button>
                  <button
                    onClick={() => handleAssignCoach(c.id, false)}
                    disabled={isPending}
                    className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                  >
                    Assistant
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </Card>
  );
}
