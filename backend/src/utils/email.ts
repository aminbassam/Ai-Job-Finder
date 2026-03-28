import nodemailer from "nodemailer";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function logEmailToConsole(opts: MailOptions, reason: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[email] ${reason} — printing to console instead`);
  console.log(`[email]   To:      ${opts.to}`);
  console.log(`[email]   Subject: ${opts.subject}`);
  console.log(`[email]   Body:    ${opts.text}`);
  console.log(`${"─".repeat(60)}\n`);
}

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? "587", 10),
    secure: parseInt(SMTP_PORT ?? "587", 10) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
  });
}

export async function sendEmail(opts: MailOptions): Promise<void> {
  const from = process.env.SMTP_FROM ?? "JobFlow AI <noreply@jobflow.ai>";
  const transporter = createTransporter();

  if (!transporter) {
    logEmailToConsole(opts, "No SMTP_HOST configured");
    return;
  }

  try {
    await transporter.sendMail({ from, ...opts });
    console.log(`[email] Sent to ${opts.to} — "${opts.subject}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] SMTP send failed: ${message}`);
    logEmailToConsole(opts, "SMTP failed — fallback");
  }
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

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:5678";
  const resetLink = `${appUrl}/auth/reset-password?token=${resetToken}`;

  await sendEmail({
    to,
    subject: "Reset your JobFlow AI password",
    text: `Click the link below to reset your password:\n\n${resetLink}\n\nThis link expires in 1 hour. If you didn't request a reset, ignore this email.`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #0B0F14; color: #F9FAFB; padding: 32px; border-radius: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 32px;">
          <div style="background: #4F8CFF; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 20px;">✦</span>
          </div>
          <span style="font-size: 20px; font-weight: 600; color: white;">JobFlow AI</span>
        </div>
        <h2 style="color: white; margin: 0 0 8px;">Reset your password</h2>
        <p style="color: #9CA3AF; margin: 0 0 24px;">Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetLink}" style="display: inline-block; background: #4F8CFF; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
          Reset Password
        </a>
        <p style="color: #6B7280; font-size: 13px; margin: 0;">
          If the button doesn't work, copy this link:<br/>
          <a href="${resetLink}" style="color: #4F8CFF; word-break: break-all;">${resetLink}</a>
        </p>
        <p style="color: #6B7280; font-size: 13px; margin-top: 16px;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
