import nodemailer from "nodemailer";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? "587", 10),
    secure: parseInt(SMTP_PORT ?? "587", 10) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

export async function sendEmail(opts: MailOptions): Promise<void> {
  const from = process.env.SMTP_FROM ?? "JobFlow AI <noreply@jobflow.ai>";
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`[email] No SMTP configured — logging email instead`);
    console.log(`[email]   To:      ${opts.to}`);
    console.log(`[email]   Subject: ${opts.subject}`);
    console.log(`[email]   Body:    ${opts.text}`);
    return;
  }

  await transporter.sendMail({ from, ...opts });
}

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  await sendEmail({
    to,
    subject: `Your JobFlow AI verification code: ${code}`,
    text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes. If you didn't create an account, you can ignore this email.`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #0B0F14; color: #F9FAFB; padding: 32px; border-radius: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 32px;">
          <div style="background: #4F8CFF; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 20px;">✦</span>
          </div>
          <span style="font-size: 20px; font-weight: 600; color: white;">JobFlow AI</span>
        </div>
        <h2 style="color: white; margin: 0 0 8px;">Verify your email address</h2>
        <p style="color: #9CA3AF; margin: 0 0 24px;">Enter the code below to confirm your account:</p>
        <div style="background: #111827; border: 1px solid #1F2937; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #4F8CFF;">${code}</span>
        </div>
        <p style="color: #6B7280; font-size: 13px; margin: 0;">
          This code expires in <strong style="color: #9CA3AF;">15 minutes</strong>.
          If you didn't create a JobFlow AI account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
