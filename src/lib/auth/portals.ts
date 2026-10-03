// Which views (portals) an account can open, and where it lands after login.
// A player who coaches is role 'player' with is_coach = true: they have the player view
// and the coach view. An admin who plays is role 'admin' with is_player = true: they have
// the admin view and the player view. Each device remembers the last view used.

export type Portal = "player" | "coach" | "admin";

export interface Account {
  role: "player" | "coach" | "admin";
  is_coach: boolean;
  /** An admin who also plays */
  is_player: boolean;
}

/** The cookie that remembers which view an account with two views used last */
export const VIEW_COOKIE = "beachamp-view";

/** Kept a year; only the server reads it */
export const VIEW_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

/** A profile row (or none) as an Account: a missing or unknown role is a player, as before */
export function accountOf(
  profile: { role?: string | null; is_coach?: boolean | null; is_player?: boolean | null } | null | undefined
): Account {
  const role = profile?.role;
  return {
    role: role === "admin" || role === "coach" ? role : "player",
    is_coach: profile?.is_coach === true,
    is_player: profile?.is_player === true,
  };
}

/** Plays: a player account, or an admin who also plays */
export function isPlayer(a: Account): boolean {
  return a.role === "player" || a.is_player;
}

/** Can do coach work: a coach account, or a player or admin with coach access */
export function canCoach(a: Account): boolean {
  return a.role === "coach" || a.is_coach;
}

/** May use coach tools: an admin, or anyone who can coach */
export function coachOrAdmin(a: Account): boolean {
  return a.role === "admin" || canCoach(a);
}

/** The views this account can open, in switcher order */
export function portalsFor(a: Account): Portal[] {
  if (a.role === "admin") return a.is_player ? ["admin", "player"] : ["admin"];
  if (a.role === "coach") return ["coach"];
  return a.is_coach ? ["player", "coach"] : ["player"];
}

/** The switches the menu shows: admins jump between all three portals, in development only;
 *  an account with two views (a player who coaches, an admin who plays) always gets the
 *  switch between them */
export function switchesFor(
  role: Account["role"],
  portals: Portal[],
  dev: boolean
): { devPortals: boolean; views: boolean } {
  return { devPortals: dev && role === "admin", views: portals.length > 1 };
}

/** "/coach/groups/1" → "coach"; anything outside the three portals → null */
export function portalOfPath(pathname: string): Portal | null {
  const first = pathname.split("/")[1];
  return first === "admin" || first === "coach" || first === "player" ? first : null;
}

/** Where login lands: the remembered view if this account has it, else its first view */
export function homePath(a: Account, lastView: string | undefined): string {
  const portals = portalsFor(a);
  const view = portals.find((p) => p === lastView) ?? portals[0];
  return `/${view}/dashboard`;
}

/** The view to remember for this visit, or null to leave the cookie alone: only for
 *  accounts with two views, only a view they have, only when it changes, and never for
 *  a prefetch (a link to the other view must not flip it) */
export function viewToRemember(
  a: Account,
  pathname: string,
  current: string | undefined,
  headers: Headers
): Portal | null {
  if (isPrefetch(headers)) return null;
  const portals = portalsFor(a);
  const portal = portalOfPath(pathname);
  if (portals.length < 2 || !portal || !portals.includes(portal) || portal === current) return null;
  return portal;
}

/** A background prefetch, not a visit: Next.js link prefetches and browser prefetch hints */
export function isPrefetch(headers: Headers): boolean {
  return (
    headers.has("next-router-prefetch") ||
    /prefetch/i.test(headers.get("purpose") ?? "") ||
    /prefetch/i.test(headers.get("sec-purpose") ?? "")
  );
}
