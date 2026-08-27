import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsUUID } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";
import { PushNotificationsService } from "./push-notifications.service";

class CreateMemberLikeInput {
  @IsUUID()
  profileId!: string;

  @IsOptional()
  @IsIn(["connect", "explore", "ready_to_meet"])
  source?: "connect" | "explore" | "ready_to_meet";
}

type IncomingLikeRow = {
  like_id: string;
  liker_id: string;
  source: "connect" | "explore" | "ready_to_meet";
  visible_at: string;
  created_at: string;
  display_name: string;
  gender: "Man" | "Woman" | "Nonbinary";
  seeking: "Women" | "Men" | "Everyone";
  date_of_birth: string;
  culture: string;
  occupation: string;
  matching_data: Record<string, unknown>;
  recently_active_at: string;
  identity_verified: boolean;
  selfie_verified: boolean;
  meetup_verified: boolean;
  recipient_has_plan: boolean;
  matched: boolean;
  match_expires_at: string | null;
  chat_started: boolean;
};

@Controller("v1/likes")
@UseGuards(AccessTokenGuard)
export class MemberLikesController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PushNotificationsService) private readonly push: PushNotificationsService,
  ) {}

  @Post()
  async like(@Req() request: AuthenticatedRequest, @Body() input: CreateMemberLikeInput) {
    const result = await this.database.withUser(request.user.id, async (client) => {
      const candidate = await client.query<{ user_id: string }>(
        `SELECT d.user_id
           FROM discovery_profiles d
           JOIN users u ON u.id = d.user_id
          WHERE d.user_id = $1
            AND d.user_id <> $2
            AND d.visible = true
            AND u.status = 'active'
            AND u.email_verified_at IS NOT NULL`,
        [input.profileId, request.user.id],
      );
      if (!candidate.rows[0]) return { liked: false, reason: "profile_unavailable" };

      const source = input.source || "connect";
      const likeResult = await client.query<{ newly_liked: boolean }>(
        `INSERT INTO member_likes (liker_id, liked_user_id, source, visible_at)
         VALUES ($1, $2, $3, now() + interval '30 days')
         ON CONFLICT (liker_id, liked_user_id) DO UPDATE SET
           source = EXCLUDED.source,
           updated_at = now()
         RETURNING (xmax = 0) AS newly_liked`,
        [request.user.id, input.profileId, source],
      );
      const mutual = await client.query(
        `SELECT 1 FROM member_likes
          WHERE liker_id = $1
            AND liked_user_id = $2
          LIMIT 1`,
        [input.profileId, request.user.id],
      );
      if (mutual.rowCount) {
        await client.query(
          `UPDATE member_likes
              SET matched_at = COALESCE(matched_at, now()),
                  match_expires_at = COALESCE(match_expires_at, now() + interval '7 days'),
                  updated_at = now()
            WHERE (liker_id = $1 AND liked_user_id = $2)
               OR (liker_id = $2 AND liked_user_id = $1)`,
          [request.user.id, input.profileId],
        );
      }

      return {
        liked: true,
        matched: Boolean(mutual.rowCount),
        profileId: input.profileId,
        newlyLiked: Boolean(likeResult.rows[0]?.newly_liked),
        visibleToRecipientAfterDays: 30,
      };
    });
    if (result.liked && result.newlyLiked) {
      this.push.sendLikeNotification(input.profileId, request.user.id, Boolean(result.matched)).catch(() => undefined);
    }
    return result;
  }

  @Get("incoming")
  incoming(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<IncomingLikeRow>(
        `WITH recipient_plan AS (
           SELECT EXISTS (
             SELECT 1 FROM user_entitlements e
              WHERE e.user_id = $1
                AND e.active = true
                AND e.entitlement IN ('premium', 'kindred_pass')
                AND (e.expires_at IS NULL OR e.expires_at > now())
           ) AS has_plan
         )
         SELECT l.id AS like_id,
                l.liker_id,
                l.source,
                l.visible_at,
                l.created_at,
                d.display_name,
                d.gender,
                d.seeking,
                d.date_of_birth,
                d.culture,
                d.occupation,
                d.matching_data,
                d.recently_active_at,
                ${publicStripeVerifiedSql("d.user_id")} AS identity_verified,
                ${publicSelfieVerifiedSql("d.user_id")} AS selfie_verified,
                ${publicMeetupVerifiedSql("d.user_id")} AS meetup_verified,
                (SELECT has_plan FROM recipient_plan) AS recipient_has_plan,
                EXISTS (
                  SELECT 1 FROM member_likes m
                   WHERE m.liker_id = $1
                     AND m.liked_user_id = l.liker_id
                     AND (
                       m.chat_started_at IS NOT NULL
                       OR l.chat_started_at IS NOT NULL
                       OR COALESCE(m.match_expires_at, l.match_expires_at, now() + interval '7 days') > now()
                     )
                ) AS matched,
                l.match_expires_at,
                EXISTS (
                  SELECT 1 FROM chat_messages cm
                   WHERE (cm.sender_id = $1 AND cm.recipient_id = l.liker_id)
                      OR (cm.sender_id = l.liker_id AND cm.recipient_id = $1)
                ) AS chat_started
           FROM member_likes l
           JOIN discovery_profiles d ON d.user_id = l.liker_id
           JOIN users u ON u.id = l.liker_id
           LEFT JOIN user_trust_scores ts ON ts.user_id = l.liker_id
          WHERE l.liked_user_id = $1
            AND d.visible = true
            AND u.status = 'active'
            AND u.email_verified_at IS NOT NULL
            AND (
              l.match_expires_at IS NULL
              OR l.match_expires_at > now()
            )
            AND l.chat_started_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM member_likes m
               WHERE m.liker_id = $1
                 AND m.liked_user_id = l.liker_id
                 AND (
                   m.chat_started_at IS NOT NULL
                   OR l.chat_started_at IS NOT NULL
                   OR COALESCE(m.match_expires_at, l.match_expires_at, now() + interval '30 days') > now()
                 )
            )
            AND NOT EXISTS (
              SELECT 1 FROM chat_messages cm
               WHERE (cm.sender_id = $1 AND cm.recipient_id = l.liker_id)
                  OR (cm.sender_id = l.liker_id AND cm.recipient_id = $1)
            )
            AND NOT EXISTS (
              SELECT 1 FROM user_blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_profile_id = l.liker_id::text)
                  OR (b.blocker_id = l.liker_id AND b.blocked_profile_id = $1::text)
            )
          ORDER BY l.created_at DESC
          LIMIT 50`,
        [request.user.id],
      );

      return {
        likes: result.rows.map((row) => {
          const visible = row.matched || row.recipient_has_plan || new Date(row.visible_at).getTime() <= Date.now();
          const age = ageFromDate(row.date_of_birth);
          const origin = apiOrigin(request);
          const photoVersion = typeof row.matching_data?.photoVersion === "string" ? row.matching_data.photoVersion : "";
          const photoUris = Array.isArray(row.matching_data?.photos)
            ? row.matching_data.photos
                .map((photo) => photo && typeof photo === "object" && "uri" in photo ? (photo as { uri?: unknown }).uri : undefined)
                .map((uri) => publicMediaUri(uri, origin, photoVersion))
                .filter((uri): uri is string => uri.length > 0)
            : [];
          const bestPhotoUri = publicMediaUri(row.matching_data?.bestPhotoUri, origin, photoVersion);
          return {
            id: row.like_id,
            visible,
            matched: row.matched || row.chat_started,
            chatStarted: row.chat_started,
            matchExpiresAt: row.match_expires_at,
            visibleAt: row.visible_at,
            createdAt: row.created_at,
            source: row.source,
            profile: {
              id: row.liker_id,
              name: row.display_name,
              gender: row.gender,
              seeking: row.seeking,
              age,
              culture: row.culture || "Open culture",
              role: row.occupation || "",
              photoUri: bestPhotoUri || photoUris[0],
              photoUris,
              contactVerified: true,
              idVerified: row.identity_verified,
              selfieVerified: row.selfie_verified,
              meetupVerified: row.meetup_verified,
              recentlyActive: Date.now() - new Date(row.recently_active_at).getTime() <= 14 * 24 * 60 * 60 * 1000,
              matching: row.matching_data || {},
            },
          };
        }),
      };
    });
  }
}

function ageFromDate(value: string) {
  const birth = new Date(value);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function publicMediaUri(uri: unknown, origin: string, photoVersion = "") {
  if (typeof uri !== "string") return "";
  const trimmed = uri.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/\/v1\/me\/private-space\/media\/profile-photo\/[0-9a-f-]{36}/i);
  if (match?.[0]) {
    const versionedPath = photoVersion ? `${match[0]}?v=${encodeURIComponent(photoVersion)}` : match[0];
    return `${origin}${versionedPath}`;
  }
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : "";
}

function apiOrigin(request: AuthenticatedRequest) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const protocol = proto || request.protocol || "http";
  return `${protocol}://${host || request.get("host")}`;
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

