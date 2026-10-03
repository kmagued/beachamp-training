"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/app/_actions/notifications";
import { sendEmail } from "@/lib/email/send";
import { branding } from "@/lib/config/branding";
import {
  alreadyRegistered,
  escapeLike,
  inviteExpiry,
  inviteMessage,
  inviteProblem,
  inviteUrl,
  originFrom,
  signupProblem,
  type CreatedInvite,
} from "@/lib/coaches/invites";

// ── Helper: the signed-in admin's id, or null ──
async function currentAdminId(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? (user.id as string) : null;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

// ═══════════════════════════════════════
// ADMIN: invite a coach, revoke an invite
// ═══════════════════════════════════════

/** Invite a new coach: a link that works once and expires in 7 days, emailed too when there's an address */
export async function createCoachInvite(
  formData: FormData
): Promise<{ error: string } | { success: true; invite: CreatedInvite }> {
  const adminId = await currentAdminId();
  if (!adminId) return { error: "Unauthorized: admin access required" };

  const input = {
    first_name: field(formData, "first_name"),
    last_name: field(formData, "last_name"),
    phone: field(formData, "phone"),
    email: field(formData, "email").toLowerCase(),
  };
  const problem = inviteProblem(input);
  if (problem) return { error: problem };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Someone who already has an account is made a coach from Existing player instead
  if (input.email) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", escapeLike(input.email))
      .limit(1);
    if (existing?.length) return { error: "This email already has an account. Use Existing player instead." };
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = inviteExpiry(new Date()).toISOString();
  const { error } = await admin.from("coach_invites").insert({
    token,
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    email: input.email || null,
    created_by: adminId,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  // The link uses the address the admin is on, so it works on staging and production alike
  const h = await headers();
  const origin = originFrom(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto")) ?? "";
  const url = inviteUrl(origin, token);

  let emailed: boolean | null = null;
  if (input.email) {
    const sent = await sendEmail({
      to: input.email,
      subject: `You're invited to coach at ${branding.name}`,
      body: inviteMessage(input.first_name, url, expiresAt),
      ctaLabel: "Create your coach account",
      ctaUrl: url,
    });
    emailed = sent.success;
  }

  revalidatePath("/admin/coaches");
  return {
    success: true,
    invite: { url, firstName: input.first_name, phone: input.phone, email: input.email || null, expiresAt, emailed },
  };
}

/** Revoke an open invite: its link stops working */
export async function revokeCoachInvite(inviteId: string): Promise<{ error: string } | { success: true }> {
  const adminId = await currentAdminId();
  if (!adminId) return { error: "Unauthorized: admin access required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("coach_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  return { success: true };
}

// ═══════════════════════════════════════
// INVITEE: create the coach account
// ═══════════════════════════════════════

/** The invited coach creates their account. On success it redirects to the email-code page. */
export async function acceptCoachInvite(token: string, formData: FormData): Promise<{ error: string }> {
  const input = {
    first_name: field(formData, "first_name"),
    last_name: field(formData, "last_name"),
    phone: field(formData, "phone"),
    email: field(formData, "email").toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
  const problem = signupProblem(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Someone signed in would keep their own session while the new account waits for its code
  const {
    data: { user: signedIn },
  } = await supabase.auth.getUser();
  if (signedIn) return { error: "You're signed in. Log out first, then open the invite link again." };

  // Claim the invite with one conditional update, so only one signup can ever use it
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("coach_invites")
    .update({ accepted_at: now })
    .eq("token", token)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "This invite link is no longer valid. Ask the academy for a new one." };
  const release = () => admin.from("coach_invites").update({ accepted_at: null }).eq("id", claimed.id);

  // Supabase emails the signup code, as it does for players
  const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password });
  const newUser = data?.user ?? null;
  if (alreadyRegistered(error, newUser)) {
    await release();
    return { error: "This email already has an account. Ask the academy to make that account a coach." };
  }
  if (error || !newUser) {
    await release();
    return { error: error?.message ?? "Couldn't create your account. Please try again." };
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: newUser.id,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
      role: "coach",
      is_coach: true,
      is_active: true,
      profile_completed: true,
    },
    { onConflict: "id" }
  );
  if (profileError) {
    // Don't leave a login with no profile behind
    await admin.auth.admin.deleteUser(newUser.id);
    await release();
    return { error: `Couldn't create your account: ${profileError.message}` };
  }

  await admin.from("coach_invites").update({ accepted_by: newUser.id }).eq("id", claimed.id);

  await notifyAdmins({
    title: "Coach invite accepted",
    body: `${input.first_name} ${input.last_name} created their coach account. Assign them to a group.`,
    type: "system",
    link: "/admin/groups",
  });

  revalidatePath("/admin/coaches");
  redirect(`/verify-email?email=${encodeURIComponent(input.email)}`);
}
