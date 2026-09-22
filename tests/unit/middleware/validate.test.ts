import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { validateBody, validateParams } from '../../../src/middleware/validate.js';

function runMiddleware(middleware: ReturnType<typeof validateBody>, req: unknown, res: unknown) {
  return new Promise<void>((resolve, reject) => {
    middleware(req as never, res as never, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe('validateRequest', () => {
  it('preserves validated params when a later body validator runs', async () => {
    const req = {
      params: { id: '6a4a5424c8097df77a6ed9be' },
      body: { tags: ['item-1'] },
    };
    const res = { locals: {} as { validated?: unknown } };

    await runMiddleware(validateParams(z.object({ id: z.string().min(1) })), req, res);
    await runMiddleware(validateBody(z.object({ tags: z.array(z.string()) })), req, res);

    expect(res.locals.validated).toEqual({
      params: { id: '6a4a5424c8097df77a6ed9be' },
      body: { tags: ['item-1'] },
    });
  });

  it('throws error when validation fails', async () => {
    const req = { body: { email: 'not-an-email' } };
    const res = { locals: {} as { validated?: unknown } };

    await expect(runMiddleware(validateBody(z.object({ email: z.string().email() })), req, res)).rejects.toThrow();
  });
});
