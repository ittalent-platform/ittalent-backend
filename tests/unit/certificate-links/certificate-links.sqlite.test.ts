import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

it('persists suggested links and returns them in the suggested list', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ittalent-cert-'));
  const previousPath = process.env.SQLITE_DB_PATH;
  const previousMongo = process.env.USE_MONGODB;
  process.env.SQLITE_DB_PATH = join(dir, 'demo.sqlite');
  process.env.USE_MONGODB = 'false';
  vi.resetModules();
  const { closeSqliteDb, generateId, initSqliteDatabase } = await import('../../../src/config/sqlite.js');
  const { CertificateLinksRepository } = await import('../../../src/modules/certificate-links/certificate-links.repository.js');

  try {
    initSqliteDatabase();
    const repository = new CertificateLinksRepository();
    const ownerId = generateId();
    const created = await repository.create({
      ownerId,
      actorId: ownerId,
      idempotencyKey: 'create-cert',
      requestHash: 'create-cert',
      input: { name: 'AWS', url: 'https://example.com/aws' },
    });
    const id = String(created._id);
    const updated = await repository.updateGuarded(ownerId, id, created.version, {
      $set: { suggested: true, version: created.version },
    });

    expect(updated?.suggested).toBe(true);
    expect(updated?.version).toBe(created.version);
    expect((await repository.findOwned(ownerId, id))?.suggested).toBe(true);
    expect(await repository.countSuggested(ownerId)).toBe(1);
    expect((await repository.findPage(ownerId, 1, 20, { suggested: true })).items).toHaveLength(1);
    expect((await repository.findPage(ownerId, 1, 20, { suggested: false })).items).toHaveLength(0);
  } finally {
    closeSqliteDb();
    if (previousPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = previousPath;
    if (previousMongo === undefined) delete process.env.USE_MONGODB;
    else process.env.USE_MONGODB = previousMongo;
    rmSync(dir, { recursive: true, force: true });
  }
}, 20_000);
