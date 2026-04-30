import nodemailer from "nodemailer";
import { branding } from "@/lib/config/branding";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_EMAIL = process.env.EMAIL_FROM || `${branding.name} <noreply@beachamp.com>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapInTemplate(subject: string, body: string, ctaLabel?: string, ctaUrl?: string): string {
  const PRIMARY = "#124B5D";
  const TEXT = "#0C313A";
  const TEXT_MUTED = "#5A6B73";
  const TEXT_SUBTLE = "#8A9499";
  const BORDER = "#E7F0F3";
  const PAGE_BG = "#F4F6F7";

  const safeBody = escapeHtml(body).replace(/\n/g, "<br>");
  const safeSubject = escapeHtml(subject);
  const ctaHtml = ctaLabel && ctaUrl
    ? `
          <tr>
            <td style="padding:4px 40px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td bgcolor="${PRIMARY}" style="border-radius:6px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:0.1px;">
                      ${escapeHtml(ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safeSubject}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid ${BORDER};border-radius:8px;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 40px 20px;border-bottom:1px solid ${BORDER};">
              <p style="margin:0;color:${PRIMARY};font-size:16px;font-weight:700;letter-spacing:0.3px;">${escapeHtml(branding.name)}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 12px;">
              <h2 style="margin:0 0 14px;color:${TEXT};font-size:18px;font-weight:600;line-height:1.4;">${safeSubject}</h2>
              <p style="margin:0;color:${TEXT_MUTED};font-size:15px;line-height:1.65;">${safeBody}</p>
            </td>
          </tr>

          ${ctaHtml}

          <!-- Footer -->
          <tr>
            <td style="padding:28px 40px;border-top:1px solid ${BORDER};">
              <p style="margin:0;color:${TEXT_SUBTLE};font-size:12px;line-height:1.6;">
                You're receiving this because you have an account on ${escapeHtml(branding.name)}.${APP_URL ? ` Visit your dashboard at <a href="${APP_URL}" style="color:${PRIMARY};text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a>.` : ""}
              </p>
              <p style="margin:10px 0 0;color:${TEXT_SUBTLE};font-size:11px;">© ${new Date().getFullYear()} ${escapeHtml(branding.name)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendEmail({ to, subject, body, html, ctaLabel, ctaUrl }: SendEmailOptions) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[email] SMTP credentials not set, skipping email to", to);
    return { success: false, error: "Email not configured" };
  }

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html: html || wrapInTemplate(subject, body, ctaLabel, ctaUrl),
      text: body,
    });

    return { success: true };
  } catch (err) {
    console.error("[email] Send failed:", err);
    return { success: false, error: String(err) };
  }
}
