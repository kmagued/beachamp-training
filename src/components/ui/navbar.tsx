import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Logo, buttonVariants } from "@/components/ui";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  /** User initials for the avatar (null = not logged in) */
  user?: {
    initials: string;
    email: string;
  } | null;
  className?: string;
}

export function Navbar({ user, className }: NavbarProps) {
  return (
    <nav
      className={cn(
        "sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 max-w-7xl mx-auto">
        <Link href="/">
          <Logo showName className="text-slate-900" />
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <UserMenu initials={user.initials} email={user.email} />
          ) : (
            <>
              <Link
                href="/login"
                className="text-slate-600 hover:text-slate-900 font-medium text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className={cn(
                  buttonVariants.primary,
                  "text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg"
                )}
              >
                Join Now
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
