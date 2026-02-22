"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BulkPaymentImport } from "./_components/bulk-payment-import";

export default function ImportPaymentsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Payments
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Import Payments</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a CSV file to bulk import historical payment and subscription data.
        </p>
      </div>

      <BulkPaymentImport />
    </div>
  );
}
