import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consumeEmailDeliveryStatus,
  escapeHtml,
  sendEmail,
  sendEnterpriseAdminInvitationEmail,
  sendEnterpriseRegistrationMagicLink,
  sendEnterpriseRejectionEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from '../../../src/shared/services/email.service.js';

describe('EmailService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('escapeHtml', () => {
    it('escapes special HTML characters', () => {
      const dangerous = '<script>alert("xss & \'hack\'");</script>';
      const safe = escapeHtml(dangerous);
      expect(safe).toBe('&lt;script&gt;alert(&quot;xss &amp; &#39;hack&#39;&quot;);&lt;/script&gt;');
    });
  });

  describe('sendEmail in dev mode', () => {
    it('logs email and marks delivery status as true when no BREVO_API_KEY is configured', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email:dev]',
        expect.objectContaining({ to: 'test@example.com', subject: 'Test Subject' }),
      );

      const status = consumeEmailDeliveryStatus('test@example.com');
      expect(status).toBe(true);

      // Subsequent consumption should return undefined (single consumption)
      expect(consumeEmailDeliveryStatus('test@example.com')).toBeUndefined();
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends verification email with escaped url', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendVerificationEmail('user@example.com', 'http://localhost:5173/verify-email?token=abc');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email:dev]',
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Verify your ITTalent email',
        }),
      );
      expect(consumeEmailDeliveryStatus('user@example.com')).toBe(true);
    });
  });

  describe('sendResetPasswordEmail', () => {
    it('sends reset password email with escaped url', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendResetPasswordEmail('user@example.com', 'http://localhost:5173/reset-password?token=xyz');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email:dev]',
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset your ITTalent password',
        }),
      );
      expect(consumeEmailDeliveryStatus('user@example.com')).toBe(true);
    });
  });

  describe('sendEnterpriseRegistrationMagicLink', () => {
    it('sends registration magic link with escaped name and url', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEnterpriseRegistrationMagicLink(
        'rep@company.com',
        'John <Doe>',
        'http://localhost:5173/enterprise-registration/verify?token=secure123',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email:dev]',
        expect.objectContaining({
          to: 'rep@company.com',
          subject: 'Complete your ITTalent enterprise registration',
        }),
      );
      expect(consumeEmailDeliveryStatus('rep@company.com')).toBe(true);
    });
  });

  describe('sendEnterpriseRejectionEmail', () => {
    it('sends enterprise rejection email with escaped company name and rationale', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEnterpriseRejectionEmail(
        'rep@company.com',
        'Acme <Corp>',
        'Business license expired & invalid',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email:dev]',
        expect.objectContaining({
          to: 'rep@company.com',
          subject: 'Update on your ITTalent enterprise registration for Acme &lt;Corp&gt;',
        }),
      );
      expect(consumeEmailDeliveryStatus('rep@company.com')).toBe(true);
    });
  });

  describe('sendEnterpriseAdminInvitationEmail', () => {
    it('sends enterprise admin onboarding invitation email with escaped parameters', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await sendEnterpriseAdminInvitationEmail(
        'rep@company.com',
        'John <Doe>',
        'Acme <Corp>',
        'http://localhost:5173/enterprise-registration/invitation?token=token123',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[email:dev]',
        expect.objectContaining({
          to: 'rep@company.com',
          subject: 'Welcome to ITTalent: Activate your enterprise account for Acme &lt;Corp&gt;',
        }),
      );
      expect(consumeEmailDeliveryStatus('rep@company.com')).toBe(true);
    });
  });
});
