"use client";

import { useState } from "react";
import { Card, Button } from "@/components/ui";
import { CreditCard, Plus } from "lucide-react";
import { NewPaymentDrawer } from "../../payments/_components/new-payment-drawer";

export function PaymentsTab({ date }: { date: string }) {
  const [showNewPayment, setShowNewPayment] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-center py-10">
          <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Add a cash payment for this day</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Record player or quick payments received in cash.
          </p>
          <Button onClick={() => setShowNewPayment(true)}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Cash Payment
            </span>
          </Button>
        </div>
      </Card>

      <NewPaymentDrawer
        open={showNewPayment}
        onClose={() => setShowNewPayment(false)}
        onSuccess={() => setShowNewPayment(false)}
        defaultMethod="cash"
      />
    </div>
  );
}
