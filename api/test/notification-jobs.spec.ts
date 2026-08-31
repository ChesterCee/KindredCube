import { afterEach, describe, expect, it, vi } from 'vitest';
import { schedulePostMeet } from '../src/notification-schedule';
import { NotificationWorkerService } from '../src/notification-worker.service';
import { PushNotificationsService } from '../src/push-notifications.service';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('durable meeting reminders', () => {
  it.each([30,45,60])('schedules both people after %i minutes', async (duration) => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const start = Date.now() + 60_000;
    await schedulePostMeet({ query } as any, { kind: 'meeting_response', senderId: 'a', recipientId: 'b', meetingResponse: { status: 'accepted', proposal: { scheduledAt: start, durationMinutes: duration } } } as any);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1].slice(1,3)).toEqual(['a','b']);
    expect(query.mock.calls[1][1].slice(1,3)).toEqual(['b','a']);
    expect(query.mock.calls[0][1][4].getTime()).toBe(start + duration * 60_000);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (dedupe_key) DO NOTHING');
  });
  it('does not schedule an unaccepted proposal', async () => {
    const query = vi.fn();
    await schedulePostMeet({ query } as any, { kind: 'meeting_proposal' } as any);
    expect(query).not.toHaveBeenCalled();
  });
  it('cancels pending reminders when a meeting is declined', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await schedulePostMeet({ query } as any, { kind: 'meeting_response', senderId: 'a', recipientId: 'b', meetingResponse: { status: 'declined', proposal: { scheduledAt: Date.now(), durationMinutes: 30 } } } as any);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("status = 'skipped'");
  });
  it('leases jobs, records acceptance, and throttles inactivity reminders', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'job', user_id: 'a', kind: 'post_meet', attempts: 1 }] })
      .mockResolvedValue({ rows: [] });
    const sendScheduledNotification = vi.fn().mockResolvedValue('sent');
    const worker = new NotificationWorkerService({ query } as any, { sendScheduledNotification } as any);
    await worker.tick();
    expect(query.mock.calls[0][0]).toContain("interval '7 days'");
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[2][1]).toEqual(['job','sent']);
    expect(sendScheduledNotification).toHaveBeenCalledTimes(1);
  });
});

describe('notification copy, routing and preferences', () => {
  function setup(preferences: Record<string, boolean> = {}, submitted = false) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('settings_data')) return { rows: [{ settings_data: { notificationPreferences: preferences } }], rowCount: 1 };
      if (sql.includes('user_push_tokens')) return { rows: [{ token: 'ExponentPushToken[test]', platform: 'ios' }], rowCount: 1 };
      if (sql.includes('display_name')) return { rows: [{ display_name: 'Sam' }], rowCount: 1 };
      if (sql.includes('content_kind')) return { rows: [{ content_kind: 'meeting_response' }], rowCount: 1 };
      if (sql.includes('post_meet_checks')) return { rows: submitted ? [{ id: 'check' }] : [], rowCount: submitted ? 1 : 0 };
      if (sql.includes('user_blocks')) return { rows: [], rowCount: 0 };
      return { rows: [{ id: 'user', count: 1 }], rowCount: 1 };
    });
    const push = new PushNotificationsService({ withUser: async (_: string, fn: any) => fn({ query }) } as any);
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ data: { status: 'ok', id: 'ticket' } }) });
    vi.stubGlobal('fetch', fetchMock);
    return { push, fetchMock };
  }
  it('announces accepted meetings and routes to their chat', async () => {
    const { push, fetchMock } = setup();
    await push.sendMessageNotification('recipient','sender','message','accepted');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.title).toBe('Meeting accepted');
    expect(body.body).toContain('Sam accepted');
    expect(body.data.profileId).toBe('sender');
    expect(body.data.destination).toBe('chat');
  });
  it('routes new likes to Liked You', async () => {
    const { push, fetchMock } = setup();
    await push.sendLikeNotification('recipient','liker',false);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).data.destination).toBe('liked');
  });
  it('does not remind someone who already completed their check', async () => {
    const { push, fetchMock } = setup({}, true);
    expect(await push.sendScheduledNotification({ user_id:'a', other_user_id:'b', kind:'post_meet', meeting_started_at:new Date() })).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('respects the marketing opt-out', async () => {
    const { push, fetchMock } = setup({ marketing:false });
    expect(await push.sendScheduledNotification({ user_id:'a', other_user_id:null, kind:'inactivity', meeting_started_at:null })).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends the post-meet reminder to the correct conversation', async () => {
    const { push, fetchMock } = setup();
    expect(await push.sendScheduledNotification({ user_id:'a', other_user_id:'b', kind:'post_meet', meeting_started_at:new Date() })).toBe('sent');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.data).toEqual({ type:'post_meet', destination:'chat', profileId:'b', senderId:'b' });
    expect(body.body).toContain('private post-meet check');
  });
  it('does not mark a failed Expo request as sent', async () => {
    const { push, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce({ ok:false, status:503, text:async () => 'Unavailable' });
    expect(await push.sendScheduledNotification({ user_id:'a', other_user_id:'b', kind:'post_meet', meeting_started_at:new Date() })).toBe('retry');
  });
  it('respects the post-meet reminder opt-out', async () => {
    const { push, fetchMock } = setup({ meetingReminders:false });
    expect(await push.sendScheduledNotification({ user_id:'a', other_user_id:'b', kind:'post_meet', meeting_started_at:new Date() })).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
