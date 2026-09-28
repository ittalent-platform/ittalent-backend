import type { Types } from 'mongoose';

import { ApplicantProfile, type ApplicantProfileDoc } from '../../models/applicant-profile.model.js';

export class ApplicantProfilesRepository {
  async findByUserId(userId: Types.ObjectId | string): Promise<ApplicantProfileDoc | null> {
    return ApplicantProfile.findOne({ user_id: userId }).lean<ApplicantProfileDoc>().exec();
  }
}

export const applicantProfilesRepository = new ApplicantProfilesRepository();