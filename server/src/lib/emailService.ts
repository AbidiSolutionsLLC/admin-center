// server/src/lib/emailService.ts
/**
 * Email service wrapper for sending transactional emails
 * Uses Azure Communication Services (ACS) / Nodemailer depending on configuration
 * Used by: people.controller.ts (invite endpoints)
 */

import nodemailer from 'nodemailer';
import { EmailClient } from '@azure/communication-email';

interface WelcomeEmailParams {
  email: string;
  full_name: string;
  employee_id: string;
  company_name: string;
  invite_link?: string;
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

let transporter: nodemailer.Transporter | null = null;

export const getTransporter = async (): Promise<nodemailer.Transporter> => {
  if (!transporter) {
    transporter = await createTransporter();
  }
  return transporter;
};

// ── Unified Sending Logic ───────────────────────────────────────────────────

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Internal helper to send email using the best available service
 */
const sendEmailInternal = async (params: SendEmailParams): Promise<void> => {
  const { to, subject, html, text } = params;
  
  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn(`[EmailService] Invalid or missing email address: "${to}". Skipping email delivery.`);
    return;
  }
  
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
      await azureClient.beginSend(emailMessage);
      console.log(`✅ Azure email sent successfully to ${to}`);
      return;
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
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sends a raw email message.
 */
export const sendEmail = async (params: SendEmailParams): Promise<void> => {
  await sendEmailInternal(params);
};

/**
 * Sends a welcome email to a newly invited user
 * @param params - Email parameters including recipient info and invite link
 * @returns Promise that resolves when email is sent
 */
export const sendWelcomeEmail = async (params: WelcomeEmailParams): Promise<void> => {
  const { email, full_name, employee_id, company_name, invite_link } = params;

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

  await sendEmailInternal({ to: email, subject: `Welcome to ${company_name} — Complete Your Profile`, html, text });
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

  await sendEmailInternal({ to: email, subject: 'Password Reset Request', html });
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

  await sendEmailInternal({ to: email, subject: `Action Required: New Policy Published - ${policy_title}`, html, text });
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

  await sendEmailInternal({ to: email, subject: 'Your Verification Code', html, text });
};

export const emailService = {
  sendWelcomeEmail,
  sendBulkWelcomeEmails,
  sendPasswordResetEmail,
  sendPolicyNotificationEmail,
  sendMfaOtpEmail,
};
