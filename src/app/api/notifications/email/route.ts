import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

/**
 * Webhook endpoint called by Supabase database webhook on notification INSERT.
 * Looks up the user's email and sends the notification via Resend.
 *
 * Set up in Supabase Dashboard:
 *   Database > Webhooks > Create webhook
 *   Table: notifications
 *   Events: INSERT
 *   URL: https://your-domain.com/api/notifications/email
 *   Headers: { "x-webhook-secret": "<your-secret>" }
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const record = payload.record;

    if (!record?.user_id || !record?.title) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Look up user email
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("email, first_name")
      .eq("id", record.user_id)
      .single();

    if (!profile?.email) {
      return NextResponse.json({ skipped: true, reason: "No email" });
    }

    // Send email
    const result = await sendEmail({
      to: profile.email,
      subject: record.title,
      body: record.body || record.title,
    });

    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("[webhook] Notification email error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
