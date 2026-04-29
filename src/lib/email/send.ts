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
  const PRIMARY_DARK = "#0C313A";
  const ACCENT = "#F7AC40";
  const SECONDARY = "#5CACB0";
  const SAND = "#F6EFDA";
  const TEXT = "#0C313A";
  const TEXT_MUTED = "#5A6B73";
  const BORDER = "#E7F0F3";
  const PAGE_BG = "#F6EFDA";

  const safeBody = escapeHtml(body).replace(/\n/g, "<br>");
  const safeSubject = escapeHtml(subject);
  const ctaHtml = ctaLabel && ctaUrl
    ? `
        <tr>
          <td style="padding:8px 40px 4px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td align="center" bgcolor="${ACCENT}" style="border-radius:10px;">
                  <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;color:${PRIMARY_DARK};text-decoration:none;letter-spacing:0.2px;">
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
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px -28px rgba(12,49,58,0.35);">
          <!-- Header band -->
          <tr>
            <td style="background:linear-gradient(135deg,${PRIMARY_DARK} 0%,${PRIMARY} 60%,${SECONDARY} 100%);background-color:${PRIMARY};padding:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:28px 40px 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          <span style="display:inline-block;padding:6px 12px;background:${ACCENT};color:${PRIMARY_DARK};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;border-radius:999px;">${escapeHtml(branding.sport)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:14px;">
                          <h1 style="margin:0;color:#FFFFFF;font-size:26px;font-weight:700;letter-spacing:-0.3px;line-height:1.15;">${escapeHtml(branding.name)}</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:4px;">
                          <p style="margin:0;color:rgba(255,255,255,0.72);font-size:13px;font-weight:500;letter-spacing:0.2px;">${escapeHtml(branding.tagline)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Accent rule -->
          <tr>
            <td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,${ACCENT} 0%,${SECONDARY} 100%);background-color:${ACCENT};">&nbsp;</td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 8px;">
              <h2 style="margin:0 0 14px;color:${TEXT};font-size:22px;font-weight:700;line-height:1.3;letter-spacing:-0.2px;">${safeSubject}</h2>
              <p style="margin:0;color:${TEXT_MUTED};font-size:15px;line-height:1.65;">${safeBody}</p>
            </td>
          </tr>

          ${ctaHtml}

          <tr>
            <td style="padding:24px 40px 32px;">
              <div style="height:1px;background:${BORDER};line-height:1px;font-size:0;">&nbsp;</div>
              <p style="margin:18px 0 0;color:${TEXT_MUTED};font-size:13px;line-height:1.6;">
                You're receiving this because you have an account on ${escapeHtml(branding.name)}.
                ${APP_URL ? `Visit your dashboard anytime at <a href="${APP_URL}" style="color:${PRIMARY};text-decoration:none;font-weight:600;">${APP_URL.replace(/^https?:\/\//, "")}</a>.` : ""}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${SAND};padding:20px 40px;text-align:center;">
              <p style="margin:0;color:${PRIMARY};font-size:13px;font-weight:700;letter-spacing:0.4px;">${escapeHtml(branding.name)}</p>
              <p style="margin:4px 0 0;color:${TEXT_MUTED};font-size:11px;letter-spacing:0.2px;">© ${new Date().getFullYear()} ${escapeHtml(branding.name)}. All rights reserved.</p>
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
