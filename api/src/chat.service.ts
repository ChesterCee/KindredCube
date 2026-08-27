import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";

export type ChatContentKind = "text" | "gif" | "image" | "audio" | "video" | "meeting_proposal" | "meeting_response";

type MeetingProposalPayload = {
  venue: string;
  scheduledAt: number;
  durationMinutes: number;
  latitude: number;
  longitude: number;
};

export type ChatPayload = {
  text?: string;
  gifUrl?: string;
  gifPreviewUrl?: string;
  gifTitle?: string;
  imageUri?: string;
  videoUri?: string;
  fileSizeBytes?: number;
  audioUri?: string;
  durationMillis?: number;
  reactions?: Record<string, string>;
  meetingProposal?: MeetingProposalPayload;
  meetingResponse?: {
    status: "accepted" | "declined";
    proposal: MeetingProposalPayload;
  };
};

export type ChatMessageResponse = {
  id: string;
  senderId: string;
  recipientId: string;
  kind: ChatContentKind;
  createdAt: string;
  editedAt?: string;
  unsentAt?: string;
  text?: string;
  gifUrl?: string;
  gifPreviewUrl?: string;
  gifTitle?: string;
  imageUri?: string;
  videoUri?: string;
  fileSizeBytes?: number;
  audioUri?: string;
  durationMillis?: number;
  meetingProposal?: MeetingProposalPayload;
  meetingResponse?: {
    status: "accepted" | "declined";
    proposal: MeetingProposalPayload;
  };
};

export type ChatConversationResponse = {
  profile: {
    id: string;
    name: string;
    gender: "Man" | "Woman" | "Nonbinary";
    seeking: "Women" | "Men" | "Everyone";
    age: number;
    culture: string;
    role: string;
    photoUri?: string;
    photoUris: string[];
    contactVerified: boolean;
    idVerified: boolean;
    selfieVerified: boolean;
    meetupVerified: boolean;
    recentlyActive: boolean;
    matching: Record<string, unknown>;
  };
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageSenderId?: string;
};

type ChatMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content_kind: ChatContentKind;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  reaction_data: Record<string, string> | null;
  created_at: string;
  edited_at: string | null;
  unsent_at: string | null;
};

type ChatConversationRow = {
  other_user_id: string;
  last_message_at: string;
  display_name: string;
  gender: "Man" | "Woman" | "Nonbinary";
  seeking: "Women" | "Men" | "Everyone";
  date_of_birth: string;
  culture: string | null;
  occupation: string | null;
  matching_data: Record<string, unknown> | null;
  recently_active_at: string;
  identity_verified: boolean;
  selfie_verified: boolean;
  meetup_verified: boolean;
  last_content_kind: ChatContentKind | null;
  last_sender_id: string | null;
  last_ciphertext: string | null;
  last_iv: string | null;
  last_auth_tag: string | null;
};

@Injectable()
export class ChatService {
  private readonly encryptionKey: Buffer;
  private readonly hashKey: string;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {
    const secret = process.env.CHAT_ENCRYPTION_SECRET || process.env.SESSION_TOKEN_PEPPER || "";
    if (secret.length < 32) throw new Error("CHAT_ENCRYPTION_SECRET or SESSION_TOKEN_PEPPER must be at least 32 characters");
    this.encryptionKey = createHash("sha256").update(secret).digest();
    this.hashKey = secret;
  }

  async listConversations(userId: string) {
    return this.database.withUser(userId, async (client) => {
      const result = await client.query<ChatConversationRow>(
        `WITH message_pairs AS (
           SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_user_id,
                  created_at AS last_message_at
             FROM chat_messages
            WHERE (sender_id = $1 OR recipient_id = $1)
              AND created_at >= now() - interval '3 months'
         ),
         active_matches AS (
           SELECT CASE WHEN l.liker_id = $1 THEN l.liked_user_id ELSE l.liker_id END AS other_user_id,
                  GREATEST(
                    COALESCE(l.chat_started_at, 'epoch'::timestamptz),
                    COALESCE(r.chat_started_at, 'epoch'::timestamptz),
                    COALESCE(l.matched_at, 'epoch'::timestamptz),
                    COALESCE(r.matched_at, 'epoch'::timestamptz),
                    COALESCE(l.updated_at, 'epoch'::timestamptz),
                    COALESCE(r.updated_at, 'epoch'::timestamptz),
                    l.created_at,
                    r.created_at
                  ) AS last_message_at
             FROM member_likes l
             JOIN member_likes r
               ON r.liker_id = l.liked_user_id
              AND r.liked_user_id = l.liker_id
            WHERE (l.liker_id = $1 OR l.liked_user_id = $1)
              AND (
                l.chat_started_at IS NOT NULL
                OR r.chat_started_at IS NOT NULL
                OR COALESCE(l.match_expires_at, r.match_expires_at, now() + interval '7 days') > now()
              )
         ),
         latest AS (
           SELECT DISTINCT ON (other_user_id) other_user_id, last_message_at
             FROM (
               SELECT other_user_id, last_message_at FROM message_pairs
               UNION ALL
               SELECT other_user_id, last_message_at FROM active_matches
             ) conversations
            WHERE last_message_at >= now() - interval '3 months'
            ORDER BY other_user_id, last_message_at DESC
         )
         SELECT latest.other_user_id,
                latest.last_message_at,
                d.display_name,
                d.gender,
                d.seeking,
                d.date_of_birth,
                d.culture,
                d.occupation,
                d.matching_data,
                d.recently_active_at,
                ${publicMeetupVerifiedSql("d.user_id")} AS meetup_verified,
                last_message.content_kind AS last_content_kind,
                last_message.sender_id AS last_sender_id,
                last_message.ciphertext AS last_ciphertext,
                last_message.iv AS last_iv,
                last_message.auth_tag AS last_auth_tag,
                ${publicStripeVerifiedSql("d.user_id")} AS identity_verified,
                ${publicSelfieVerifiedSql("d.user_id")} AS selfie_verified
           FROM latest
           JOIN users u ON u.id = latest.other_user_id
           JOIN discovery_profiles d ON d.user_id = latest.other_user_id
           LEFT JOIN user_trust_scores ts ON ts.user_id = latest.other_user_id
           LEFT JOIN LATERAL (
             SELECT sender_id, content_kind, ciphertext, iv, auth_tag
               FROM chat_messages cm
              WHERE (
                    (cm.sender_id = $1 AND cm.recipient_id = latest.other_user_id)
                 OR (cm.sender_id = latest.other_user_id AND cm.recipient_id = $1)
              )
                AND (
                  (cm.sender_id = $1 AND cm.deleted_for_sender_at IS NULL)
                  OR (cm.recipient_id = $1 AND cm.deleted_for_recipient_at IS NULL)
                )
              ORDER BY cm.created_at DESC
              LIMIT 1
           ) last_message ON true
          WHERE u.status = 'active'
            AND u.email_verified_at IS NOT NULL
            AND d.visible = true
            AND NOT EXISTS (
              SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_profile_id = latest.other_user_id::text)
                  OR (b.blocker_id = latest.other_user_id AND b.blocked_profile_id = $1::text)
            )
          ORDER BY latest.last_message_at DESC
          LIMIT 50`,
        [userId],
      );
      return { conversations: result.rows.map((row) => this.toConversationResponse(row)) };
    });
  }

  async listMessages(userId: string, otherUserId: string) {
    if (!isUuid(otherUserId) || otherUserId === userId) throw new BadRequestException("A valid chat member is required.");
    return this.database.withUser(userId, async (client) => {
      await this.assertCanChat(client, userId, otherUserId);
      const result = await client.query<ChatMessageRow>(
        `SELECT id, sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, reaction_data, created_at, edited_at, unsent_at
           FROM chat_messages
          WHERE (
              (sender_id = $1 AND recipient_id = $2 AND deleted_for_sender_at IS NULL)
              OR (sender_id = $2 AND recipient_id = $1 AND deleted_for_recipient_at IS NULL)
            )
          ORDER BY created_at ASC
          LIMIT 100`,
        [userId, otherUserId],
      );
      await client.query(
        `UPDATE chat_messages
            SET read_at = COALESCE(read_at, now())
          WHERE sender_id = $2
            AND recipient_id = $1
            AND read_at IS NULL`,
        [userId, otherUserId],
      );
      return { messages: result.rows.map((row) => this.toResponse(row)) };
    });
  }

  async sendMessage(userId: string, recipientId: string, kind: ChatContentKind, payload: ChatPayload) {
    if (!isUuid(recipientId) || recipientId === userId) throw new BadRequestException("A valid recipient is required.");
    const normalized = normalizePayload(kind, payload);
    return this.database.withUser(userId, async (client) => {
      await this.assertCanChat(client, userId, recipientId);
      const encrypted = this.encrypt(normalized);
      const result = await client.query<ChatMessageRow>(
        `INSERT INTO chat_messages
          (sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, reaction_data, created_at, edited_at, unsent_at`,
        [
          userId,
          recipientId,
          kind,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          encrypted.contentHash,
        ],
      );
      await client.query(
        `UPDATE member_likes
            SET chat_started_at = COALESCE(chat_started_at, now()),
                updated_at = now()
          WHERE (liker_id = $1 AND liked_user_id = $2)
             OR (liker_id = $2 AND liked_user_id = $1)`,
        [userId, recipientId],
      );
      return this.toResponse(result.rows[0]!);
    });
  }

  async editMessage(userId: string, messageId: string, text: string) {
    if (!isUuid(messageId)) throw new BadRequestException("A valid message is required.");
    const normalized = normalizePayload("text", { text });
    return this.database.withUser(userId, async (client) => {
      const current = await client.query<ChatMessageRow>(
        `SELECT id, sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, reaction_data, created_at, edited_at, unsent_at
           FROM chat_messages
          WHERE id = $1 AND sender_id = $2 AND unsent_at IS NULL`,
        [messageId, userId],
      );
      const row = current.rows[0];
      if (!row) throw new ForbiddenException("This message cannot be edited.");
      if (row.content_kind !== "text") throw new BadRequestException("Only text messages can be edited.");
      const encrypted = this.encrypt(normalized);
      const result = await client.query<ChatMessageRow>(
        `UPDATE chat_messages
            SET ciphertext = $3,
                iv = $4,
                auth_tag = $5,
                content_hash = $6,
                edited_at = now()
          WHERE id = $1 AND sender_id = $2
          RETURNING id, sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, reaction_data, created_at, edited_at, unsent_at`,
        [messageId, userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.contentHash],
      );
      return this.toResponse(result.rows[0]!);
    });
  }

  async unsendMessage(userId: string, messageId: string) {
    if (!isUuid(messageId)) throw new BadRequestException("A valid message is required.");
    return this.database.withUser(userId, async (client) => {
      const encrypted = this.encrypt({ text: "Message unsent" });
      const result = await client.query<ChatMessageRow>(
        `UPDATE chat_messages
            SET content_kind = 'text',
                ciphertext = $3,
                iv = $4,
                auth_tag = $5,
                content_hash = $6,
                unsent_at = now()
          WHERE id = $1 AND sender_id = $2 AND unsent_at IS NULL
          RETURNING id, sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, reaction_data, created_at, edited_at, unsent_at`,
        [messageId, userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.contentHash],
      );
      if (!result.rows[0]) throw new ForbiddenException("This message cannot be unsent.");
      return this.toResponse(result.rows[0]!);
    });
  }

  async reactToMessage(userId: string, messageId: string, emoji: string) {
    if (!isUuid(messageId)) throw new BadRequestException("A valid message is required.");
    const normalizedEmoji = normalizeReactionEmoji(emoji);
    return this.database.withUser(userId, async (client) => {
      const result = await client.query<ChatMessageRow>(
        `UPDATE chat_messages
            SET reaction_data = COALESCE(reaction_data, '{}'::jsonb) || jsonb_build_object($2::text, $3::text)
          WHERE id = $1
            AND unsent_at IS NULL
            AND (sender_id = $2 OR recipient_id = $2)
          RETURNING id, sender_id, recipient_id, content_kind, ciphertext, iv, auth_tag, reaction_data, created_at, edited_at, unsent_at`,
        [messageId, userId, normalizedEmoji],
      );
      if (!result.rows[0]) throw new ForbiddenException("This message cannot be reacted to.");
      return this.toResponse(result.rows[0]!);
    });
  }

  async deleteMessageForMe(userId: string, messageId: string) {
    if (!isUuid(messageId)) throw new BadRequestException("A valid message is required.");
    return this.database.withUser(userId, async (client) => {
      const result = await client.query(
        `UPDATE chat_messages
            SET deleted_for_sender_at = CASE WHEN sender_id = $2 THEN now() ELSE deleted_for_sender_at END,
                deleted_for_recipient_at = CASE WHEN recipient_id = $2 THEN now() ELSE deleted_for_recipient_at END
          WHERE id = $1
            AND (sender_id = $2 OR recipient_id = $2)`,
        [messageId, userId],
      );
      if (!result.rowCount) throw new ForbiddenException("This message cannot be deleted.");
      return { deleted: true };
    });
  }

  private async assertCanChat(client: PoolClient, userId: string, otherUserId: string) {
    const result = await client.query(
      `WITH other_account AS (
         SELECT 1
           FROM users u
           JOIN discovery_profiles d ON d.user_id = u.id
          WHERE u.id = $2
            AND u.status = 'active'
            AND u.email_verified_at IS NOT NULL
            AND d.visible = true
       ),
       blocked AS (
         SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = $1 AND b.blocked_profile_id = $2::text)
             OR (b.blocker_id = $2 AND b.blocked_profile_id = $1::text)
       ),
       mutual_like AS (
         SELECT 1 FROM member_likes a
          JOIN member_likes b
            ON b.liker_id = a.liked_user_id
           AND b.liked_user_id = a.liker_id
          WHERE a.liker_id = $1
            AND a.liked_user_id = $2
            AND (
              a.chat_started_at IS NOT NULL
              OR b.chat_started_at IS NOT NULL
              OR COALESCE(a.match_expires_at, b.match_expires_at, now() + interval '7 days') > now()
            )
       ),
       active_plan AS (
         SELECT 1 FROM user_entitlements e
          WHERE e.user_id = $1
            AND e.active = true
            AND e.entitlement IN ('premium', 'kindred_pass')
            AND (e.expires_at IS NULL OR e.expires_at > now())
       ),
       ready_meet_wallet AS (
         SELECT 1 FROM wallet_ledger w
          WHERE w.user_id = $1
            AND w.entry_type = 'ready_to_meet_chat'
       )
       SELECT
         EXISTS (SELECT 1 FROM other_account) AS other_exists,
         EXISTS (SELECT 1 FROM blocked) AS blocked,
         EXISTS (SELECT 1 FROM mutual_like) AS mutual_like,
         EXISTS (SELECT 1 FROM active_plan) AS active_plan,
         EXISTS (SELECT 1 FROM ready_meet_wallet) AS ready_meet_wallet`,
      [userId, otherUserId],
    );
    const row = result.rows[0] as {
      other_exists: boolean;
      blocked: boolean;
      mutual_like: boolean;
      active_plan: boolean;
      ready_meet_wallet: boolean;
    };
    if (!row?.other_exists) throw new ForbiddenException("This profile is not available for chat.");
    if (row.blocked) throw new ForbiddenException("This chat is not available.");
    if (!row.mutual_like && !row.active_plan && !row.ready_meet_wallet) {
      throw new ForbiddenException("Chat opens after a mutual match or an active chat entitlement.");
    }
  }

  private encrypt(payload: ChatPayload) {
    const iv = randomBytes(12);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      contentHash: createHmac("sha256", this.hashKey).update(plaintext).digest("hex"),
    };
  }

  private decrypt(row: ChatMessageRow) {
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(row.iv, "base64"));
    decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as ChatPayload;
  }

  private toResponse(row: ChatMessageRow): ChatMessageResponse {
    const payload = this.decrypt(row);
    return {
      id: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      kind: row.content_kind,
      createdAt: row.created_at,
      editedAt: row.edited_at || undefined,
      unsentAt: row.unsent_at || undefined,
      reactions: row.reaction_data || {},
      ...payload,
    };
  }

  private toConversationResponse(row: ChatConversationRow): ChatConversationResponse {
    const matching = activeMatchingData(row.matching_data || {});
    const photoVersion = typeof matching.photoVersion === "string" ? matching.photoVersion : "";
    const photoUris = Array.isArray(matching.photos)
      ? matching.photos
          .map((photo) => photo && typeof photo === "object" && "uri" in photo ? (photo as { uri?: unknown }).uri : undefined)
          .map((uri) => publicMediaUri(uri, photoVersion))
          .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0)
      : [];
    const bestPhotoUri = publicMediaUri(matching.bestPhotoUri, photoVersion);
    return {
      profile: {
        id: row.other_user_id,
        name: row.display_name,
        gender: row.gender,
        seeking: row.seeking,
        age: ageFromDate(row.date_of_birth),
        culture: row.culture || "Open culture",
        role: row.occupation || "",
        photoUri: bestPhotoUri || photoUris[0],
        photoUris,
        contactVerified: true,
        idVerified: row.identity_verified,
        selfieVerified: row.selfie_verified,
        meetupVerified: row.meetup_verified,
        recentlyActive: Date.now() - new Date(row.recently_active_at).getTime() <= 14 * 24 * 60 * 60 * 1000,
        matching,
      },
      lastMessageAt: row.last_message_at,
      lastMessagePreview: this.conversationPreview(row),
      lastMessageSenderId: row.last_sender_id || undefined,
    };
  }

  private conversationPreview(row: ChatConversationRow) {
    if (!row.last_content_kind || !row.last_ciphertext || !row.last_iv || !row.last_auth_tag) {
      return "You matched. Start the conversation.";
    }
    try {
      const payload = this.decrypt({
        id: "preview",
        sender_id: row.other_user_id,
        recipient_id: row.other_user_id,
        content_kind: row.last_content_kind,
        ciphertext: row.last_ciphertext,
        iv: row.last_iv,
        auth_tag: row.last_auth_tag,
        reaction_data: null,
        created_at: row.last_message_at,
        edited_at: null,
        unsent_at: null,
      });
      if (row.last_content_kind === "text" && payload.text) return payload.text.slice(0, 140);
      if (row.last_content_kind === "gif") return payload.gifTitle ? `GIF: ${payload.gifTitle}` : "Sent a GIF";
      if (row.last_content_kind === "image") return "Sent a photo";
      if (row.last_content_kind === "video") return "Sent a video";
      if (row.last_content_kind === "audio") return "Sent a voice note";
      if (row.last_content_kind === "meeting_proposal") return "Sent a meeting proposal";
      if (row.last_content_kind === "meeting_response") return payload.meetingResponse?.status === "accepted" ? "Accepted the meeting proposal" : "Declined the meeting proposal";
    } catch {
      return "New message";
    }
    return "New message";
  }
}

function activeMatchingData(matching: Record<string, unknown>): Record<string, unknown> {
  const readyToMeet = matching.readyToMeet === true
    && typeof matching.readyToMeetAt === "string"
    && typeof matching.readyToMeetExpiresAt === "string"
    && new Date(matching.readyToMeetAt).getTime() <= Date.now()
    && new Date(matching.readyToMeetExpiresAt).getTime() > Date.now();
  return { ...matching, readyToMeet };
}

function publicMediaUri(uri: unknown, photoVersion = "") {
  if (typeof uri !== "string") return "";
  const trimmed = uri.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/v1\/me\/private-space\/media\/profile-photo\/[0-9a-f-]{36}/i);
  if (match?.[0]) {
    const origin = (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
    const versionedPath = photoVersion ? `${match[0]}?v=${encodeURIComponent(photoVersion)}` : match[0];
    return origin ? `${origin}${versionedPath}` : versionedPath;
  }
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : "";
}

function ageFromDate(value: string) {
  const birth = new Date(value);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function normalizePayload(kind: ChatContentKind, payload: ChatPayload) {
  if (kind === "text") {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text || text.length > 2000) throw new BadRequestException("Message must be between 1 and 2,000 characters.");
    return { text };
  }
  if (kind === "gif") {
    const gifUrl = typeof payload.gifUrl === "string" ? payload.gifUrl.trim() : "";
    const gifPreviewUrl = typeof payload.gifPreviewUrl === "string" ? payload.gifPreviewUrl.trim() : "";
    if (!/^https:\/\//.test(gifUrl)) throw new BadRequestException("Choose a valid GIF.");
    return {
      gifUrl,
      ...(gifPreviewUrl && /^https:\/\//.test(gifPreviewUrl) ? { gifPreviewUrl } : {}),
      gifTitle: typeof payload.gifTitle === "string" ? payload.gifTitle.slice(0, 160) : "GIF",
    };
  }
  if (kind === "image") {
    const imageUri = typeof payload.imageUri === "string" ? payload.imageUri.trim() : "";
    if (!imageUri || imageUri.length > 2000) throw new BadRequestException("Choose a valid image.");
    const fileSizeBytes = boundedFileSize(payload.fileSizeBytes, 10 * 1024 * 1024, "Photos must be 10 MB or less.");
    return { imageUri, fileSizeBytes };
  }
  if (kind === "video") {
    const videoUri = typeof payload.videoUri === "string" ? payload.videoUri.trim() : "";
    if (!videoUri || videoUri.length > 2000) throw new BadRequestException("Choose a valid video.");
    const fileSizeBytes = boundedFileSize(payload.fileSizeBytes, 50 * 1024 * 1024, "Videos must be 50 MB or less.");
    return { videoUri, fileSizeBytes };
  }
  if (kind === "audio") {
    const audioUri = typeof payload.audioUri === "string" ? payload.audioUri.trim() : "";
    if (!audioUri || audioUri.length > 2000) throw new BadRequestException("Choose a valid voice note.");
    return {
      audioUri,
      durationMillis: typeof payload.durationMillis === "number" ? Math.max(0, Math.round(payload.durationMillis)) : 0,
    };
  }
  if (kind === "meeting_proposal") {
    return { meetingProposal: normalizeMeetingProposal(payload.meetingProposal) };
  }
  if (kind === "meeting_response") {
    const status = payload.meetingResponse?.status;
    if (status !== "accepted" && status !== "declined") throw new BadRequestException("Choose accept or decline.");
    return {
      meetingResponse: {
        status,
        proposal: normalizeMeetingProposal(payload.meetingResponse?.proposal),
      },
    };
  }
  throw new BadRequestException("Unsupported message type.");
}

function normalizeMeetingProposal(value: ChatPayload["meetingProposal"]) {
  const venue = typeof value?.venue === "string" ? value.venue.trim() : "";
  const scheduledAt = Number(value?.scheduledAt);
  const durationMinutes = Number(value?.durationMinutes);
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!venue || venue.length > 500) throw new BadRequestException("Choose a valid public meeting place.");
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) throw new BadRequestException("Choose a future meeting time.");
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 360) throw new BadRequestException("Choose a valid meeting duration.");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new BadRequestException("Choose a valid map location.");
  }
  return {
    venue: venue.slice(0, 500),
    scheduledAt: Math.round(scheduledAt),
    durationMinutes: Math.round(durationMinutes),
    latitude,
    longitude,
  };
}

function boundedFileSize(value: unknown, maximum: number, message: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (numeric > maximum) throw new BadRequestException(message);
  return Math.round(numeric);
}

const allowedReactionEmojis = new Set(["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F61F}", "\u{1F64F}", "\u{1F525}"]);

function normalizeReactionEmoji(value: string) {
  const emoji = typeof value === "string" ? value.trim() : "";
  if (!allowedReactionEmojis.has(emoji)) throw new BadRequestException("Choose a valid reaction.");
  return emoji;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicMeetupVerifiedSql(userExpression: string) {
  return `(COALESCE(ts.meetup_verified, false) OR EXISTS (
    SELECT 1
      FROM post_meet_checks pm
     WHERE pm.other_user_id = ${userExpression}
       AND COALESCE(pm.safety_concern, false) = false
       AND COALESCE(pm.trust_score, 0) >= 2.5
       AND EXISTS (
         SELECT 1
           FROM post_meet_checks reciprocal
          WHERE reciprocal.user_id = ${userExpression}
            AND reciprocal.other_user_id = pm.user_id
            AND reciprocal.meeting_started_at BETWEEN pm.meeting_started_at - interval '36 hours'
                                                  AND pm.meeting_started_at + interval '36 hours'
       )
  ))`;
}

function publicStripeVerifiedSql(userExpression: string) {
  return `public_identity_verified(${userExpression})`;
}

function publicSelfieVerifiedSql(userExpression: string) {
  return `public_selfie_verified(${userExpression})`;
}

