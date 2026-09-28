import type { ApplicantProfileDoc } from '../../models/applicant-profile.model.js';
import {
  applicantProfilesRepository,
  type ApplicantProfilesRepository,
} from './applicant-profiles.repository.js';

// Read-only for now: other modules use this to resolve the Applicant Profile of a signed-in user.
export class ApplicantProfilesService {
  constructor(private readonly repository: ApplicantProfilesRepository = applicantProfilesRepository) {}

  async findByUserId(userId: string): Promise<ApplicantProfileDoc | null> {
    return this.repository.findByUserId(userId);
  }
}

export const applicantProfilesService = new ApplicantProfilesService();