import type { Env } from '@/types';

export type EmailResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'send_failed'; status: number; body: string };

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCodeDigits(code: string): string {
  return String(code)
    .split('')
    .map(
      (d) =>
        `<span style="display:inline-block;width:44px;height:56px;line-height:56px;text-align:center;` +
        `background:#f5f3ef;border:1.5px solid #e4e2de;border-radius:10px;font-size:28px;` +
        `font-weight:700;color:#18181b;margin:0 4px;">${d}</span>`,
    )
    .join('');
}

// Parse "Name <email@host>" → { name, email }. Falls kein "<…>" enthalten, gilt der ganze String als email.
function parseFromHeader(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1]!.trim(), email: m[2]!.trim() };
  return { name: 'FBM Finance', email: from.trim() };
}

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<EmailResult> {
  const from = parseFromHeader(env.EMAIL_FROM ?? 'FBM Finance <noreply@finanzapp.local>');

  // Provider-Auswahl: Brevo bevorzugt (kein Domain-Zwang), Resend als Fallback wenn nur dieser Key gesetzt ist.
  if (env.BREVO_API_KEY) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] Brevo error', res.status, 'from=', from.email, 'to=', to, 'body=', body);
      return { ok: false, reason: 'send_failed', status: res.status, body };
    }
    return { ok: true };
  }

  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to, subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] Resend error', res.status, 'from=', from.email, 'to=', to, 'body=', body);
      return { ok: false, reason: 'send_failed', status: res.status, body };
    }
    return { ok: true };
  }

  console.error('[email] No mail provider configured (set BREVO_API_KEY or RESEND_API_KEY). Cannot send to', to);
  return { ok: false, reason: 'not_configured' };
}

export async function sendVerificationEmail(
  env: Env,
  to: string,
  firstName: string | null | undefined,
  code: string,
): Promise<EmailResult> {
  const ttl = Number(env.EMAIL_CODE_TTL_MINUTES ?? 15);
  const name = firstName || 'Nutzer';
  const safe = escapeHtml(name);
  const codeDigits = renderCodeDigits(code);

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
              <p style="margin:0;font-size:13px;color:#92400e;">&#9201; Dieser Code ist <strong>${ttl} Minuten</strong> gültig.</p>
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

  return sendEmail(
    env,
    to,
    'FBM Finance – Dein Verifizierungscode',
    `Hallo ${name},\n\ndein Verifizierungscode lautet: ${code}\n\nDer Code ist ${ttl} Minuten gültig.\n\n– Das FBM Finance Team`,
    html,
  );
}

export async function sendPasswordResetEmail(
  env: Env,
  to: string,
  firstName: string | null | undefined,
  code: string,
): Promise<EmailResult> {
  const ttl = Number(env.EMAIL_CODE_TTL_MINUTES ?? 15);
  const name = firstName || 'Nutzer';
  const safe = escapeHtml(name);

  return sendEmail(
    env,
    to,
    'FBM Finance – Passwort zurücksetzen',
    `Hallo ${name},\n\ndein Code zum Zurücksetzen des Passworts lautet: ${code}\n\nEr ist ${ttl} Minuten gültig.\n\n– Das FBM Finance Team`,
    `<p>Hallo ${safe},</p><p>dein Code zum Zurücksetzen des Passworts lautet:</p><p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p><p>Er ist ${ttl} Minuten gültig.</p>`,
  );
}
