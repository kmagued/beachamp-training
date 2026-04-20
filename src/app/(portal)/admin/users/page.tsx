"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Drawer, Toast } from "@/components/ui";
import { ShieldCheck, Plus, Search, Loader2, Mail, Phone } from "lucide-react";
import { updateUserRole } from "./actions";
import type { UserRole } from "@/types/database";

interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

interface SearchUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: UserRole;
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminUsersContent />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="h-8 w-48 bg-slate-200 rounded mb-2 animate-pulse" />
      <div className="h-4 w-32 bg-slate-100 rounded mb-6 animate-pulse" />
      <Card className="animate-pulse">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function AdminUsersContent() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Search state for add drawer
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchAdmins = useCallback(async () => {
    const [{ data: { user } }, { data }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, is_active, created_at")
        .eq("role", "admin")
        .order("first_name"),
    ]);
    if (user) setCurrentUserId(user.id);
    if (data) setAdmins(data as AdminUser[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const parts = query.trim().split(/\s+/);
    let q = supabase
      .from("profiles")
      .select("id, first_name, last_name, email, role")
      .neq("role", "admin")
      .eq("is_active", true);

    if (parts.length >= 2) {
      // "John Doe" → match first_name like John AND last_name like Doe
      q = q.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts.slice(1).join(" ")}%`);
    } else {
      q = q.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`);
    }

    const { data } = await q.order("first_name").limit(20);
    setSearchResults((data || []) as SearchUser[]);
    setSearching(false);
  }

  async function handlePromote(userId: string) {
    setPromotingId(userId);
    const result = await updateUserRole(userId, "admin");
    if (result.error) {
      setToast({ message: result.error, variant: "error" });
    } else {
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
      setToast({ message: "User promoted to admin", variant: "success" });
      fetchAdmins();
    }
    setPromotingId(null);
  }

  async function handleRemoveAdmin(userId: string) {
    const confirmed = window.confirm("Remove admin access? The user will be set back to player role.");
    if (!confirmed) return;
    setRemovingId(userId);
    const result = await updateUserRole(userId, "player");
    if (result.error) {
      setToast({ message: result.error, variant: "error" });
    } else {
      setAdmins((prev) => prev.filter((u) => u.id !== userId));
      setToast({ message: "Admin access removed", variant: "success" });
    }
    setRemovingId(null);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Admins</h1>
          <p className="text-slate-500 text-sm">
            {admins.length} admin{admins.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => { setShowAddDrawer(true); setSearchQuery(""); setSearchResults([]); }}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Admin
          </span>
        </Button>
      </div>

      {loading ? (
        <Card className="animate-pulse">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </Card>
      ) : admins.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No admins found</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {admins.map((admin) => {
              const isSelf = admin.id === currentUserId;
              return (
                <div key={admin.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {admin.first_name?.[0]}{admin.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {admin.first_name} {admin.last_name}
                        </p>
                        {isSelf && <Badge variant="info">You</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        {admin.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3" /> {admin.email}
                          </span>
                        )}
                        {admin.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {admin.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isSelf && (
                    <button
                      onClick={() => handleRemoveAdmin(admin.id)}
                      disabled={removingId === admin.id}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0 ml-3"
                    >
                      {removingId === admin.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Remove"
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Add Admin Drawer */}
      <Drawer
        open={showAddDrawer}
        onClose={() => setShowAddDrawer(false)}
        title="Add Admin"
        width="max-w-lg"
      >
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            autoFocus
          />
        </div>

        {searchQuery.length < 2 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            Type at least 2 characters to search
          </p>
        ) : searching ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Searching...
          </div>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No users found</p>
        ) : (
          <div className="space-y-1">
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {user.email || "No email"} &middot; <span className="capitalize">{user.role}</span>
                  </p>
                </div>
                <button
                  onClick={() => handlePromote(user.id)}
                  disabled={promotingId === user.id}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-700 transition-colors disabled:opacity-50 shrink-0 ml-3"
                >
                  {promotingId === user.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Make Admin"
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
