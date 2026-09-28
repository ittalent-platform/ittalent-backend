import type { Types } from "mongoose";
import { Schema, model } from "mongoose";

// Minimal placeholder: only what "Apply a job" needs (a profile must exist for the user).
// The profile-management feature can extend this schema with more fields.
export interface ApplicantProfileData {
  user_id: Types.ObjectId;
  full_name?: string;
}

const applicantProfileSchema = new Schema<ApplicantProfileData>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    full_name: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: "applicant_profiles",
  },
);

export const ApplicantProfile = model(
  "ApplicantProfile",
  applicantProfileSchema,
);
export type ApplicantProfileDoc = ApplicantProfileData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
