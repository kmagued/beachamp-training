"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { X, Mail, Phone, MapPin, Calendar, Users, Pencil, ExternalLink, Loader2, ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import { updateCoach, deleteCoach } from "@/app/_actions/training";
import type { CoachRow } from "./types";

interface CoachDrawerProps {
  coach: CoachRow | null;
  onClose: () => void;
  onDataChange: () => void;
}

export function CoachDrawer({ coach, onClose, onDataChange }: CoachDrawerProps) {
  const open = !!coach;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* Desktop: right side panel */}
      <div
        className={cn(
          "absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-xl border-l border-slate-200 transition-transform duration-300 ease-out hidden sm:flex flex-col pointer-events-auto",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {coach && <DrawerContent coach={coach} onClose={onClose} onDataChange={onDataChange} />}
      </div>
      {/* Mobile: bottom sheet */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-white shadow-xl border-t border-slate-200 rounded-t-2xl transition-transform duration-300 ease-out sm:hidden max-h-[85vh] flex flex-col pointer-events-auto",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        {coach && <DrawerContent coach={coach} onClose={onClose} onDataChange={onDataChange} />}
      </div>
    </div>,
    document.body
  );
}

function DrawerContent({ coach, onClose, onDataChange }: { coach: CoachRow; onClose: () => void; onDataChange: () => void }) {
  const [view, setView] = useState<"detail" | "edit">("detail");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setView("detail");
    setConfirmDelete(false);
    setDeleteError(null);
  }, [coach.id]);

  if (view === "edit") {
    return (
      <EditView
        coach={coach}
        onBack={() => setView("detail")}
        onClose={onClose}
        onSuccess={() => {
          onDataChange();
          setView("detail");
        }}
      />
    );
  }

  const initials = `${coach.first_name?.[0] ?? ""}${coach.last_name?.[0] ?? ""}`.toUpperCase();

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Coach Details</h2>
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
              {coach.first_name} {coach.last_name}
            </p>
            <div className="mt-1">
              <Badge variant={coach.is_active ? "success" : "neutral"}>
                {coach.is_active ? "Active" : "Inactive"}
              </Badge>
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
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400">Email</p>
                {coach.email ? (
                  <a href={`mailto:${coach.email}`} className="text-sm text-primary hover:underline truncate block">{coach.email}</a>
                ) : (
                  <p className="text-sm text-slate-700">—</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-400">Phone</p>
                {coach.phone ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">{coach.phone}</span>
                    <a
                      href={buildWhatsAppUrl(coach.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700">—</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Area</p>
                <p className="text-sm text-slate-700 capitalize">{coach.area || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Groups card */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Assigned Groups{coach.group_count > 0 ? ` (${coach.group_count})` : ""}
            </p>
          </div>
          <div className="px-4 py-3">
            {coach.group_count > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {coach.group_names.map((name, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
                    <Users className="w-3 h-3 text-slate-400" />
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not assigned to any group yet</p>
            )}
          </div>
        </div>

        {/* Registered */}
        <div className="flex items-center gap-3 px-1 text-xs text-slate-400">
          <Calendar className="w-3.5 h-3.5" />
          Joined {formatDate(coach.created_at)}
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
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 border border-slate-200 hover:bg-red-50 hover:border-red-200 transition-colors"
            title="Delete Coach"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <Link href={`/admin/coaches/${coach.id}`} className="block">
          <Button fullWidth>
            <span className="flex items-center justify-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> View Full Profile
            </span>
          </Button>
        </Link>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Delete Coach</h3>
              <p className="text-sm text-slate-500 mt-1">
                Permanently delete <span className="font-medium text-slate-700">{coach.first_name} {coach.last_name}</span>? Their account is removed, any sessions they ran become unassigned, and their feedback is deleted. This can&apos;t be undone.
              </p>
            </div>
            {deleteError && <p className="text-xs text-red-600 mb-2 text-center">{deleteError}</p>}
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <button
                onClick={() => {
                  startDeleteTransition(async () => {
                    setDeleteError(null);
                    const res = await deleteCoach(coach.id);
                    if ("error" in res) setDeleteError(res.error ?? "Failed to delete coach");
                    else {
                      setConfirmDelete(false);
                      onClose();
                      onDataChange();
                    }
                  });
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</span>
                ) : (
                  "Delete Coach"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EditView({ coach, onBack, onClose, onSuccess }: { coach: CoachRow; onBack: () => void; onClose: () => void; onSuccess: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState(coach.first_name);
  const [lastName, setLastName] = useState(coach.last_name);
  const [email, setEmail] = useState(coach.email || "");
  const [phone, setPhone] = useState(coach.phone || "");
  const [area, setArea] = useState(coach.area || "");
  const [isActive, setIsActive] = useState(coach.is_active);

  function handleSubmit() {
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required");
      return;
    }
    const formData = new FormData();
    formData.set("first_name", firstName);
    formData.set("last_name", lastName);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("area", area);
    formData.set("is_active", String(isActive));

    startTransition(async () => {
      const res = await updateCoach(coach.id, formData);
      if ("error" in res) setError(res.error ?? "Failed to update coach");
      else onSuccess();
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-slate-900">Edit Coach</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
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
        <div>
          <Label>Area</Label>
          <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Maadi, New Cairo" />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={isActive ? "true" : "false"} onChange={(e) => setIsActive(e.target.value === "true")}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>
        {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
        <Button variant="secondary" className="flex-1" onClick={onBack}>Cancel</Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </>
  );
}
