import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { branding } from "@/lib/config/branding";
import { Button } from "@/components/ui";
import { inviteState, type InviteState } from "@/lib/coaches/invites";
import { CoachSignupForm } from "./_components/coach-signup-form";

interface InviteRow {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/** Why the signup form isn't shown */
const NOTICES: Record<Exclude<InviteState, "pending">, { title: string; body: string }> = {
  revoked: { title: "This invite link isn't valid", body: "Ask the academy for a new one." },
  expired: { title: "This invite has expired", body: "Ask the academy for a new link." },
  accepted: {
    title: "This invite has already been used",
    body: "If it was you, log in with the email and password you chose.",
  },
};

export default async function CoachInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // The person opening the link has no account yet, so the invite is read with the service role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("coach_invites")
    .select("first_name, last_name, phone, email, expires_at, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  const invite = data as InviteRow | null;
  // An unknown token reads the same as a revoked one
  const state: InviteState = invite ? inviteState(invite, new Date()) : "revoked";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-sand/10 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-[0_8px_40px_-20px_rgba(18,75,93,0.15)] p-8 w-full max-w-md">
        {state === "pending" && invite && !user ? (
          <>
            <div className="text-center mb-8">
              <h1 className="font-display text-4xl sm:text-5xl tracking-tight text-primary-900">Join as a Coach</h1>
              <p className="text-primary-700/60 text-sm mt-2">Create your {branding.name} coach account</p>
            </div>
            <CoachSignupForm token={token} invite={invite} />
          </>
        ) : state === "pending" ? (
          <div className="text-center space-y-4">
            <h1 className="font-display text-3xl tracking-tight text-primary-900">You&apos;re signed in</h1>
            <p className="text-sm text-primary-700/70">
              You&apos;re signed in as {user?.email}. Log out, then open this link again to create your coach account.
            </p>
            <form action={logout}>
              <Button type="submit" variant="outline" fullWidth>
                Log out
              </Button>
            </form>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <h1 className="font-display text-3xl tracking-tight text-primary-900">{NOTICES[state].title}</h1>
            <p className="text-sm text-primary-700/70">{NOTICES[state].body}</p>
            {state === "accepted" && (
              <Link
                href="/login"
                className="inline-block text-sm font-semibold text-primary-800 hover:text-primary-900 hover:underline"
              >
                Log in
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
