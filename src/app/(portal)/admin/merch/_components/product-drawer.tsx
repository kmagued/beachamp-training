"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, ConfirmDialog, Drawer, Input, Label, Select, Textarea } from "@/components/ui";
import { Check, Copy, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  MERCH_SIZES,
  ONE_SIZE,
  type MerchCategory,
  type MerchItemView,
  type MerchSubcategory,
} from "@/lib/config/merch";
import { MerchThumb } from "@/components/merch/merch-shared";
import { createMerchItem, deleteMerchItem, updateMerchItem } from "../actions";
import { createMerchSubcategory } from "../categories/actions";

export type ProductDrawerMode = "create" | "edit" | "duplicate";

const DEFAULT_SIZES = ["S", "M", "L"];

/** Sizes after clicking one: "One size" can't be combined with the others */
function toggledSizes(current: string[], size: string): string[] {
  if (size === ONE_SIZE) return current.includes(size) ? [] : [size];
  const rest = current.filter((s) => s !== ONE_SIZE);
  const next = rest.includes(size) ? rest.filter((s) => s !== size) : [...rest, size];
  return MERCH_SIZES.filter((s) => next.includes(s));
}

export function ProductDrawer({
  open,
  mode,
  item,
  categories,
  subcategories: initialSubcategories,
  onClose,
  onSaved,
  onUpdateStock,
  onDuplicate,
}: {
  open: boolean;
  mode: ProductDrawerMode;
  /** The product being edited, or the one a duplicate starts from */
  item: MerchItemView | null;
  categories: MerchCategory[];
  subcategories: MerchSubcategory[];
  onClose: () => void;
  /** keepOpen: "Save & add another" was used and the drawer has reset itself */
  onSaved: (message: string, keepOpen: boolean) => void;
  onUpdateStock: (item: MerchItemView) => void;
  onDuplicate: (item: MerchItemView) => void;
}) {
  const editing = mode === "edit" ? item : null;
  // Counts of sizes the product already has; shown read-only (Restock / Recount changes them)
  const existingStock = new Map((editing?.stock ?? []).map((s) => [s.size, s.quantity]));

  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(mode === "duplicate" && item ? `Copy of ${item.name}` : item?.name ?? "");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(item?.subcategory_id ?? "");
  const [subcategories, setSubcategories] = useState(initialSubcategories);
  const [newSubName, setNewSubName] = useState<string | null>(null);
  const [subPending, setSubPending] = useState(false);
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [sizes, setSizes] = useState<string[]>(item ? item.stock.map((s) => s.size) : DEFAULT_SIZES);
  const [opening, setOpening] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ next: string[]; stocked: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const categorySubcategories = subcategories.filter((s) => s.category_id === categoryId);
  const openingTotal = sizes
    .filter((s) => !existingStock.has(s))
    .reduce((sum, s) => sum + (Number(opening[s]) > 0 ? Number(opening[s]) : 0), 0);
  const thumbUrl = previewUrl ?? editing?.image_url ?? null;

  function toggleSize(size: string) {
    const next = toggledSizes(sizes, size);
    const stocked = sizes.filter((s) => !next.includes(s) && (existingStock.get(s) ?? 0) > 0);
    if (stocked.length) setPendingRemoval({ next, stocked });
    else setSizes(next);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleCreateSubcategory() {
    if (!newSubName?.trim()) return;
    setSubPending(true);
    setError(null);
    const res = await createMerchSubcategory(categoryId, newSubName);
    setSubPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setSubcategories((prev) => [...prev, res.subcategory].sort((a, b) => a.name.localeCompare(b.name)));
    setSubcategoryId(res.subcategory.id);
    setNewSubName(null);
  }

  function resetForAnother() {
    setName("");
    setSubcategoryId("");
    setPrice("");
    setDescription("");
    setIsActive(true);
    setSizes(DEFAULT_SIZES);
    setOpening({});
    setPhoto(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit(addAnother: boolean) {
    setError(null);
    const fd = new FormData();
    if (editing) fd.set("id", editing.id);
    fd.set("name", name);
    fd.set("category_id", categoryId);
    fd.set("subcategory_id", subcategoryId);
    fd.set("price", price);
    fd.set("description", description);
    if (isActive) fd.set("is_active", "on");
    if (photo) fd.set("image", photo);
    for (const size of sizes) {
      fd.append("sizes", size);
      if (!existingStock.has(size)) fd.set(`stock_${size}`, opening[size] ?? "");
    }

    startTransition(async () => {
      const res = editing ? await updateMerchItem(fd) : await createMerchItem(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (addAnother) {
        const added = name.trim();
        resetForAnother();
        onSaved(`"${added}" added. Add the next one`, true);
      } else {
        onSaved(editing ? "Product updated" : "Product added", false);
      }
    });
  }

  function handleDelete() {
    if (!editing) return;
    startTransition(async () => {
      const res = await deleteMerchItem(editing.id);
      setConfirmDelete(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onSaved("Product deleted", false);
    });
  }

  const title = mode === "edit" ? "Edit product" : mode === "duplicate" ? "Duplicate product" : "New product";

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={title}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="flex-1 px-3" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            {!editing && (
              <Button variant="outline" className="flex-1 px-3" onClick={() => submit(true)} disabled={isPending}>
                Save &amp; add another
              </Button>
            )}
            <Button className="flex-1 px-3" onClick={() => submit(false)} disabled={isPending}>
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </span>
              ) : editing ? (
                "Save changes"
              ) : (
                "Create product"
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {categories.length === 0 && (
            <div className="px-4 py-3 bg-amber-50 rounded-lg text-sm text-amber-700">
              Add a category on the Categories page first.
            </div>
          )}

          <div>
            <Label>Photo</Label>
            <label className="flex items-center gap-4 cursor-pointer group">
              <MerchThumb url={thumbUrl} alt="Product photo" sizes="96px" className="w-24 aspect-square rounded-lg shrink-0" />
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:underline">
                  <Upload className="w-4 h-4" />
                  {thumbUrl ? "Replace photo" : "Upload photo"}
                </span>
                <p className="text-xs text-slate-400">PNG, JPG or WebP up to 5MB. Square works best.</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div>
            <Label required>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beachamp Black Hoodie" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Category</Label>
              <Select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId("");
                  setNewSubName(null);
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
                    disabled={!categoryId}
                    className="text-xs font-medium text-primary hover:text-primary-600 inline-flex items-center gap-1 mb-1.5 disabled:opacity-40"
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
                <Select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
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
            <Label required>Price (EGP)</Label>
            <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="650" />
          </div>

          <div>
            <Label required>{editing ? "Sizes & stock" : "Sizes & opening stock"}</Label>
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

            {sizes.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2.5">
                {sizes.map((s) => (
                  <div key={s} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 truncate">{s}</p>
                    {existingStock.has(s) ? (
                      <p className="text-sm font-bold text-slate-900 mt-0.5 px-1.5 py-1" title="Change counts with Update stock">
                        {existingStock.get(s)}
                      </p>
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={opening[s] ?? ""}
                        onChange={(e) => setOpening((prev) => ({ ...prev, [s]: e.target.value }))}
                        placeholder="0"
                        aria-label={`Opening stock for ${s}`}
                        className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-right text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-1.5 text-xs text-slate-500">
              {editing ? (
                <>
                  <span>Existing counts change with Restock / Recount</span>
                  <button
                    type="button"
                    onClick={() => onUpdateStock(editing)}
                    className="font-semibold text-secondary-dark hover:underline"
                  >
                    Update stock
                  </button>
                </>
              ) : (
                <span className="ml-auto">{openingTotal} units total</span>
              )}
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Material, fit, anything players should know"
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive((v) => !v)}
            className="w-full flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left"
          >
            <span
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors shrink-0",
                isActive ? "bg-emerald-500" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                  isActive ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-800">Show in player catalog</span>
              <span className="block text-xs text-slate-400">Turn off to prepare a product before launching it</span>
            </span>
          </button>

          {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}

          {editing && (
            <div className="flex items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => onDuplicate(editing)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-600"
              >
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete product
              </button>
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!pendingRemoval}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) setSizes(pendingRemoval.next);
          setPendingRemoval(null);
        }}
        title="Remove sizes that have stock?"
        description={
          pendingRemoval
            ? pendingRemoval.stocked
                .map((s) => `${s} still has ${existingStock.get(s)} in stock`)
                .join(", ") + ". Removing a size drops its count when you save."
            : ""
        }
        confirmLabel="Remove anyway"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this product?"
        description={`"${editing?.name ?? ""}" will be removed from the catalog. Sales already recorded keep the product.`}
        confirmLabel="Delete product"
        loading={isPending}
      />
    </>
  );
}
