"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { Card, Input, Select, Label, Button, DatePicker, Textarea, Badge, Toast } from "@/components/ui";
import { Pencil, Loader2, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { useRouter } from "next/navigation";
import { updatePlayer, deletePlayer } from "../actions";
import type { PlayerProfile } from "./types";

interface PlayerActionsProps {
  player: PlayerProfile;
}

export function PlayerActionsMenu({ player }: PlayerActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  function confirmDeletePlayer() {
    startDeleteTransition(async () => {
      const res = await deletePlayer(player.id);
      if (res.success) {
        router.push("/admin/players");
      } else {
        setToast({ message: res.error ?? "Failed to delete player", variant: "error" });
        setConfirmDelete(false);
      }
    });
  }

  return (
    <>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <span className="flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </span>
        </Button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="px-2.5 py-2 rounded-xl text-danger border border-primary-200 hover:bg-danger/5 hover:border-danger/30 transition-colors"
          title="Delete Player"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {editing && (
        <EditPlayerModal
          player={player}
          onClose={() => setEditing(false)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/50 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-danger" />
              </div>
              <h3 className="font-display text-2xl tracking-wide text-primary-900">Delete Player</h3>
              <p className="text-sm text-primary-700/70 mt-2">
                Are you sure you want to delete <span className="font-semibold text-primary-900">{player.first_name} {player.last_name}</span>? This will permanently remove their profile, subscriptions, payments, and attendance records.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                onClick={confirmDeletePlayer}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-danger hover:bg-danger/90 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                  </span>
                ) : (
                  "Delete Player"
                )}
              </button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export function EditPlayerModal({ player, onClose, onSuccess }: { player: PlayerProfile; onClose: () => void; onSuccess?: () => void }) {
  const open = true;

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [handleEsc]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Desktop: right side panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl border-l border-primary-100 transition-transform duration-300 ease-out hidden sm:flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <EditDrawerContent player={player} onClose={onClose} onSuccess={onSuccess} />
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white shadow-xl border-t border-primary-100 rounded-t-2xl transition-transform duration-300 ease-out sm:hidden max-h-[85vh] flex flex-col",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-primary-200" />
        </div>
        <EditDrawerContent player={player} onClose={onClose} onSuccess={onSuccess} />
      </div>
    </>
  );
}

function EditDrawerContent({ player, onClose, onSuccess }: { player: PlayerProfile; onClose: () => void; onSuccess?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState(player.first_name);
  const [lastName, setLastName] = useState(player.last_name);
  const [email, setEmail] = useState(player.email || "");
  const [phone, setPhone] = useState(player.phone || "");
  const [dateOfBirth, setDateOfBirth] = useState(player.date_of_birth || "");
  const [area, setArea] = useState(player.area || "");
  const [gender, setGender] = useState(player.gender || "");
  const [playingLevel, setPlayingLevel] = useState(player.playing_level || "");
  const [trainingGoals, setTrainingGoals] = useState<string[]>(
    player.training_goals ? player.training_goals.split(", ").filter(Boolean) : []
  );
  const [healthConditions, setHealthConditions] = useState(player.health_conditions || "");
  const [height, setHeight] = useState(player.height ? String(player.height) : "");
  const [weight, setWeight] = useState(player.weight ? String(player.weight) : "");
  const [preferredHand, setPreferredHand] = useState(player.preferred_hand || "");
  const [preferredPosition, setPreferredPosition] = useState(player.preferred_position || "");
  const [guardianName, setGuardianName] = useState(player.guardian_name || "");
  const [guardianPhone, setGuardianPhone] = useState(player.guardian_phone || "");
  const [registrationDate, setRegistrationDate] = useState(
    player.created_at ? new Date(player.created_at).toISOString().split("T")[0] : ""
  );

  function handleSubmit() {
    setError("");
    const formData = new FormData();
    formData.set("first_name", firstName);
    formData.set("last_name", lastName);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("date_of_birth", dateOfBirth);
    formData.set("area", area);
    formData.set("gender", gender);
    formData.set("playing_level", playingLevel);
    formData.set("training_goals", trainingGoals.join(", "));
    formData.set("health_conditions", healthConditions);
    formData.set("height", height);
    formData.set("weight", weight);
    formData.set("preferred_hand", preferredHand);
    formData.set("preferred_position", preferredPosition);
    formData.set("guardian_name", guardianName);
    formData.set("guardian_phone", guardianPhone);
    formData.set("created_at", registrationDate);

    startTransition(async () => {
      const res = await updatePlayer(player.id, formData);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess?.();
        onClose();
      }
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-primary-100">
        <h2 className="font-display text-2xl tracking-wide text-primary-900">Edit Player</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-primary-700/50 hover:text-primary-900 hover:bg-primary-50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label required>First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label required>Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date of Birth</Label>
            <DatePicker
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              placeholder="Date of birth"
            />
          </div>
          <div>
            <Label>Registration Date</Label>
            <DatePicker
              value={registrationDate}
              onChange={(e) => setRegistrationDate(e.target.value)}
              placeholder="Registration date"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Area</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Maadi, New Cairo" list="area-suggestions-detail" />
            <datalist id="area-suggestions-detail">
              {branding.areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </div>
        </div>

        <div>
          <Label>Playing Level</Label>
          <Select value={playingLevel} onChange={(e) => setPlayingLevel(e.target.value)}>
            <option value="">Select level...</option>
            {branding.levels.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Training Goals</Label>
          <div className="flex flex-wrap gap-2">
            {branding.trainingGoals.map((goal) => {
              const selected = trainingGoals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() =>
                    setTrainingGoals((prev) =>
                      selected ? prev.filter((g) => g !== goal) : [...prev, goal]
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-primary-50 border-primary-300 text-primary-800"
                      : "bg-white border-primary-100 text-primary-700/70 hover:border-primary-200"
                  }`}
                >
                  {goal}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Health / Injury Conditions</Label>
          <Textarea
            value={healthConditions}
            onChange={(e) => setHealthConditions(e.target.value)}
            placeholder="Any injuries or health conditions..."
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Height (cm)</Label>
            <Input type="number" min={100} max={250} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="170" />
          </div>
          <div>
            <Label>Weight (kg)</Label>
            <Input type="number" min={20} max={200} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="70" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Preferred Hand</Label>
            <Select value={preferredHand} onChange={(e) => setPreferredHand(e.target.value)}>
              <option value="">Select...</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </Select>
          </div>
          <div>
            <Label>Preferred Position</Label>
            <Select value={preferredPosition} onChange={(e) => setPreferredPosition(e.target.value)}>
              <option value="">Select...</option>
              <option value="defender">Defender</option>
              <option value="blocker">Blocker</option>
            </Select>
          </div>
        </div>

        {dateOfBirth && (() => {
          const age = Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          return age < 16;
        })() && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-accent/10 border border-accent/30">
            <div>
              <Label required>Guardian Name</Label>
              <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Parent/guardian name" />
            </div>
            <div>
              <Label required>Guardian Phone</Label>
              <Input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 bg-danger/5 border border-danger/20 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-primary-100 flex items-center gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </span>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </>
  );
}
