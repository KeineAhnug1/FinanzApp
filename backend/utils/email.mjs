// @ts-check
// E-Mail via Resend REST API (ersetzt nodemailer)
import { VERIFICATION_TTL_MINUTES } from "../config/runtime.mjs";

/**
 * @param {string} to
 * @param {string | null | undefined} firstName
 * @param {string} code
 * @param {{ RESEND_API_KEY?: string; SMTP_FROM?: string }} env
 */
export async function sendVerificationEmail(to, firstName, code, env) {
  const apiKey = env.RESEND_API_KEY || "";
  const from = env.SMTP_FROM || "FinanzApp <noreply@finanzapp.dev>";
  if (!apiKey) {
    console.warn(`[verification] RESEND_API_KEY not set. Code for ${to} not sent.`);
    return false;
  }

  const greetingName = firstName || "Nutzer";
  const safe = greetingName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const codeDigits = String(code)
    .split("")
    .map(
      (d) =>
        `<span style="display:inline-block;width:44px;height:56px;line-height:56px;text-align:center;background:#f5f3ef;border:1.5px solid #e4e2de;border-radius:10px;font-size:28px;font-weight:700;color:#18181b;margin:0 4px;">${d}</span>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e2de;overflow:hidden;">
        <tr><td style="background:#2563eb;padding:32px 40px 28px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">FBM Finance</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">Deine persönliche Finanzverwaltung</p>
        </td></tr>
        <tr><td style="padding:36px 40px 16px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Hallo ${safe},</p>
          <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">um deine Registrierung abzuschließen, gib bitte folgenden Code ein:</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
            <tr><td align="center" style="padding:24px 28px;background:#faf9f7;border:1.5px solid #e4e2de;border-radius:12px;">${codeDigits}</td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
            <tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#92400e;">⏱ Dieser Code ist <strong>${VERIFICATION_TTL_MINUTES} Minuten</strong> gültig.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e4e2de;margin:20px 0 0;"></td></tr>
        <tr><td style="padding:20px 40px 32px;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">Falls du dich nicht bei FBM Finance registriert hast, kannst du diese E-Mail einfach ignorieren.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "FBM Finance – Dein Verifizierungscode",
      text: `Hallo ${greetingName},\n\ndein Verifizierungscode lautet: ${code}\n\nDer Code ist ${VERIFICATION_TTL_MINUTES} Minuten gültig.\n\n– Das FBM Finance Team`,
      html,
    }),
  });
  if (!resp.ok) {
    console.error("[email] Resend error:", await resp.text());
    return false;
  }
  return true;
}

/**
 * @param {string} to
 * @param {string | null | undefined} firstName
 * @param {string} code
 * @param {{ RESEND_API_KEY?: string; SMTP_FROM?: string }} env
 */
export async function sendPasswordResetEmail(to, firstName, code, env) {
  const apiKey = env.RESEND_API_KEY || "";
  const from = env.SMTP_FROM || "FinanzApp <noreply@finanzapp.dev>";
  if (!apiKey) {
    console.warn(`[password-reset] RESEND_API_KEY not set. Code for ${to} not sent.`);
    return false;
  }

  const greetingName = firstName || "Nutzer";
  const safe = greetingName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "FBM Finance – Passwort zurücksetzen",
      text: `Hallo ${greetingName}, dein Code zum Zurücksetzen des Passworts lautet: ${code}. Er ist ${VERIFICATION_TTL_MINUTES} Minuten gültig.`,
      html: `<p>Hallo ${safe},</p><p>dein Code zum Zurücksetzen des Passworts lautet:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p><p>Er ist ${VERIFICATION_TTL_MINUTES} Minuten gültig.</p>`,
    }),
  });
  if (!resp.ok) {
    console.error("[email] Resend error:", await resp.text());
    return false;
  }
  return true;
}
