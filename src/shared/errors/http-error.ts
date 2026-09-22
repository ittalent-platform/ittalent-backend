export interface HttpError extends Error {
  statusCode: number;
  code?: string;
}

export function createHttpError(
  statusCode: number,
  message: string,
  code?: string,
): HttpError {
  return Object.assign(new Error(message), {
    statusCode,
    ...(code ? { code } : {}),
  });
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
}
