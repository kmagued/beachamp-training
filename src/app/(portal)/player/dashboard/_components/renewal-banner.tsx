import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONES = {
  danger: {
    box: "bg-danger/5 border-danger/30",
    icon: "text-danger",
    title: "text-danger",
    body: "text-danger/80",
    button: "bg-danger hover:bg-danger/90 text-white",
  },
  warning: {
    box: "bg-accent/10 border-accent/40",
    icon: "text-accent-600",
    title: "text-accent-700",
    body: "text-accent-700/80",
    button: "bg-accent hover:bg-accent-600 text-primary-900",
  },
} as const;

/** The dashboard's renew prompt. On phones the button drops below the message at full width. */
export function RenewalBanner({ tone, title, body }: { tone: keyof typeof TONES; title: string; body: string }) {
  const t = TONES[tone];
  return (
    <div className={cn("border rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3", t.box)}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <AlertTriangle className={cn("w-5 h-5 mt-0.5 shrink-0", t.icon)} />
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", t.title)}>{title}</p>
          <p className={cn("text-xs mt-0.5", t.body)}>{body}</p>
        </div>
      </div>
      <Link
        href="/player/subscribe"
        className={cn(
          "inline-flex items-center justify-center w-full sm:w-auto shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
          t.button,
        )}
      >
        Renew now
      </Link>
    </div>
  );
}
