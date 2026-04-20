"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Input, Label, Skeleton, Drawer } from "@/components/ui";
import { Package as PackageIcon, Plus, Pencil, Loader2 } from "lucide-react";
import { createPackage, updatePackage, togglePackageStatus } from "./actions";
import type { Package } from "@/types/database";

type PackageWithCount = Package & { subscriber_count: number };

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<PackageWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<PackageWithCount | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const drawerOpen = showForm || !!editingPkg;
  function closeDrawer() {
    setShowForm(false);
    setEditingPkg(null);
    setError(null);
  }

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function fetchPackages() {
    const { data: pkgs } = await supabase
      .from("packages")
      .select("*")
      .order("sort_order", { ascending: true });

    if (pkgs) {
      // Single batched query for active subscriber counts
      const pkgIds = (pkgs as Package[]).map((p) => p.id);
      const { data: subRows } = await supabase
        .from("subscriptions")
        .select("package_id")
        .in("package_id", pkgIds)
        .eq("status", "active");

      const countMap = new Map<string, number>();
      for (const row of (subRows || []) as { package_id: string }[]) {
        countMap.set(row.package_id, (countMap.get(row.package_id) || 0) + 1);
      }

      setPackages((pkgs as Package[]).map((pkg) => ({ ...pkg, subscriber_count: countMap.get(pkg.id) || 0 })));
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createPackage(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setShowForm(false);
        fetchPackages();
      }
    });
  }

  function handleUpdate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePackage(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setEditingPkg(null);
        fetchPackages();
      }
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await togglePackageStatus(id, isActive);
      fetchPackages();
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Packages</h1>
          <p className="text-slate-500 text-sm">Manage training packages</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingPkg(null); }} size="sm">
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New Package
          </span>
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Package Drawer (create + edit) */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingPkg ? "Edit Package" : "New Package"}
        footer={
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={closeDrawer}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="package-form"
              className="flex-1"
              disabled={isPending}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {editingPkg ? "Saving..." : "Creating..."}
                </span>
              ) : (
                editingPkg ? "Save Changes" : "Create Package"
              )}
            </Button>
          </div>
        }
      >
        <form
          id="package-form"
          key={editingPkg?.id || "new"}
          action={editingPkg ? handleUpdate : handleCreate}
          className="space-y-4"
        >
          {editingPkg && <input type="hidden" name="id" value={editingPkg.id} />}
          <div>
            <Label required>Name</Label>
            <Input name="name" defaultValue={editingPkg?.name ?? ""} required placeholder="e.g. Premium" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Sessions</Label>
              <Input
                name="session_count"
                type="number"
                defaultValue={editingPkg?.session_count ?? ""}
                required
                min="1"
                placeholder="12"
              />
            </div>
            <div>
              <Label required>Validity (days)</Label>
              <Input
                name="validity_days"
                type="number"
                defaultValue={editingPkg?.validity_days ?? ""}
                required
                min="1"
                placeholder="30"
              />
            </div>
          </div>
          <div>
            <Label required>Price (EGP)</Label>
            <Input
              name="price"
              type="number"
              defaultValue={editingPkg?.price ?? ""}
              required
              min="0"
              placeholder="1500"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              name="description"
              defaultValue={editingPkg?.description ?? ""}
              placeholder="Optional description"
            />
          </div>
          {error && (
            <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>
          )}
        </form>
      </Drawer>

      {/* Package Cards */}
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
      ) : (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((pkg) => (
          <Card key={pkg.id} className={!pkg.is_active ? "opacity-60" : ""}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-brand-admin/10 flex items-center justify-center">
                  <PackageIcon className="w-4 h-4 text-brand-admin" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{pkg.name}</h3>
                  <Badge variant={pkg.is_active ? "success" : "neutral"}>
                    {pkg.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
              <button
                onClick={() => { setEditingPkg(pkg); setShowForm(false); }}
                className="text-slate-400 hover:text-slate-600 p-1"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Sessions</span>
                <span className="font-medium text-slate-900">{pkg.session_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Validity</span>
                <span className="font-medium text-slate-900">{pkg.validity_days} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Price</span>
                <span className="font-medium text-slate-900">{pkg.price.toLocaleString()} EGP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Subscribers</span>
                <span className="font-medium text-slate-900">{pkg.subscriber_count}</span>
              </div>
            </div>

            {pkg.description && (
              <p className="text-xs text-slate-400 mb-3">{pkg.description}</p>
            )}

            <button
              onClick={() => handleToggle(pkg.id, pkg.is_active)}
              disabled={isPending}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors w-full ${
                pkg.is_active
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {pkg.is_active ? "Deactivate" : "Activate"}
            </button>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
