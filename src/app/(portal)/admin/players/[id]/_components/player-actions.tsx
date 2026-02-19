"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Card, Input, Select, Label, Button, DatePicker, Textarea, Badge } from "@/components/ui";
import { Pencil, KeyRound, MoreVertical, Loader2, Copy, Check, X } from "lucide-react";
import { branding } from "@/lib/config/branding";
import { updatePlayer, resetPlayerPassword } from "../actions";
import type { PlayerProfile } from "./types";

interface PlayerActionsProps {
  player: PlayerProfile;
}

export function PlayerActionsMenu({ player }: PlayerActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
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
    </>
  );
}

export function EditPlayerModal({ player, onClose, onSuccess }: { player: PlayerProfile; onClose: () => void; onSuccess?: () => void }) {
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
        onSuccess?.();
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-slate-900">Edit Player</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label required>Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Date of Birth</Label>
            <DatePicker
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              placeholder="Date of birth"
            />
          </div>
          <div>
            <Label>Area of Residence</Label>
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Select area...</option>
              {branding.areas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
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
            <Label>Status</Label>
            <Select value={String(isActive)} onChange={(e) => setIsActive(e.target.value === "true")}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
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
          <div className="mt-4 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </span>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
