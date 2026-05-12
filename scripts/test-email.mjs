// Run: node --env-file=.env scripts/test-email.mjs [deine@email.de]
import nodemailer from "nodemailer";

const TO = process.argv[2] || process.env.TEST_EMAIL_TO;
if (!TO) {
  console.error("Kein Empfänger gefunden. Entweder TEST_EMAIL_TO in der .env setzen oder als Argument übergeben:");
  console.error("  node --env-file=.env scripts/test-email.mjs deine@email.de");
  process.exit(1);
}

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM,
  EMAIL_CODE_TTL_MINUTES
} = process.env;

if (!SMTP_HOST || !SMTP_FROM) {
  console.error("SMTP_HOST und SMTP_FROM müssen in der .env gesetzt sein.");
  process.exit(1);
}

const TTL = EMAIL_CODE_TTL_MINUTES || 15;
const firstName = "Max";
const code = "483921";

const safe = firstName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const codeDigits = code.split("").map(d =>
  `<span style="display:inline-block;width:44px;height:56px;line-height:56px;text-align:center;background:#f5f3ef;border:1.5px solid #e4e2de;border-radius:10px;font-size:28px;font-weight:700;color:#18181b;margin:0 4px;">${d}</span>`
).join("");

const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e4e2de;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;padding:32px 40px 28px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">FinanzApp</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.2px;">Deine persönliche Finanzverwaltung</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 16px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Hallo ${safe},</p>
            <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
              um deine Registrierung abzuschließen, gib bitte folgenden Code ein:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
              <tr><td align="center" style="padding:24px 28px;background:#faf9f7;border:1.5px solid #e4e2de;border-radius:12px;">
                ${codeDigits}
              </td></tr>
            </table>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:#92400e;">
                    ⏱ Dieser Code ist <strong>${TTL} Minuten</strong> gültig.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e4e2de;margin:20px 0 0;"></td></tr>
        <tr>
          <td style="padding:20px 40px 32px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
              Falls du dich nicht bei FinanzApp registriert hast, kannst du diese E-Mail einfach ignorieren.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">© ${new Date().getFullYear()} FinanzApp</p>
    </td></tr>
  </table>
</body>
</html>`;

const auth = SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined;
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: SMTP_SECURE === "true",
  auth
});

console.log(`Sende Test-E-Mail an ${TO} ...`);
await transporter.sendMail({
  from: SMTP_FROM,
  to: TO,
  subject: "FinanzApp – Dein Verifizierungscode [TEST]",
  text: `Hallo ${firstName},\n\ndein Verifizierungscode lautet: ${code}\n\nDer Code ist ${TTL} Minuten gültig.`,
  html
});
console.log("E-Mail erfolgreich gesendet!");
