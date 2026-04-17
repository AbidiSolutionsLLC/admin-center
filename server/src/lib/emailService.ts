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
const createTransporter = () => {
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

  // Development fallback: log emails to console
  console.warn('⚠️  No Azure or SMTP service configured. Using ethereal.email test account.');
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: 'ethereal.user@ethereal.email',
      pass: 'ethereal_password',
    },
  });
};

let transporter: nodemailer.Transporter | null = null;

export const getTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    transporter = createTransporter();
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

  await getTransporter().sendMail(mailOptions);
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #E8870A; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f7f8fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #E8870A; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
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
              <strong>Your Employee ID:</strong> ${employee_id}<br>
              <strong>Email:</strong> ${email}
            </div>

            ${invite_link ? `
              <p>Click the button below to complete your profile and set up your account:</p>
              <a href="${invite_link}" class="button">Complete Your Profile</a>
              <p style="font-size: 12px; color: #666;">Or copy and paste this link: ${invite_link}</p>
            ` : `
              <p>Your account is being set up. You'll receive another email with instructions to access the platform soon.</p>
            `}

            <p>If you have any questions, please contact your HR administrator.</p>
            <p>Best regards,<br>${company_name} Team</p>
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .content { background-color: #f7f8fa; padding: 30px; border-radius: 8px; }
          .button { display: inline-block; background-color: #E8870A; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <p>Hi ${full_name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${reset_link}" class="button">Reset Password</a>
            <p style="font-size: 12px; color: #666;">This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmailInternal({ to: email, subject: 'Password Reset Request', html });
};

export const emailService = {
  sendWelcomeEmail,
  sendBulkWelcomeEmails,
  sendPasswordResetEmail,
};
