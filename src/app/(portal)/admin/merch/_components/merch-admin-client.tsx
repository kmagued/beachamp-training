"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Input, Label, Select, Textarea, Checkbox, Drawer, EmptyState, ConfirmDialog, Toast } from "@/components/ui";
import { Plus, Pencil, Loader2, Upload, Shirt, Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MERCH_CATEGORIES, MERCH_SIZES, merchTypeLabel, type MerchItemView, type MerchSubcategory } from "@/lib/config/merch";
import { MerchThumb, MerchSizes, MerchPrice, MerchCategoryChips, countByCategory } from "@/components/merch/merch-shared";
import { createMerchItem, updateMerchItem, toggleMerchVisibility, deleteMerchItem, createMerchSubcategory } from "../actions";

export function MerchAdminClient({
  items,
  subcategories: initialSubcategories,
}: {
  items: MerchItemView[];
  subcategories: MerchSubcategory[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MerchItemView | null>(null);
  const [sizes, setSizes] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("apparel");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [subcategories, setSubcategories] = useState(initialSubcategories);
  const [newSubName, setNewSubName] = useState<string | null>(null);
  const [subPending, setSubPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const drawerOpen = showForm || !!editing;
  const visibleCount = items.filter((i) => i.is_active).length;
  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  function openDrawer(item: MerchItemView | null) {
    setEditing(item);
    setShowForm(!item);
    setSizes(item ? item.sizes : ["S", "M", "L"]);
    setCategory(item?.category ?? "apparel");
    setSubcategoryId(item?.subcategory_id ?? "");
    setSubcategories(initialSubcategories);
    setNewSubName(null);
    setPreviewUrl(null);
    setError(null);
  }

  function closeDrawer() {
    setShowForm(false);
    setEditing(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  function toggleSize(size: string) {
    if (size === "One size") {
      setSizes((prev) => (prev.includes(size) ? [] : [size]));
      return;
    }
    setSizes((prev) => {
      const next = prev.filter((s) => s !== "One size");
      const updated = next.includes(size) ? next.filter((s) => s !== size) : [...next, size];
      return MERCH_SIZES.filter((s) => updated.includes(s));
    });
  }

  const categorySubcategories = subcategories.filter((s) => s.category === category);

  async function handleCreateSubcategory() {
    if (!newSubName?.trim()) return;
    setSubPending(true);
    setError(null);
    const res = await createMerchSubcategory(category, newSubName);
    setSubPending(false);
    if ("error" in res && res.error) {
      setError(res.error);
    } else if ("subcategory" in res && res.subcategory) {
      const created = res.subcategory;
      setSubcategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSubcategoryId(created.id);
      setNewSubName(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = editing ? await updateMerchItem(formData) : await createMerchItem(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setToast({ message: editing ? "Item updated" : "Item added to catalog", variant: "success" });
        closeDrawer();
        router.refresh();
      }
    });
  }

  function handleToggle(item: MerchItemView) {
    startTransition(async () => {
      const result = await toggleMerchVisibility(item.id, item.is_active);
      if (result.error) {
        setToast({ message: result.error, variant: "error" });
      } else {
        setToast({ message: item.is_active ? "Hidden from players" : "Now visible to players", variant: "success" });
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!editing) return;
    startTransition(async () => {
      const result = await deleteMerchItem(editing.id);
      setConfirmDelete(false);
      if (result.error) {
        setToast({ message: result.error, variant: "error" });
      } else {
        setToast({ message: "Item deleted", variant: "success" });
        closeDrawer();
        router.refresh();
      }
    });
  }

  const thumbUrl = previewUrl ?? editing?.image_url ?? null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Merch</h1>
          <p className="text-slate-500 text-sm">Manage the merch catalog players see in their portal</p>
        </div>
        <Button onClick={() => openDrawer(null)} size="sm">
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New Item
          </span>
        </Button>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Item" : "New Item"}
        footer={
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="flex-1" onClick={closeDrawer} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" form="merch-form" className="flex-1" disabled={isPending}>
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {editing ? "Saving..." : "Creating..."}
                </span>
              ) : editing ? (
                "Save Changes"
              ) : (
                "Create Item"
              )}
            </Button>
          </div>
        }
      >
        <form id="merch-form" key={editing?.id || "new"} action={handleSubmit} className="space-y-4">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          {newSubName !== null && <input type="hidden" name="subcategory_id" value={subcategoryId} />}

          <div>
            <Label>Photo</Label>
            <label className="flex items-center gap-4 cursor-pointer group">
              <MerchThumb url={thumbUrl} alt="Item photo" sizes="96px" className="w-24 aspect-square rounded-lg shrink-0" />
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:underline">
                  <Upload className="w-4 h-4" />
                  {thumbUrl ? "Replace photo" : "Upload photo"}
                </span>
                <p className="text-xs text-slate-400">PNG, JPG or WebP up to 5MB. Square works best.</p>
              </div>
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Category</Label>
              <Select
                name="category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setSubcategoryId("");
                  setNewSubName(null);
                }}
              >
                {MERCH_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label required>Sub-category</Label>
                {newSubName === null && (
                  <button
                    type="button"
                    onClick={() => setNewSubName("")}
                    className="text-xs font-medium text-primary hover:text-primary-600 inline-flex items-center gap-1 mb-1.5"
                  >
                    <Plus className="w-3 h-3" /> New
                  </button>
                )}
              </div>
              {newSubName !== null ? (
                <div className="flex gap-1.5">
                  <Input
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    placeholder="e.g. Hoodie"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateSubcategory();
                      }
                      if (e.key === "Escape") setNewSubName(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateSubcategory}
                    disabled={subPending || !newSubName.trim()}
                    className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 shrink-0"
                    aria-label="Add sub-category"
                  >
                    {subPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSubName(null)}
                    className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 shrink-0"
                    aria-label="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Select name="subcategory_id" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                  <option value="">{categorySubcategories.length ? "Select" : "Add one with + New"}</option>
                  {categorySubcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          <div>
            <Label required>Name</Label>
            <Input name="name" defaultValue={editing?.name ?? ""} required placeholder="e.g. Beachamp Black Hoodie" />
          </div>

          <div>
            <Label required>Price (EGP)</Label>
            <Input name="price" type="number" min="0" defaultValue={editing?.price ?? ""} required placeholder="650" />
          </div>

          <div>
            <Label required>Sizes</Label>
            <div className="flex flex-wrap gap-1.5">
              {MERCH_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSize(s)}
                  aria-pressed={sizes.includes(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
                    sizes.includes(s)
                      ? "bg-primary-50 border-primary text-primary"
                      : "bg-white border-slate-300 text-slate-600 hover:border-slate-400",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {sizes.map((s) => (
              <input key={s} type="hidden" name="sizes" value={s} />
            ))}
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              name="description"
              defaultValue={editing?.description ?? ""}
              placeholder="Material, fit, anything players should know"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Checkbox name="is_active" label="Show in catalog (players can see this item)" defaultChecked={editing?.is_active ?? true} />
            <Checkbox name="is_sold_out" label="Sold out (stays in the catalog with a Sold out tag)" defaultChecked={editing?.is_sold_out ?? false} />
          </div>

          {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}

          {editing && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Delete item
            </button>
          )}
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this item?"
        description={`"${editing?.name ?? ""}" will be removed from the catalog. Income already logged for it keeps the item.`}
        confirmLabel="Delete item"
        loading={isPending}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Shirt className="w-10 h-10" />}
            title="No merch yet"
            description="Add your first item and it will show up in the player portal."
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <MerchCategoryChips counts={countByCategory(items)} value={filter} onChange={setFilter} />
            <p className="text-xs text-slate-500">
              {items.length} {items.length === 1 ? "item" : "items"} · {visibleCount} visible to players
            </p>
          </div>

          {filtered.length === 0 ? (
            <Card className="text-center py-10">
              <p className="text-sm text-slate-500">No items in this category yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col",
                    !item.is_active && "opacity-60",
                  )}
                >
                  <MerchThumb url={item.image_url} alt={item.name} />
                  <div className="p-3 sm:p-4 flex flex-col gap-2.5 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 text-sm leading-snug">{item.name}</h3>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary mt-0.5">
                          {merchTypeLabel(item.category, item.subcategory_name)}
                        </p>
                      </div>
                      <button
                        onClick={() => openDrawer(item)}
                        className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
                        title="Edit"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <MerchPrice price={item.price} />
                    <MerchSizes sizes={item.sizes} />
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={item.is_active ? "success" : "neutral"}>{item.is_active ? "Visible" : "Hidden"}</Badge>
                      <Badge variant={item.is_sold_out ? "danger" : "neutral"}>{item.is_sold_out ? "Sold out" : "In stock"}</Badge>
                    </div>
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={isPending}
                      className={cn(
                        "mt-auto text-xs font-medium px-3 py-1.5 rounded-lg transition-colors w-full",
                        item.is_active
                          ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                      )}
                    >
                      {item.is_active ? "Hide from catalog" : "Show in catalog"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
