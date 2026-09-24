import { useState, useTransition, useEffect } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Button, DatePicker, Select } from "@/components/ui";
import { Loader2, Plus, Check, X } from "lucide-react";
import { createIncome, updateIncome, createIncomeCategory } from "@/app/_actions/income";
import type { IncomeRow, CategoryRow } from "./types";

export interface IncomeFormProps {
  /** Drives the reset-on-open effect; the form itself renders no chrome */
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  editingIncome: IncomeRow | null;
  onSuccess: () => void;
  /** Refetch categories after one is created inline (no toast) */
  onCategoriesChange: () => void;
}

/** Income form body — rendered inside a Drawer by IncomeDrawer or EntryDrawer */
export function IncomeForm({ open, onClose, categories, editingIncome, onSuccess, onCategoriesChange }: IncomeFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  // Inline new category
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryPending, setCategoryPending] = useState(false);

  const activeCategories = categories.filter((c) => c.is_active);

  // Reset form when opening/editing
  useEffect(() => {
    if (open) {
      if (editingIncome) {
        setCategoryId(editingIncome.category_id);
        setDescription(editingIncome.description || "");
        setAmount(String(editingIncome.amount));
        setIncomeDate(editingIncome.income_date || new Date().toISOString().split("T")[0]);
        setNotes(editingIncome.notes || "");
      } else {
        setCategoryId("");
        setDescription("");
        setAmount("");
        setIncomeDate(new Date().toISOString().split("T")[0]);
        setNotes("");
      }
      setError("");
      setShowNewCategory(false);
      setNewCategoryName("");
    }
  }, [open, editingIncome]);

  function handleSubmit() {
    setError("");
    const formData = new FormData();
    formData.set("category_id", categoryId);
    formData.set("description", description);
    formData.set("amount", amount);
    formData.set("income_date", incomeDate);
    formData.set("notes", notes);

    startTransition(async () => {
      const res = editingIncome
        ? await updateIncome(editingIncome.id, formData)
        : await createIncome(formData);

      if ("error" in res) {
        setError(res.error ?? "Failed to save income");
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

    const res = await createIncomeCategory(formData);
    setCategoryPending(false);

    if ("error" in res) {
      setError(res.error ?? "Failed to create category");
    } else {
      setNewCategoryName("");
      setShowNewCategory(false);
      setCategoryId(res.id);
      onCategoriesChange();
    }
  }

  return (
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
              placeholder="e.g. Merch, Camp fees"
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
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 py-0"
          >
            <option value="">Select category</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </div>

      <div>
        <Label>Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Hoodies sold at tournament"
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
          value={incomeDate}
          onChange={(e) => setIncomeDate(e.target.value)}
        />
      </div>

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
            {editingIncome ? "Updating..." : "Adding..."}
          </span>
        ) : (
          editingIncome ? "Update Income" : "Add Income"
        )}
      </Button>
    </div>
  );
}

/** Standalone Add/Edit Income drawer */
export function IncomeDrawer(props: IncomeFormProps) {
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={props.editingIncome ? "Edit Income" : "Add Income"}
    >
      <IncomeForm {...props} />
    </Drawer>
  );
}
