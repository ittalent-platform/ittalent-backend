/**
 * Deadlines are date-only and mean the end of the selected day in Asia/Ho_Chi_Minh
 * (UTC+7, no daylight saving) — see TBD-JOB-01 in the job-posting use cases.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ICT_OFFSET_HOURS = 7;
const MS_PER_HOUR = 3_600_000;
const ICT_OFFSET_MS = ICT_OFFSET_HOURS * MS_PER_HOUR;
const DATE_LENGTH = 'YYYY-MM-DD'.length;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Accepts `YYYY-MM-DD` or an ISO datetime (its Asia/Ho_Chi_Minh calendar day is used). */
export function isValidDeadlineInput(value: string): boolean {
  if (DATE_ONLY.test(value)) return isCalendarDate(value);
  return !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

/** The instant the selected day ends in Asia/Ho_Chi_Minh (23:59:59.999 +07:00). */
export function deadlineFromInput(value: string): Date {
  const day = DATE_ONLY.test(value)
    ? value
    : new Date(Date.parse(value) + ICT_OFFSET_MS).toISOString().slice(0, DATE_LENGTH);
  return new Date(`${day}T23:59:59.999+07:00`);
}

/** A deadline is "today or later" while its end-of-day instant has not passed. */
export function isDeadlineOnOrAfterToday(deadline: Date, now: Date = new Date()): boolean {
  return deadline.getTime() >= now.getTime();
}
