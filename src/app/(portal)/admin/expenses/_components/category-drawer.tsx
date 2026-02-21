import { useState, useTransition, useMemo } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Button, Badge } from "@/components/ui";
import { Loader2, Plus, Pencil, ToggleLeft, ToggleRight, Check, X } from "lucide-react";
import { createExpenseCategory, updateExpenseCategory, toggleExpenseCategoryActive } from "@/app/_actions/expenses";
import type { CategoryRow } from "./types";

const SUGGESTIONS = [
  "Court Reservation", "Coach Salary", "Equipment", "Utilities",
  "Marketing", "Transportation", "Maintenance", "Insurance",
  "Rent", "Water & Electricity", "Supplies", "Snacks & Drinks",
  "Prizes & Awards", "Uniforms", "Medical", "Other",
];

interface CategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  onSuccess: () => void;
}

export function CategoryDrawer({ open, onClose, categories, onSuccess }: CategoryDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Filter out suggestions that already exist as categories
  const availableSuggestions = useMemo(() => {
    const existing = new Set(categories.map((c) => c.name.toLowerCase()));
    return SUGGESTIONS.filter((s) => !existing.has(s.toLowerCase()));
  }, [categories]);

  function handleCreate(name?: string) {
    const catName = (name || newName).trim();
    if (!catName) return;
    setError("");
    const formData = new FormData();
    formData.set("name", catName);

    startTransition(async () => {
      const res = await createExpenseCategory(formData);
      if (res.error) {
        setError(res.error);
      } else {
        setNewName("");
        onSuccess();
      }
    });
  }

  function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setError("");
    const formData = new FormData();
    formData.set("name", editName.trim());

    startTransition(async () => {
      const res = await updateExpenseCategory(id, formData);
      if (res.error) {
        setError(res.error);
      } else {
        setEditingId(null);
        setEditName("");
        onSuccess();
      }
    });
  }

  function handleToggle(id: string) {
    setError("");
    startTransition(async () => {
      const res = await toggleExpenseCategoryActive(id);
      if (res.error) setError(res.error);
      else onSuccess();
    });
  }

  function startEditing(cat: CategoryRow) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
  }

  return (
    <Drawer open={open} onClose={onClose} title="Manage Categories">
      <div className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-sm text-red-600">{error}</div>
        )}

        {/* Add new category */}
        <div>
          <Label>New Category</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button onClick={() => handleCreate()} disabled={isPending || !newName.trim()} className="shrink-0">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Suggestions */}
        {availableSuggestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Suggestions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleCreate(s)}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-full border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-primary hover:text-primary hover:bg-primary-50 transition-colors disabled:opacity-50"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categories list */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Categories ({categories.length})
          </p>

          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
            >
              {editingId === cat.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(cat.id);
                      if (e.key === "Escape") cancelEditing();
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdate(cat.id)}
                    disabled={isPending}
                    className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="p-1 rounded text-slate-400 hover:bg-slate-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm font-medium ${cat.is_active ? "text-slate-700" : "text-slate-400 line-through"}`}>
                    {cat.name}
                  </span>
                  {cat.is_default && (
                    <Badge variant="neutral" className="text-[10px]">Default</Badge>
                  )}
                  <button
                    onClick={() => startEditing(cat)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggle(cat.id)}
                    disabled={isPending}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    title={cat.is_active ? "Deactivate" : "Activate"}
                  >
                    {cat.is_active ? (
                      <ToggleRight className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 text-slate-300" />
                    )}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
