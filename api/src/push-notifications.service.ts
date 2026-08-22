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

  async sendMessageNotification(recipientId: string, senderId: string, messageId: string) {
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
      const messages: ExpoPushMessage[] = tokens.rows.map((row) => ({
        to: row.token,
        title: `New message from ${senderName}`,
        body: "Open KindredCube to reply.",
        sound: "default",
        priority: "high",
        channelId: "messages",
        data: {
          type: "chat_message",
          senderId,
          messageId,
        },
      }));
      await sendExpoPush(messages, this.logger);
      this.logger.log(`Queued ${messages.length} message push notification(s) for recipient ${recipientId}.`);
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
      const messages: ExpoPushMessage[] = tokens.rows.map((row) => ({
        to: row.token,
        title: matched ? "It's a match on KindredCube" : "Someone liked you on KindredCube",
        body: matched ? "You both liked each other. Open KindredCube to start chatting." : "Open Liked You to see the new activity.",
        sound: "default",
        priority: "high",
        channelId: "likes",
        data: {
          type: matched ? "match" : "like",
          likerId,
        },
      }));
      await sendExpoPush(messages, this.logger);
      this.logger.log(`Queued ${messages.length} like push notification(s) for recipient ${recipientId}.`);
    });
  }
}

async function notificationsDisabled(
  client: PoolClient,
  userId: string,
  key: "newMessages" | "newAdmirers" | "newMatches",
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
  return client.query<{ token: string }>(
    `SELECT token
       FROM user_push_tokens
      WHERE user_id = $1
        AND enabled = true
      ORDER BY last_seen_at DESC
      LIMIT 5`,
    [userId],
  );
}

async function sendExpoPush(messages: ExpoPushMessage[], logger: Logger) {
  if (!messages.length) return;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
    });
    const body = await response.text();
    if (!response.ok) {
      logger.warn(`Expo push request failed with ${response.status}: ${body.slice(0, 500)}`);
      return;
    }
    try {
      const parsed = JSON.parse(body) as { data?: Array<{ status?: string; message?: string; details?: unknown }> | { status?: string; message?: string; details?: unknown } };
      const receipts = Array.isArray(parsed.data) ? parsed.data : parsed.data ? [parsed.data] : [];
      const failures = receipts.filter((receipt) => receipt.status === "error");
      if (failures.length) logger.warn(`Expo push returned ${failures.length} error(s): ${JSON.stringify(failures).slice(0, 500)}`);
    } catch {
      logger.warn(`Expo push returned an unreadable response: ${body.slice(0, 500)}`);
    }
  } catch (error) {
    logger.warn(`Expo push delivery threw before completion: ${error instanceof Error ? error.message : String(error)}`);
    // Push delivery should never fail the saved chat message.
  }
}
