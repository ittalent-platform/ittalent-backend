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
  const roleLabel = accountRole === 'enterprise_admin' ? 'Enterprise Administrator account' : accountRole === 'recruiter' ? 'HR account' : 'Candidate account';
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

export async function sendEnterpriseRegistrationMagicLink(
  to: string,
  representativeName: string,
  url: string,
): Promise<void> {
  const safeUrl = escapeHtml(url);
  const safeName = escapeHtml(representativeName);
  await sendEmail({
    to,
    subject: 'Complete your ITTalent enterprise registration',
    html: `
      <p>Hello ${safeName},</p>
      <p>Thank you for initiating registration for your organization on ITTalent.</p>
      <p>Please click the link below to verify your corporate email and continue your company registration:</p>
      <p><a href="${safeUrl}">Verify corporate email and continue registration</a></p>
      <p>This verification link is valid for 24 hours.</p>
      <p>If you did not request this registration, please disregard this email.</p>
    `,
  });
}

export async function sendEnterpriseRejectionEmail(
  to: string,
  companyName: string,
  reason: string,
): Promise<void> {
  const safeCompany = escapeHtml(companyName);
  const safeReason = escapeHtml(reason);
  await sendEmail({
    to,
    subject: `Update on your ITTalent enterprise registration for ${safeCompany}`,
    html: `
      <p>Hello,</p>
      <p>Thank you for submitting a registration application for <strong>${safeCompany}</strong> on ITTalent.</p>
      <p>After careful review of your documents and company information, we regret to inform you that we cannot approve your registration at this time for the following reason:</p>
      <blockquote><p>${safeReason}</p></blockquote>
      <p>If you believe this was an error or wish to submit updated documentation, you are welcome to initiate a new registration.</p>
      <p>Sincerely,<br/>The ITTalent Verification Team</p>
    `,
  });
}

export async function sendEnterpriseAdminInvitationEmail(
  to: string,
  representativeName: string,
  companyName: string,
  invitationUrl: string,
): Promise<void> {
  const safeName = escapeHtml(representativeName);
  const safeCompany = escapeHtml(companyName);
  const safeUrl = escapeHtml(invitationUrl);
  await sendEmail({
    to,
    subject: `Welcome to ITTalent: Activate your enterprise account for ${safeCompany}`,
    html: `
      <p>Hello ${safeName},</p>
      <p>Congratulations! Your enterprise registration for <strong>${safeCompany}</strong> has been approved by the ITTalent verification team.</p>
      <p>Please click the link below to accept the invitation and configure your enterprise administrator account:</p>
      <p><a href="${safeUrl}">Accept invitation and activate administrator account</a></p>
      <p>This single-use invitation link expires in 7 days.</p>
      <p>Welcome aboard,<br/>The ITTalent Team</p>
    `,
  });
}

export type InterviewEmailKind = 'scheduled' | 'updated' | 'cancelled';

export interface InterviewEmailInput {
  kind: InterviewEmailKind;
  to: string;
  recipientName?: string | undefined;
  jobTitle: string;
  companyName: string;
  scheduledAt: Date;
  durationMinutes: number;
  mode: 'online' | 'onsite';
  meetingLink?: string | undefined;
  location?: string | undefined;
  notes?: string | undefined;
}

// Interview times are shown in Vietnam time, the same zone the job deadlines use.
const INTERVIEW_EMAIL_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const INTERVIEW_EMAIL_LOCALE = 'en-GB';

const INTERVIEW_EMAIL_SUBJECTS: Record<InterviewEmailKind, string> = {
  scheduled: 'Interview scheduled',
  updated: 'Interview updated',
  cancelled: 'Interview cancelled',
};

const INTERVIEW_EMAIL_INTROS: Record<InterviewEmailKind, string> = {
  scheduled: 'An interview has been scheduled.',
  updated: 'The details of your interview have changed. Please use the new details below.',
  cancelled: 'The interview below has been cancelled.',
};

const INTERVIEW_TIME_FORMAT = new Intl.DateTimeFormat(INTERVIEW_EMAIL_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: INTERVIEW_EMAIL_TIME_ZONE,
  timeZoneName: 'short',
});

export function buildInterviewEmailHtml(input: InterviewEmailInput): string {
  const greeting = input.recipientName ? `Hello ${escapeHtml(input.recipientName)},` : 'Hello,';
  const where =
    input.mode === 'online'
      ? input.meetingLink
        ? `<p>Meeting link: <a href="${escapeHtml(input.meetingLink)}">${escapeHtml(input.meetingLink)}</a></p>`
        : ''
      : input.location
        ? `<p>Location: ${escapeHtml(input.location)}</p>`
        : '';
  const notes = input.notes ? `<p>Notes: ${escapeHtml(input.notes)}</p>` : '';
  return `
      <p>${greeting}</p>
      <p>${INTERVIEW_EMAIL_INTROS[input.kind]}</p>
      <p>Position: <strong>${escapeHtml(input.jobTitle)}</strong> at ${escapeHtml(input.companyName)}</p>
      <p>Time: ${escapeHtml(INTERVIEW_TIME_FORMAT.format(input.scheduledAt))} (${input.durationMinutes} minutes)</p>
      <p>Format: ${input.mode === 'online' ? 'Online' : 'Onsite'}</p>
      ${where}
      ${notes}
    `;
}

// One mail per participant so each one is addressed by name. Callers decide what a delivery failure means.
export async function sendInterviewEmail(input: InterviewEmailInput): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: `${INTERVIEW_EMAIL_SUBJECTS[input.kind]}: ${input.jobTitle} at ${input.companyName}`,
    html: buildInterviewEmailHtml(input),
  });
}
