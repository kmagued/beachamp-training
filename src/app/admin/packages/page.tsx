"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Input } from "@/components/ui";
import { Package as PackageIcon, Plus, X, Pencil } from "lucide-react";
import { createPackage, updatePackage, togglePackageStatus } from "./actions";
import type { Package } from "@/types/database";

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<(Package & { subscriber_count: number })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      // Get subscriber counts
      const withCounts = await Promise.all(
        pkgs.map(async (pkg: Package) => {
          const { count } = await supabase
            .from("subscriptions")
            .select("*", { count: "exact", head: true })
            .eq("package_id", pkg.id)
            .eq("status", "active");
          return { ...pkg, subscriber_count: count || 0 };
        })
      );
      setPackages(withCounts);
    }
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
        setEditingId(null);
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Packages</h1>
          <p className="text-slate-500 text-sm">Manage training packages</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingId(null); }} size="sm">
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

      {/* New Package Form */}
      {showForm && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">New Package</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form action={handleCreate} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
              <Input name="name" required placeholder="e.g. Premium" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Sessions</label>
              <Input name="session_count" type="number" required min="1" placeholder="12" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Validity (days)</label>
              <Input name="validity_days" type="number" required min="1" placeholder="30" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Price (EGP)</label>
              <Input name="price" type="number" required min="0" placeholder="1500" />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
              <Input name="description" placeholder="Optional description" />
            </div>
            <div className="flex items-end">
              <Button type="submit" fullWidth disabled={isPending}>
                {isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Package Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((pkg) => (
          <Card key={pkg.id} className={!pkg.is_active ? "opacity-60" : ""}>
            {editingId === pkg.id ? (
              /* Edit mode */
              <form action={handleUpdate}>
                <input type="hidden" name="id" value={pkg.id} />
                <div className="space-y-3">
                  <Input name="name" defaultValue={pkg.name} required />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 block">Sessions</label>
                      <Input name="session_count" type="number" defaultValue={pkg.session_count} required />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 block">Days</label>
                      <Input name="validity_days" type="number" defaultValue={pkg.validity_days} required />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 block">Price</label>
                      <Input name="price" type="number" defaultValue={pkg.price} required />
                    </div>
                  </div>
                  <Input name="description" defaultValue={pkg.description || ""} placeholder="Description" />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isPending} fullWidth>
                      Save
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditingId(null)} fullWidth>
                      Cancel
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              /* Display mode */
              <>
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
                    onClick={() => setEditingId(pkg.id)}
                    className="text-slate-400 hover:text-slate-600 p-1"
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
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
