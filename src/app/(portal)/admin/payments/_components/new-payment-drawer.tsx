"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Drawer } from "@/components/ui/drawer";
import { Input, Select, Label, Button, DatePicker } from "@/components/ui";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createAdminPayment, createStandalonePayment } from "../actions";

interface PackageOption {
  id: string;
  name: string;
  session_count: number;
  price: number;
  validity_days: number;
}

interface PlayerOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

type PaymentType = "subscription" | "standalone";

interface NewPaymentDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefillPlayerId?: string;
  prefillPlayerName?: string;
  defaultMethod?: "cash" | "instapay";
}

export function NewPaymentDrawer({
  open,
  onClose,
  onSuccess,
  prefillPlayerId,
  prefillPlayerName,
  defaultMethod,
}: NewPaymentDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Payment type toggle
  const [paymentType, setPaymentType] = useState<PaymentType>("subscription");

  // Player search
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerOption[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Package & payment
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [packageId, setPackageId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "instapay">(defaultMethod || "cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Load packages
  useEffect(() => {
    if (!open) return;
    supabase
      .from("packages")
      .select("id, name, session_count, price, validity_days")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setPackages(data as PackageOption[]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Prefill player
  useEffect(() => {
    if (open && prefillPlayerId && prefillPlayerName) {
      setSelectedPlayer({ id: prefillPlayerId, name: prefillPlayerName });
      setPaymentType("subscription");
    }
  }, [open, prefillPlayerId, prefillPlayerName]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPlayerSearch("");
      setPlayerResults([]);
      setSelectedPlayer(prefillPlayerId && prefillPlayerName ? { id: prefillPlayerId, name: prefillPlayerName } : null);
      setShowResults(false);
      setPackageId("");
      setAmount("");
      setMethod(defaultMethod || "cash");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setNote("");
      setError("");
      setPaymentType(prefillPlayerId ? "subscription" : "subscription");
    }
  }, [open, prefillPlayerId, prefillPlayerName, defaultMethod]);

  // Search players with debounce
  useEffect(() => {
    if (!playerSearch.trim() || selectedPlayer) {
      setPlayerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const q = playerSearch.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      let query = supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("role", "player")
        .eq("is_active", true);
      if (words.length >= 2) {
        query = query.or(
          `and(first_name.ilike.%${words[0]}%,last_name.ilike.%${words[1]}%),and(first_name.ilike.%${words[1]}%,last_name.ilike.%${words[0]}%)`
        );
      } else {
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
      }
      const { data } = await query.limit(8);
      if (data) {
        setPlayerResults(data as PlayerOption[]);
        setShowResults(true);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSearch, selectedPlayer]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelectPlayer(p: PlayerOption) {
    setSelectedPlayer({ id: p.id, name: `${p.first_name} ${p.last_name}` });
    setPlayerSearch("");
    setShowResults(false);
  }

  function handlePackageChange(id: string) {
    setPackageId(id);
    const pkg = packages.find((p) => p.id === id);
    if (pkg) {
      setAmount(String(pkg.price));
    } else {
      setAmount("");
    }
  }

  function handleSubmit() {
    setError("");

    if (paymentType === "standalone") {
      if (!packageId) {
        setError("Please select a package");
        return;
      }
      if (!amount || Number(amount) <= 0) {
        setError("Please enter a valid amount");
        return;
      }
      if (!note.trim()) {
        setError("Please enter the name");
        return;
      }

      startTransition(async () => {
        const res = await createStandalonePayment({
          package_id: packageId,
          amount: Number(amount),
          method,
          note: note.trim(),
          payment_date: paymentDate,
        });
        if (res.error) {
          setError(res.error);
        } else {
          onSuccess();
          onClose();
        }
      });
    } else {
      if (!selectedPlayer) {
        setError("Please select a player");
        return;
      }
      if (!packageId) {
        setError("Please select a package");
        return;
      }
      if (!amount || Number(amount) <= 0) {
        setError("Please enter a valid amount");
        return;
      }

      startTransition(async () => {
        const res = await createAdminPayment({
          player_id: selectedPlayer.id,
          package_id: packageId,
          amount: Number(amount),
          method,
          payment_date: paymentDate,
        });
        if (res.error) {
          setError(res.error);
        } else {
          onSuccess();
          onClose();
        }
      });
    }
  }

  const isStandalone = paymentType === "standalone";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New Payment"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Creating...
              </span>
            ) : (
              "Create Payment"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Payment type toggle */}
        {!prefillPlayerId && (
          <div>
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPaymentType("subscription")}
                className={cn(
                  "py-2 text-xs font-medium rounded-md transition-colors",
                  !isStandalone ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                Player Payment
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("standalone")}
                className={cn(
                  "py-2 text-xs font-medium rounded-md transition-colors",
                  isStandalone ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                Quick Payment
              </button>
            </div>
          </div>
        )}

        {/* Subscription mode: Player selection */}
        {!isStandalone && (
          <div>
            <Label required>Player</Label>
            {selectedPlayer ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
                <span className="text-sm font-medium text-slate-900">{selectedPlayer.name}</span>
                {!prefillPlayerId && (
                  <button
                    onClick={() => {
                      setSelectedPlayer(null);
                      setPlayerSearch("");
                    }}
                    className="p-0.5 rounded text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    onFocus={() => playerResults.length > 0 && setShowResults(true)}
                    placeholder="Search by name or email..."
                    className="pl-9"
                  />
                </div>
                {showResults && playerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {playerResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectPlayer(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {p.first_name} {p.last_name}
                        </p>
                        {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {showResults && playerSearch.trim() && playerResults.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-3 text-sm text-slate-400 text-center">
                    No players found
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Standalone mode: Note */}
        {isStandalone && (
          <div>
            <Label required>Name</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. John Doe" />
            <p className="text-xs text-slate-400 mt-1">Not linked to a player account</p>
          </div>
        )}

        {/* Package (shown for both modes) */}
        <div>
          <Label required>Package</Label>
          <Select value={packageId} onChange={(e) => handlePackageChange(e.target.value)}>
            <option value="">Select package...</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} — {pkg.price.toLocaleString()} EGP ({pkg.session_count} sessions)
              </option>
            ))}
          </Select>
        </div>

        {/* Amount */}
        <div>
          <Label required>Amount (EGP)</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>

        {/* Payment date */}
        <div>
          <Label required>Payment Date</Label>
          <DatePicker value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>

        {/* Payment method */}
        <div>
          <Label required>Payment Method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "instapay")}>
            <option value="cash">Cash</option>
            <option value="instapay">InstaPay</option>
          </Select>
          <p className="text-xs text-slate-400 mt-1.5">
            {method === "cash"
              ? "Cash payments are confirmed immediately."
              : "InstaPay payments will be pending until confirmed."}
          </p>
        </div>

        {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}
      </div>
    </Drawer>
  );
}
