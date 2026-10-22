import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  consumeEmailDeliveryStatus,
  sendInterviewEmail,
  type InterviewEmailKind,
} from '../../shared/services/email.service.js';
import type { InterviewDoc, InterviewMode } from '../../models/interview.model.js';
import type { UserDoc } from '../../models/user.model.js';
import { notificationsService, type NotificationsService } from '../notifications/notifications.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  INTERVIEW_CONFIG,
  INTERVIEW_APPLICANT_ROLE,
  INTERVIEW_EDITABLE_STATUS,
  INTERVIEW_EMAIL_FAILED_LOG,
  INTERVIEW_EMAIL_FALLBACKS,
  INTERVIEW_ERROR_CODES,
  INTERVIEW_MANAGER_ROLE,
  INTERVIEW_MESSAGES,
  INTERVIEW_COMPLETED_STATUS,
  ACTIVE_USER_STATUS,
  SCHEDULABLE_APPLICATION_STATUSES,
  TIME_GATED_STATUSES,
} from './interviews.constants.js';
import {
  interviewsRepository,
  type InterviewFilter,
  type InterviewsRepository,
  type UpdateInterviewRecord,
} from './interviews.repository.js';
import {
  parseInterviewStatusFilter,
  type CreateInterviewBody,
  type InterviewCalendarQuery,
  type InterviewCalendarResponse,
  type InterviewDetailDTO,
  type InterviewDTO,
  type InterviewListQuery,
  type InterviewListResponse,
  type InterviewLookupQuery,
  type RequestInterviewRescheduleBody,
  type InterviewParticipantDTO,
  type InterviewerListResponse,
  type SchedulableApplicationListResponse,
  type UpdateInterviewBody,
  type UpdateInterviewStatusBody,
} from './interviews.schemas.js';

export interface InterviewActor {
  id: string;
  role: string;
}

interface InterviewScope {
  enterpriseId: string;
}

interface InterviewLookups {
  users: Map<string, UserDoc>;
  jobTitles: Map<string, string>;
}

// The filters the List and the Calendar views have in common.
type InterviewFilterQuery = Pick<
  InterviewCalendarQuery,
  'status' | 'mode' | 'jobId' | 'applicationId' | 'interviewerId' | 'search'
> & { from?: Date | undefined; to?: Date | undefined };

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export class InterviewsService {
  constructor(
    private readonly repository: InterviewsRepository = interviewsRepository,
    private readonly users: UsersService = usersService,
    // Injected so the "interview has ended" rule can be tested without waiting.
    private readonly now: () => Date = () => new Date(),
    private readonly notifications: NotificationsService = notificationsService,
  ) {}

  // ---- writes ----

  async create(actor: InterviewActor, body: CreateInterviewBody): Promise<InterviewDetailDTO> {
    const scope = await this.resolveScope(actor);

    const context = await this.repository.findApplicationContext(body.applicationId);
    // Another company's application is indistinguishable from a missing one.
    if (!context || String(context.job.enterprise_id) !== scope.enterpriseId) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, INTERVIEW_MESSAGES.APPLICATION_NOT_FOUND);
    }
    if (!SCHEDULABLE_APPLICATION_STATUSES.includes(context.application.status)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        INTERVIEW_MESSAGES.APPLICATION_NOT_SCHEDULABLE,
        INTERVIEW_ERROR_CODES.APPLICATION_NOT_SCHEDULABLE,
      );
    }

    const scheduledAt = new Date(body.scheduledAt);
    this.assertInFuture(scheduledAt);
    this.assertModeDetails(body.mode, body.meetingLink, body.location);
    await this.assertInterviewers(scope.enterpriseId, body.interviewerIds);

    const applicantId = String(context.application.applicant_id);
    const applicant = await this.users.findById(applicantId);
    if (!applicant || applicant.status !== ACTIVE_USER_STATUS) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        INTERVIEW_MESSAGES.APPLICANT_UNAVAILABLE,
        INTERVIEW_ERROR_CODES.APPLICANT_UNAVAILABLE,
      );
    }

    const endsAt = this.endOf(scheduledAt, body.durationMinutes);
    await this.assertNoConflict({ interviewerIds: body.interviewerIds, applicantId, startsAt: scheduledAt, endsAt });

    const created = await this.repository.create({
      enterpriseId: scope.enterpriseId,
      applicationId: body.applicationId,
      jobId: String(context.application.job_id),
      applicantId,
      interviewerIds: body.interviewerIds,
      createdBy: actor.id,
      scheduledAt,
      endsAt,
      durationMinutes: body.durationMinutes,
      mode: body.mode,
      meetingLink: body.meetingLink,
      location: body.location,
      notes: body.notes,
    });

    const detail = await this.hydrateDetail(created);
    await this.notify('scheduled', detail, scope.enterpriseId);
    return detail;
  }

  async update(actor: InterviewActor, id: string, body: UpdateInterviewBody): Promise<InterviewDetailDTO> {
    const scope = await this.resolveScope(actor);
    const existing = await this.loadScoped(scope, id);
    if (existing.status !== INTERVIEW_EDITABLE_STATUS) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.NOT_EDITABLE, INTERVIEW_ERROR_CODES.NOT_EDITABLE);
    }

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : existing.scheduled_at;
    // An unchanged time is left alone even if it has passed, so notes can still be edited during the interview.
    const timeChanged = scheduledAt.getTime() !== existing.scheduled_at.getTime();
    if (timeChanged) {
      this.assertInFuture(scheduledAt);
    }
    const durationMinutes = body.durationMinutes ?? existing.duration_minutes;
    const mode = body.mode ?? existing.mode;
    this.assertModeDetails(
      mode,
      this.resolveNullable(body.meetingLink, existing.meeting_link),
      this.resolveNullable(body.location, existing.location),
    );

    const previousInterviewerIds = existing.interviewer_ids.map(String);
    const interviewerIds = body.interviewerIds ?? previousInterviewerIds;
    this.assertDistinctInterviewers(interviewerIds);
    const interviewersChanged = !sameMembers(interviewerIds, previousInterviewerIds);
    if (interviewersChanged) {
      await this.assertInterviewers(scope.enterpriseId, interviewerIds);
    }

    const endsAt = this.endOf(scheduledAt, durationMinutes);
    if (timeChanged || interviewersChanged || durationMinutes !== existing.duration_minutes) {
      await this.assertNoConflict({
        interviewerIds,
        applicantId: String(existing.applicant_id),
        startsAt: scheduledAt,
        endsAt,
        excludeId: id,
      });
    }

    const record: UpdateInterviewRecord = {
      interviewerIds,
      scheduledAt,
      endsAt,
      durationMinutes,
      mode,
      meetingLink: body.meetingLink,
      location: body.location,
      notes: body.notes,
    };
    const updated = await this.repository.updateScheduled(id, record);
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.STATE_CHANGED, INTERVIEW_ERROR_CODES.STATE_CHANGED);
    }

    const detail = await this.hydrateDetail(updated);
    await this.notify('updated', detail, scope.enterpriseId);
    const removedIds = previousInterviewerIds.filter((interviewerId) => !interviewerIds.includes(interviewerId));
    if (removedIds.length > 0) {
      await this.notifyRemovedInterviewers(existing, removedIds, scope.enterpriseId);
    }
    return detail;
  }

  async updateStatus(actor: InterviewActor, id: string, body: UpdateInterviewStatusBody): Promise<InterviewDetailDTO> {
    const scope = await this.resolveScope(actor);
    const existing = await this.loadScoped(scope, id);
    if (existing.status !== INTERVIEW_EDITABLE_STATUS) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.ALREADY_FINAL, INTERVIEW_ERROR_CODES.ALREADY_FINAL);
    }

    // Completed / no-show only make sense once the interview has ended; cancelling is always possible.
    const timeGated = TIME_GATED_STATUSES.includes(body.status);
    const now = this.now();
    if (timeGated && now.getTime() < existing.ends_at.getTime()) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.NOT_ENDED, INTERVIEW_ERROR_CODES.NOT_ENDED);
    }

    const updated = await this.repository.transitionFromScheduled(id, body.status, actor.id, {
      note: body.note,
      endedBefore: timeGated ? now : undefined,
    });
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.STATE_CHANGED, INTERVIEW_ERROR_CODES.STATE_CHANGED);
    }

    const detail = await this.hydrateDetail(updated);
    if (body.status === 'cancelled') {
      await this.notify('cancelled', detail, scope.enterpriseId);
    }
    return detail;
  }

  async requestReschedule(actor: InterviewActor, id: string, body: RequestInterviewRescheduleBody): Promise<InterviewDetailDTO> {
    if (actor.role !== INTERVIEW_APPLICANT_ROLE) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, INTERVIEW_MESSAGES.APPLICANT_ONLY);
    }

    const existing = await this.repository.findById(id);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, INTERVIEW_MESSAGES.NOT_FOUND);
    }
    if (String(existing.applicant_id) !== actor.id) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, INTERVIEW_MESSAGES.NOT_APPLICANT);
    }
    if (existing.status !== INTERVIEW_EDITABLE_STATUS) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        existing.status === 'reschedule_requested' ? INTERVIEW_MESSAGES.RESCHEDULE_REQUESTED : INTERVIEW_MESSAGES.ALREADY_FINAL,
        existing.status === 'reschedule_requested' ? INTERVIEW_ERROR_CODES.RESCHEDULE_REQUESTED : INTERVIEW_ERROR_CODES.ALREADY_FINAL,
      );
    }

    const updated = await this.repository.requestReschedule(id, actor.id, {
      proposedDateTime: new Date(body.proposedDateTime),
      reason: body.reason,
    });
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.STATE_CHANGED, INTERVIEW_ERROR_CODES.STATE_CHANGED);
    }
    return this.hydrateDetail(updated);
  }

  async remove(actor: InterviewActor, id: string): Promise<void> {
    const scope = await this.resolveScope(actor);
    const existing = await this.loadScoped(scope, id);
    // A completed interview is a record of work done, so it stays.
    if (existing.status === INTERVIEW_COMPLETED_STATUS) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        INTERVIEW_MESSAGES.COMPLETED_NOT_DELETABLE,
        INTERVIEW_ERROR_CODES.COMPLETED_NOT_DELETABLE,
      );
    }

    const deleted = await this.repository.deleteNotCompleted(id);
    if (!deleted) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, INTERVIEW_MESSAGES.STATE_CHANGED, INTERVIEW_ERROR_CODES.STATE_CHANGED);
    }

    // Deleting an interview that was still scheduled tells the participants it will not happen.
    if (deleted.status === INTERVIEW_EDITABLE_STATUS) {
      await this.safely(async () => {
        await this.notify('cancelled', await this.hydrateOne(deleted), scope.enterpriseId);
      });
    }
  }

  // ---- reads ----

  async list(actor: InterviewActor, query: InterviewListQuery): Promise<InterviewListResponse> {
    const scope = await this.resolveScope(actor);
    const filter = await this.buildFilter(scope, query, false);
    const { items, total } = await this.repository.findPage(filter, {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return {
      items: await this.hydrate(items),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async calendar(actor: InterviewActor, query: InterviewCalendarQuery): Promise<InterviewCalendarResponse> {
    const scope = await this.resolveScope(actor);
    const window = { from: query.from.toISOString(), to: query.to.toISOString() };
    const filter = await this.buildFilter(scope, query, true);
    const { items, total } = await this.repository.findCalendar(filter, INTERVIEW_CONFIG.CALENDAR_MAX_ITEMS);
    return { ...window, total, truncated: total > items.length, items: await this.hydrate(items) };
  }

  async getDetail(actor: InterviewActor, id: string): Promise<InterviewDetailDTO> {
    const scope = await this.resolveScope(actor);
    return this.hydrateDetail(await this.loadScoped(scope, id));
  }

  // ---- lookups for the Schedule dialog ----

  // The applications an interview can still be scheduled for (see SCHEDULABLE_APPLICATION_STATUSES), newest first.
  // `search` matches the applicant name/email or the job title.
  async listSchedulableApplications(actor: InterviewActor, query: InterviewLookupQuery): Promise<SchedulableApplicationListResponse> {
    const scope = await this.resolveScope(actor);
    const search = query.search ? await this.resolveSearch(scope.enterpriseId, query.search) : undefined;
    const applications = await this.repository.findSchedulableApplications({
      enterpriseId: scope.enterpriseId,
      statuses: SCHEDULABLE_APPLICATION_STATUSES,
      search,
      limit: query.limit,
    });
    const [applicants, jobTitles] = await Promise.all([
      this.users.findByIds(unique(applications.map((application) => String(application.applicant_id)))),
      this.repository.findJobTitles(unique(applications.map((application) => String(application.job_id)))),
    ]);
    const lookups: InterviewLookups = { users: new Map(applicants.map((user) => [String(user._id), user])), jobTitles };
    return {
      items: applications.map((application) => ({
        id: String(application._id),
        status: application.status,
        appliedAt: application.createdAt.toISOString(),
        job: { id: String(application.job_id), title: jobTitles.get(String(application.job_id)) ?? null },
        applicant: this.participant(lookups, String(application.applicant_id)),
      })),
    };
  }

  // The active recruiters of the actor's enterprise who can be added as interviewers (the actor included),
  // by name or email. A recruiter team is small, so it is filtered here instead of with a dedicated query.
  async listInterviewers(actor: InterviewActor, query: InterviewLookupQuery): Promise<InterviewerListResponse> {
    const scope = await this.resolveScope(actor);
    const keyword = query.search?.toLowerCase();
    const recruiters = await this.users.findRecruitersByEnterpriseId(scope.enterpriseId);
    const items = recruiters
      .filter((recruiter) => recruiter.status === ACTIVE_USER_STATUS)
      .filter(
        (recruiter) =>
          !keyword ||
          [recruiter.full_name, recruiter.email, recruiter.username].some((value) => value?.toLowerCase().includes(keyword)),
      )
      .map((recruiter) => ({ id: String(recruiter._id), fullName: recruiter.full_name ?? null, email: recruiter.email }))
      .sort((left, right) => (left.fullName ?? left.email).localeCompare(right.fullName ?? right.email))
      .slice(0, query.limit);
    return { items };
  }

  // ---- scope and rules ----

  // The routes already restrict these endpoints to recruiters; the service enforces it too so it is safe to call from anywhere.
  private async resolveScope(actor: InterviewActor): Promise<InterviewScope> {
    if (actor.role !== INTERVIEW_MANAGER_ROLE) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, INTERVIEW_MESSAGES.RECRUITER_ONLY);
    }
    const enterpriseId = await this.users.getEnterpriseId(actor.id);
    if (!enterpriseId) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, INTERVIEW_MESSAGES.NO_ENTERPRISE);
    }
    return { enterpriseId };
  }

  // Another company's interview is indistinguishable from a missing one.
  private async loadScoped(scope: InterviewScope, id: string): Promise<InterviewDoc> {
    const interview = await this.repository.findById(id);
    if (!interview || String(interview.enterprise_id) !== scope.enterpriseId) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, INTERVIEW_MESSAGES.NOT_FOUND);
    }
    return interview;
  }

  private async buildFilter(scope: InterviewScope, query: InterviewFilterQuery, overlapRange: boolean): Promise<InterviewFilter> {
    const search = query.search ? await this.resolveSearch(scope.enterpriseId, query.search) : undefined;
    return {
      enterpriseId: scope.enterpriseId,
      interviewerId: query.interviewerId,
      statuses: query.status ? parseInterviewStatusFilter(query.status) : undefined,
      mode: query.mode,
      jobId: query.jobId,
      applicationId: query.applicationId,
      from: query.from,
      to: query.to,
      overlapRange,
      search,
    };
  }

  // A keyword matches people (the applicant or an interviewer, by name, email or username) and the enterprise's job
  // titles. Each side is capped, so a very short keyword on a large user base can miss some matches.
  private async resolveSearch(enterpriseId: string, keyword: string): Promise<{ userIds: string[]; jobIds: string[] }> {
    const [userIds, jobIds] = await Promise.all([
      this.users.findIdsByKeyword(keyword, INTERVIEW_CONFIG.SEARCH_MATCH_LIMIT),
      this.repository.findJobIdsByTitle(enterpriseId, keyword),
    ]);
    return { userIds, jobIds };
  }

  private endOf(startsAt: Date, durationMinutes: number): Date {
    return new Date(startsAt.getTime() + durationMinutes * INTERVIEW_CONFIG.MS_PER_MINUTE);
  }

  private assertInFuture(scheduledAt: Date): void {
    if (scheduledAt.getTime() <= this.now().getTime()) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, INTERVIEW_MESSAGES.TIME_IN_PAST, INTERVIEW_ERROR_CODES.TIME_IN_PAST);
    }
  }

  private assertModeDetails(mode: InterviewMode, meetingLink: string | undefined, location: string | undefined): void {
    if (mode === 'online' && !meetingLink) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, INTERVIEW_MESSAGES.ONLINE_LINK_REQUIRED);
    }
    if (mode === 'onsite' && !location) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, INTERVIEW_MESSAGES.ONSITE_LOCATION_REQUIRED);
    }
  }

  // `undefined` keeps the stored value, `null` clears it, a value replaces it.
  private resolveNullable(patch: string | null | undefined, current: string | undefined): string | undefined {
    return patch === undefined ? current : (patch ?? undefined);
  }

  // Every interviewer must be an active recruiter of the same enterprise.
  private async assertInterviewers(enterpriseId: string, interviewerIds: string[]): Promise<void> {
    this.assertDistinctInterviewers(interviewerIds);
    const rows = await this.users.findByIds(interviewerIds);
    const valid = rows.filter(
      (row) =>
        row.status === ACTIVE_USER_STATUS &&
        row.role === INTERVIEW_MANAGER_ROLE &&
        String(row.enterprise_id ?? '') === enterpriseId,
    );
    if (valid.length !== interviewerIds.length) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        INTERVIEW_MESSAGES.INVALID_INTERVIEWERS,
        INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS,
      );
    }
  }

  // The request schema rejects repeated interviewers, but the service must never store the same one twice.
  private assertDistinctInterviewers(interviewerIds: string[]): void {
    if (unique(interviewerIds).length !== interviewerIds.length) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        INTERVIEW_MESSAGES.DUPLICATE_INTERVIEWERS,
        INTERVIEW_ERROR_CODES.INVALID_INTERVIEWERS,
      );
    }
  }

  private async assertNoConflict(params: Parameters<InterviewsRepository['findConflict']>[0]): Promise<void> {
    const conflict = await this.repository.findConflict(params);
    if (!conflict) {
      return;
    }
    const applicantBusy = String(conflict.applicant_id) === params.applicantId;
    throw createHttpError(
      HTTP_STATUS.HTTP_409_CONFLICT,
      applicantBusy ? INTERVIEW_MESSAGES.APPLICANT_CONFLICT : INTERVIEW_MESSAGES.INTERVIEWER_CONFLICT,
      applicantBusy ? INTERVIEW_ERROR_CODES.APPLICANT_CONFLICT : INTERVIEW_ERROR_CODES.INTERVIEWER_CONFLICT,
    );
  }

  // ---- mapping ----

  private async loadLookups(interviews: InterviewDoc[]): Promise<InterviewLookups> {
    const userIds = unique(
      interviews.flatMap((interview) => [String(interview.applicant_id), ...interview.interviewer_ids.map(String)]),
    );
    const jobIds = unique(interviews.map((interview) => String(interview.job_id)));
    const [users, jobTitles] = await Promise.all([
      this.users.findByIds(userIds),
      this.repository.findJobTitles(jobIds),
    ]);
    return { users: new Map(users.map((user) => [String(user._id), user])), jobTitles };
  }

  private participant(lookups: InterviewLookups, id: string): InterviewParticipantDTO {
    const user = lookups.users.get(id);
    return { id, fullName: user?.full_name ?? null, email: user?.email ?? null };
  }

  private toDto(interview: InterviewDoc, lookups: InterviewLookups): InterviewDTO {
    return {
      id: String(interview._id),
      status: interview.status,
      scheduledAt: interview.scheduled_at.toISOString(),
      endsAt: interview.ends_at.toISOString(),
      durationMinutes: interview.duration_minutes,
      mode: interview.mode,
      meetingLink: interview.meeting_link ?? null,
      location: interview.location ?? null,
      notes: interview.notes ?? null,
      rescheduleRequest: interview.reschedule_request
        ? {
            proposedDateTime: interview.reschedule_request.proposed_time.toISOString(),
            reason: interview.reschedule_request.reason,
            requestedAt: interview.reschedule_request.requested_at.toISOString(),
          }
        : null,
      applicationId: String(interview.application_id),
      job: { id: String(interview.job_id), title: lookups.jobTitles.get(String(interview.job_id)) ?? null },
      applicant: this.participant(lookups, String(interview.applicant_id)),
      interviewers: interview.interviewer_ids.map((interviewerId) => this.participant(lookups, String(interviewerId))),
      canComplete:
        interview.status === INTERVIEW_EDITABLE_STATUS && interview.ends_at.getTime() <= this.now().getTime(),
      createdAt: interview.createdAt.toISOString(),
      updatedAt: interview.updatedAt.toISOString(),
    };
  }

  private async hydrate(interviews: InterviewDoc[]): Promise<InterviewDTO[]> {
    const lookups = await this.loadLookups(interviews);
    return interviews.map((interview) => this.toDto(interview, lookups));
  }

  private async hydrateOne(interview: InterviewDoc): Promise<InterviewDTO> {
    return this.toDto(interview, await this.loadLookups([interview]));
  }

  private async hydrateDetail(interview: InterviewDoc): Promise<InterviewDetailDTO> {
    return {
      ...(await this.hydrateOne(interview)),
      createdBy: String(interview.created_by),
      statusHistory: interview.status_history.map((entry) => ({
        status: entry.status,
        changedAt: entry.changed_at.toISOString(),
        changedBy: String(entry.changed_by),
        note: entry.note ?? null,
      })),
    };
  }

  // ---- email ----

  // A failed notification never fails the request; it is only logged.
  private async safely(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      console.error(INTERVIEW_EMAIL_FAILED_LOG, error);
    }
  }

  private async notify(
    kind: InterviewEmailKind,
    interview: InterviewDTO,
    enterpriseId: string,
    recipients: InterviewParticipantDTO[] = [interview.applicant, ...interview.interviewers],
  ): Promise<void> {
    await this.safely(async () => {
      const companyName = (await this.repository.findEnterpriseName(enterpriseId)) ?? INTERVIEW_EMAIL_FALLBACKS.COMPANY_NAME;
      // One mail per address even when a person is listed twice.
      const byEmail = new Map<string, InterviewParticipantDTO>();
      for (const recipient of recipients) {
        if (recipient.email) {
          byEmail.set(recipient.email.toLowerCase(), recipient);
        }
      }
      const results = await Promise.allSettled(
        [...byEmail.values()].map(async (recipient) => {
          const to = recipient.email ?? '';
          await sendInterviewEmail({
            kind,
            to,
            recipientName: recipient.fullName ?? undefined,
            jobTitle: interview.job.title ?? INTERVIEW_EMAIL_FALLBACKS.JOB_TITLE,
            companyName,
            scheduledAt: new Date(interview.scheduledAt),
            durationMinutes: interview.durationMinutes,
            mode: interview.mode,
            meetingLink: interview.meetingLink ?? undefined,
            location: interview.location ?? undefined,
            notes: interview.notes ?? undefined,
          });
          if (consumeEmailDeliveryStatus(to) === false) {
            throw new Error(`Interview email to ${to} was not delivered`);
          }
        }),
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(INTERVIEW_EMAIL_FAILED_LOG, result.reason);
        }
      }

      const notifiedUserIds = new Set<string>();
      for (const recipient of recipients) {
        if (recipient.id && !notifiedUserIds.has(recipient.id)) {
          notifiedUserIds.add(recipient.id);
          try {
            let type: 'interview_scheduled' | 'interview_rescheduled' | 'interview_cancelled';
            let category: 'action_required' | 'warning';
            let title: string;
            let message: string;
            let actionUrl: string;

            const jobTitle = interview.job.title ?? INTERVIEW_EMAIL_FALLBACKS.JOB_TITLE;
            const formattedTime = new Date(interview.scheduledAt).toLocaleString();

            if (kind === 'scheduled') {
              type = 'interview_scheduled';
              category = 'action_required';
              title = 'Interview Scheduled';
              message = `An interview for "${jobTitle}" has been scheduled for ${formattedTime}.`;
              actionUrl = `/interviews/${interview.id}`;
            } else if (kind === 'updated') {
              type = 'interview_rescheduled';
              category = 'action_required';
              title = 'Interview Rescheduled';
              message = `The interview for "${jobTitle}" has been rescheduled to ${formattedTime}.`;
              actionUrl = `/interviews/${interview.id}`;
            } else {
              type = 'interview_cancelled';
              category = 'warning';
              title = 'Interview Cancelled';
              message = `The interview for "${jobTitle}" scheduled for ${formattedTime} has been cancelled.`;
              actionUrl = '/interviews';
            }

            await this.notifications.dispatch({
              recipientId: recipient.id,
              title,
              message,
              type,
              category,
              actionUrl,
              data: {
                interviewId: interview.id,
                applicationId: interview.applicationId,
                jobId: interview.job.id,
                scheduledAt: interview.scheduledAt,
              },
            });
          } catch (error) {
            console.error('Failed to dispatch interview in-app notification', error);
          }
        }
      }
    });
  }

  // Interviewers taken off an interview are told it no longer involves them, using the time they had been given.
  private async notifyRemovedInterviewers(previous: InterviewDoc, removedIds: string[], enterpriseId: string): Promise<void> {
    await this.safely(async () => {
      const dto = await this.hydrateOne(previous);
      const removed = await this.users.findByIds(removedIds);
      await this.notify(
        'cancelled',
        dto,
        enterpriseId,
        removed.map((user) => ({ id: String(user._id), fullName: user.full_name ?? null, email: user.email })),
      );
    });
  }
}

export const interviewsService = new InterviewsService();
