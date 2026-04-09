"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button } from "@/components/ui";
import { CreditCard, Plus } from "lucide-react";
import { NewPaymentDrawer } from "../../payments/_components/new-payment-drawer";

interface DailyPayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  note: string | null;
  confirmed_at: string | null;
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
  subscriptions: { packages: { name: string } | null } | null;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "confirmed": return <Badge variant="success">Confirmed</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    case "rejected": return <Badge variant="danger">Rejected</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

export function PaymentsTab({ date }: { date: string }) {
  const [payments, setPayments] = useState<DailyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPayment, setShowNewPayment] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchPayments = useCallback(async () => {
    setLoading(true);

    // Daily report shows only confirmed payments, bucketed by confirmed_at
    const { data } = await supabase
      .from("payments")
      .select("id, amount, method, status, note, confirmed_at, profiles!payments_player_id_fkey(first_name, last_name), subscriptions!payments_subscription_id_fkey(packages(name))")
      .eq("status", "confirmed")
      .gte("confirmed_at", `${date}T00:00:00`)
      .lte("confirmed_at", `${date}T23:59:59`)
      .order("confirmed_at", { ascending: false });

    setPayments((data || []) as unknown as DailyPayment[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const confirmedPayments = payments.filter((p) => p.status === "confirmed");
  const total = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);
  const cashTotal = confirmedPayments
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      {payments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Confirmed</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{total.toLocaleString()} EGP</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Cash</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{cashTotal.toLocaleString()} EGP</p>
          </Card>
          <Card className="p-4 col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Payments</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{payments.length}</p>
          </Card>
        </div>
      )}

      {/* Payments list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" />
            Payments
          </h2>
          <Button size="sm" onClick={() => setShowNewPayment(true)}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Payment
            </span>
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
        ) : payments.length === 0 ? (
          <div className="text-center py-10">
            <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No payments for this date</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {payment.profiles
                      ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
                      : payment.note || "Quick Payment"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {payment.subscriptions?.packages?.name || "Standalone"} &middot; {payment.method}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {payment.amount.toLocaleString()} EGP
                  </span>
                  <StatusBadge status={payment.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <NewPaymentDrawer
        open={showNewPayment}
        onClose={() => setShowNewPayment(false)}
        onSuccess={() => {
          setShowNewPayment(false);
          fetchPayments();
        }}
      />
    </div>
  );
}
