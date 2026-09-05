import { Inject, Injectable, Logger } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default";
  priority?: "default" | "normal" | "high";
  channelId?: string;
  badge?: number;
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async registerToken(userId: string, token: string, platform: "ios" | "android" | "web" | "unknown") {
    const normalized = token.trim();
    if (!normalized.startsWith("ExponentPushToken[") && !normalized.startsWith("ExpoPushToken[")) {
      throw new Error("Invalid Expo push token.");
    }
    return this.database.withUser(userId, async (client) => {
      await client.query(
        `INSERT INTO user_push_tokens (user_id, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           enabled = true,
           last_seen_at = now(),
           updated_at = now()`,
        [userId, normalized, platform],
      );
      this.logger.log(`Registered ${platform} push token for user ${userId}.`);
      return { registered: true };
    });
  }

  async diagnostics(userId: string) {
    return this.database.withUser(userId, async (client) => {
      const tokens = await client.query<{
        platform: string;
        enabled: boolean;
        last_seen_at: string;
        token_prefix: string;
      }>(
        `SELECT platform, enabled, last_seen_at, left(token, 28) AS token_prefix
           FROM user_push_tokens
          WHERE user_id = $1
          ORDER BY last_seen_at DESC
          LIMIT 10`,
        [userId],
      );
      const badgeCount = await notificationBadgeCount(client, userId);
      return {
        badgeCount,
        tokenCount: tokens.rowCount,
        tokens: tokens.rows.map((row) => ({
          platform: row.platform,
          enabled: row.enabled,
          lastSeenAt: row.last_seen_at,
          tokenPrefix: row.token_prefix,
        })),
      };
    });
  }

  async sendTestNotification(userId: string) {
    await this.database.withUser(userId, async (client) => {
      const tokens = await activePushTokens(client, userId);
      if (!tokens.rowCount) {
        this.logger.warn(`No active push token found for test recipient ${userId}.`);
        return;
      }
      const badgeCount = await notificationBadgeCount(client, userId);
      const messages: ExpoPushMessage[] = tokens.rows.map((row) => ({
        to: row.token,
        title: "KindredCube test notification",
        body: "If you can see this on your phone, push notifications are connected.",
        sound: "default",
        priority: "high",
        channelId: "messages",
        badge: Math.max(1, badgeCount || 1),
        data: {
          type: "push_test",
        },
      }));
      await sendExpoPush(messages, this.logger);
      this.logger.log(
        `Queued ${messages.length} test push notification(s) for user ${userId}; platforms=${summarizePushPlatforms(tokens.rows)}.`,
      );
    });
    return { queued: true };
  }

  async sendMessageNotification(recipientId: string, senderId: string, messageId: string, meetingStatus?: "accepted" | "declined") {
    await this.database.withUser(recipientId, async (client) => {
      if (await notificationsDisabled(client, recipientId, "newMessages")) {
        this.logger.warn(`Message push skipped because recipient ${recipientId} disabled new message notifications.`);
        return;
      }
      const tokens = await activePushTokens(client, recipientId);
      if (!tokens.rowCount) {
        this.logger.warn(`No active push token found for message recipient ${recipientId}.`);
        return;
      }
      const sender = await client.query<{ display_name: string }>(
        `SELECT COALESCE(d.display_name, u.public_username, 'Someone') AS display_name
           FROM users u
           LEFT JOIN discovery_profiles d ON d.user_id = u.id
          WHERE u.id = $1`,
        [senderId],
      );
      const senderName = sender.rows[0]?.display_name || "Someone";
      const message = await client.query<{ content_kind: string }>(
        `SELECT content_kind
           FROM chat_messages
          WHERE id = $1
            AND recipient_id = $2
          LIMIT 1`,
        [messageId, recipientId],
      );
      const messageKind = message.rows[0]?.content_kind || "text";
      const badgeCount = await notificationBadgeCount(client, recipientId);
      const messages: ExpoPushMessage[] = tokens.rows.map((row) => ({
        to: row.token,
        title: meetingStatus === "accepted" ? "Meeting accepted" : meetingStatus === "declined" ? "Meeting declined" : `New message from ${senderName}`,
        body: meetingStatus === "accepted"
          ? `${senderName} accepted your meeting proposal.`
          : meetingStatus === "declined"
            ? `${senderName} declined your meeting proposal.`
            : pushBodyForChatKind(messageKind),
        sound: "default",
        priority: "high",
        channelId: "messages",
        badge: Math.max(1, badgeCount),
        data: {
          type: "chat_message",
          destination: "chat",
          profileId: senderId,
          senderId,
          messageId,
        },
      }));
      await sendExpoPush(messages, this.logger);
      this.logger.log(
        `Queued ${messages.length} message push notification(s) for recipient ${recipientId}; platforms=${summarizePushPlatforms(tokens.rows)}.`,
      );
    });
  }

  async sendSupportNotification(recipientId: string, ticketNumber: string, body: string) {
    await this.database.withUser(recipientId, async (client) => {
      const tokens = await activePushTokens(client, recipientId);
      if (!tokens.rowCount) {
        this.logger.warn(`No active push token found for support recipient ${recipientId}.`);
        return;
      }
      const badgeCount = await notificationBadgeCount(client, recipientId);
      const messages: ExpoPushMessage[] = tokens.rows.map((row) => ({
        to: row.token,
        title: `Support update · ${ticketNumber}`,
        body: body.trim().slice(0, 180) || "You have a new message from KindredCube Support.",
        sound: "default",
        priority: "high",
        channelId: "messages",
        badge: Math.max(1, badgeCount || 1),
        data: {
          type: "support_message",
          destination: "settings",
          ticketNumber,
        },
      }));
      await sendExpoPush(messages, this.logger);
      this.logger.log(`Queued ${messages.length} support push notification(s) for recipient ${recipientId}.`);
    });
  }

  async sendLikeNotification(recipientId: string, likerId: string, matched: boolean) {
    await this.database.withUser(recipientId, async (client) => {
      if (await notificationsDisabled(client, recipientId, matched ? "newMatches" : "newAdmirers")) {
        this.logger.warn(`Like push skipped because recipient ${recipientId} disabled ${matched ? "new match" : "new admirer"} notifications.`);
        return;
      }
      const tokens = await activePushTokens(client, recipientId);
      if (!tokens.rowCount) {
        this.logger.warn(`No active push token found for like recipient ${recipientId}.`);
        return;
      }
      const badgeCount = await notificationBadgeCount(client, recipientId);
      const messages: ExpoPushMessage[] = tokens.rows.map((row) => ({
        to: row.token,
        title: matched ? "It's a match on KindredCube" : "Someone liked you on KindredCube",
        body: matched ? "You both liked each other. Open KindredCube to start chatting." : "Open Liked You to see the new activity.",
        sound: "default",
        priority: "high",
        channelId: "likes",
        badge: Math.max(1, badgeCount),
        data: {
          type: matched ? "match" : "like",
          destination: matched ? "chats" : "liked",
          profileId: likerId,
          likerId,
        },
      }));
      await sendExpoPush(messages, this.logger);
      this.logger.log(
        `Queued ${messages.length} like push notification(s) for recipient ${recipientId}; platforms=${summarizePushPlatforms(tokens.rows)}.`,
      );
    });
  }

  async sendScheduledNotification(job: { user_id: string; other_user_id: string | null; kind: string; meeting_started_at: Date | null }): Promise<"sent" | "skipped" | "retry"> {
    return this.database.withUser(job.user_id, async (client) => {
      const user = await client.query("SELECT id FROM users WHERE id = $1 AND status = 'active'", [job.user_id]);
      if (!user.rowCount || await notificationsDisabled(client, job.user_id, job.kind === 'post_meet' ? 'meetingReminders' : 'marketing')) return 'skipped';
      if (job.kind === 'post_meet') {
        const submitted = await client.query("SELECT id FROM post_meet_checks WHERE user_id = $1 AND other_user_id = $2 AND meeting_started_at = $3", [job.user_id, job.other_user_id, job.meeting_started_at]);
        const blocked = await client.query("SELECT 1 FROM user_blocks WHERE (blocker_id = $1::uuid AND blocked_profile_id = $2::text) OR (blocker_id = $2::uuid AND blocked_profile_id = $1::text)", [job.user_id, job.other_user_id]);
        if (submitted.rowCount || blocked.rowCount) return 'skipped';
      } else {
        const inactive = await client.query("SELECT 1 FROM notification_activity WHERE user_id = $1 AND last_active_at <= now() - interval '7 days'", [job.user_id]);
        if (!inactive.rowCount) return 'skipped';
      }
      const tokens = await activePushTokens(client, job.user_id);
      if (!tokens.rowCount) return 'skipped';
      const postMeet = job.kind === 'post_meet';
      const badge = await notificationBadgeCount(client, job.user_id);
      const data: Record<string, string> = { type: postMeet ? 'post_meet' : 'inactivity', destination: postMeet ? 'chat' : 'explore' };
      if (postMeet && job.other_user_id) {
        data.profileId = job.other_user_id;
        data.senderId = job.other_user_id;
      }
      const sent = await sendExpoPush(tokens.rows.map<ExpoPushMessage>((row) => ({
        to: row.token,
        title: postMeet ? "How did your meetup go?" : "Your next connection could be waiting",
        body: postMeet ? "Your scheduled meeting has ended. Complete your private post-meet check." : "Come back to KindredCube and discover someone who shares your values.",
        sound: 'default',
        priority: postMeet ? 'high' : 'normal',
        channelId: 'messages',
        badge: postMeet ? Math.max(1, badge) : badge,
        data,
      })), this.logger);
      return sent ? 'sent' : 'retry';
    });
  }
}

function pushBodyForChatKind(kind: string) {
  if (kind === "gif") return "Sent a GIF.";
  if (kind === "image") return "Sent a photo.";
  if (kind === "audio") return "Sent a voice note.";
  if (kind === "video") return "Sent a video.";
  if (kind === "meeting_proposal") return "Sent a meeting proposal.";
  if (kind === "meeting_response") return "Updated a meeting proposal.";
  return "Open KindredCube to reply.";
}

function summarizePushPlatforms(tokens: Array<{ platform: string }>) {
  const counts = tokens.reduce<Record<string, number>>((next, row) => {
    const platform = row.platform || "unknown";
    next[platform] = (next[platform] || 0) + 1;
    return next;
  }, {});
  return Object.entries(counts)
    .map(([platform, count]) => `${platform}:${count}`)
    .join(",") || "none";
}

async function notificationsDisabled(
  client: PoolClient,
  userId: string,
  key: "newMessages" | "newAdmirers" | "newMatches" | "meetingReminders" | "marketing",
) {
  const preferences = await client.query<{ settings_data: Record<string, unknown> }>(
    `SELECT settings_data
       FROM user_private_spaces
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  const notificationPreferences = preferences.rows[0]?.settings_data?.notificationPreferences;
  return Boolean(
    notificationPreferences &&
      typeof notificationPreferences === "object" &&
      !Array.isArray(notificationPreferences) &&
      (notificationPreferences as Record<string, unknown>)[key] === false,
  );
}

function activePushTokens(client: PoolClient, userId: string) {
  return client.query<{ token: string; platform: string }>(
    `SELECT token, platform
       FROM user_push_tokens
      WHERE user_id = $1
        AND enabled = true
      ORDER BY last_seen_at DESC
      LIMIT 5`,
    [userId],
  );
}

async function notificationBadgeCount(client: PoolClient, userId: string) {
  const result = await client.query<{ count: number }>(
    `WITH unread_messages AS (
       SELECT count(*)::int AS total
         FROM chat_messages
        WHERE recipient_id = $1
          AND read_at IS NULL
          AND unsent_at IS NULL
          AND deleted_for_recipient_at IS NULL
     ),
     pending_likes AS (
       SELECT count(*)::int AS total
         FROM member_likes incoming
        WHERE incoming.liked_user_id = $1
          AND incoming.visible_at <= now()
          AND incoming.chat_started_at IS NULL
          AND NOT EXISTS (
            SELECT 1
              FROM member_likes outgoing
             WHERE outgoing.liker_id = incoming.liked_user_id
               AND outgoing.liked_user_id = incoming.liker_id
               AND outgoing.chat_started_at IS NOT NULL
          )
     )
     SELECT (COALESCE((SELECT total FROM unread_messages), 0)
           + COALESCE((SELECT total FROM pending_likes), 0))::int AS count`,
    [userId],
  );
  return Number(result.rows[0]?.count || 0);
}

async function sendExpoPush(messages: ExpoPushMessage[], logger: Logger): Promise<boolean> {
  if (!messages.length) return false;
  if (messages.length > 1) {
    let accepted = false;
    for (const message of messages) {
      accepted = await sendExpoPush([message], logger) || accepted;
    }
    return accepted;
  }
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages[0]),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    if (!response.ok) {
      logger.warn(`Expo push request failed with ${response.status}: ${body.slice(0, 500)}`);
      return false;
    }
    try {
      const parsed = JSON.parse(body) as { data?: Array<{ status?: string; id?: string; message?: string; details?: unknown }> | { status?: string; id?: string; message?: string; details?: unknown } };
      const receipts = Array.isArray(parsed.data) ? parsed.data : parsed.data ? [parsed.data] : [];
      const failures = receipts.filter((receipt) => receipt.status === "error");
      if (failures.length) logger.warn(`Expo push returned ${failures.length} error(s): ${JSON.stringify(failures).slice(0, 500)}`);
      const ticketIds = receipts
        .map((receipt) => receipt.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (ticketIds.length) {
        logger.log(`Expo push accepted ${ticketIds.length} ticket(s): ${ticketIds.join(",")}`);
        setTimeout(() => {
          fetchExpoReceipts(ticketIds, logger).catch((error) => {
            logger.warn(`Expo push receipt check failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        }, 15_000);
      }
      return ticketIds.length > 0;
    } catch {
      logger.warn(`Expo push returned an unreadable response: ${body.slice(0, 500)}`);
      return false;
    }
  } catch (error) {
    logger.warn(`Expo push delivery threw before completion: ${error instanceof Error ? error.message : String(error)}`);
    // Push delivery should never fail the saved chat message.
    return false;
  }
}

async function fetchExpoReceipts(ticketIds: string[], logger: Logger) {
  if (!ticketIds.length) return;
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: ticketIds }),
  });
  const body = await response.text();
  if (!response.ok) {
    logger.warn(`Expo push receipt request failed with ${response.status}: ${body.slice(0, 500)}`);
    return;
  }
  try {
    const parsed = JSON.parse(body) as { data?: Record<string, { status?: string; message?: string; details?: unknown }> };
    const receipts = parsed.data || {};
    const failures = Object.entries(receipts).filter(([, receipt]) => receipt.status === "error");
    if (failures.length) {
      logger.warn(`Expo push receipt error(s): ${JSON.stringify(Object.fromEntries(failures)).slice(0, 900)}`);
      return;
    }
    logger.log(`Expo push receipt check passed for ${Object.keys(receipts).length} ticket(s).`);
  } catch {
    logger.warn(`Expo push receipt returned unreadable response: ${body.slice(0, 500)}`);
  }
}
