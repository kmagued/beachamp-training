import { useState, useTransition, useEffect, useMemo } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Button, DatePicker } from "@/components/ui";
import { Loader2, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createExpense, updateExpense, createExpenseCategory } from "@/app/_actions/expenses";
import type { ExpenseRow, CategoryRow } from "./types";

export interface CourtSession {
  id: string;
  start_time: string;
  end_time: string;
  group_name: string;
  location: string | null;
}

interface ExpenseDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  editingExpense: ExpenseRow | null;
  onSuccess: () => void;
  defaultDate?: string;
  /** When provided, court calculator shows session-based selection */
  sessions?: CourtSession[];
}

export function ExpenseDrawer({ open, onClose, categories, editingExpense, onSuccess, defaultDate, sessions }: ExpenseDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("monthly");
  const [notes, setNotes] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"paid_full" | "partially_paid" | "payment_due">("paid_full");
  const [paidAmount, setPaidAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Court reservation fields (generic mode)
  const [courtCount, setCourtCount] = useState("");
  const [courtHours, setCourtHours] = useState("");
  const [courtHourlyRate, setCourtHourlyRate] = useState("250");
  const [useCourtCalculator, setUseCourtCalculator] = useState(true);

  // Session-based court calculator
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [sessionCourts, setSessionCourts] = useState<Record<string, string>>({});

  // Inline new category
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryPending, setCategoryPending] = useState(false);

  const activeCategories = categories.filter((c) => c.is_active);
  const selectedCategory = activeCategories.find((c) => c.id === categoryId);
  const isCourtReservation = selectedCategory?.name === "Court Reservation";

  const hasSessionMode = !!sessions && sessions.length > 0;

  // Helper: calculate duration of a session in hours (handles midnight 00:00 as end-of-day)
  function getSessionHours(session: CourtSession) {
    const [sh, sm] = session.start_time.split(":").map(Number);
    const [eh, em] = session.end_time.split(":").map(Number);
    let endMinutes = eh * 60 + em;
    const startMinutes = sh * 60 + sm;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60; // midnight wrap
    return (endMinutes - startMinutes) / 60;
  }

  // Session-based total calculation
  const sessionTotal = useMemo(() => {
    if (!hasSessionMode || !isCourtReservation || !useCourtCalculator) return 0;
    const rate = Number(courtHourlyRate) || 0;
    let total = 0;
    selectedSessions.forEach((sid) => {
      const session = sessions!.find((s) => s.id === sid);
      if (!session) return;
      const courts = Number(sessionCourts[sid]) || 1;
      const hours = getSessionHours(session);
      total += courts * hours * rate;
    });
    return total;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessions, sessionCourts, courtHourlyRate, hasSessionMode, isCourtReservation, useCourtCalculator, sessions]);

  // Auto-calculate amount for court reservations (only when calculator is active)
  useEffect(() => {
    if (isCourtReservation && useCourtCalculator) {
      if (hasSessionMode) {
        if (sessionTotal > 0) setAmount(String(sessionTotal));
        else setAmount("");
      } else {
        const courts = Number(courtCount) || 0;
        const hours = Number(courtHours) || 0;
        const rate = Number(courtHourlyRate) || 0;
        const calculated = courts * hours * rate;
        if (calculated > 0) setAmount(String(calculated));
        else setAmount("");
      }
    }
  }, [courtCount, courtHours, courtHourlyRate, isCourtReservation, useCourtCalculator, hasSessionMode, sessionTotal]);

  // Reset form when opening/editing
  useEffect(() => {
    if (open) {
      if (editingExpense) {
        setCategoryId(editingExpense.category_id);
        setDescription(editingExpense.description);
        setAmount(String(editingExpense.amount));
        setExpenseDate(editingExpense.expense_date || new Date().toISOString().split("T")[0]);
        setIsRecurring(editingExpense.is_recurring);
        setRecurrenceType(editingExpense.recurrence_type || "monthly");
        setNotes(editingExpense.notes || "");
        setCourtCount(editingExpense.court_count ? String(editingExpense.court_count) : "");
        setCourtHours(editingExpense.court_hours ? String(editingExpense.court_hours) : "");
        setCourtHourlyRate(editingExpense.court_hourly_rate ? String(editingExpense.court_hourly_rate) : "250");
        setUseCourtCalculator(!!editingExpense.court_count);
        setSelectedSessions(new Set());
        setSessionCourts({});
        setPaymentStatus(editingExpense.payment_status || "paid_full");
        setPaidAmount(editingExpense.paid_amount ? String(editingExpense.paid_amount) : "");
        setDueDate(editingExpense.due_date || "");
      } else {
        setCategoryId(activeCategories[0]?.id || "");
        setDescription("");
        setAmount("");
        setExpenseDate(defaultDate || new Date().toISOString().split("T")[0]);
        setIsRecurring(false);
        setRecurrenceType("monthly");
        setNotes("");
        setCourtCount("");
        setCourtHours("");
        setCourtHourlyRate("250");
        setUseCourtCalculator(true);
        setSelectedSessions(new Set());
        setSessionCourts({});
        setPaymentStatus("paid_full");
        setPaidAmount("");
        setDueDate("");
      }
      setError("");
      setShowNewCategory(false);
      setNewCategoryName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingExpense]);

  function handleSubmit() {
    setError("");
    const formData = new FormData();
    formData.set("category_id", categoryId);
    formData.set("description", description);
    formData.set("amount", amount);
    formData.set("payment_status", paymentStatus);
    formData.set("expense_date", paymentStatus === "payment_due" ? new Date().toISOString().split("T")[0] : expenseDate);
    formData.set("is_recurring", String(isRecurring));
    if (isRecurring) formData.set("recurrence_type", recurrenceType);
    formData.set("notes", notes);
    if (paymentStatus === "partially_paid" && paidAmount) formData.set("paid_amount", paidAmount);
    if (paymentStatus === "payment_due" && dueDate) formData.set("due_date", dueDate);
    if (isCourtReservation && useCourtCalculator) {
      formData.set("court_hourly_rate", courtHourlyRate);
      if (hasSessionMode) {
        // Aggregate court data from selected sessions
        let totalCourts = 0;
        let totalHours = 0;
        selectedSessions.forEach((sid) => {
          const session = sessions!.find((s) => s.id === sid);
          if (!session) return;
          totalCourts += Number(sessionCourts[sid]) || 1;
          totalHours += getSessionHours(session);
        });
        formData.set("court_count", String(totalCourts));
        formData.set("court_hours", String(totalHours));
      } else {
        formData.set("court_count", courtCount);
        formData.set("court_hours", courtHours);
      }
    }

    startTransition(async () => {
      const res = editingExpense
        ? await updateExpense(editingExpense.id, formData)
        : await createExpense(formData);

      if (res.error) {
        setError(res.error);
      } else {
        onSuccess();
        onClose();
      }
    });
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCategoryPending(true);
    setError("");
    const formData = new FormData();
    formData.set("name", newCategoryName.trim());

    const res = await createExpenseCategory(formData);
    setCategoryPending(false);

    if (res.error) {
      setError(res.error);
    } else {
      setNewCategoryName("");
      setShowNewCategory(false);
      onSuccess();
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={editingExpense ? "Edit Expense" : "Add Expense"}>
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-sm text-red-600">{error}</div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label required className="mb-0">Category</Label>
            {!showNewCategory && (
              <button
                onClick={() => setShowNewCategory(true)}
                className="text-xs font-medium text-primary hover:text-primary-600 transition-colors inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>

          {showNewCategory ? (
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCategory();
                  if (e.key === "Escape") { setShowNewCategory(false); setNewCategoryName(""); }
                }}
                autoFocus
              />
              <button
                onClick={handleCreateCategory}
                disabled={categoryPending || !newCategoryName.trim()}
                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                {categoryPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }}
                className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select category</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Court reservation: toggle between calculator and manual */}
        {isCourtReservation && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setUseCourtCalculator(true)}
                className={cn(
                  "py-2 text-xs font-medium rounded-md transition-colors",
                  useCourtCalculator
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                Calculator
              </button>
              <button
                type="button"
                onClick={() => setUseCourtCalculator(false)}
                className={cn(
                  "py-2 text-xs font-medium rounded-md transition-colors",
                  !useCourtCalculator
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                Manual Amount
              </button>
            </div>
            {useCourtCalculator && (
              <div className="p-4 rounded-xl bg-primary-50/50 border border-primary-100 space-y-3">
                {/* Hourly rate — shared for both modes */}
                <div>
                  <Label>Hourly Rate (EGP)</Label>
                  <Input type="number" min="0" value={courtHourlyRate} onChange={(e) => setCourtHourlyRate(e.target.value)} placeholder="250" />
                </div>

                {hasSessionMode ? (
                  <>
                    {/* Session-based calculator */}
                    <div>
                      <Label>Sessions</Label>
                      <div className="space-y-2 mt-1">
                        {sessions!.map((session) => {
                          const isSelected = selectedSessions.has(session.id);
                          const hours = getSessionHours(session);
                          const courtsStr = sessionCourts[session.id] ?? "";
                          const courts = Number(courtsStr) || 1;
                          return (
                            <div
                              key={session.id}
                              className={cn(
                                "rounded-lg border p-3 transition-colors",
                                isSelected
                                  ? "border-primary-200 bg-white"
                                  : "border-slate-200 bg-slate-50/50"
                              )}
                            >
                              <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedSessions);
                                    if (e.target.checked) next.add(session.id);
                                    else next.delete(session.id);
                                    setSelectedSessions(next);
                                  }}
                                  className="table-checkbox mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-900">{session.group_name}</p>
                                  <p className="text-xs text-slate-400">
                                    {session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}
                                    {" · "}{hours}h
                                    {session.location && ` · ${session.location}`}
                                  </p>
                                </div>
                              </label>
                              {isSelected && (
                                <div className="mt-2 ml-7 flex items-center gap-2">
                                  <span className="text-xs text-slate-500 whitespace-nowrap">Courts:</span>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={courtsStr}
                                    onChange={(e) => setSessionCourts((prev) => ({
                                      ...prev,
                                      [session.id]: e.target.value,
                                    }))}
                                    className="w-20 h-8 text-xs"
                                    placeholder="1"
                                  />
                                  <span className="text-xs text-slate-400">
                                    = {(courts * hours * (Number(courtHourlyRate) || 0)).toLocaleString()} EGP
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {sessionTotal > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t border-primary-100">
                        <span className="text-xs font-medium text-slate-500">Total</span>
                        <span className="text-sm font-bold text-primary-700">{sessionTotal.toLocaleString()} EGP</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Generic calculator */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Courts</Label>
                        <Input type="number" min="1" value={courtCount} onChange={(e) => setCourtCount(e.target.value)} placeholder="1" />
                      </div>
                      <div>
                        <Label>Hours</Label>
                        <Input type="number" min="0.5" step="0.5" value={courtHours} onChange={(e) => setCourtHours(e.target.value)} placeholder="1" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Court 1 monthly rent"
          />
        </div>

        <div>
          <Label required>Amount (EGP)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            readOnly={isCourtReservation && useCourtCalculator}
            className={isCourtReservation && useCourtCalculator ? "bg-slate-50 cursor-not-allowed" : ""}
          />
        </div>

        {/* Payment status */}
        <div>
          <Label>Payment Status</Label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as "paid_full" | "partially_paid" | "payment_due")}
            className="w-full h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="paid_full">Paid in Full</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="payment_due">Payment Due</option>
          </select>
        </div>

        {paymentStatus === "partially_paid" && (
          <div>
            <Label required>Amount Paid (EGP)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}

        {paymentStatus === "payment_due" && (
          <div>
            <Label>Due Date</Label>
            <DatePicker
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        )}

        {paymentStatus !== "payment_due" && (
          <div>
            <Label required>Date</Label>
            <DatePicker
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="is_recurring"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
          />
          <label htmlFor="is_recurring" className="text-sm font-medium text-slate-700">
            Recurring expense
          </label>
        </div>

        {isRecurring && (
          <div>
            <Label required>Recurrence</Label>
            <select
              value={recurrenceType}
              onChange={(e) => setRecurrenceType(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        )}

        <div>
          <Label>Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={3}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>

        <Button onClick={handleSubmit} disabled={isPending} className="w-full">
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {editingExpense ? "Updating..." : "Adding..."}
            </span>
          ) : (
            editingExpense ? "Update Expense" : "Add Expense"
          )}
        </Button>
      </div>
    </Drawer>
  );
}
