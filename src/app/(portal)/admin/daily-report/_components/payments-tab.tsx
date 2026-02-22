"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button } from "@/components/ui";
import { CreditCard, Plus } from "lucide-react";
import { NewPaymentDrawer } from "../../payments/_components/new-payment-drawer";

interface CashPayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  profiles: { first_name: string; last_name: string } | null;
  subscriptions: { packages: { name: string } } | null;
}

export function PaymentsTab({ date }: { date: string }) {
  const [payments, setPayments] = useState<CashPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPayment, setShowNewPayment] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function loadData() {
    setLoading(true);

    // Fetch cash payments for the selected date
    // Use created_at date range for the selected day
    const dateStart = `${date}T00:00:00`;
    const dateEnd = `${date}T23:59:59`;

    const { data } = await supabase
      .from("payments")
      .select("id, amount, method, status, created_at, confirmed_at, profiles!payments_player_id_fkey(first_name, last_name), subscriptions!payments_subscription_id_fkey(packages(name))")
      .eq("method", "cash")
      .gte("created_at", dateStart)
      .lte("created_at", dateEnd)
      .order("created_at", { ascending: false });

    setPayments((data || []) as unknown as CashPayment[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const total = useMemo(
    () => payments.filter((p) => p.status === "confirmed").reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="h-5 w-32 bg-slate-200 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-slate-100 rounded" />
          <div className="h-4 w-full bg-slate-100 rounded" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {payments.length} cash payment{payments.length !== 1 ? "s" : ""}
          </p>
          <p className="text-lg font-bold text-slate-900">{total.toLocaleString()} EGP collected</p>
        </div>
        <Button onClick={() => setShowNewPayment(true)}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Cash Payment
          </span>
        </Button>
      </div>

      {/* List */}
      {payments.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No cash payments for this day</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Cash Payment" to log one.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {payments.map((payment) => {
              const playerName = payment.profiles
                ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
                : "Unknown";
              const packageName = payment.subscriptions?.packages?.name || "—";

              return (
                <div
                  key={payment.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{playerName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{packageName}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                      {payment.amount.toLocaleString()} EGP
                    </span>
                    <Badge variant={payment.status === "confirmed" ? "success" : payment.status === "pending" ? "warning" : "danger"}>
                      {payment.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <NewPaymentDrawer
        open={showNewPayment}
        onClose={() => setShowNewPayment(false)}
        onSuccess={() => { setShowNewPayment(false); loadData(); }}
        defaultMethod="cash"
      />
    </div>
  );
}
