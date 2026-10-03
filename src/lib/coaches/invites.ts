// Coach invites: an admin sends a link, and the coach creates their own account from it.

import { branding } from "@/lib/config/branding";
import { shortDate } from "@/lib/birthdays/format";
import { cairoDayKey } from "@/lib/utils/cairo-time";

export const INVITE_DAYS = 7;

export type InviteState = "pending" | "expired" | "accepted" | "revoked";

export interface InviteDates {
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/** When a link made now stops working */
export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

/** Where an invite stands: accepted beats revoked beats expired */
export function inviteState(invite: InviteDates, now: Date): InviteState {
  if (invite.accepted_at) return "accepted";
  if (invite.revoked_at) return "revoked";
  return new Date(invite.expires_at).getTime() <= now.getTime() ? "expired" : "pending";
}

/** The link the coach opens */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/** The site's address from the request's host and protocol headers, or null without a host */
export function originFrom(host: string | null, proto: string | null): string | null {
  if (!host) return null;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const scheme = proto?.split(",")[0].trim() || (local ? "http" : "https");
  return `${scheme}://${host}`;
}

/** The last day a link works, as a Cairo calendar day: "Sat 10 Oct" */
export function expiryLabel(expiresAt: string): string {
  return shortDate(cairoDayKey(new Date(expiresAt)));
}

/** The WhatsApp and email text: who it's for, the link, and the last day it works */
export function inviteMessage(firstName: string, url: string, expiresAt: string): string {
  return (
    `Hi ${firstName}, you're invited to join ${branding.name} as a coach. ` +
    `Create your coach account here:\n${url}\n\nThe link works once and expires on ${expiryLabel(expiresAt)}.`
  );
}

/** What createCoachInvite hands back for the admin to share */
export interface CreatedInvite {
  url: string;
  firstName: string;
  phone: string;
  email: string | null;
  expiresAt: string;
  /** Whether the email went out; null when no email was given */
  emailed: boolean | null;
}

/** Escapes LIKE wildcards, so an ilike() on an email matches only that email ("omar_a" isn't "omarxa") */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Supabase's answer to signing up an email that already has an account: an "already registered"
 *  error, or (with email confirmation on) no error and a user with no identities */
export function alreadyRegistered(
  error: { message: string } | null,
  user: { identities?: unknown[] | null } | null
): boolean {
  if (error) return /already registered/i.test(error.message);
  return user?.identities?.length === 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InviteForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
}

export interface SignupForm extends InviteForm {
  password: string;
}

/** What's wrong with the admin's invite form, or null: names and phone required, email optional */
export function inviteProblem(input: InviteForm): string | null {
  if (!input.first_name.trim() || !input.last_name.trim()) return "First and last name are required";
  if (!input.phone.trim()) return "Phone is required";
  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) return "Please enter a valid email";
  return null;
}

/** What's wrong with the coach's signup form, or null: also an email and a 6-character password */
export function signupProblem(input: SignupForm): string | null {
  return (
    inviteProblem(input) ??
    (input.email.trim() ? null : "Email is required") ??
    (input.password.length < 6 ? "Password must be at least 6 characters" : null)
  );
}
