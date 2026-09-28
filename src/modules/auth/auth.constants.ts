export const AUTH_MESSAGES = {
  USER_ALREADY_EXISTS: 'User with this email already exists',
  USERNAME_ALREADY_EXISTS: 'Username already taken',
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_INACTIVE: 'Account is inactive or suspended',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
  USER_NOT_FOUND: 'User not found',
  VERIFICATION_EMAIL_SENT: 'If the email is registered and unverified, a verification email has been sent.',
  REGISTRATION_SUCCESS_CHECK_EMAIL: 'Registration successful. Please check your email to verify your account.',
  EMAIL_ALREADY_VERIFIED: 'Email is already verified.',
  INVALID_VERIFICATION_TOKEN: 'Invalid verification link.',
  VERIFICATION_TOKEN_EXPIRED: 'Verification link expired.',
  RESET_PASSWORD_EMAIL_SENT: 'If the email exists, a password reset link has been sent.',
  PASSWORD_RESET_SUCCESS: 'Password reset successful. You can now log in with your new password.',
  INVALID_RESET_TOKEN: 'Invalid password reset link.',
  RESET_TOKEN_UNAVAILABLE: 'Password reset link has expired or has already been used.',
  PASSWORD_CHANGED_SUCCESS: 'Password changed successfully.',
  INVALID_CURRENT_PASSWORD: 'Incorrect current password.',
  ACCOUNT_HAS_NO_PASSWORD: 'This account does not have a local password set.',
} as const;


export const VERIFICATION_STAGES = ['success', 'already-verified', 'expired', 'invalid', 'retry-later'] as const;
export type VerificationStage = (typeof VERIFICATION_STAGES)[number];

export const AUTH_CONFIG = {
  BCRYPT_SALT_ROUNDS: 10,
  PASSWORD_MIN_LENGTH: 8,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  TOKEN_BYTES: 32,
} as const;

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
