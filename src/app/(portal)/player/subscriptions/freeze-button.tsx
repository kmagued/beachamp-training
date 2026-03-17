"use client";

import { useTransition, useState } from "react";
import { Snowflake, Play, Loader2 } from "lucide-react";
import { Button, Drawer } from "@/components/ui";
import { playerFreezeSubscription, playerUnfreezeSubscription } from "./actions";

interface FreezeButtonProps {
  subscriptionId: string;
  status: string;
  packageName: string;
}

export function FreezeButton({ subscriptionId, status, packageName }: FreezeButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFrozen = status === "frozen";

  function handleAction() {
    setError(null);
    startTransition(async () => {
      const res = isFrozen
        ? await playerUnfreezeSubscription(subscriptionId)
        : await playerFreezeSubscription(subscriptionId);
      if ("error" in res) {
        setError(res.error as string);
      } else {
        setShowConfirm(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setShowConfirm(true); }}
        className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
          isFrozen
            ? "text-emerald-600 hover:text-emerald-700"
            : "text-blue-600 hover:text-blue-700"
        }`}
      >
        {isFrozen ? (
          <><Play className="w-3.5 h-3.5" /> Unfreeze</>
        ) : (
          <><Snowflake className="w-3.5 h-3.5" /> Freeze</>
        )}
      </button>

      <Drawer
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={isFrozen ? "Unfreeze Subscription" : "Freeze Subscription"}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              fullWidth
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={isPending}
              fullWidth
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {isFrozen ? "Unfreezing..." : "Freezing..."}
                </span>
              ) : isFrozen ? "Unfreeze" : "Freeze"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {isFrozen ? (
            <>
              <p className="text-sm text-slate-600">
                Are you sure you want to unfreeze your <span className="font-medium text-slate-900">{packageName}</span> subscription?
              </p>
              <p className="text-xs text-slate-400">
                Your subscription will be reactivated and the expiry date will be extended by the number of days it was frozen.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Are you sure you want to freeze your <span className="font-medium text-slate-900">{packageName}</span> subscription?
              </p>
              <p className="text-xs text-slate-400">
                While frozen, your sessions will be paused and the remaining days will be preserved. You can unfreeze anytime to resume.
              </p>
            </>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
