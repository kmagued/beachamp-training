"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ShareSubject } from "@/lib/share/share";
import { ShareDrawer } from "./share-drawer";

const LOOKS = {
  /** 1st place: filled gold, as in the mockup */
  gold: "rounded-xl px-5 py-2.5 text-sm border border-accent-500 bg-accent-400 hover:bg-accent-500 text-primary-900",
  /** 2nd place: outlined navy */
  outline: "rounded-xl px-5 py-2.5 text-sm border border-primary-200 bg-white hover:bg-primary-50 text-primary-800",
  /** On a badge tile */
  compact: "rounded-lg px-2.5 py-1.5 gap-1.5 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-primary-800",
};

export function ShareButton({
  subject,
  playerId,
  look,
}: {
  subject: ShareSubject;
  playerId: string;
  look: keyof typeof LOOKS;
}) {
  const [open, setOpen] = useState(false);
  // The drawer, and with it the card's fonts, load on the first tap rather than with the page
  const [used, setUsed] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
        className={cn("inline-flex items-center gap-2 font-semibold transition-colors", LOOKS[look])}
      >
        <Share2 className={look === "compact" ? "w-3.5 h-3.5" : "w-4 h-4"} />
        {subject.kind === "award" ? "Share this award" : "Share"}
      </button>
      {used && <ShareDrawer open={open} onClose={() => setOpen(false)} subject={subject} playerId={playerId} />}
    </>
  );
}
