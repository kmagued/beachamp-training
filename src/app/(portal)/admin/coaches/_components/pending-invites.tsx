"use client";

import { useState, useTransition } from "react";
import { Badge, Card, ConfirmDialog } from "@/components/ui";
import { CheckCircle2, Copy, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import { expiryLabel, inviteMessage, inviteState, inviteUrl } from "@/lib/coaches/invites";
import { revokeCoachInvite } from "@/app/_actions/coach-invites";
import type { InviteRow } from "./types";

const actionClass =
  "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors";

interface PendingInvitesProps {
  invites: InviteRow[];
  /** Called after a revoke, to reload the list */
  onChange: () => void;
}

/** Coach invites nobody has used yet: copy or resend the link, or revoke it */
export function PendingInvites({ invites, onChange }: PendingInvitesProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  const now = new Date();
  // Links are built from the address the admin is on, like the one createCoachInvite returned
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const revokingExpired = revoking ? inviteState(revoking, now) === "expired" : false;

  function copy(id: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  function confirmRevoke() {
    if (!revoking) return;
    const invite = revoking;
    setError(null);
    startTransition(async () => {
      const res = await revokeCoachInvite(invite.id);
      if ("error" in res) setError(res.error);
      setRevoking(null);
      onChange();
    });
  }

  return (
    <Card className="mb-4 p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Pending invites ({invites.length})
        </p>
      </div>
      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {invites.map((invite) => {
          // An expired link is dead: it can only be removed
          const expired = inviteState(invite, now) === "expired";
          const url = inviteUrl(origin, invite.token);
          const contact = [invite.phone, invite.email].filter(Boolean).join(" · ");
          return (
            <li key={invite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  {invite.first_name} {invite.last_name}
                  {expired && <Badge variant="warning">Expired</Badge>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {expired ? contact : `${contact} · Expires ${expiryLabel(invite.expires_at)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!expired && (
                  <>
                    <button type="button" onClick={() => copy(invite.id, url)} className={actionClass}>
                      {copiedId === invite.id ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedId === invite.id ? "Copied" : "Copy link"}
                    </button>
                    <a
                      href={buildWhatsAppUrl(invite.phone, inviteMessage(invite.first_name, url, invite.expires_at))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={actionClass}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setRevoking(invite)}
                  className={cn(actionClass, "text-red-500 hover:bg-red-50 hover:border-red-200")}
                >
                  <X className="w-3.5 h-3.5" /> {expired ? "Remove" : "Revoke"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={confirmRevoke}
        title={revokingExpired ? "Remove invite" : "Revoke invite"}
        description={
          revoking ? (
            <>
              {revokingExpired ? "The expired invite for " : "The link for "}
              <span className="font-medium text-slate-700">
                {revoking.first_name} {revoking.last_name}
              </span>
              {revokingExpired ? " leaves this list." : " stops working."} You can invite them again any time.
            </>
          ) : null
        }
        confirmLabel={revokingExpired ? "Remove" : "Revoke"}
        loading={isPending}
        loadingLabel={revokingExpired ? "Removing..." : "Revoking..."}
      />
    </Card>
  );
}
