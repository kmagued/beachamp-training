"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { Card, Input, Select, Label, Button, DatePicker, Textarea, Badge, Toast } from "@/components/ui";
import { Pencil, KeyRound, MoreVertical, Loader2, Copy, Check, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { useRouter } from "next/navigation";
import { updatePlayer, resetPlayerPassword, deletePlayer } from "../actions";
import type { PlayerProfile } from "./types";

interface PlayerActionsProps {
  player: PlayerProfile;
}

export function PlayerActionsMenu({ player }: PlayerActionsProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleResetPassword() {
    setMenuOpen(false);
    startTransition(async () => {
      const res = await resetPlayerPassword(player.id);
      if (res.password) {
        setPasswordResult(res.password);
      } else {
        setToast({ message: res.error ?? "Failed to reset password", variant: "error" });
      }
    });
  }

  function handleCopy() {
    if (passwordResult) {
      navigator.clipboard.writeText(passwordResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleDelete() {
    setMenuOpen(false);
    setConfirmDelete(true);
  }

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

        <div className="relative" ref={menuRef}>
          <Button
            variant="secondary"
            onClick={() => setMenuOpen(!menuOpen)}
            className="px-2.5"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
          </Button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg border border-slate-200 shadow-lg z-20 py-1">
              <button
                onClick={handleResetPassword}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <KeyRound className="w-4 h-4 text-slate-400" />
                Reset Password
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                Delete Player
              </button>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditPlayerModal
          player={player}
          onClose={() => setEditing(false)}
        />
      )}

      {passwordResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Password Reset</h3>
              <p className="text-sm text-slate-500 mt-1">
                New password for {player.first_name} {player.last_name}
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                New Password
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded border border-slate-200 text-slate-900 select-all">
                  {passwordResult}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                  title="Copy"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Share this password with the player. They can change it later.
              </p>
            </div>

            <Button
              fullWidth
              onClick={() => { setPasswordResult(null); setCopied(false); }}
            >
              Done
            </Button>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Delete Player</h3>
              <p className="text-sm text-slate-500 mt-1">
                Are you sure you want to delete <span className="font-medium text-slate-700">{player.first_name} {player.last_name}</span>? This will permanently remove their profile, subscriptions, payments, and attendance records.
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
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
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
          "fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl border-l border-slate-200 transition-transform duration-300 ease-out hidden sm:flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <EditDrawerContent player={player} onClose={onClose} onSuccess={onSuccess} />
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white shadow-xl border-t border-slate-200 rounded-t-2xl transition-transform duration-300 ease-out sm:hidden max-h-[85vh] flex flex-col",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
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
  const [isActive, setIsActive] = useState(player.is_active);
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
    formData.set("playing_level", playingLevel);
    formData.set("training_goals", trainingGoals.join(", "));
    formData.set("health_conditions", healthConditions);
    formData.set("height", height);
    formData.set("weight", weight);
    formData.set("preferred_hand", preferredHand);
    formData.set("preferred_position", preferredPosition);
    formData.set("guardian_name", guardianName);
    formData.set("guardian_phone", guardianPhone);
    formData.set("is_active", String(isActive));
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
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Edit Player</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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

        <div>
          <Label>Area</Label>
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Select area...</option>
            {branding.areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <Label>Status</Label>
            <Select value={String(isActive)} onChange={(e) => setIsActive(e.target.value === "true")}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
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
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
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
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50/50 border border-amber-100">
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
          <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
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
