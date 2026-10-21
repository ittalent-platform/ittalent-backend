import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const devicePlatforms = ['ios', 'android', 'web'] as const;
export type DevicePlatform = (typeof devicePlatforms)[number];

export interface DeviceTokenData {
  user_id: Types.ObjectId;
  token: string;
  platform: DevicePlatform;
  last_seen_at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const deviceTokenSchema = new Schema<DeviceTokenData>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, trim: true, unique: true },
    platform: { type: String, enum: devicePlatforms, required: true },
    last_seen_at: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'device_tokens',
  },
);

export const DeviceToken = model<DeviceTokenData>('DeviceToken', deviceTokenSchema);
