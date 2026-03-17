"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Badge, Button, Input, Select, DatePicker } from "@/components/ui";
import { X, Check, Image as ImageIcon, Loader2, Pencil, Search, Link2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format-date";
import { updatePayment, linkPaymentToPlayer, deletePayment } from "../actions";
import type { PaymentRow } from "./types";

interface PlayerOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "pending" ? "warning" : status === "confirmed" ? "success" : status === "rejected" ? "danger" : "neutral";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-700 text-right">{value}</span>
    </div>
  );
}

interface PaymentDrawerProps {
  payment: PaymentRow | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onViewScreenshot: (path: string) => void;
  onDataChange: () => void;
  isPending: boolean;
  actionId: string | null;
}

export function PaymentDrawer({
  payment,
  onClose,
  onConfirm,
  onReject,
  onViewScreenshot,
  onDataChange,
  isPending,
  actionId,
}: PaymentDrawerProps) {
  const open = !!payment;

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
        {payment && <DrawerContent payment={payment} onClose={onClose} onConfirm={onConfirm} onReject={onReject} onViewScreenshot={onViewScreenshot} onDataChange={onDataChange} isPending={isPending} actionId={actionId} />}
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
        {payment && <DrawerContent payment={payment} onClose={onClose} onConfirm={onConfirm} onReject={onReject} onViewScreenshot={onViewScreenshot} onDataChange={onDataChange} isPending={isPending} actionId={actionId} />}
      </div>
    </>
  );
}

function DrawerContent({
  payment,
  onClose,
  onConfirm,
  onReject,
  onViewScreenshot,
  onDataChange,
  isPending,
  actionId,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onViewScreenshot: (path: string) => void;
  onDataChange: () => void;
  isPending: boolean;
  actionId: string | null;
}) {
  // Link to player state
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerOption[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isLinking, startLinkTransition] = useTransition();
  const [linkError, setLinkError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Search players with debounce
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
          `and(first_name.ilike.%${words[0]}%,last_name.ilike.%${words[1]}%),and(first_name.ilike.%${words[1]}%,last_name.ilike.%${words[0]}%)`
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Reset link state when payment changes
  useEffect(() => {
    setPlayerSearch("");
    setPlayerResults([]);
    setSelectedPlayer(null);
    setShowResults(false);
    setLinkError(null);
  }, [payment.id]);

  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(payment.amount);
  const [editMethod, setEditMethod] = useState(payment.method);
  const [editStatus, setEditStatus] = useState(payment.status);
  function getDisplayDate(p: PaymentRow): string {
    if (p.status === "pending") return "";
    if (p.confirmed_at) return new Date(p.confirmed_at).toISOString().split("T")[0];
    if (p.subscriptions?.start_date) return p.subscriptions.start_date;
    return "";
  }

  const [editDate, setEditDate] = useState(getDisplayDate(payment));
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset edit state when payment changes
  useEffect(() => {
    setEditing(false);
    setEditAmount(payment.amount);
    setEditMethod(payment.method);
    setEditStatus(payment.status);
    setEditDate(getDisplayDate(payment));
    setEditError(null);
    setConfirmDelete(false);
  }, [payment.id, payment.amount, payment.method, payment.status, payment.confirmed_at, payment.subscriptions?.start_date]);

  function handleSaveEdit() {
    if (editAmount <= 0) {
      setEditError("Amount must be greater than 0");
      return;
    }
    setEditError(null);
    startUpdateTransition(async () => {
      const currentDate = getDisplayDate(payment);
      const res = await updatePayment(payment.id, {
        amount: editAmount,
        method: editMethod,
        status: editStatus !== payment.status ? editStatus : undefined,
        payment_date: editDate && editDate !== currentDate ? editDate : undefined,
      });
      if ("error" in res) {
        setEditError(res.error ?? "Failed to update payment");
      } else {
        setEditing(false);
        onDataChange();
      }
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-900">Payment Details</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {payment.profiles
              ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
              : payment.note || "Single session"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Amount (EGP)</label>
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(Number(e.target.value))}
                min={1}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Method</label>
              <Select value={editMethod} onChange={(e) => setEditMethod(e.target.value)}>
                <option value="instapay">Instapay</option>
                <option value="cash">Cash</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
              <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Payment Date</label>
              <DatePicker
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                placeholder="Select payment date..."
              />
            </div>
            {editError && (
              <p className="text-xs text-red-600">{editError}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl font-bold text-slate-900">{payment.amount.toLocaleString()} EGP</span>
              <StatusBadge status={payment.status} />
            </div>

            <div className="space-y-0">
              {payment.profiles ? (
                <DetailRow label="Player" value={`${payment.profiles.first_name} ${payment.profiles.last_name}`} />
              ) : payment.note ? (
                <DetailRow label="Note" value={payment.note} />
              ) : null}
              <DetailRow label="Package" value={payment.subscriptions?.packages?.name || (payment.profiles ? "—" : "Single session")} />
              <DetailRow
                label="Method"
                value={<span className="capitalize">{payment.method.replace(/_/g, " ")}</span>}
              />
              <DetailRow
                label="Submitted"
                value={formatDateTime(payment.created_at)}
              />
              {payment.confirmed_at && (
                <DetailRow
                  label="Confirmed"
                  value={formatDateTime(payment.confirmed_at)}
                />
              )}
              {payment.status === "rejected" && payment.rejection_reason && (
                <DetailRow
                  label="Rejection Reason"
                  value={<span className="text-red-500">{payment.rejection_reason}</span>}
                />
              )}
            </div>

            {/* Link to Player — only for standalone/quick payments */}
            {!payment.player_id && (
              <div className="mt-4 p-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/50">
                <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Link to Player Account
                </p>
                {selectedPlayer ? (
                  <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                    <span className="text-sm font-medium text-slate-900">{selectedPlayer.name}</span>
                    <button onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); }} className="p-0.5 rounded text-slate-400 hover:text-slate-600">
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
                            onClick={() => {
                              setSelectedPlayer({ id: p.id, name: `${p.first_name} ${p.last_name}` });
                              setPlayerSearch("");
                              setShowResults(false);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                          >
                            <p className="text-sm font-medium text-slate-900">{p.first_name} {p.last_name}</p>
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
                {selectedPlayer && (
                  <button
                    onClick={() => {
                      setLinkError(null);
                      startLinkTransition(async () => {
                        const res = await linkPaymentToPlayer(payment.id, selectedPlayer.id);
                        if ("error" in res) {
                          setLinkError(res.error ?? "Failed to link");
                        } else {
                          onDataChange();
                        }
                      });
                    }}
                    disabled={isLinking}
                    className="mt-2 w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isLinking ? "Linking..." : "Link Payment to Player"}
                  </button>
                )}
                {linkError && <p className="text-xs text-red-600 mt-1">{linkError}</p>}
              </div>
            )}

            {payment.screenshot_url && (
              <button
                onClick={() => onViewScreenshot(payment.screenshot_url!)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                View Payment Screenshot
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-slate-100 space-y-3">
        {editing ? (
          <div className="flex gap-3">
            <Button onClick={handleSaveEdit} disabled={isUpdating} fullWidth>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="secondary" onClick={() => { setEditing(false); setEditAmount(payment.amount); setEditMethod(payment.method); setEditStatus(payment.status); setEditDate(getDisplayDate(payment)); setEditError(null); }} disabled={isUpdating}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            {payment.status === "pending" && (
              <div className="flex gap-3">
                <button
                  onClick={() => onConfirm(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  {isPending && actionId === payment.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Confirm Payment
                </button>
                <button
                  onClick={() => onReject(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setEditing(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Payment
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-sm text-red-600 font-medium hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-lg p-6 mx-5 max-w-sm w-full">
            <h3 className="font-semibold text-slate-900 mb-2">Delete Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              This will permanently delete this payment{payment.subscription_id ? " and its associated subscription" : ""}. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  startDeleteTransition(async () => {
                    setDeleteError(null);
                    const res = await deletePayment(payment.id);
                    if ("error" in res) {
                      setDeleteError(res.error ?? "Failed to delete payment");
                    } else {
                      onClose();
                      onDataChange();
                    }
                  });
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
          </div>
        </div>
      )}
    </>
  );
}
