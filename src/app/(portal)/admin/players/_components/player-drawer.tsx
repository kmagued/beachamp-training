"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { Badge, Card, Button, Input, Select, Label, DatePicker, Textarea } from "@/components/ui";
import {
  X, Mail, Phone, MapPin, Calendar, Heart, Target, Dumbbell,
  KeyRound, Pencil, Copy, Check, ExternalLink, Loader2, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { updatePlayer, resetPlayerPassword } from "../[id]/actions";
import type { PlayerRow } from "./types";
import { getPlayerStatus } from "./types";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active": return <Badge variant="success">Active</Badge>;
    case "expiring": return <Badge variant="warning">Expiring</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    default: return <Badge variant="neutral">Inactive</Badge>;
  }
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return null;
  switch (level) {
    case "beginner": return <Badge variant="info">Beginner</Badge>;
    case "intermediate": return <Badge variant="info">Intermediate</Badge>;
    case "advanced": return <Badge variant="success">Advanced</Badge>;
    case "professional": return <Badge variant="success">Professional</Badge>;
    default: return <Badge variant="neutral">{level}</Badge>;
  }
}

interface PlayerDrawerProps {
  player: PlayerRow | null;
  onClose: () => void;
  onDataChange: () => void;
}

export function PlayerDrawer({ player, onClose, onDataChange }: PlayerDrawerProps) {
  const open = !!player;

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, handleEsc]);

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
        {player && <DrawerContent player={player} onClose={onClose} onDataChange={onDataChange} />}
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
        {player && <DrawerContent player={player} onClose={onClose} onDataChange={onDataChange} />}
      </div>
    </>
  );
}

function DrawerContent({
  player,
  onClose,
  onDataChange,
}: {
  player: PlayerRow;
  onClose: () => void;
  onDataChange: () => void;
}) {
  const [view, setView] = useState<"detail" | "edit">("detail");
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isResetting, startResetTransition] = useTransition();

  // Reset to detail view when player changes
  useEffect(() => {
    setView("detail");
    setPasswordResult(null);
    setCopied(false);
  }, [player.id]);

  function handleResetPassword() {
    startResetTransition(async () => {
      const res = await resetPlayerPassword(player.id);
      if (res.password) setPasswordResult(res.password);
    });
  }

  function handleCopy() {
    if (passwordResult) {
      navigator.clipboard.writeText(passwordResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (view === "edit") {
    return (
      <EditView
        player={player}
        onBack={() => setView("detail")}
        onClose={onClose}
        onSuccess={() => {
          onDataChange();
          setView("detail");
        }}
      />
    );
  }

  const status = getPlayerStatus(player);
  const activeSub = player.subscriptions?.find((s) => s.status === "active");
  const initials = `${player.first_name?.[0] ?? ""}${player.last_name?.[0] ?? ""}`.toUpperCase();

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Player Details</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {/* Profile */}
        <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0 bg-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900 truncate">
              {player.first_name} {player.last_name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={status} />
              <LevelBadge level={player.playing_level} />
            </div>
          </div>
        </div>

        {/* Contact info card */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Information</p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center gap-3 px-4 py-3">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-slate-400">Email</p>
                <p className="text-sm text-slate-700 truncate">{player.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Phone</p>
                <p className="text-sm text-slate-700">{player.phone || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Area</p>
                <p className="text-sm text-slate-700 capitalize">{player.area || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Player details card */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Player Details</p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center gap-3 px-4 py-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Date of Birth</p>
                <p className="text-sm text-slate-700">
                  {player.date_of_birth
                    ? new Date(player.date_of_birth).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                    : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Target className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Training Goals</p>
                <p className="text-sm text-slate-700">{player.training_goals || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Heart className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Health Conditions</p>
                <p className="text-sm text-slate-700">{player.health_conditions || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Active subscription card */}
        {activeSub && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Subscription</p>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center gap-3 px-4 py-3">
                <Dumbbell className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Package</p>
                  <p className="text-sm text-slate-700 font-medium">{activeSub.packages?.name || "—"}</p>
                </div>
              </div>
              <div className="flex items-start justify-between px-4 py-3">
                <div>
                  <p className="text-xs text-slate-400">Sessions</p>
                  <p className="text-sm text-slate-700 font-medium">
                    {activeSub.sessions_remaining}/{activeSub.sessions_total} remaining
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Expires</p>
                  <p className="text-sm text-slate-700">
                    {activeSub.end_date
                      ? new Date(activeSub.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Registered */}
        <div className="flex items-center gap-3 px-1 text-xs text-slate-400">
          <Calendar className="w-3.5 h-3.5" />
          Registered {new Date(player.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-slate-100 space-y-3">
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setView("edit")}>
            <span className="flex items-center justify-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </span>
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleResetPassword}
            disabled={isResetting}
          >
            <span className="flex items-center justify-center gap-1.5">
              {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Reset Password
            </span>
          </Button>
        </div>
        <Link href={`/admin/players/${player.id}`} className="block">
          <Button variant="secondary" fullWidth>
            <span className="flex items-center justify-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> View Full Profile
            </span>
          </Button>
        </Link>
      </div>

      {/* Password result modal */}
      {passwordResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
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
    </>
  );
}

function EditView({
  player,
  onBack,
  onClose,
  onSuccess,
}: {
  player: PlayerRow;
  onBack: () => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
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
  const [isActive, setIsActive] = useState(player.is_active);

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
    formData.set("is_active", String(isActive));

    startTransition(async () => {
      const res = await updatePlayer(player.id, formData);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess();
      }
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-slate-900">Edit Player</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <div className="space-y-4">
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
              <Label>Area</Label>
              <Select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Select area...</option>
                {branding.areas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </div>
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
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
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
