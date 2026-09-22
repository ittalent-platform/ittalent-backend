const localDevelopmentOrigin = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

export function getAllowedOrigins(value = process.env.CORS_ORIGIN ?? ''): string[] {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  return !origin || localDevelopmentOrigin.test(origin) || allowedOrigins.includes(origin);
}

export function getTrustedOrigins(value = process.env.CORS_ORIGIN ?? ''): string[] {
  return [...getAllowedOrigins(value), 'http://localhost:*', 'http://127.0.0.1:*'];
}
