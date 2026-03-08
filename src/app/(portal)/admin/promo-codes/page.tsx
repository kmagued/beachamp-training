"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Input, Select, Skeleton, Drawer } from "@/components/ui";
import { Ticket, Plus, Pencil, Trash2 } from "lucide-react";
import { createPromoCode, updatePromoCode, togglePromoCodeStatus, deletePromoCode } from "./actions";
import { formatDate } from "@/lib/utils/format-date";
import type { PromoCode, Package } from "@/types/database";

type PromoCodeWithCount = PromoCode & { use_count: number };

export default function AdminPromoCodesPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCodeWithCount[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCodeWithCount | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state for package selection (since MultiSelect uses string options)
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function fetchData() {
    const [{ data: codes }, { data: pkgs }] = await Promise.all([
      supabase
        .from("promo_codes")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (pkgs) setPackages(pkgs as Package[]);

    if (codes) {
      const withCounts = await Promise.all(
        (codes as PromoCode[]).map(async (code) => {
          const { count } = await supabase
            .from("promo_code_uses")
            .select("*", { count: "exact", head: true })
            .eq("promo_code_id", code.id);
          return { ...code, use_count: count || 0 };
        })
      );
      setPromoCodes(withCounts);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmitForm(formData: FormData) {
    setError(null);
    if (selectedPackageIds.length > 0) {
      formData.set("package_ids", selectedPackageIds.join(","));
    }
    startTransition(async () => {
      const result = editingCode
        ? await updatePromoCode(formData)
        : await createPromoCode(formData);
      if (result.error) {
        setError(result.error);
      } else {
        closeDrawer();
        fetchData();
      }
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await togglePromoCodeStatus(id, isActive);
      fetchData();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this promo code?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePromoCode(id);
      if (result.error) {
        setError(result.error);
      } else {
        fetchData();
      }
    });
  }

  function openCreateDrawer() {
    setEditingCode(null);
    setSelectedPackageIds([]);
    setError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(code: PromoCodeWithCount) {
    setEditingCode(code);
    setSelectedPackageIds(code.package_ids || []);
    setError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingCode(null);
    setSelectedPackageIds([]);
    setError(null);
  }

  function getPackageName(id: string) {
    return packages.find((p) => p.id === id)?.name || "Unknown";
  }

  function formatDiscount(code: PromoCode) {
    if (code.discount_type === "percentage") {
      return `${code.discount_value}% off`;
    }
    return `${code.discount_value.toLocaleString()} EGP off`;
  }

  function formatUsage(code: PromoCodeWithCount) {
    if (code.max_uses !== null) {
      return `${code.use_count} / ${code.max_uses}`;
    }
    return `${code.use_count} (unlimited)`;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Promo Codes</h1>
          <p className="text-slate-500 text-sm">Manage discount codes for subscriptions</p>
        </div>
        <Button onClick={openCreateDrawer} size="sm">
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New Promo Code
          </span>
        </Button>
      </div>

      {/* Create/Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingCode ? "Edit Promo Code" : "New Promo Code"}
      >
        <form action={handleSubmitForm} className="space-y-4">
          {editingCode && <input type="hidden" name="id" value={editingCode.id} />}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Code</label>
            <Input name="code" required placeholder="e.g. SUMMER25" className="uppercase" defaultValue={editingCode?.code || ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Discount Type</label>
              <Select name="discount_type" required defaultValue={editingCode?.discount_type || "percentage"}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_amount">Fixed Amount (EGP)</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Discount Value</label>
              <Input name="discount_value" type="number" required min="1" step="any" placeholder="e.g. 20" defaultValue={editingCode?.discount_value ?? ""} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Expiry Date</label>
            <Input name="expiry_date" type="date" defaultValue={editingCode?.expiry_date || ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Max Uses</label>
              <Input name="max_uses" type="number" min="1" placeholder="Unlimited" defaultValue={editingCode?.max_uses ?? ""} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Per-Player Limit</label>
              <Input name="per_player_limit" type="number" min="1" defaultValue={editingCode?.per_player_limit ?? 1} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Restrict to Packages <span className="text-slate-400 font-normal">(leave empty for all)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() =>
                    setSelectedPackageIds((prev) =>
                      prev.includes(pkg.id) ? prev.filter((id) => id !== pkg.id) : [...prev, pkg.id]
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    selectedPackageIds.includes(pkg.id)
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {pkg.name}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={isPending} fullWidth>
            {isPending ? (editingCode ? "Saving..." : "Creating...") : (editingCode ? "Save Changes" : "Create Promo Code")}
          </Button>
        </form>
      </Drawer>

      {/* Promo Code Cards */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-8 w-full rounded-lg" />
            </Card>
          ))}
        </div>
      ) : promoCodes.length === 0 ? (
        <Card className="text-center py-10">
          <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No promo codes yet. Create one to get started.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {promoCodes.map((code) => (
            <Card key={code.id} className={!code.is_active ? "opacity-60" : ""}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                      <Ticket className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 font-mono">{code.code}</h3>
                      <Badge variant={code.is_active ? "success" : "neutral"}>
                        {code.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditDrawer(code)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {code.use_count === 0 && (
                      <button
                        onClick={() => handleDelete(code.id)}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Discount</span>
                    <span className="font-medium text-slate-900">{formatDiscount(code)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expiry</span>
                    <span className="font-medium text-slate-900">
                      {code.expiry_date ? formatDate(code.expiry_date) : "No expiry"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Uses</span>
                    <span className="font-medium text-slate-900">{formatUsage(code)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Per Player</span>
                    <span className="font-medium text-slate-900">{code.per_player_limit}x</span>
                  </div>
                  {code.package_ids && code.package_ids.length > 0 && (
                    <div className="flex justify-between items-start">
                      <span className="text-slate-500">Packages</span>
                      <span className="font-medium text-slate-900 text-right">
                        {code.package_ids.map(getPackageName).join(", ")}
                      </span>
                    </div>
                  )}
                  {(!code.package_ids || code.package_ids.length === 0) && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Packages</span>
                      <span className="font-medium text-slate-900">All</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleToggle(code.id, code.is_active)}
                  disabled={isPending}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors w-full ${
                    code.is_active
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {code.is_active ? "Deactivate" : "Activate"}
                </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
