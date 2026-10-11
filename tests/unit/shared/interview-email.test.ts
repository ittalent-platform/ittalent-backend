import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildInterviewEmailHtml,
  consumeEmailDeliveryStatus,
  sendInterviewEmail,
  type InterviewEmailInput,
} from '../../../src/shared/services/email.service.js';

const base: InterviewEmailInput = {
  kind: 'scheduled',
  to: 'Candidate@Example.com',
  recipientName: 'Linh <b>Tran</b>',
  jobTitle: 'Backend Engineer',
  companyName: 'Acme & Co',
  // 03:00 UTC is 10:00 in Vietnam.
  scheduledAt: new Date('2026-10-13T03:00:00.000Z'),
  durationMinutes: 45,
  mode: 'online',
  meetingLink: 'https://meet.example.com/room?a=1&b=2',
};

describe('interview emails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the time in Vietnam time with the duration and the meeting link', () => {
    const html = buildInterviewEmailHtml(base);
    // The punctuation between the date and the time differs between ICU versions.
    expect(html).toMatch(/Tuesday,? 13 October 2026,?( at)? 10:00 GMT\+7/);
    expect(html).toContain('45 minutes');
    expect(html).toContain('Online');
    expect(html).toContain('href="https://meet.example.com/room?a=1&amp;b=2"');
  });

  it('shows the location of an onsite interview and the notes', () => {
    const html = buildInterviewEmailHtml({ ...base, mode: 'onsite', meetingLink: undefined, location: 'Floor 5, 1 Test St', notes: 'Bring your ID' });
    expect(html).toContain('Onsite');
    expect(html).toContain('Location: Floor 5, 1 Test St');
    expect(html).toContain('Notes: Bring your ID');
    expect(html).not.toContain('Meeting link');
  });

  it('escapes everything that comes from users', () => {
    const html = buildInterviewEmailHtml({ ...base, jobTitle: '<script>x</script>', notes: '<img src=x>' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('Hello Linh &lt;b&gt;Tran&lt;/b&gt;,');
    expect(html).toContain('Acme &amp; Co');
  });

  it('greets without a name when there is none', () => {
    expect(buildInterviewEmailHtml({ ...base, recipientName: undefined })).toContain('<p>Hello,</p>');
  });

  it.each([
    ['scheduled', 'Interview scheduled: Backend Engineer at Acme & Co', 'has been scheduled'],
    ['updated', 'Interview updated: Backend Engineer at Acme & Co', 'have changed'],
    ['cancelled', 'Interview cancelled: Backend Engineer at Acme & Co', 'has been cancelled'],
  ] as const)('sends the %s mail with its own subject and wording', async (kind, subject, wording) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await sendInterviewEmail({ ...base, kind });

    expect(info).toHaveBeenCalledWith('[email:dev]', expect.objectContaining({ to: 'candidate@example.com', subject }));
    expect(buildInterviewEmailHtml({ ...base, kind })).toContain(wording);
    expect(consumeEmailDeliveryStatus('candidate@example.com')).toBe(true);
  });
});
