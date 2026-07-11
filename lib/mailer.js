import "server-only";
import nodemailer from "nodemailer";

// Server-only: never import this in client components. Uses Gmail SMTP
// with an app password (GMAIL_USER / GMAIL_APP_PASSWORD), not a real
// account password — see https://myaccount.google.com/apppasswords.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function wrapHtml(bodyHtml) {
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #4f46e5; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">ProcureBid</h1>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px; background: #ffffff; color: #0f172a;">
        ${bodyHtml}
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 16px; text-align: center;">
        This is an automated message from ProcureBid.
      </p>
    </div>
  `;
}

/**
 * Sends an HTML email via Gmail SMTP, wrapped in the ProcureBid branded template.
 * @param {{ to: string, subject: string, html: string }} params
 */
export async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"ProcureBid" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: wrapHtml(html),
  });
}
