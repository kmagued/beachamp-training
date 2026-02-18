"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Input, Skeleton, TableRowSkeleton } from "@/components/ui";
import { Check, X, Image as ImageIcon } from "lucide-react";
import { confirmPayment, rejectPayment, getScreenshotUrl } from "./actions";

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  status: string;
  screenshot_url: string | null;
  created_at: string;
  confirmed_at: string | null;
  profiles: { first_name: string; last_name: string } | null;
  subscriptions: { packages: { name: string } } | null;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function fetchPayments() {
    const { data } = await supabase
      .from("payments")
      .select("*, profiles!payments_player_id_fkey(first_name, last_name), subscriptions!payments_subscription_id_fkey(packages(name))")
      .order("created_at", { ascending: false });
    if (data) setPayments(data as unknown as PaymentRow[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm(id: string) {
    startTransition(async () => {
      await confirmPayment(id);
      fetchPayments();
    });
  }

  function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    startTransition(async () => {
      await rejectPayment(id, rejectReason);
      setRejectingId(null);
      setRejectReason("");
      fetchPayments();
    });
  }

  async function handleViewScreenshot(path: string) {
    const result = await getScreenshotUrl(path);
    if (result.url) setScreenshotUrl(result.url);
  }

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const confirmedToday = payments.filter(
    (p) =>
      p.status === "confirmed" &&
      p.confirmed_at &&
      new Date(p.confirmed_at).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-500 text-sm">Review and manage player payments</p>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 mb-6">
        <Badge variant={pendingCount > 0 ? "warning" : "neutral"}>
          {pendingCount} Pending
        </Badge>
        <Badge variant="success">{confirmedToday} Confirmed Today</Badge>
      </div>

      {loading ? (
        <>
          {/* Desktop Skeleton */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    {["Player", "Package", "Amount", "Method", "Date", "Actions"].map((h) => (
                      <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRowSkeleton key={i} columns={6} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Mobile Skeleton */}
          <div className="sm:hidden space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
      <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Player
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Package
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Amount
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Method
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Date
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, i) => (
                <tr
                  key={payment.id}
                  className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-[#FAFBFC]" : ""}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {payment.profiles?.first_name} {payment.profiles?.last_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {payment.subscriptions?.packages?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {payment.amount.toLocaleString()} EGP
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 capitalize">
                    {payment.method.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {payment.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleConfirm(payment.id)}
                          disabled={isPending}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                          title="Confirm"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        {payment.screenshot_url && (
                          <button
                            onClick={() => handleViewScreenshot(payment.screenshot_url!)}
                            className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
                            title="View Screenshot"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setRejectingId(payment.id)}
                          disabled={isPending}
                          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                          title="Reject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <Badge
                        variant={
                          payment.status === "confirmed"
                            ? "success"
                            : payment.status === "rejected"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {payment.status}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    No payments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {payments.map((payment) => (
          <Card key={payment.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {payment.profiles?.first_name} {payment.profiles?.last_name}
                </p>
                <p className="text-xs text-slate-400">
                  {payment.subscriptions?.packages?.name || "—"}
                </p>
              </div>
              {payment.status === "pending" ? (
                <Badge variant="warning">Pending</Badge>
              ) : (
                <Badge
                  variant={
                    payment.status === "confirmed"
                      ? "success"
                      : payment.status === "rejected"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {payment.status}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div>
                <span className="text-slate-400">Amount</span>
                <p className="text-slate-700 font-medium">{payment.amount.toLocaleString()} EGP</p>
              </div>
              <div>
                <span className="text-slate-400">Method</span>
                <p className="text-slate-700 font-medium capitalize">{payment.method.replace("_", " ")}</p>
              </div>
              <div>
                <span className="text-slate-400">Date</span>
                <p className="text-slate-700 font-medium">{new Date(payment.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            {payment.status === "pending" && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleConfirm(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-xs font-medium"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                {payment.screenshot_url && (
                  <button
                    onClick={() => handleViewScreenshot(payment.screenshot_url!)}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors text-xs font-medium"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setRejectingId(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs font-medium"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            )}
          </Card>
        ))}
        {payments.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">No payments found</p>
        )}
      </div>
      </>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <h3 className="font-semibold text-slate-900 mb-3">Reject Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              Please provide a reason for rejecting this payment.
            </p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason..."
              className="mb-4"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleReject(rejectingId)}
                disabled={!rejectReason.trim() || isPending}
                fullWidth
                className="!bg-red-600 hover:!bg-red-700"
              >
                Reject
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                fullWidth
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Screenshot lightbox */}
      {screenshotUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setScreenshotUrl(null)}
        >
          <div className="max-w-2xl max-h-[80vh] relative">
            <button
              onClick={() => setScreenshotUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl}
              alt="Payment screenshot"
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
