export const AUTH_MESSAGES = {
  USER_ALREADY_EXISTS: 'User with this email already exists',
  USERNAME_ALREADY_EXISTS: 'Username already taken',
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCOUNT_INACTIVE: 'Account is inactive or suspended',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',
  USER_NOT_FOUND: 'User not found',
} as const;

export const AUTH_CONFIG = {
  BCRYPT_SALT_ROUNDS: 10,
  PASSWORD_MIN_LENGTH: 8,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
} as const;

export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
