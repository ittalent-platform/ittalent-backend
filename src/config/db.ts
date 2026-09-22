import mongoose from 'mongoose';

import { env } from './env.js';
import '../models/index.js';

export async function connectDatabase(): Promise<typeof mongoose> {
  await mongoose.connect(env.MONGODB_URI);
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
