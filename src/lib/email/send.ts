import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_EMAIL = process.env.EMAIL_FROM || "Beachamp <noreply@beachamp.com>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

function wrapInTemplate(subject: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">Beachamp</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;font-weight:600;">${subject}</h2>
      <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">${body}</p>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Beachamp Training Platform</p>
    </div>
  </div>
</body>
</html>`.trim();
}

export async function sendEmail({ to, subject, body, html }: SendEmailOptions) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[email] SMTP credentials not set, skipping email to", to);
    return { success: false, error: "Email not configured" };
  }

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html: html || wrapInTemplate(subject, body),
    });

    return { success: true };
  } catch (err) {
    console.error("[email] Send failed:", err);
    return { success: false, error: String(err) };
  }
}
