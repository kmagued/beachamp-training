import { useState, useTransition, useEffect } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Button, DatePicker } from "@/components/ui";
import { Loader2, Plus, Check, X } from "lucide-react";
import { createExpense, updateExpense, createExpenseCategory } from "@/app/_actions/expenses";
import type { ExpenseRow, CategoryRow } from "./types";

interface ExpenseDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  editingExpense: ExpenseRow | null;
  onSuccess: () => void;
}

export function ExpenseDrawer({ open, onClose, categories, editingExpense, onSuccess }: ExpenseDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("monthly");
  const [notes, setNotes] = useState("");

  // Inline new category
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryPending, setCategoryPending] = useState(false);

  // Reset form when opening/editing
  useEffect(() => {
    if (open) {
      if (editingExpense) {
        setCategoryId(editingExpense.category_id);
        setDescription(editingExpense.description);
        setAmount(String(editingExpense.amount));
        setExpenseDate(editingExpense.expense_date);
        setIsRecurring(editingExpense.is_recurring);
        setRecurrenceType(editingExpense.recurrence_type || "monthly");
        setNotes(editingExpense.notes || "");
      } else {
        setCategoryId(categories[0]?.id || "");
        setDescription("");
        setAmount("");
        setExpenseDate(new Date().toISOString().split("T")[0]);
        setIsRecurring(false);
        setRecurrenceType("monthly");
        setNotes("");
      }
      setError("");
      setShowNewCategory(false);
      setNewCategoryName("");
    }
  }, [open, editingExpense, categories]);

  function handleSubmit() {
    setError("");
    const formData = new FormData();
    formData.set("category_id", categoryId);
    formData.set("description", description);
    formData.set("amount", amount);
    formData.set("expense_date", expenseDate);
    formData.set("is_recurring", String(isRecurring));
    if (isRecurring) formData.set("recurrence_type", recurrenceType);
    formData.set("notes", notes);

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
      // Refresh data so the new category appears, then select it
      onSuccess();
    }
  }

  const activeCategories = categories.filter((c) => c.is_active);

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

        <div>
          <Label required>Description</Label>
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
          />
        </div>

        <div>
          <Label required>Date</Label>
          <DatePicker
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </div>

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
