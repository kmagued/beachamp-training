import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { UserMenu } from "./user-menu";
import { branding } from "@/lib/config/branding";

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
        "sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-primary-100",
        className
      )}
    >
      <div className="flex items-center justify-between h-14 px-5 sm:px-6 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center">
          <Image
            src="/images/teal-logo.png"
            alt={branding.name}
            width={96}
            height={32}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-1">
          {user ? (
            <UserMenu initials={user.initials} email={user.email} />
          ) : (
            <>
              <Link
                href="/login"
                className="text-primary-700 hover:text-primary-900 text-[13px] font-medium px-3 py-1.5 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-primary-800 hover:bg-primary-900 text-white text-[13px] font-semibold px-4 py-1.5 rounded-md transition-colors"
              >
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
