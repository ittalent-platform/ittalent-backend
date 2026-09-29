import { describe, expect, it } from 'vitest';

import {
  changePasswordRequestSchema,
  passwordSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
} from '../../../src/modules/auth/auth.schemas.js';

describe('Auth Schemas - Password Complexity', () => {
  describe('passwordSchema', () => {
    it('accepts valid passwords containing uppercase, lowercase, number, and special character within 8-64 chars', () => {
      const validPasswords = [
        'Password123!',
        'Str0ng#Pass',
        'P@ssw0rd',
        'Abcdef1$',
        'Complex^99',
        'My&Pass88',
        'Test*123A',
        'A1!' + 'a'.repeat(61), // Exactly 64 chars
      ];

      for (const password of validPasswords) {
        const result = passwordSchema.safeParse(password);
        expect(result.success, `Expected "${password}" to be valid`).toBe(true);
      }
    });

    it('accepts every allowed special character from the required set (!@#$%^&*)', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*'];

      for (const char of specialChars) {
        const password = `ValidPass1${char}`;
        const result = passwordSchema.safeParse(password);
        expect(result.success, `Expected special char "${char}" to be accepted`).toBe(true);
      }
    });

    it('rejects passwords shorter than 8 characters', () => {
      const result = passwordSchema.safeParse('Pass1!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('at least 8 characters');
      }
    });

    it('rejects passwords longer than 64 characters', () => {
      const tooLong = 'A1!' + 'a'.repeat(62); // 65 chars
      const result = passwordSchema.safeParse(tooLong);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('cannot exceed 64 characters');
      }
    });

    it('rejects passwords missing an uppercase letter', () => {
      const result = passwordSchema.safeParse('password123!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('uppercase letter');
      }
    });

    it('rejects passwords missing a lowercase letter', () => {
      const result = passwordSchema.safeParse('PASSWORD123!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('lowercase letter');
      }
    });

    it('rejects passwords missing a number', () => {
      const result = passwordSchema.safeParse('Password!!!!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('number');
      }
    });

    it('rejects passwords missing a special character from !@#$%^&*', () => {
      const result = passwordSchema.safeParse('Password123');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('special character');
      }
    });

    it('rejects empty password string', () => {
      const result = passwordSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });

  describe('registerRequestSchema', () => {
    it('validates a valid registration payload', () => {
      const result = registerRequestSchema.safeParse({
        email: 'user@example.com',
        username: 'validuser',
        password: 'Password123!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects registration payload with a weak password', () => {
      const result = registerRequestSchema.safeParse({
        email: 'user@example.com',
        username: 'validuser',
        password: 'weakpassword',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('resetPasswordRequestSchema', () => {
    it('validates a valid password reset payload', () => {
      const result = resetPasswordRequestSchema.safeParse({
        token: 'reset-token-123',
        newPassword: 'NewPassword123!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects password reset payload with a weak newPassword', () => {
      const result = resetPasswordRequestSchema.safeParse({
        token: 'reset-token-123',
        newPassword: 'simple',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordRequestSchema', () => {
    it('validates a valid change password payload', () => {
      const result = changePasswordRequestSchema.safeParse({
        currentPassword: 'AnyCurrentPassword',
        newPassword: 'UpdatedPassword123!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects change password payload with a weak newPassword', () => {
      const result = changePasswordRequestSchema.safeParse({
        currentPassword: 'AnyCurrentPassword',
        newPassword: 'NoSpecialChar123',
      });
      expect(result.success).toBe(false);
    });
  });
});
