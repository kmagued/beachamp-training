import Link from "next/link";
import { Coins } from "lucide-react";
import { Card } from "@/components/ui";
import { creditsDetail } from "@/lib/badges/words";

/** The dashboard's Beachamp Credits balance, shown even at 0 so players learn they exist */
export function CreditsCard({ balance, paidTiers }: { balance: number; paidTiers: number }) {
  return (
    <Card className="h-full">
      <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
        <Coins className="w-4 h-4 text-amber-600" />
        Beachamp Credits
      </h2>
      <p className="mt-3 font-display text-5xl leading-none text-primary-900">{balance}</p>
      <p className="mt-2 text-sm text-slate-500">{creditsDetail(paidTiers)}</p>
      <Link
        href="/player/achievements"
        className="mt-3 inline-block text-sm font-semibold text-primary-800 hover:text-primary-900"
      >
        See your badges →
      </Link>
    </Card>
  );
}
