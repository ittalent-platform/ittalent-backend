import mongoose from 'mongoose';

import { env } from './env.js';
import { closeSqliteDb, initSqliteDatabase } from './sqlite.js';
import '../models/index.js';

export async function connectDatabase(): Promise<void> {
  initSqliteDatabase();
  console.info('Connected to SQLite database successfully');

  if (process.env.USE_MONGODB === 'true') {
    await mongoose.connect(env.MONGODB_URI);
    console.info('Connected to MongoDB database');
  }
}

export async function disconnectDatabase(): Promise<void> {
  closeSqliteDb();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
