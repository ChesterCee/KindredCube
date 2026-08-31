import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private lastInactivityScan = 0;
  private retryAfter = 0;
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PushNotificationsService) private readonly push: PushNotificationsService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => { void this.tick(); }, 1000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy || Date.now() < this.retryAfter) return;
    this.busy = true;
    try {
      if (Date.now() - this.lastInactivityScan >= 3600_000) {
        await this.database.query(
          `INSERT INTO notification_jobs(dedupe_key,user_id,kind,due_at,available_at)
           SELECT 'inactivity:' || a.user_id::text || ':' || date_trunc('week',now())::text,
                  a.user_id,'inactivity',now(),now()
           FROM notification_activity a JOIN users u ON u.id = a.user_id
           WHERE u.status = 'active' AND a.last_active_at <= now() - interval '7 days'
             AND NOT EXISTS (SELECT 1 FROM notification_jobs j WHERE j.user_id = a.user_id
               AND j.kind = 'inactivity' AND j.created_at > now() - interval '7 days')
           ON CONFLICT (dedupe_key) DO NOTHING`,
        );
        this.lastInactivityScan = Date.now();
      }
      for (let i = 0; i < 20; i++) {
        // Atomic lease allows multiple API processes without simultaneous delivery.
        const result = await this.database.query<{
          id: string; user_id: string; other_user_id: string | null;
          kind: string; meeting_started_at: Date | null; attempts: number;
        }>(`UPDATE notification_jobs SET available_at = now() + interval '5 minutes', attempts = attempts + 1
            WHERE id = (SELECT id FROM notification_jobs WHERE status = 'pending'
              AND available_at <= now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING id,user_id,other_user_id,kind,meeting_started_at,attempts`);
        const job = result.rows[0];
        if (!job) break;
        let status: 'sent' | 'skipped' | 'retry' = 'retry';
        try { status = await this.push.sendScheduledNotification(job); }
        catch (error) { this.logger.warn(`Notification ${job.id} delivery failed: ${error instanceof Error ? error.message : String(error)}`); }
        const nextStatus = status === 'retry' ? (job.attempts >= 8 ? 'failed' : 'pending') : status;
        await this.database.query("UPDATE notification_jobs SET status = $2, completed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END WHERE id = $1 AND status = 'pending'", [job.id, nextStatus]);
        this.logger.log(`Scheduled ${job.kind} notification ${job.id}: ${nextStatus}`);
      }
    } catch (error) {
      this.retryAfter = Date.now() + 60_000;
      this.logger.error(`Notification scheduler failed (check migrations): ${error instanceof Error ? error.message : String(error)}`);
    } finally { this.busy = false; }
  }
}
