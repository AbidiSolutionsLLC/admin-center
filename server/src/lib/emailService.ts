// server/src/lib/emailService.ts
/**
 * Email service wrapper for sending transactional emails
 * Uses Azure Communication Services (ACS) / Nodemailer depending on configuration
 * Used by: people.controller.ts (invite endpoints)
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { EmailClient } from '@azure/communication-email';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { onCommit } from './platformEvents';
import { escapeHtml } from '../identity/html';
import { EmailDelivery, EmailRelatedType } from '../models/EmailDelivery.model';
import { encrypt } from './cryptoService';

interface WelcomeEmailParams {
  email: string;
  full_name: string;
  employee_id: string;
  company_name: string;
  invite_link?: string;
  meta?: Pick<EmailMeta, 'company_id' | 'related' | 'session'>;
}

interface BulkEmailResult {
  email: string;
  success: boolean;
  error?: string;
}

// ── Azure Communication Services Setup ───────────────────────────────────────

const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
let azureClient: EmailClient | null = null;

if (connectionString) {
  try {
    azureClient = new EmailClient(connectionString);
    console.log('✅ Azure Email Client initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Azure Email Client:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// ── Nodemailer Setup (Fallback) ──────────────────────────────────────────────

/**
 * Nodemailer transporter configuration
 * Used as a fallback when Azure is not configured
 */
const createTransporter = async () => {
  // Test harnesses (e2e-platform, cutover smokes): MOCK_EMAIL=true keeps every e-mail in-process (nodemailer's JSON
  // transport) instead of reaching the ethereal.email fallback over the internet. Ignored in production, so a stray
  // flag can never silently drop real mail.
  if (process.env.MOCK_EMAIL === 'true' && process.env.NODE_ENV !== 'production') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  // If SMTP configuration from env exists
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Development fallback: use auto-generated ethereal.email test account
  console.warn('⚠️  No Azure or SMTP service configured. Using ethereal.email test account.');
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

let transporter: Transporter | null = null;

export const getTransporter = async (): Promise<Transporter> => {
  if (!transporter) {
    transporter = await createTransporter();
  }
  return transporter;
};

// ── Unified Sending Logic ───────────────────────────────────────────────────

/** Delivery-log context (Plan 0.6). All optional; stored on the EmailDelivery row. */
export interface EmailMeta {
  company_id?: Types.ObjectId | string;
  template?: string;
  related?: { type: EmailRelatedType; id: string };
  /** Send in the request instead of queueing (codes that expire in minutes, DRD §5.3). The row is still logged. */
  direct?: boolean;
  /**
   * The caller's transaction (Plan 2.5). The outbox row is written inside it, so a rolled-back change leaves no e-mail.
   * Delivery never happens inside the transaction: the sender loop picks the row up after commit, and inline/direct
   * mode delivers in an after-commit hook.
   */
  session?: ClientSession | null;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  meta?: EmailMeta;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends one message through the best available service: Azure Communication Services first, Nodemailer second.
 * Throws when both fail. Used by `sendEmailInternal` (inline mode) and by lib/emailSender.ts (queued rows).
 */
export const deliverNow = async (params: Pick<SendEmailParams, 'to' | 'subject' | 'html' | 'text'>): Promise<{ provider_message_id?: string }> => {
  const { to, subject, html, text } = params;

  const senderAddress = process.env.SENDER_EMAIL_ADDRESS;

  // 1. Try Azure Communication Services
  if (azureClient && senderAddress) {
    try {
      const emailMessage = {
        senderAddress: senderAddress,
        content: {
          subject: subject,
          html: html,
          plainText: text,
        },
        recipients: {
          to: [{ address: to }],
        },
      };

      console.log(`📨 Queuing Azure email for ${to}...`);
      const poller = await azureClient.beginSend(emailMessage);
      console.log(`✅ Azure email sent successfully to ${to}`);
      return { provider_message_id: (poller as { operationState?: { id?: string } }).operationState?.id };
    } catch (error) {
      console.error('❌ Azure email send failed, falling back to Nodemailer:', error instanceof Error ? error.message : 'Unknown error');
      // Fall through to Nodemailer
    }
  }

  // 2. Fallback to Nodemailer
  const mailOptions = {
    from: process.env.EMAIL_FROM ?? process.env.SMTP_FROM_EMAIL ?? senderAddress ?? 'noreply@admin-center.com',
    to,
    subject,
    html,
    text,
  };

  const tp = await getTransporter();
  const info = await tp.sendMail(mailOptions);
  
  if (!process.env.SMTP_HOST) {
    console.log('📧 Ethereal Email preview URL: %s', nodemailer.getTestMessageUrl(info));
  }
  return { provider_message_id: typeof info?.messageId === 'string' ? info.messageId : undefined };
};

const dbConnected = (): boolean => mongoose.connection.readyState === 1;

/** Inline mode: tests and the mock-mail switch send in the request (the row is still written). */
const inlineMode = (): boolean =>
  process.env.NODE_ENV === 'test' || (process.env.MOCK_EMAIL === 'true' && process.env.NODE_ENV !== 'production');

const errorText = (err: unknown): string => {
  const e = err as { code?: unknown; name?: string; message?: string };
  return `${typeof e?.code === 'string' ? e.code : e?.name || 'Error'}: ${String(e?.message ?? err).slice(0, 200)}`;
};

/**
 * Accepts a message for delivery: validates the address, writes an EmailDelivery row (bodies encrypted) and returns its
 * id. The sender loop (lib/emailSender.ts) delivers it. In inline mode, or with `meta.direct`, it delivers in the call
 * and rethrows a delivery failure (as before the outbox). Without a database connection it just delivers.
 */
const sendEmailInternal = async (params: SendEmailParams): Promise<string | undefined> => {
  const { to, subject, html, text, meta } = params;
  const base = {
    company_id: meta?.company_id,
    to: typeof to === 'string' ? to : String(to),
    template: meta?.template || 'custom',
    subject,
    related: meta?.related,
  };

  const session = meta?.session ?? undefined;

  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to)) {
    console.warn(`[EmailService] Invalid or missing email address: "${to}". Skipping email delivery.`);
    if (dbConnected()) {
      const [row] = await EmailDelivery.create([{ ...base, to: String(to ?? ''), status: 'failed', last_error: 'INVALID_ADDRESS: invalid or missing recipient' }], { session });
      return String(row._id);
    }
    return undefined;
  }

  if (!dbConnected()) {
    await deliverNow({ to, subject, html, text });
    return undefined;
  }

  const direct = inlineMode() || meta?.direct === true;
  const [row] = await EmailDelivery.create([{
    ...base,
    status: direct ? 'sending' : 'queued',
    attempts: direct ? 1 : 0,
    html_enc: encrypt(html),
    ...(text ? { text_enc: encrypt(text) } : {}),
  }], { session });
  if (!direct) return String(row._id);

  const deliverRow = async () => {
    try {
      const result = await deliverNow({ to, subject, html, text });
      await EmailDelivery.updateOne({ _id: row._id }, { $set: { status: 'sent', sent_at: new Date(), provider_message_id: result.provider_message_id }, $unset: { html_enc: 1, text_enc: 1 } });
    } catch (err) {
      await EmailDelivery.updateOne({ _id: row._id }, { $set: { status: 'failed', last_error: errorText(err) }, $unset: { html_enc: 1, text_enc: 1 } });
      throw err;
    }
  };

  if (session) {
    // Inside a transaction: deliver only if it commits. A failure is recorded on the row (and logged by onCommit).
    onCommit(session, deliverRow);
    return String(row._id);
  }
  await deliverRow();
  return String(row._id);
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sends a raw email message.
 */
export const sendEmail = async (params: SendEmailParams): Promise<string | undefined> => sendEmailInternal(params);

/**
 * Sends a welcome email to a newly invited user
 * @param params - Email parameters including recipient info and invite link
 * @returns Promise that resolves when email is sent
 */
export const sendWelcomeEmail = async (params: WelcomeEmailParams): Promise<string | undefined> => {
  const { email, full_name, employee_id, company_name, invite_link, meta } = params;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #f8fafc; background-color: #0b0f19; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .header { background-color: #161c30; padding: 30px 20px; text-align: center; border-radius: 16px 16px 0 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
          .header h1 { margin: 0; color: #f8fafc; font-size: 24px; font-weight: 600; }
          .content { background-color: #161c30; padding: 40px; border-radius: 0 0 16px 16px; border: 1px solid rgba(255,255,255,0.05); border-top: none; }
          .button { display: inline-block; background-color: #f5b02a; color: #000000; padding: 14px 32px; text-decoration: none; border-radius: 12px; margin: 24px 0; font-weight: 600; text-align: center; }
          .info-box { background-color: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid rgba(255,255,255,0.08); }
          .footer { text-align: center; color: #94a3b8; font-size: 13px; margin-top: 30px; }
          p { color: #cbd5e1; margin-bottom: 16px; }
          strong { color: #f8fafc; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${company_name}!</h1>
          </div>
          <div class="content">
            <p>Hi ${full_name},</p>
            <p>You've been invited to join <strong>${company_name}</strong> on Admin Center. We're excited to have you on board!</p>
            
            <div class="info-box">
              <p style="margin-bottom: 8px;"><strong>Your Employee ID:</strong> ${employee_id}</p>
              <p style="margin-bottom: 0;"><strong>Email:</strong> ${email}</p>
            </div>

            ${invite_link ? `
              <p>Click the button below to complete your profile and set up your account:</p>
              <div style="text-align: center;">
                <a href="${invite_link}" class="button">Complete Your Profile</a>
              </div>
              <p style="font-size: 13px; color: #94a3b8; text-align: center;">Or copy and paste this link: <br><span style="color: #f5b02a;">${invite_link}</span></p>
            ` : `
              <p>Your account is being set up. You'll receive another email with instructions to access the platform soon.</p>
            `}

            <p style="margin-top: 32px;">If you have any questions, please contact your HR administrator.</p>
            <p>Best regards,<br><strong>${company_name} Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message from Admin Center. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Welcome to ${company_name}!

Hi ${full_name},

You've been invited to join ${company_name} on Admin Center. We're excited to have you on board!

Your Employee ID: ${employee_id}
Email: ${email}

${invite_link ? `Complete your profile here: ${invite_link}` : 'Your account is being set up. You\'ll receive another email with instructions soon.'}

If you have any questions, please contact your HR administrator.

Best regards,
${company_name} Team

---
This is an automated message from Admin Center. Please do not reply to this email.
  `.trim();

  return sendEmailInternal({ to: email, subject: `Welcome to ${company_name} — Complete Your Profile`, html, text, meta: { ...meta, template: 'welcome' } });
};

/**
 * Sends a "Claim your account" email to a migrated/seeded active user (03 §4.3).
 */
export const sendClaimEmail = async (params: {
  email: string;
  full_name: string;
  company_name: string;
  claim_link: string;
}): Promise<void> => {
  const { email, full_name, company_name, claim_link } = params;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #f8fafc; background-color: #0b0f19; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .header { background-color: #161c30; padding: 30px 20px; text-align: center; border-radius: 16px 16px 0 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
          .header h1 { margin: 0; color: #f8fafc; font-size: 24px; font-weight: 600; }
          .content { background-color: #161c30; padding: 40px; border-radius: 0 0 16px 16px; border: 1px solid rgba(255,255,255,0.05); border-top: none; }
          .button { display: inline-block; background-color: #f5b02a; color: #000000; padding: 14px 32px; text-decoration: none; border-radius: 12px; margin: 24px 0; font-weight: 600; text-align: center; }
          p { color: #cbd5e1; margin-bottom: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Claim Your Karbexa Account</h1>
          </div>
          <div class="content">
            <p>Hi ${full_name},</p>
            <p>Your Karbexa account for <strong>${company_name}</strong> is ready. Please click the button below to claim your account, set your password, and set up Multi-Factor Authentication.</p>
            <div style="text-align: center;">
              <a href="${claim_link}" class="button">Claim Account</a>
            </div>
            <p style="font-size: 13px; color: #94a3b8; text-align: center;">Or copy and paste this link: <br><span style="color: #f5b02a;">${claim_link}</span></p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `Hi ${full_name},\n\nYour Karbexa account for ${company_name} is ready. Please claim your account here: ${claim_link}\n`;

  await sendEmailInternal({
    to: email,
    subject: `Claim your Karbexa account for ${company_name}`,
    html,
    text,
    meta: { template: 'claim', direct: true }, // scripts/send-claim-emails.ts exits right after sending: no sender loop runs there
  });
};

/**
 * Sends welcome emails to multiple users in bulk
 * @param users - Array of email parameters for each user
 * @returns Array of results indicating success/failure for each email
 */
export const sendBulkWelcomeEmails = async (users: WelcomeEmailParams[]): Promise<BulkEmailResult[]> => {
  const results: BulkEmailResult[] = [];

  for (const user of users) {
    try {
      await sendWelcomeEmail(user);
      results.push({ email: user.email, success: true });
    } catch (error) {
      results.push({
        email: user.email,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
};

/**
 * Sends a password reset email
 * @param email - Recipient email address
 * @param full_name - Recipient's full name
 * @param reset_link - Password reset link
 */
export const sendPasswordResetEmail = async (
  email: string,
  full_name: string,
  reset_link: string
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #f8fafc; background-color: #0b0f19; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .content { background-color: #161c30; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }
          .button { display: inline-block; background-color: #f5b02a; color: #000000; padding: 14px 32px; text-decoration: none; border-radius: 12px; margin: 24px 0; font-weight: 600; }
          p { color: #cbd5e1; margin-bottom: 16px; }
          strong { color: #f8fafc; font-weight: 600; }
          .footer { text-align: center; color: #94a3b8; font-size: 13px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #f8fafc; margin-top: 0; margin-bottom: 24px;">Password Reset Request</h2>
            <p>Hi ${full_name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center;">
              <a href="${reset_link}" class="button">Reset Password</a>
            </div>
            <p style="font-size: 13px; color: #94a3b8; text-align: center;">This link will expire in 1 hour.</p>
            <p style="margin-top: 32px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Admin Center.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmailInternal({ to: email, subject: 'Password Reset Request', html, meta: { template: 'password_reset' } });
};

export interface PolicyEmailParams {
  email: string;
  full_name: string;
  policy_title: string;
  company_name: string;
  policy_link: string;
}

export const sendPolicyNotificationEmail = async (params: PolicyEmailParams): Promise<void> => {
  const { email, full_name, policy_title, company_name, policy_link } = params;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #f8fafc; background-color: #0b0f19; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .content { background-color: #161c30; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }
          .button { display: inline-block; background-color: #f5b02a; color: #000000; padding: 14px 32px; text-decoration: none; border-radius: 12px; margin: 24px 0; font-weight: 600; }
          p { color: #cbd5e1; margin-bottom: 16px; }
          strong { color: #f8fafc; font-weight: 600; }
          .footer { text-align: center; color: #94a3b8; font-size: 13px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #f8fafc; margin-top: 0; margin-bottom: 24px;">Action Required</h2>
            <p>Hi ${full_name},</p>
            <p>A new policy "<strong>${policy_title}</strong>" has been published at ${company_name}.</p>
            <p>Please review and acknowledge the policy by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${policy_link}" class="button">View Policy</a>
            </div>
            <p style="margin-top: 32px;">Best regards,<br><strong>${company_name} Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message from Admin Center.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Hi ${full_name},

A new policy "${policy_title}" has been published at ${company_name}.
Please review and acknowledge it here: ${policy_link}

Best regards,
${company_name} Team
  `.trim();

  await sendEmailInternal({ to: email, subject: `Action Required: New Policy Published - ${policy_title}`, html, text, meta: { template: 'policy' } });
};

export interface MfaOtpEmailParams {
  email: string;
  full_name: string;
  otp_code: string;
  company_name: string;
}

export const sendMfaOtpEmail = async (params: MfaOtpEmailParams): Promise<void> => {
  const { email, full_name, otp_code, company_name } = params;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: 'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #f8fafc; background-color: #0b0f19; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .content { background-color: #161c30; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); text-align: center; }
          .code { display: inline-block; background-color: rgba(245,176,42,0.1); border: 1px solid rgba(245,176,42,0.3); padding: 16px 32px; font-size: 32px; font-weight: 700; letter-spacing: 8px; border-radius: 12px; margin: 24px 0; color: #f5b02a; }
          p { color: #cbd5e1; margin-bottom: 16px; }
          strong { color: #f8fafc; font-weight: 600; }
          .footer { text-align: center; color: #94a3b8; font-size: 13px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <h2 style="color: #f8fafc; margin-top: 0; margin-bottom: 24px;">Login Verification</h2>
            <p style="text-align: left;">Hi ${full_name},</p>
            <p style="text-align: left;">Here is your one-time verification code to log in to <strong>${company_name}</strong>:</p>
            <div class="code">${otp_code}</div>
            <p style="font-size: 13px; color: #94a3b8;">This code will expire in 10 minutes.</p>
            <p style="text-align: left; margin-top: 32px;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Admin Center.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Hi ${full_name},

Here is your one-time verification code to log in to ${company_name}:
${otp_code}

This code will expire in 10 minutes.
If you didn't request this code, please ignore this email.
  `.trim();

  await sendEmailInternal({ to: email, subject: 'Your Verification Code', html, text, meta: { template: 'mfa_otp', direct: true } });
};

export const sendMfaResetEmail = async (params: {
  email: string;
  full_name: string;
  company_name: string;
}): Promise<void> => {
  const { email, full_name, company_name } = params;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b5bdb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e1e4e8; border-top: none; border-radius: 0 0 8px 8px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Two-Factor Authentication Reset</h2>
          </div>
          <div class="content">
            <p>Hi ${escapeHtml(full_name)},</p>
            <p>An administrator has reset your Multi-Factor Authentication (MFA) settings for <strong>${escapeHtml(company_name)}</strong>.</p>
            <p>At your next sign-in, you will be required to set up your authenticator app again before you can access the platform.</p>
            <div class="warning">
              <strong>Notice:</strong> If you did not request this reset or speak with your administrator, please contact your security team immediately.
            </div>
          </div>
        </div>
      </body>
    </html>
  `.trim();

  const text = `
Hi ${full_name},

An administrator has reset your Multi-Factor Authentication (MFA) settings for ${company_name}.

At your next sign-in, you will be required to set up your authenticator app again before you can access the platform.

If you did not request this reset or speak with your administrator, please contact your security team immediately.
  `.trim();

  await sendEmailInternal({
    to: email,
    subject: `Two-Factor Authentication Reset — ${company_name}`,
    html,
    text,
    meta: { template: 'mfa_reset' },
  });
};

export const emailService = {
  sendWelcomeEmail,
  sendBulkWelcomeEmails,
  sendPasswordResetEmail,
  sendPolicyNotificationEmail,
  sendMfaOtpEmail,
  sendMfaResetEmail,
};
