"use client";

import { useEffect, useCallback } from "react";
import { Badge } from "@/components/ui";
import { X, Mail, Phone, MapPin, Calendar, Shield, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRow } from "./types";
import type { UserRole } from "@/types/database";

function RoleBadge({ role }: { role: string }) {
  switch (role) {
    case "admin": return <Badge variant="danger">Admin</Badge>;
    case "coach": return <Badge variant="info">Coach</Badge>;
    default: return <Badge variant="neutral">Player</Badge>;
  }
}

const roleBgColor: Record<string, string> = {
  admin: "bg-red-500",
  coach: "bg-sky-500",
  player: "bg-slate-400",
};

interface UserDrawerProps {
  user: UserRow | null;
  onClose: () => void;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  changingRoleId: string | null;
  currentUserId: string;
}

export function UserDrawer({ user, onClose, onRoleChange, changingRoleId, currentUserId }: UserDrawerProps) {
  const open = !!user;

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
        {user && <DrawerContent user={user} onClose={onClose} onRoleChange={onRoleChange} changingRoleId={changingRoleId} isSelf={user.id === currentUserId} />}
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white shadow-xl border-t border-slate-200 rounded-t-2xl transition-transform duration-300 ease-out sm:hidden max-h-[85vh] flex flex-col",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        {user && <DrawerContent user={user} onClose={onClose} onRoleChange={onRoleChange} changingRoleId={changingRoleId} isSelf={user.id === currentUserId} />}
      </div>
    </>
  );
}

function DrawerContent({ user, onClose, onRoleChange, changingRoleId, isSelf }: {
  user: UserRow;
  onClose: () => void;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  changingRoleId: string | null;
  isSelf: boolean;
}) {
  const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase();
  const avatarBg = roleBgColor[user.role] || "bg-slate-400";

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">User Details</h2>
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
          <div className={cn("w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0", avatarBg)}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900 truncate">
              {user.first_name} {user.last_name}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <RoleBadge role={user.role} />
              <Badge variant={user.is_active ? "success" : "neutral"}>
                {user.is_active ? "Active" : "Inactive"}
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
              <div className="min-w-0">
                <p className="text-xs text-slate-400">Email</p>
                <p className="text-sm text-slate-700 truncate">{user.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Phone</p>
                <p className="text-sm text-slate-700">{user.phone || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Area</p>
                <p className="text-sm text-slate-700 capitalize">{user.area || "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Account info card */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Account</p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex items-center gap-3 px-4 py-3">
              <Shield className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400">Role</p>
                {isSelf ? (
                  <p className="text-sm text-slate-700 capitalize">{user.role}</p>
                ) : changingRoleId === user.id ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">Updating...</span>
                  </div>
                ) : (
                  <select
                    value={user.role}
                    onChange={(e) => {
                      const newRole = e.target.value as UserRole;
                      if (newRole === user.role) return;
                      if (newRole === "admin" || user.role === "admin") {
                        const confirmed = window.confirm(
                          `Are you sure you want to change this user's role ${user.role === "admin" ? "from" : "to"} Admin?`
                        );
                        if (!confirmed) {
                          e.target.value = user.role;
                          return;
                        }
                      }
                      onRoleChange(user.id, newRole);
                    }}
                    className="mt-0.5 text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                  >
                    <option value="player">Player</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Registered</p>
                <p className="text-sm text-slate-700">
                  {new Date(user.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
