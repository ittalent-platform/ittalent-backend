import { env } from '../../config/env.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

const deliveryStatus = new Map<string, boolean>();

export function consumeEmailDeliveryStatus(email: string): boolean | undefined {
  const key = email.toLowerCase();
  const status = deliveryStatus.get(key);
  deliveryStatus.delete(key);
  return status;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case "'":
        return '&#39;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const normalizedTo = to.toLowerCase();

  if (!env.BREVO_API_KEY) {
    console.info('[email:dev]', { to: normalizedTo, subject });
    deliveryStatus.set(normalizedTo, true);
    return true;
}

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: env.BREVO_SENDER_EMAIL,
          name: env.BREVO_SENDER_NAME,
        },
        to: [{ email: normalizedTo }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;
      console.error('[email:brevo:error]', { status: response.status, error: errorBody });
      deliveryStatus.set(normalizedTo, false);
      return false;
    }

    deliveryStatus.set(normalizedTo, true);
    return true;
  } catch (error) {
    console.error('[email:brevo:exception]', error);
    deliveryStatus.set(normalizedTo, false);
    return false;
  }
}

export async function sendVerificationEmail(to: string, url: string): Promise<void> {
  const safeUrl = escapeHtml(url);
  await sendEmail({
    to,
    subject: 'Verify your ITTalent email',
    html: `
      <p>Hello,</p>
      <p>Please click the link below to verify your ITTalent email address.</p>
      <p><a href="${safeUrl}">Verify email</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function sendUserInvitationEmail(to: string, url: string, accountRole: string): Promise<boolean> {
  const safeUrl = escapeHtml(url);
  const roleLabel = accountRole === 'recruiter' ? 'HR account' : 'user account';
  return sendEmail({
    to,
    subject: 'Your ITTalent account invitation',
    html: `<p>Hello,</p><p>You have been invited to create or activate an ITTalent ${escapeHtml(roleLabel)}.</p><p><a href="${safeUrl}">Accept invitation</a></p><p>This link expires in 24 hours and can only be used once.</p>`,
  });
  }

export async function sendUserEmailChangeEmail(to: string, url: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'Confirm your ITTalent account email change',
    html: `<p>Hello,</p><p>A System Administrator requested this email address for an ITTalent account. Sign in to the existing account and confirm the request with your current password.</p><p><a href="${escapeHtml(url)}">Review email change</a></p><p>This request expires in 24 hours. If you did not expect it, ignore this message.</p>`,
  });
}

export async function sendResetPasswordEmail(to: string, url: string): Promise<void> {
  const safeUrl = escapeHtml(url);
  await sendEmail({
    to,
    subject: 'Reset your ITTalent password',
    html: `
      <p>Hello,</p>
      <p>Please click the link below to reset your ITTalent password.</p>
      <p><a href="${safeUrl}">Reset password</a></p>
      <p>This link expires in 1 hour.</p>
    `,
  });
}

export async function sendApplicationConfirmationEmail(
  to: string,
  jobTitle: string,
  status: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your ITTalent application has been submitted',
    html: `
      <p>Hello,</p>
      <p>Your application for <strong>${escapeHtml(jobTitle)}</strong> has been received.</p>
      <p>Current status: ${escapeHtml(status)}</p>
    `,
  });
}
