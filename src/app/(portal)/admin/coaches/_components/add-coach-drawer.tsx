"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Drawer, Input, Label, buttonSizes, buttonVariants } from "@/components/ui";
import { CheckCircle2, Copy, Loader2, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buildWhatsAppUrl } from "@/lib/whatsapp/url";
import { anyFieldFilter, playerSearch } from "@/lib/coaches/player-search";
import { INVITE_DAYS, expiryLabel, inviteMessage, type CreatedInvite } from "@/lib/coaches/invites";
import { assignPlayerAsCoach } from "@/app/_actions/training";
import { createCoachInvite } from "@/app/_actions/coach-invites";

type Tab = "existing" | "invite";

interface PlayerResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface AddCoachDrawerProps {
  open: boolean;
  onClose: () => void;
  /** An existing player was made a coach */
  onAssigned: (name: string) => void;
  /** An invite was created; the drawer stays open so the admin can share it */
  onInvited: () => void;
}

/** Add Coach: make an existing player a coach, or invite someone new with a link */
export function AddCoachDrawer({ open, onClose, onAssigned, onInvited }: AddCoachDrawerProps) {
  const [tab, setTab] = useState<Tab>("existing");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Existing player
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PlayerResult | null>(null);
  const searchSeq = useRef(0);

  // Invite coach
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Every opening starts fresh, on Existing player
  useEffect(() => {
    if (!open) return;
    searchSeq.current++;
    setTab("existing");
    setError(null);
    setQuery("");
    setResults([]);
    setSearching(false);
    setSelected(null);
    setInvite(null);
    setCopied(false);
  }, [open]);

  async function search(text: string) {
    setQuery(text);
    setSelected(null);
    const seq = ++searchSeq.current;
    const terms = playerSearch(text);
    if (!terms) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let q = supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone")
      .eq("role", "player")
      .eq("is_coach", false)
      .eq("is_active", true);
    q =
      terms.kind === "full-name"
        ? q.ilike("first_name", `%${terms.first}%`).ilike("last_name", `%${terms.last}%`)
        : q.or(anyFieldFilter(terms.text));
    const { data } = await q.order("first_name").limit(20);
    // A newer search has started since: its answer wins
    if (seq !== searchSeq.current) return;
    setResults((data ?? []) as PlayerResult[]);
    setSearching(false);
  }

  function makeCoach() {
    if (!selected) return;
    const player = selected;
    setError(null);
    startTransition(async () => {
      const res = await assignPlayerAsCoach(player.id);
      if ("error" in res) setError(res.error);
      else onAssigned(`${player.first_name} ${player.last_name}`.trim());
    });
  }

  function createInvite(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createCoachInvite(formData);
      if ("error" in res) setError(res.error);
      else {
        setInvite(res.invite);
        onInvited();
      }
    });
  }

  function copyLink() {
    if (!invite) return;
    navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const footer =
    tab === "existing" ? (
      <Button fullWidth onClick={makeCoach} disabled={!selected || isPending}>
        {isPending ? "Saving..." : selected ? `Make ${selected.first_name} a coach` : "Pick a player"}
      </Button>
    ) : invite ? (
      <Button fullWidth onClick={onClose}>
        Done
      </Button>
    ) : (
      <Button type="submit" form="invite-coach-form" fullWidth disabled={isPending}>
        {isPending ? "Creating..." : "Create Invite"}
      </Button>
    );

  return (
    <Drawer open={open} onClose={onClose} title={invite ? "Invite Ready" : "Add Coach"} footer={footer}>
      {!invite && (
        <div role="tablist" className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-lg bg-slate-100">
          {(["existing", "invite"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={cn(
                "py-1.5 rounded-md text-sm font-medium transition-colors",
                tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t === "existing" ? "Existing player" : "Invite coach"}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>
      )}

      {tab === "existing" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            They keep their player account and log in as usual, with a Coach view next to their Player view.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search players by name, email or phone"
              aria-label="Search players"
              className="pl-9"
            />
          </div>
          {searching ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : playerSearch(query) && results.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              No active players found who aren&apos;t coaches already
            </p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((p) => {
                const isSelected = selected?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
                        isSelected ? "border-primary bg-primary-50" : "border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {[p.email, p.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "invite" && !invite && (
        <form id="invite-coach-form" action={createInvite} className="space-y-3">
          <p className="text-xs text-slate-500">
            They get a link to create their own account. It works once and expires in {INVITE_DAYS} days. Once
            they&apos;ve joined, assign them to a group from the group&apos;s page.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>First Name</Label>
              <Input name="first_name" required placeholder="John" />
            </div>
            <div>
              <Label required>Last Name</Label>
              <Input name="last_name" required placeholder="Doe" />
            </div>
          </div>
          <div>
            <Label required>Phone</Label>
            <Input name="phone" type="tel" required placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="coach@example.com" />
            <p className="text-[10px] text-slate-400 mt-1">Optional: we&apos;ll email the link too</p>
          </div>
        </form>
      )}

      {tab === "invite" && invite && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">Invite created for {invite.firstName}</p>
            </div>
            <p className="text-xs text-emerald-600">
              Send them this link. It works once and expires on {expiryLabel(invite.expiresAt)}.
            </p>
          </div>
          <div>
            <Label>Invite link</Label>
            <Input value={invite.url} readOnly onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={copyLink}>
              <span className="flex items-center justify-center gap-1.5">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </span>
            </Button>
            <a
              href={buildWhatsAppUrl(invite.phone, inviteMessage(invite.firstName, invite.url, invite.expiresAt))}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
                buttonVariants.outline,
                buttonSizes.sm
              )}
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          </div>
          {invite.emailed !== null && (
            <p className={cn("text-xs", invite.emailed ? "text-slate-500" : "text-amber-600")}>
              {invite.emailed
                ? `Emailed to ${invite.email}.`
                : "Couldn't send the email. Copy the link or send it on WhatsApp instead."}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
