import { Inject, Injectable } from "@nestjs/common";
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
      return { registered: true };
    });
  }

  async sendMessageNotification(recipientId: string, senderId: string, messageId: string) {
    await this.database.withUser(recipientId, async (client) => {
      const preferences = await client.query<{ settings_data: Record<string, unknown> }>(
        `SELECT settings_data
           FROM user_private_spaces
          WHERE user_id = $1
          LIMIT 1`,
        [recipientId],
      );
      const notificationPreferences = preferences.rows[0]?.settings_data?.notificationPreferences;
      if (
        notificationPreferences &&
        typeof notificationPreferences === "object" &&
        !Array.isArray(notificationPreferences) &&
        (notificationPreferences as Record<string, unknown>).newMessages === false
      ) {
        return;
      }
      const tokens = await client.query<{ token: string }>(
        `SELECT token
           FROM user_push_tokens
          WHERE user_id = $1
            AND enabled = true
          ORDER BY last_seen_at DESC
          LIMIT 5`,
        [recipientId],
      );
      if (!tokens.rowCount) return;
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
      await sendExpoPush(messages);
    });
  }
}

async function sendExpoPush(messages: ExpoPushMessage[]) {
  if (!messages.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
    });
  } catch {
    // Push delivery should never fail the saved chat message.
  }
}
