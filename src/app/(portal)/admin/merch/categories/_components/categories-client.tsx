"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Toast } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { canDeleteCategory, canDeleteSubcategory, usageLabel } from "@/lib/merch/categories";
import {
  createMerchCategory,
  createMerchSubcategory,
  deleteMerchCategory,
  deleteMerchSubcategory,
  moveMerchCategory,
  renameMerchCategory,
  renameMerchSubcategory,
} from "../actions";

export interface CategoryCard {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  /** Live products in the category */
  products: number;
  /** Every product pointing at it, deleted ones included */
  items: number;
  subcategories: { id: string; name: string; live: number; deleted: number }[];
}

type Result = { error: string } | { success: true };

const ICON_BTN =
  "w-7 h-7 rounded-md flex items-center justify-center border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors disabled:opacity-35 disabled:hover:text-slate-500 disabled:hover:border-slate-200";

function InlineName({
  value,
  placeholder,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  placeholder: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
          if (e.key === "Escape") onCancel();
        }}
        className="flex-1 min-w-0 rounded-md border border-primary px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={pending || !value.trim()}
        className="w-7 h-7 rounded-md flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 shrink-0"
        aria-label="Save"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100 shrink-0"
        aria-label="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function CategoriesClient({ categories }: { categories: CategoryCard[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "category" | "subcategory"; id: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ categoryId: string; value: string } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "category" | "subcategory"; id: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  function run(action: () => Promise<Result>, success: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        return;
      }
      after?.();
      setToast({ message: success, variant: "success" });
      router.refresh();
    });
  }

  function saveEdit() {
    if (!editing) return;
    const { kind, id, value } = editing;
    run(
      () => (kind === "category" ? renameMerchCategory(id, value) : renameMerchSubcategory(id, value)),
      "Renamed",
      () => setEditing(null),
    );
  }

  function saveNewSubcategory() {
    if (!adding) return;
    const { categoryId, value } = adding;
    run(
      async () => {
        const res = await createMerchSubcategory(categoryId, value);
        return "error" in res ? { error: res.error } : { success: true as const };
      },
      `${value.trim()} added`,
      () => setAdding(null),
    );
  }

  function saveNewCategory() {
    if (newCategory === null) return;
    const name = newCategory;
    run(() => createMerchCategory(name), `${name.trim()} added`, () => setNewCategory(null));
  }

  function confirmDelete() {
    if (!deleting) return;
    const { kind, id, name } = deleting;
    run(
      () => (kind === "category" ? deleteMerchCategory(id) : deleteMerchSubcategory(id)),
      `${name} deleted`,
      () => setDeleting(null),
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Categories</h1>
          <p className="text-slate-500 text-sm max-w-xl">
            Group products into categories and sub-categories. They power the catalog filters players see and the
            breakdowns in Analytics.
          </p>
        </div>
        <Button size="sm" className="px-4" onClick={() => setNewCategory("")} disabled={newCategory !== null}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New category
          </span>
        </Button>
      </div>

      {newCategory !== null && (
        <Card className="mb-4 p-3 sm:p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">New category</p>
          <InlineName
            value={newCategory}
            placeholder="e.g. Bags"
            pending={isPending}
            onChange={setNewCategory}
            onSave={saveNewCategory}
            onCancel={() => setNewCategory(null)}
          />
        </Card>
      )}

      {categories.length === 0 && newCategory === null ? (
        <Card>
          <EmptyState
            icon={<Tags className="w-10 h-10" />}
            title="No categories yet"
            description="Add a category, then the sub-categories inside it (e.g. Apparel → Hoodie)."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {categories.map((c, index) => {
            const deletable = canDeleteCategory({ subcategories: c.subcategories.length, items: c.items });
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50/60">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => run(() => moveMerchCategory(c.id, "up"), "Order updated")}
                      disabled={isPending || index === 0}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      aria-label={`Move ${c.name} up`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => run(() => moveMerchCategory(c.id, "down"), "Order updated")}
                      disabled={isPending || index === categories.length - 1}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      aria-label={`Move ${c.name} down`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {editing?.kind === "category" && editing.id === c.id ? (
                    <InlineName
                      value={editing.value}
                      placeholder="Category name"
                      pending={isPending}
                      onChange={(value) => setEditing({ ...editing, value })}
                      onSave={saveEdit}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">{c.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {c.subcategories.length} {c.subcategories.length === 1 ? "sub-category" : "sub-categories"} ·{" "}
                          {c.products} {c.products === 1 ? "product" : "products"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: "category", id: c.id, value: c.name })}
                        className={ICON_BTN}
                        aria-label={`Rename ${c.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting({ kind: "category", id: c.id, name: c.name })}
                        disabled={!deletable}
                        title={deletable ? `Delete ${c.name}` : "Can't delete: it still has sub-categories or products. Rename it instead."}
                        className={cn(ICON_BTN, deletable && "text-red-600 border-red-200 hover:text-red-700 hover:border-red-300")}
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="divide-y divide-slate-50">
                  {c.subcategories.map((s) => {
                    const subDeletable = canDeleteSubcategory(s);
                    const pastOnly = s.live === 0 && s.deleted > 0;
                    return (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                        {editing?.kind === "subcategory" && editing.id === s.id ? (
                          <InlineName
                            value={editing.value}
                            placeholder="Sub-category name"
                            pending={isPending}
                            onChange={(value) => setEditing({ ...editing, value })}
                            onSave={saveEdit}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <>
                            <span className="text-sm font-semibold text-slate-700 min-w-0 truncate">{s.name}</span>
                            <span className={cn("ml-auto text-[11px] whitespace-nowrap", pastOnly ? "text-amber-600" : "text-slate-400")}>
                              {usageLabel(s)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditing({ kind: "subcategory", id: s.id, value: s.name })}
                              className={ICON_BTN}
                              aria-label={`Rename ${s.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting({ kind: "subcategory", id: s.id, name: s.name })}
                              disabled={!subDeletable}
                              title={
                                subDeletable
                                  ? `Delete ${s.name}`
                                  : pastOnly
                                    ? `Can't delete: past sales are recorded under ${s.name}. Rename it instead; your sales history keeps its label.`
                                    : `Can't delete: ${usageLabel(s)} use it. Rename it instead.`
                              }
                              className={cn(
                                ICON_BTN,
                                subDeletable && "text-red-600 border-red-200 hover:text-red-700 hover:border-red-300",
                              )}
                              aria-label={`Delete ${s.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {adding?.categoryId === c.id ? (
                    <div className="px-3 py-2">
                      <InlineName
                        value={adding.value}
                        placeholder="e.g. Hoodie"
                        pending={isPending}
                        onChange={(value) => setAdding({ categoryId: c.id, value })}
                        onSave={saveNewSubcategory}
                        onCancel={() => setAdding(null)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdding({ categoryId: c.id, value: "" })}
                      className="w-full text-left px-3 py-2.5 text-xs font-semibold text-secondary-dark hover:bg-slate-50"
                    >
                      + Add sub-category
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 rounded-xl border border-dashed border-primary-100 bg-white px-4 py-3 text-xs text-slate-500">
        <b className="text-primary">Rename anything, any time:</b> products and past sales follow the new name.{" "}
        <b className="text-primary">Delete</b> is only offered when nothing uses it (no products, no past sales), so
        reports never lose a label. <b className="text-primary">▲▼</b> sets the order of the category chips players see.
      </p>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="Nothing uses it, so nothing else changes."
        confirmLabel="Delete"
        loading={isPending}
      />
    </div>
  );
}
