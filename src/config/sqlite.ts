import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { env } from './env.js';

const OBJECT_ID_BYTE_LENGTH = 12;

let sqliteInstance: Database.Database | null = null;
let dbInstance: BetterSQLite3Database | null = null;

export function initSqliteDatabase(): BetterSQLite3Database {
  const db = getSqliteDb();
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(currentDir, '../../drizzle');
  migrate(db, { migrationsFolder });
  return db;
}

export function getSqliteDb(): BetterSQLite3Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = env.SQLITE_DB_PATH;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('foreign_keys = ON');

  dbInstance = drizzle(sqliteInstance);
  return dbInstance;
}

export function closeSqliteDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

/**
 * Generates a 24-character hexadecimal identifier compatible with MongoDB ObjectId format.
 */
export function generateId(): string {
  return randomBytes(OBJECT_ID_BYTE_LENGTH).toString('hex');
}

/**
 * Checks if a string matches the 24-character hexadecimal format.
 */
export function isValidId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}
