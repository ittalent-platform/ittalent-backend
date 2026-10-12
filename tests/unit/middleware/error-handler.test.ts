import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { errorHandler } from '../../../src/middleware/error-handler.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import { createHttpError } from '../../../src/shared/errors/http-error.js';

describe('errorHandler', () => {
  it('handles HttpError with correct status code and message', () => {
    const error = createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Resource not found', 'NOT_FOUND');
    const req = {} as never;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as never;
    const next = vi.fn();

    errorHandler(error, req, res, next);

    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_404_NOT_FOUND);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Resource not found',
      code: 'NOT_FOUND',
    });
  });

  it('handles ZodError with 400 Bad Request', () => {
    const schema = z.object({ name: z.string() });
    const parseResult = schema.safeParse({});
    if (parseResult.success) throw new Error('Expected validation failure');

    const req = {} as never;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as never;
    const next = vi.fn();

    errorHandler(parseResult.error, req, res, next);

    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
      }),
    );
  });

  it('hides internal messages of unhandled errors and returns an error id', () => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) } as never;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(new Error('Local credentials were not found'), {} as never, res, vi.fn());

    expect(json).toHaveBeenCalledWith({ success: false, message: 'Internal server error', errorId: expect.any(String) });
  });
});
