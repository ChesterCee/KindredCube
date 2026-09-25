import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Param, Patch, Post, Req, Res, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { Response } from "express";
import sharp from "sharp";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";
import { PushNotificationsService } from "./push-notifications.service";

class CreateConstellationInput {
  @IsString() @MinLength(2) @MaxLength(40) name!: string;
  @IsString() @MaxLength(240) description!: string;
  @IsBoolean() requiresApproval!: boolean;
  @IsOptional() @IsString() imageBase64?: string;
  @IsOptional() @IsIn(["image/jpeg", "image/png", "image/webp"]) mimeType?: string;
  @IsOptional() @IsIn(["community", "moderated_match"]) experienceType?: "community" | "moderated_match";
  @IsOptional() @IsIn(["ai", "human"]) moderatorType?: "ai" | "human";
  @IsOptional() @IsIn(["Man", "Woman", "Nonbinary"]) featuredGender?: "Man" | "Woman" | "Nonbinary";
  @IsOptional() @IsIn(["Men", "Women", "Everyone"]) audienceGender?: "Men" | "Women" | "Everyone";
  @IsOptional() @IsNumber() @Min(-90) @Max(90) originLatitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) originLongitude?: number;
  @IsOptional() @IsString() @MaxLength(120) originCity?: string;
  @IsOptional() @IsString() @MaxLength(120) originCountry?: string;
}

class UpdateConstellationPitchInput {
  @IsString() @MaxLength(800) pitchAbout!: string;
  @IsString() @MaxLength(800) pitchLookingFor!: string;
}

class BalloonDecisionInput {
  @IsIn(["inflate", "pop_self", "pop_other"]) action!: "inflate" | "pop_self" | "pop_other";
  @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsIn(["children", "distance", "work_lifestyle", "family_goals", "values", "attraction", "communication", "other"]) reasonCode?: string;
  @IsOptional() @IsString() @MaxLength(500) privateNote?: string;
}

class MatchVoteInput { @IsIn(["yes", "not_yet", "no"]) vote!: "yes" | "not_yet" | "no"; }
class NextModeratorQuestionInput { @IsOptional() @IsString() @MaxLength(500) question?: string; }

class GenerateConstellationCoverInput {
  @IsString() @MinLength(2) @MaxLength(40) name!: string;
}

class SendConstellationRoomMessageInput {
  @IsOptional() @IsString() @MaxLength(1000) text?: string;
  @IsOptional() @IsString() imageBase64?: string;
  @IsOptional() @IsIn(["image/jpeg", "image/png", "image/webp"]) mimeType?: string;
}

class EditConstellationRoomMessageInput {
  @IsString() @MaxLength(1000) text!: string;
}

class ReportConstellationRoomMessageInput {
  @IsString() @MaxLength(500) details!: string;
}

class ConstellationRoomMessageBalloonInput {
  @IsIn(["inflate", "pop"]) action!: "inflate" | "pop";
  @IsOptional() @IsIn(["children", "distance", "work_lifestyle", "family_goals", "values", "attraction", "communication", "other"]) reasonCode?: string;
  @IsOptional() @IsString() @MaxLength(500) privateNote?: string;
}

class ConstellationBalloonAuthorDecisionInput {
  @IsIn(["accepted", "popped"]) decision!: "accepted" | "popped";
}

type ConstellationRow = {
  id: string; creator_id: string; name: string; description: string; requires_approval: boolean;
  published_at: string | null; created_at: string; member_count: string; membership_status: string | null;
  origin_city: string | null; origin_country: string | null; origin_latitude: number | null; origin_longitude: number | null;
  experience_type: "community" | "moderated_match"; moderator_type: "ai" | "human";
  featured_gender: "Man" | "Woman" | "Nonbinary"; audience_gender: "Men" | "Women" | "Everyone";
  pitch_about: string; pitch_looking_for: string;
};

@Controller("v1/constellations")
export class ConstellationsController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PushNotificationsService) private readonly pushNotifications: PushNotificationsService,
  ) {}

  @Get("rooms/:roomKey/members")
  @UseGuards(AccessTokenGuard)
  async roomMembers(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string) {
    const result = await this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      return client.query<{ user_id: string; display_name: string; gender: string; date_of_birth: string; culture: string | null; occupation: string | null; matching_data: Record<string, unknown> | null }>(
      `WITH audience AS (
         SELECT $2::uuid AS user_id
         UNION SELECT sender_id FROM constellation_room_messages WHERE room_key = $1 AND NOT is_host_message
         UNION SELECT reaction.user_id FROM constellation_room_message_balloons reaction JOIN constellation_room_messages message ON message.id = reaction.message_id WHERE message.room_key = $1 AND reaction.balloon_active
         UNION SELECT participant.user_id FROM constellation_room_participants participant WHERE participant.room_key = $1
         UNION SELECT member.user_id FROM constellation_members member WHERE member.constellation_id::text = $1 AND member.status IN ('accepted', 'suggested')
       )
       SELECT profile.user_id, profile.display_name, profile.gender, profile.date_of_birth::text, profile.culture, profile.occupation, profile.matching_data
         FROM audience
         JOIN discovery_profiles profile ON profile.user_id = audience.user_id
         JOIN users account ON account.id = audience.user_id
        WHERE account.status = 'active' AND account.email_verified_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_blocks block
             WHERE (block.blocker_id = $2 AND block.blocked_profile_id = profile.user_id::text)
                OR (block.blocker_id = profile.user_id AND block.blocked_profile_id = $2::text)
          )
        ORDER BY profile.display_name`,
      [roomKey, request.user.id],
      );
    });
    const host = request.get("x-forwarded-host") || request.get("host") || "api.kindredcube.com";
    const proto = request.get("x-forwarded-proto") || "https";
    const origin = `${proto}://${host}`;
    return { members: result.rows.map((row) => ({ id: row.user_id, name: row.display_name, gender: row.gender, age: constellationAge(row.date_of_birth), culture: row.culture || "Kindred", role: row.occupation || "", photoUri: constellationProfilePhotoUri(row.matching_data, origin) })) };
  }

  @Get("rooms/:roomKey/messages")
  @UseGuards(AccessTokenGuard)
  async roomMessages(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      await client.query(`INSERT INTO constellation_room_participants (room_key, user_id) VALUES ($1, $2) ON CONFLICT (room_key, user_id) DO UPDATE SET last_visited_at = now()`, [roomKey, request.user.id]);
      const result = await client.query<{ id: string; sender_id: string; display_name: string; message_text: string; created_at: string; edited_at: string | null; balloon_count: string; balloon_pumps: string; viewer_balloon_active: boolean | null; viewer_inflation_count: number | null; reactors: Array<{ userId: string; name: string; inflationCount: number; authorDecision: "accepted" | "popped" | null }>; has_image: boolean; is_host_message: boolean; date_of_birth: string | null; culture: string | null; occupation: string | null; matching_data: Record<string, unknown> | null }>(
        `SELECT message.id, message.sender_id, COALESCE(profile.display_name, 'Kindred') AS display_name,
                message.message_text, message.created_at, message.edited_at, message.is_host_message, (message.image_data IS NOT NULL) AS has_image,
                profile.date_of_birth::text, profile.culture, profile.occupation, profile.matching_data,
                count(reaction.user_id) FILTER (WHERE reaction.balloon_active)::text AS balloon_count,
                COALESCE(sum(reaction.inflation_count) FILTER (WHERE reaction.balloon_active), 0)::text AS balloon_pumps,
                bool_or(reaction.balloon_active) FILTER (WHERE reaction.user_id = $2) AS viewer_balloon_active,
                max(reaction.inflation_count) FILTER (WHERE reaction.user_id = $2) AS viewer_inflation_count,
                COALESCE(
                  jsonb_agg(DISTINCT jsonb_build_object(
                    'userId', reaction.user_id,
                    'name', COALESCE(reactor_profile.display_name, 'Kindred'),
                    'inflationCount', reaction.inflation_count,
                    'authorDecision', reaction.author_decision
                  )) FILTER (WHERE reaction.balloon_active),
                  '[]'::jsonb
                ) AS reactors
           FROM constellation_room_messages message
           LEFT JOIN discovery_profiles profile ON profile.user_id = message.sender_id
           LEFT JOIN constellation_room_message_balloons reaction ON reaction.message_id = message.id
           LEFT JOIN discovery_profiles reactor_profile ON reactor_profile.user_id = reaction.user_id
          WHERE message.room_key = $1
            AND (message.is_host_message OR NOT EXISTS (
              SELECT 1 FROM user_blocks block
               WHERE (block.blocker_id = $2 AND block.blocked_profile_id = message.sender_id::text)
                  OR (block.blocker_id = message.sender_id AND block.blocked_profile_id = $2::text)
            ))
          GROUP BY message.id, profile.display_name, profile.date_of_birth, profile.culture, profile.occupation, profile.matching_data
          ORDER BY message.created_at DESC LIMIT 100`,
        [roomKey, request.user.id],
      );
      const host = request.get("x-forwarded-host") || request.get("host") || "api.kindredcube.com";
      const proto = request.get("x-forwarded-proto") || "https";
      const origin = `${proto}://${host}`;
      return { messages: result.rows.reverse().map((row) => ({ id: row.id, senderId: row.is_host_message ? "amara" : row.sender_id, senderName: row.is_host_message ? "Amara" : row.display_name, senderPhotoUri: row.is_host_message ? undefined : constellationProfilePhotoUri(row.matching_data, origin), senderAge: row.date_of_birth ? constellationAge(row.date_of_birth) : undefined, senderCulture: row.culture || undefined, senderRole: row.occupation || undefined, text: row.message_text, createdAt: row.created_at, editedAt: row.edited_at || undefined, own: !row.is_host_message && row.sender_id === request.user.id, host: row.is_host_message, balloonCount: Number(row.balloon_count || 0), balloonPumps: Number(row.balloon_pumps || 0), viewerBalloonActive: row.viewer_balloon_active, viewerInflationCount: Number(row.viewer_inflation_count || 0), reactors: !row.is_host_message && row.sender_id === request.user.id && Array.isArray(row.reactors) ? row.reactors : [], imageUri: row.has_image ? `${origin}/v1/constellations/rooms/${encodeURIComponent(roomKey)}/messages/${row.id}/image` : undefined })) };
    });
  }

  @Patch("rooms/:roomKey/messages/:messageId")
  @UseGuards(AccessTokenGuard)
  async editRoomMessage(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Param("messageId") messageId: string, @Body() input: EditConstellationRoomMessageInput) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const text = input.text.trim();
      const result = await client.query<{ edited_at: string }>(
        `UPDATE constellation_room_messages
            SET message_text = $4, edited_at = now()
          WHERE id = $1 AND room_key = $2 AND sender_id = $3 AND NOT is_host_message
            AND ($4 <> '' OR image_data IS NOT NULL)
          RETURNING edited_at`,
        [messageId, roomKey, request.user.id, text],
      );
      if (!result.rowCount) throw new BadRequestException("This message cannot be edited.");
      return { text, editedAt: result.rows[0]!.edited_at };
    });
  }

  @Delete("rooms/:roomKey/messages/:messageId")
  @UseGuards(AccessTokenGuard)
  async deleteRoomMessage(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Param("messageId") messageId: string) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const result = await client.query(
        `DELETE FROM constellation_room_messages WHERE id = $1 AND room_key = $2 AND sender_id = $3 AND NOT is_host_message`,
        [messageId, roomKey, request.user.id],
      );
      if (!result.rowCount) throw new BadRequestException("This message cannot be deleted.");
      return { deleted: true };
    });
  }

  @Post("rooms/:roomKey/messages")
  @UseGuards(AccessTokenGuard)
  async sendRoomMessage(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Body() input: SendConstellationRoomMessageInput) {
    const response = await this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      await client.query(`INSERT INTO constellation_room_participants (room_key, user_id) VALUES ($1, $2) ON CONFLICT (room_key, user_id) DO UPDATE SET last_visited_at = now()`, [roomKey, request.user.id]);
      const text = input.text?.trim() || "";
      let image: Buffer | null = null;
      if (input.imageBase64) {
        const decoded = Buffer.from(input.imageBase64, "base64");
        if (!decoded.length || decoded.length > 10 * 1024 * 1024) throw new BadRequestException("Community-room pictures must be 10 MB or smaller.");
        image = await sharp(decoded).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      }
      if (!text && !image) throw new BadRequestException("Write something or choose a picture first.");
      const sender = await client.query<{ display_name: string }>(`SELECT display_name FROM discovery_profiles WHERE user_id = $1`, [request.user.id]);
      const created = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO constellation_room_messages (room_key, sender_id, message_text, image_mime_type, image_data) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [roomKey, request.user.id, text, image ? "image/webp" : null, image],
      );
      const host = request.get("x-forwarded-host") || request.get("host") || "api.kindredcube.com";
      const proto = request.get("x-forwarded-proto") || "https";
      return { id: created.rows[0]!.id, senderId: request.user.id, senderName: sender.rows[0]?.display_name || "Kindred", text, createdAt: created.rows[0]!.created_at, own: true, host: false, balloonCount: 0, balloonPumps: 0, viewerBalloonActive: null, viewerInflationCount: 0, reactors: [], imageUri: image ? `${proto}://${host}/v1/constellations/rooms/${encodeURIComponent(roomKey)}/messages/${created.rows[0]!.id}/image` : undefined };
    });
    this.pushNotifications.sendConstellationRoomNotification(roomKey, request.user.id, response.senderName, response.text || "Shared a picture", false).catch(() => undefined);
    this.maybePostAmaraFollowUp(roomKey, request.user.id).catch(() => undefined);
    return response;
  }

  @Get("rooms/:roomKey/messages/:messageId/image")
  async roomMessageImage(@Param("roomKey") roomKey: string, @Param("messageId") messageId: string, @Res() response: Response) {
    const result = await this.database.query<{ image_mime_type: string; image_data: Buffer }>(
      `SELECT image_mime_type, image_data FROM constellation_room_messages WHERE id = $1 AND room_key = $2 AND image_data IS NOT NULL`,
      [messageId, roomKey],
    );
    const row = result.rows[0];
    if (!row) return response.status(404).send("Not found");
    response.setHeader("Content-Type", row.image_mime_type);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.send(row.image_data);
  }

  @Post("rooms/:roomKey/messages/:messageId/balloon")
  @UseGuards(AccessTokenGuard)
  async reactToRoomIntroduction(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Param("messageId") messageId: string, @Body() input: ConstellationRoomMessageBalloonInput) {
    const response = await this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const message = await client.query<{ sender_id: string; is_host_message: boolean }>(`SELECT sender_id, is_host_message FROM constellation_room_messages WHERE id = $1 AND room_key = $2`, [messageId, roomKey]);
      const senderId = message.rows[0]?.sender_id;
      if (!senderId) throw new BadRequestException("This introduction is no longer available.");
      if (message.rows[0]?.is_host_message) throw new BadRequestException("Amara's host prompts cannot receive balloons.");
      if (senderId === request.user.id) throw new BadRequestException("Other members respond to your introduction.");
      if (input.action === "pop" && !input.reasonCode) throw new BadRequestException("Choose a private reason so future introductions can improve.");
      const result = input.action === "inflate"
        ? await client.query<{ balloon_active: boolean; inflation_count: number }>(
          `INSERT INTO constellation_room_message_balloons (message_id, user_id, balloon_active, inflation_count)
           VALUES ($1, $2, true, 1)
           ON CONFLICT (message_id, user_id) DO UPDATE
             SET balloon_active = true, inflation_count = LEAST(3, constellation_room_message_balloons.inflation_count + 1), reason_code = NULL, private_note = '', author_decision = NULL, updated_at = now()
           RETURNING balloon_active, inflation_count`, [messageId, request.user.id])
        : await client.query<{ balloon_active: boolean; inflation_count: number }>(
          `INSERT INTO constellation_room_message_balloons (message_id, user_id, balloon_active, inflation_count, reason_code, private_note)
           VALUES ($1, $2, false, 0, $3, $4)
           ON CONFLICT (message_id, user_id) DO UPDATE
             SET balloon_active = false, inflation_count = 0, reason_code = EXCLUDED.reason_code, private_note = EXCLUDED.private_note, author_decision = NULL, updated_at = now()
           RETURNING balloon_active, inflation_count`, [messageId, request.user.id, input.reasonCode, input.privateNote || ""]);
      return { balloonActive: result.rows[0]!.balloon_active, inflationCount: result.rows[0]!.inflation_count, senderId };
    });
    if (input.action === "inflate" && response.inflationCount === 1 && response.senderId !== request.user.id) {
      this.pushNotifications.sendConstellationReactionNotification(response.senderId, request.user.id, roomKey, messageId).catch(() => undefined);
    }
    return { balloonActive: response.balloonActive, inflationCount: response.inflationCount };
  }

  @Post("rooms/:roomKey/messages/:messageId/balloons/:reactorId/decision")
  @UseGuards(AccessTokenGuard)
  async decideRoomBalloon(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Param("messageId") messageId: string, @Param("reactorId") reactorId: string, @Body() input: ConstellationBalloonAuthorDecisionInput) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const result = await client.query<{ author_decision: "accepted" | "popped" }>(
        `UPDATE constellation_room_message_balloons reaction
            SET author_decision = $5,
                balloon_active = CASE WHEN $5 = 'popped' THEN false ELSE balloon_active END,
                updated_at = now()
           FROM constellation_room_messages message
          WHERE reaction.message_id = message.id
            AND message.id = $1 AND message.room_key = $2
            AND message.sender_id = $3 AND reaction.user_id = $4
            AND NOT message.is_host_message
          RETURNING reaction.author_decision`,
        [messageId, roomKey, request.user.id, reactorId, input.decision],
      );
      if (!result.rowCount) throw new BadRequestException("This balloon is no longer available.");
      return { decision: result.rows[0]!.author_decision };
    });
  }

  @Post("rooms/:roomKey/messages/:messageId/report")
  @UseGuards(AccessTokenGuard)
  async reportRoomMessage(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Param("messageId") messageId: string, @Body() input: ReportConstellationRoomMessageInput) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const message = await client.query<{ sender_id: string; message_text: string }>(
        `SELECT sender_id, message_text FROM constellation_room_messages WHERE id = $1 AND room_key = $2`, [messageId, roomKey],
      );
      const row = message.rows[0];
      if (!row || row.sender_id === request.user.id) throw new BadRequestException("This message cannot be reported.");
      const report = await client.query<{ id: string }>(
        `INSERT INTO safety_reports (reporter_id, reported_profile_id, reason_code, details)
         VALUES ($1, $2, 'harassment', $3) RETURNING id`,
        [request.user.id, row.sender_id, `Constellation room ${roomKey}; message ${messageId}; ${input.details || "Inappropriate public-room message"}; text: ${row.message_text.slice(0, 240)}`],
      );
      return { reported: true, reportId: report.rows[0]!.id };
    });
  }

  @Post("generate-cover")
  @UseGuards(AccessTokenGuard)
  async generateCover(@Req() request: AuthenticatedRequest, @Body() input: GenerateConstellationCoverInput) {
    await this.assertPremium(request.user.id);
    const cover = await this.generateConstellationCover(input.name.trim());
    return { imageBase64: cover.toString("base64"), mimeType: "image/png" };
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  async list(@Req() request: AuthenticatedRequest) {
    const result = await this.database.withUser(request.user.id, (client) => client.query<ConstellationRow>(
      `WITH viewer AS (
         SELECT area_latitude, area_longitude, NULLIF(matching_data->>'currentCountry', '') AS country
           FROM discovery_profiles WHERE user_id = $1
       ), visible_constellations AS (
         SELECT c.*,
                (SELECT count(*) FROM constellation_members m WHERE m.constellation_id = c.id AND m.status = 'accepted')::integer AS accepted_count
           FROM constellations c
       )
       SELECT c.id, c.creator_id, c.name, c.description, c.requires_approval, c.published_at, c.created_at,
              c.pitch_about, c.pitch_looking_for,
              c.experience_type, c.moderator_type, c.featured_gender, c.audience_gender,
              c.origin_city, c.origin_country, c.origin_latitude, c.origin_longitude,
              c.accepted_count::text AS member_count,
              (SELECT m.status FROM constellation_members m WHERE m.constellation_id = c.id AND m.user_id = $1) AS membership_status
         FROM visible_constellations c CROSS JOIN viewer
        WHERE c.creator_id = $1
           OR EXISTS (SELECT 1 FROM constellation_members own_membership WHERE own_membership.constellation_id = c.id AND own_membership.user_id = $1 AND own_membership.status IN ('accepted', 'suggested'))
           OR (
             viewer.area_latitude IS NOT NULL AND viewer.area_longitude IS NOT NULL
             AND c.origin_latitude IS NOT NULL AND c.origin_longitude IS NOT NULL
             AND (
               (c.accepted_count >= 500 AND c.origin_country IS NOT NULL AND viewer.country = c.origin_country)
               OR 3958.8 * 2 * asin(least(1.0, sqrt(
                 power(sin(radians(viewer.area_latitude - c.origin_latitude) / 2), 2)
                 + cos(radians(c.origin_latitude)) * cos(radians(viewer.area_latitude))
                 * power(sin(radians(viewer.area_longitude - c.origin_longitude) / 2), 2)
               ))) <= CASE
                 WHEN c.accepted_count >= 500 THEN 1600
                 WHEN c.accepted_count >= 400 THEN 1600
                 WHEN c.accepted_count >= 300 THEN 800
                 WHEN c.accepted_count >= 200 THEN 400
                 WHEN c.accepted_count >= 100 THEN 200
                 ELSE 100
               END
             )
           )
        ORDER BY c.published_at DESC NULLS LAST, c.created_at DESC`,
      [request.user.id],
    ));
    return { constellations: result.rows.map((row) => this.responseRow(row, request)) };
  }

  @Post()
  @UseGuards(AccessTokenGuard)
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreateConstellationInput) {
    await this.assertPremium(request.user.id);
    let cover: Buffer | null = null;
    if (input.imageBase64) {
      const decoded = Buffer.from(input.imageBase64, "base64");
      if (!decoded.length || decoded.length > 12 * 1024 * 1024) throw new BadRequestException("Constellation image must be 12 MB or smaller.");
      cover = await sharp(decoded).rotate().resize(900, 900, { fit: "cover" }).webp({ quality: 86 }).toBuffer();
    } else {
      throw new BadRequestException("Choose your profile picture or upload a constellation picture.");
    }
    const result = await this.database.withUser(request.user.id, async (client) => {
      const origin = await client.query<{ city: string | null; country: string | null; latitude: number | null; longitude: number | null }>(
        `SELECT NULLIF(matching_data->>'currentLocation', '') AS city,
                NULLIF(matching_data->>'currentCountry', '') AS country,
                area_latitude AS latitude, area_longitude AS longitude
           FROM discovery_profiles WHERE user_id = $1`,
        [request.user.id],
      );
      const area = origin.rows[0];
      const latitude = input.originLatitude ?? area?.latitude;
      const longitude = input.originLongitude ?? area?.longitude;
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) throw new BadRequestException("Allow location access so KindredCube can place this local constellation.");
      const created = await client.query<ConstellationRow>(
        `INSERT INTO constellations (creator_id, name, description, requires_approval, cover_mime_type, cover_data,
                                    origin_city, origin_country, origin_latitude, origin_longitude,
                                    experience_type, moderator_type, featured_gender, audience_gender)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, creator_id, name, description, requires_approval, published_at, created_at,
                   pitch_about, pitch_looking_for,
                   origin_city, origin_country, origin_latitude, origin_longitude,
                   experience_type, moderator_type, featured_gender, audience_gender,
                   '1'::text AS member_count, 'accepted'::text AS membership_status`,
        [request.user.id, input.name.trim(), input.description.trim(), input.requiresApproval, cover ? "image/webp" : null, cover,
          input.originCity?.trim() || area?.city || "Current area", input.originCountry?.trim() || area?.country || null, latitude, longitude,
          input.experienceType || "community", input.moderatorType || "human", input.featuredGender || "Man", input.audienceGender || "Women"],
      );
      await client.query(
        `INSERT INTO constellation_members (constellation_id, user_id, status) VALUES ($1, $2, 'accepted')`,
        [created.rows[0]!.id, request.user.id],
      );
      const suggested = await client.query<{ user_id: string }>(
        `INSERT INTO constellation_members (constellation_id, user_id, status)
         SELECT $1, candidate.user_id, 'suggested'
           FROM discovery_profiles creator
           JOIN discovery_profiles candidate ON candidate.user_id <> creator.user_id
           JOIN users candidate_user ON candidate_user.id = candidate.user_id
          WHERE creator.user_id = $2
            AND candidate.visible = true
            AND candidate_user.status = 'active'
            AND candidate_user.email_verified_at IS NOT NULL
            AND ($3 = 'Everyone' OR ($3 = 'Women' AND candidate.gender = 'Woman') OR ($3 = 'Men' AND candidate.gender = 'Man'))
            AND (candidate.seeking = 'Everyone' OR (candidate.seeking = 'Women' AND creator.gender = 'Woman') OR (candidate.seeking = 'Men' AND creator.gender = 'Man'))
            AND jsonb_object_length(COALESCE(candidate.matching_data->'compatibilityResponses', '{}'::jsonb)) >= 36
            AND jsonb_array_length(COALESCE(candidate.matching_data->'relationshipGoals', '[]'::jsonb)) > 0
            AND jsonb_array_length(COALESCE(candidate.matching_data->'interests', '[]'::jsonb)) > 0
            AND jsonb_array_length(COALESCE(candidate.matching_data->'values', '[]'::jsonb)) > 0
            AND NOT EXISTS (SELECT 1 FROM user_blocks block WHERE (block.blocker_id = $2 AND block.blocked_profile_id = candidate.user_id::text) OR (block.blocker_id = candidate.user_id AND block.blocked_profile_id = $2::text))
          ORDER BY
            (
              SELECT count(*) FROM jsonb_array_elements_text(COALESCE(candidate.matching_data->'interests', '[]'::jsonb)) item
               WHERE item IN (SELECT jsonb_array_elements_text(COALESCE(creator.matching_data->'interests', '[]'::jsonb)))
            ) + (
              SELECT count(*) FROM jsonb_array_elements_text(COALESCE(candidate.matching_data->'values', '[]'::jsonb)) item
               WHERE item IN (SELECT jsonb_array_elements_text(COALESCE(creator.matching_data->'values', '[]'::jsonb)))
            ) + (
              SELECT count(*) FROM jsonb_array_elements_text(COALESCE(candidate.matching_data->'relationshipGoals', '[]'::jsonb)) item
               WHERE item IN (SELECT jsonb_array_elements_text(COALESCE(creator.matching_data->'relationshipGoals', '[]'::jsonb)))
            ) DESC,
            CASE WHEN creator.area_latitude IS NOT NULL AND creator.area_longitude IS NOT NULL AND candidate.area_latitude IS NOT NULL AND candidate.area_longitude IS NOT NULL
              THEN 3958.8 * 2 * asin(least(1.0, sqrt(power(sin(radians(candidate.area_latitude - creator.area_latitude) / 2), 2) + cos(radians(creator.area_latitude)) * cos(radians(candidate.area_latitude)) * power(sin(radians(candidate.area_longitude - creator.area_longitude) / 2), 2))))
              ELSE 99999 END,
            candidate.recently_active_at DESC NULLS LAST
          LIMIT 12
         ON CONFLICT (constellation_id, user_id) DO NOTHING
         RETURNING user_id`,
        [created.rows[0]!.id, request.user.id, input.audienceGender || "Women"],
      );
      return { row: created.rows[0]!, suggestedUserIds: suggested.rows.map((item) => item.user_id) };
    });
    await Promise.allSettled(result.suggestedUserIds.map((recipientId) => this.pushNotifications.sendConstellationFitNotification(
      recipientId,
      request.user.id,
      result.row.id,
      result.row.name,
    )));
    return { constellation: this.responseRow(result.row, request) };
  }

  @Patch(":id/pitch")
  @UseGuards(AccessTokenGuard)
  async updatePitch(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() input: UpdateConstellationPitchInput) {
    const result = await this.database.withUser(request.user.id, (client) => client.query<ConstellationRow>(
      `UPDATE constellations
          SET pitch_about = $3, pitch_looking_for = $4, updated_at = now()
        WHERE id = $1 AND creator_id = $2
        RETURNING id, creator_id, name, description, requires_approval, published_at, created_at,
                  pitch_about, pitch_looking_for,
                  origin_city, origin_country, origin_latitude, origin_longitude,
                  experience_type, moderator_type, featured_gender, audience_gender,
                  (SELECT count(*)::text FROM constellation_members member WHERE member.constellation_id = constellations.id AND member.status = 'accepted') AS member_count,
                  'accepted'::text AS membership_status`,
      [id, request.user.id, input.pitchAbout.trim(), input.pitchLookingFor.trim()],
    ));
    const row = result.rows[0];
    if (!row) throw new BadRequestException("Only the constellation creator can update this pitch.");
    return { constellation: this.responseRow(row, request) };
  }

  @Post(":id/join")
  @UseGuards(AccessTokenGuard)
  async join(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    const result = await this.database.withUser(request.user.id, async (client) => {
      const constellation = await client.query<{ creator_id: string; requires_approval: boolean }>(
        `SELECT creator_id, requires_approval FROM constellations WHERE id = $1`, [id],
      );
      const row = constellation.rows[0];
      if (!row) throw new BadRequestException("Constellation is unavailable.");
      const status = row.requires_approval ? "pending" : "accepted";
      await client.query(
        `INSERT INTO constellation_members (constellation_id, user_id, status) VALUES ($1, $2, $3)
         ON CONFLICT (constellation_id, user_id) DO UPDATE SET status = EXCLUDED.status, joined_at = now()`,
        [id, request.user.id, status],
      );
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM constellation_members WHERE constellation_id = $1 AND status = 'accepted'`, [id],
      );
      if (Number(count.rows[0]?.count || 0) >= 10) {
        await client.query(`UPDATE constellations SET published_at = COALESCE(published_at, now()), updated_at = now() WHERE id = $1`, [id]);
      }
      return { status, memberCount: Number(count.rows[0]?.count || 0), published: Number(count.rows[0]?.count || 0) >= 10 };
    });
    return result;
  }

  @Get(":id/match-room")
  @UseGuards(AccessTokenGuard)
  async matchRoom(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.database.withUser(request.user.id, async (client) => {
      const constellation = await client.query<{ creator_id: string; experience_type: string; moderator_type: string; featured_gender: string; audience_gender: string }>(
        `SELECT creator_id, experience_type, moderator_type, featured_gender, audience_gender FROM constellations WHERE id = $1`, [id],
      );
      const room = constellation.rows[0];
      if (!room) throw new BadRequestException("This constellation is unavailable.");
      await this.assertRoomAccess(client, request.user.id, id);
      let session = await client.query<{ id: string; featured_user_id: string | null; candidate_user_id: string | null; current_question: string; question_count: number; status: string }>(
        `SELECT id, featured_user_id, candidate_user_id, current_question, question_count, status
           FROM constellation_match_sessions WHERE constellation_id = $1
          ORDER BY created_at DESC LIMIT 1`, [id],
      );
      if (!session.rows[0]) {
        session = await client.query(
          `INSERT INTO constellation_match_sessions (constellation_id, featured_user_id)
           VALUES ($1, $2) RETURNING id, featured_user_id, candidate_user_id, current_question, question_count, status`,
          [id, room.creator_id],
        );
      }
      const active = session.rows[0]!;
      const decisions = await client.query<{ user_id: string; balloon_active: boolean; inflation_count: number; popped_by_user_id: string | null }>(
        `SELECT user_id, balloon_active, inflation_count, popped_by_user_id
           FROM constellation_balloon_decisions WHERE session_id = $1`, [active.id],
      );
      const ownDecision = decisions.rows.find((decision) => decision.user_id === request.user.id);
      const ownVote = await client.query<{ vote: "yes" | "not_yet" | "no" }>(
        `SELECT vote FROM constellation_match_votes WHERE session_id = $1 AND user_id = $2`, [active.id, request.user.id],
      );
      return {
        sessionId: active.id, featuredUserId: active.featured_user_id, candidateUserId: active.candidate_user_id,
        question: active.current_question, questionCount: active.question_count, status: active.status,
        moderatorType: room.moderator_type, featuredGender: room.featured_gender, audienceGender: room.audience_gender,
        creatorId: room.creator_id, ownBalloonActive: ownDecision?.balloon_active ?? true,
        ownBalloonInflationCount: ownDecision?.inflation_count ?? 0,
        balloonStates: decisions.rows.map((decision) => ({
          userId: decision.user_id,
          active: decision.balloon_active,
          inflationCount: decision.inflation_count,
          poppedByFeatured: decision.popped_by_user_id === active.featured_user_id,
        })),
        ownVote: ownVote.rows[0]?.vote || null,
      };
    });
  }

  @Post(":id/match-room/balloon")
  @UseGuards(AccessTokenGuard)
  async balloonDecision(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() input: BalloonDecisionInput) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, id);
      const session = await client.query<{ id: string; featured_user_id: string | null }>(
        `SELECT id, featured_user_id FROM constellation_match_sessions WHERE constellation_id = $1 AND status = 'conversation' ORDER BY created_at DESC LIMIT 1`, [id],
      );
      const active = session.rows[0];
      if (!active?.featured_user_id) throw new BadRequestException("A balloon interaction is not available yet.");
      const constellation = await client.query<{ audience_gender: string }>(`SELECT audience_gender FROM constellations WHERE id = $1`, [id]);
      const audienceGender = constellation.rows[0]?.audience_gender;
      const isFeatured = active.featured_user_id === request.user.id;
      const targetUserId = input.action === "pop_other" ? input.targetUserId : request.user.id;
      if (!targetUserId) throw new BadRequestException("Choose a participant first.");
      if (input.action === "pop_other" && !isFeatured) throw new ForbiddenException("Only the featured participant can punch someone else's balloon.");
      if (input.action !== "pop_other" && isFeatured) throw new BadRequestException("The featured participant does not have an outside-circle balloon.");
      if (input.action !== "inflate" && !input.reasonCode) throw new BadRequestException("Choose a private reason so future introductions can improve.");
      const target = await client.query<{ gender: string }>(
        `SELECT profile.gender
           FROM constellation_members member
           JOIN discovery_profiles profile ON profile.user_id = member.user_id
          WHERE member.constellation_id = $1 AND member.user_id = $2 AND member.status IN ('accepted', 'suggested')`,
        [id, targetUserId],
      );
      const targetGender = target.rows[0]?.gender;
      const isAudienceMember = Boolean(targetGender) && (audienceGender === "Everyone" || audienceGender === (targetGender === "Woman" ? "Women" : targetGender === "Man" ? "Men" : "Everyone"));
      if (!isAudienceMember || targetUserId === active.featured_user_id) throw new BadRequestException("That participant does not have a balloon in this match circle.");
      if (input.action === "inflate") {
        const inflated = await client.query<{ balloon_active: boolean; inflation_count: number }>(
          `INSERT INTO constellation_balloon_decisions (session_id, user_id, balloon_active, inflation_count)
           VALUES ($1, $2, true, 1)
           ON CONFLICT (session_id, user_id) DO UPDATE
             SET inflation_count = LEAST(20, constellation_balloon_decisions.inflation_count + 1), decided_at = now()
             WHERE constellation_balloon_decisions.balloon_active = true
           RETURNING balloon_active, inflation_count`,
          [active.id, request.user.id],
        );
        if (!inflated.rows[0]) throw new BadRequestException("A popped balloon cannot be inflated again in this round.");
        await client.query(
          `UPDATE constellation_members SET status = 'accepted', responded_at = now()
            WHERE constellation_id = $1 AND user_id = $2 AND status = 'suggested'`,
          [id, request.user.id],
        );
        return { balloonActive: true, inflationCount: inflated.rows[0].inflation_count, targetUserId: request.user.id };
      }
      const popped = await client.query<{ inflation_count: number }>(
        `INSERT INTO constellation_balloon_decisions
           (session_id, user_id, balloon_active, inflation_count, reason_code, private_note, popped_by_user_id)
         VALUES ($1, $2, false, 0, $3, $4, $5)
         ON CONFLICT (session_id, user_id) DO UPDATE SET balloon_active = false,
           reason_code = EXCLUDED.reason_code, private_note = EXCLUDED.private_note,
           popped_by_user_id = EXCLUDED.popped_by_user_id, decided_at = now()
         RETURNING inflation_count`,
        [active.id, targetUserId, input.reasonCode, input.privateNote || "", request.user.id],
      );
      if (input.action === "pop_self") {
        await client.query(
          `UPDATE constellation_members SET status = 'declined', responded_at = now()
            WHERE constellation_id = $1 AND user_id = $2 AND status = 'suggested'`,
          [id, request.user.id],
        );
      }
      return { balloonActive: false, inflationCount: popped.rows[0]?.inflation_count || 0, targetUserId };
    });
  }

  @Post(":id/match-room/next-question")
  @UseGuards(AccessTokenGuard)
  async nextQuestion(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() input: NextModeratorQuestionInput) {
    return this.database.withUser(request.user.id, async (client) => {
      const constellation = await client.query<{ creator_id: string; moderator_type: string; name: string }>(
        `SELECT creator_id, moderator_type, name FROM constellations WHERE id = $1 AND experience_type = 'moderated_match'`, [id],
      );
      const room = constellation.rows[0];
      if (!room || room.creator_id !== request.user.id) throw new ForbiddenException("Only the configured moderator can advance the conversation.");
      const session = await client.query<{ id: string; current_question: string; featured_user_id: string | null; question_count: number }>(
        `SELECT id, current_question, featured_user_id, question_count FROM constellation_match_sessions WHERE constellation_id = $1 AND status = 'conversation' ORDER BY created_at DESC LIMIT 1`, [id],
      );
      const active = session.rows[0];
      if (!active) throw new BadRequestException("There is no active conversation.");
      let question = input.question?.trim() || "";
      if (room.moderator_type === "ai") question = await this.generateModeratorQuestion(client, id, room.name, active.current_question);
      if (!question) throw new BadRequestException("Write the next question.");
      await client.query(`UPDATE constellation_match_sessions SET current_question = $2, question_count = question_count + 1, updated_at = now() WHERE id = $1`, [active.id, question]);
      let status = "conversation";
      if (active.question_count >= 4 && active.featured_user_id) {
        const candidate = await client.query<{ user_id: string }>(
          `SELECT member.user_id
             FROM constellation_members member
             JOIN discovery_profiles profile ON profile.user_id = member.user_id
             LEFT JOIN constellation_balloon_decisions decision ON decision.session_id = $2 AND decision.user_id = member.user_id
            WHERE member.constellation_id = $1 AND member.status = 'accepted' AND member.user_id <> $3
              AND COALESCE(decision.balloon_active, true) = true
              AND jsonb_object_length(COALESCE(profile.matching_data->'compatibilityResponses', '{}'::jsonb)) >= 36
              AND jsonb_array_length(COALESCE(profile.matching_data->'relationshipGoals', '[]'::jsonb)) > 0
              AND jsonb_array_length(COALESCE(profile.matching_data->'interests', '[]'::jsonb)) > 0
              AND jsonb_array_length(COALESCE(profile.matching_data->'values', '[]'::jsonb)) > 0
              AND (SELECT audience_gender FROM constellations WHERE id = $1) IN ('Everyone', CASE profile.gender WHEN 'Man' THEN 'Men' WHEN 'Woman' THEN 'Women' ELSE 'Everyone' END)
            ORDER BY (SELECT count(*) FROM constellation_room_messages message WHERE message.room_key = $1::text AND message.sender_id = member.user_id) DESC,
                     member.joined_at
            LIMIT 1`, [id, active.id, active.featured_user_id],
        );
        if (candidate.rows[0]) {
          await client.query(`UPDATE constellation_match_sessions SET candidate_user_id = $2, status = 'match_check', updated_at = now() WHERE id = $1`, [active.id, candidate.rows[0].user_id]);
          status = "match_check";
        }
      }
      return { question, status };
    });
  }

  @Post(":id/match-room/vote")
  @UseGuards(AccessTokenGuard)
  async matchVote(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() input: MatchVoteInput) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, id);
      const session = await client.query<{ id: string; featured_user_id: string | null; candidate_user_id: string | null }>(
        `SELECT id, featured_user_id, candidate_user_id FROM constellation_match_sessions WHERE constellation_id = $1 AND status IN ('conversation', 'match_check') ORDER BY created_at DESC LIMIT 1`, [id],
      );
      const active = session.rows[0];
      if (!active || ![active.featured_user_id, active.candidate_user_id].includes(request.user.id)) throw new ForbiddenException("This match decision is private to the proposed pair.");
      await client.query(
        `INSERT INTO constellation_match_votes (session_id, user_id, vote) VALUES ($1, $2, $3)
         ON CONFLICT (session_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = now()`, [active.id, request.user.id, input.vote],
      );
      const otherUserId = request.user.id === active.featured_user_id ? active.candidate_user_id : active.featured_user_id;
      if (input.vote === "yes" && otherUserId) {
        await client.query(
          `INSERT INTO member_likes (liker_id, liked_user_id, source, visible_at)
           VALUES ($1, $2, 'explore', now() + interval '30 days')
           ON CONFLICT (liker_id, liked_user_id) DO UPDATE SET source = 'explore', updated_at = now()`,
          [request.user.id, otherUserId],
        );
      }
      const votes = await client.query<{ vote: string }>(`SELECT vote FROM constellation_match_votes WHERE session_id = $1 AND user_id IN ($2, $3)`, [active.id, active.featured_user_id, active.candidate_user_id]);
      const matched = votes.rowCount === 2 && votes.rows.every((row) => row.vote === "yes");
      if (matched && active.featured_user_id && active.candidate_user_id) {
        await client.query(
          `UPDATE member_likes SET matched_at = COALESCE(matched_at, now()), match_expires_at = COALESCE(match_expires_at, now() + interval '7 days'), updated_at = now()
            WHERE (liker_id = $1 AND liked_user_id = $2) OR (liker_id = $2 AND liked_user_id = $1)`,
          [active.featured_user_id, active.candidate_user_id],
        );
      }
      await client.query(`UPDATE constellation_match_sessions SET status = $2, updated_at = now() WHERE id = $1`, [active.id, matched ? "matched" : input.vote === "not_yet" ? "conversation" : "match_check"]);
      return { matched, status: matched ? "matched" : input.vote === "not_yet" ? "conversation" : "match_check" };
    });
  }

  @Post(":id/referral")
  @UseGuards(AccessTokenGuard)
  async claimReferral(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.database.withUser(request.user.id, async (client) => {
      const constellation = await client.query<{ creator_id: string }>(
        `SELECT creator_id FROM constellations WHERE id = $1`, [id],
      );
      const creatorId = constellation.rows[0]?.creator_id;
      if (!creatorId || creatorId === request.user.id) throw new BadRequestException("This referral is not available.");
      const eligible = await client.query(
        `SELECT 1 FROM users u
          WHERE u.id = $1
            AND u.created_at >= now() - interval '30 days'
            AND NOT EXISTS (SELECT 1 FROM payment_orders p WHERE p.user_id = u.id AND p.status = 'paid')`,
        [request.user.id],
      );
      if (!eligible.rowCount) throw new BadRequestException("Referral attribution is only available to new members before their first purchase.");
      const claimed = await client.query(
        `INSERT INTO constellation_referrals (referred_user_id, constellation_id, creator_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (referred_user_id) DO NOTHING
         RETURNING constellation_id`,
        [request.user.id, id, creatorId],
      );
      return { attributed: Boolean(claimed.rowCount), constellationId: claimed.rows[0]?.constellation_id || null };
    });
  }

  @Get(":id/earnings")
  @UseGuards(AccessTokenGuard)
  async earnings(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.database.withUser(request.user.id, async (client) => {
      const owner = await client.query(`SELECT 1 FROM constellations WHERE id = $1 AND creator_id = $2`, [id, request.user.id]);
      if (!owner.rowCount) throw new ForbiddenException("Only the constellation creator can view earnings.");
      await client.query(`UPDATE constellation_commissions SET status = 'available' WHERE creator_id = $1 AND status = 'pending' AND available_at <= now()`, [request.user.id]);
      const totals = await client.query<{ pending: string; available: string; paid: string; referred_users: string }>(
        `SELECT
           COALESCE(sum(commission_amount_cents) FILTER (WHERE status = 'pending'), 0)::text AS pending,
           COALESCE(sum(commission_amount_cents) FILTER (WHERE status = 'available'), 0)::text AS available,
           COALESCE(sum(commission_amount_cents) FILTER (WHERE status = 'paid'), 0)::text AS paid,
           count(DISTINCT referred_user_id)::text AS referred_users
         FROM constellation_commissions WHERE constellation_id = $1 AND creator_id = $2`,
        [id, request.user.id],
      );
      const purchases = await client.query<{ purchase_type: string; gross_amount_cents: number; commission_amount_cents: number; currency: string; status: string; created_at: string }>(
        `SELECT p.purchase_type, c.gross_amount_cents, c.commission_amount_cents, c.currency, c.status, c.created_at
           FROM constellation_commissions c JOIN payment_orders p ON p.id = c.payment_order_id
          WHERE c.constellation_id = $1 AND c.creator_id = $2
          ORDER BY c.created_at DESC LIMIT 100`,
        [id, request.user.id],
      );
      const row = totals.rows[0];
      return {
        commissionRatePercent: 10,
        pendingCents: Number(row?.pending || 0), availableCents: Number(row?.available || 0),
        paidCents: Number(row?.paid || 0), referredUsers: Number(row?.referred_users || 0),
        purchases: purchases.rows.map((purchase) => ({
          purchaseType: purchase.purchase_type, grossAmountCents: purchase.gross_amount_cents,
          commissionAmountCents: purchase.commission_amount_cents, currency: purchase.currency,
          status: purchase.status, createdAt: purchase.created_at,
        })),
      };
    });
  }

  @Delete(":id")
  @UseGuards(AccessTokenGuard)
  async remove(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    const result = await this.database.withUser(request.user.id, (client) => client.query<{ id: string }>(
      `DELETE FROM constellations WHERE id = $1 AND creator_id = $2 RETURNING id`,
      [id, request.user.id],
    ));
    if (!result.rows[0]) throw new BadRequestException("Only the constellation creator can delete it.");
    return { deleted: true, id };
  }

  @Get(":id/cover")
  async cover(@Param("id") id: string, @Res() response: Response) {
    const result = await this.database.query<{ cover_mime_type: string; cover_data: Buffer }>(
      `SELECT cover_mime_type, cover_data FROM constellations WHERE id = $1 AND cover_data IS NOT NULL`, [id],
    );
    const row = result.rows[0];
    if (!row) return response.status(404).send("Not found");
    response.setHeader("Content-Type", row.cover_mime_type);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.send(row.cover_data);
  }

  private responseRow(row: ConstellationRow, request: AuthenticatedRequest) {
    const host = request.get("x-forwarded-host") || request.get("host") || "api.kindredcube.com";
    const proto = request.get("x-forwarded-proto") || "https";
    const memberCount = Number(row.member_count || 0);
    const reachMiles = memberCount >= 500 ? null : memberCount >= 400 ? 1600 : memberCount >= 300 ? 800 : memberCount >= 200 ? 400 : memberCount >= 100 ? 200 : 100;
    return {
      id: row.id, creatorId: row.creator_id, name: row.name, description: row.description,
      pitchAbout: row.pitch_about || "", pitchLookingFor: row.pitch_looking_for || "",
      experienceType: row.experience_type, moderatorType: row.moderator_type,
      featuredGender: row.featured_gender, audienceGender: row.audience_gender,
      requiresApproval: row.requires_approval, memberCount, membershipStatus: row.membership_status,
      published: Boolean(row.published_at), membersNeededToPublish: Math.max(0, 10 - memberCount),
      originCity: row.origin_city || "Local community", originCountry: row.origin_country,
      reachMiles, countrywide: memberCount >= 500,
      coverUri: `${proto}://${host}/v1/constellations/${row.id}/cover`,
      shareUrl: `https://kindredcube.com/constellations/${row.id}`,
    };
  }

  private async assertPremium(userId: string) {
    const premium = await this.database.withUser(userId, (client) => client.query(
      `SELECT 1 FROM user_entitlements
        WHERE user_id = $1 AND entitlement = 'premium' AND active = true
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1`,
      [userId],
    ));
    if (!premium.rowCount) throw new ForbiddenException("Premium is required to create a constellation.");
  }

  private async assertRoomAccess(client: import("pg").PoolClient, userId: string, roomKey: string) {
    if (["sigma", "dog-people", "faith-purpose", "family-centered", "fitness-nerds"].includes(roomKey)) return;
    if (!/^[0-9a-f-]{36}$/i.test(roomKey)) throw new BadRequestException("Constellation room is unavailable.");
    const membership = await client.query(
      `SELECT 1 FROM constellations constellation
        WHERE constellation.id = $1
          AND (constellation.creator_id = $2 OR EXISTS (
            SELECT 1 FROM constellation_members member
             WHERE member.constellation_id = constellation.id AND member.user_id = $2 AND member.status IN ('accepted', 'suggested')
          ))`,
      [roomKey, userId],
    );
    if (!membership.rowCount) throw new ForbiddenException("Join this constellation before entering its room.");
  }

  private async generateConstellationCover(name: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException("AI constellation artwork is not configured yet.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_CONSTELLATION_IMAGE_MODEL || "gpt-image-1",
          prompt: `Create a premium square 3D constellation icon for a relationship community named "${name}". Use a polished friendly 3D animated illustration style consistent with KindredCube's default constellation art. Show a tasteful symbolic scene or diverse adults that clearly expresses the community name. Use navy blue, warm coral, and gold accents. Center the subject, keep generous clear space around it, use a fully transparent background, and include no words, letters, logos, borders, watermarks, or UI elements.`,
          size: "1024x1024",
          quality: "medium",
          background: "transparent",
          output_format: "png",
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ServiceUnavailableException(`AI artwork generation failed (${response.status}). ${detail.slice(0, 160)}`);
      }
      const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
      const encoded = payload.data?.[0]?.b64_json;
      if (!encoded) throw new ServiceUnavailableException("AI artwork generation returned no image.");
      const image = Buffer.from(encoded, "base64");
      if (!image.length || image.length > 12 * 1024 * 1024) throw new ServiceUnavailableException("AI artwork was empty or too large.");
      return image;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(error instanceof Error && error.name === "AbortError" ? "AI artwork generation timed out. Please try again." : "AI artwork generation is temporarily unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async maybePostAmaraFollowUp(roomKey: string, triggeringUserId: string) {
    const posted = await this.database.withUser(triggeringUserId, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`amara:${roomKey}`]);
      const cadence = await client.query<{ host_count: string; user_messages_since_host: string; last_host_at: string | null }>(
        `SELECT
           count(*) FILTER (WHERE is_host_message)::text AS host_count,
           count(*) FILTER (WHERE NOT is_host_message AND created_at > COALESCE((SELECT max(created_at) FROM constellation_room_messages WHERE room_key = $1 AND is_host_message), '-infinity'))::text AS user_messages_since_host,
           max(created_at) FILTER (WHERE is_host_message)::text AS last_host_at
         FROM constellation_room_messages WHERE room_key = $1`, [roomKey],
      );
      const row = cadence.rows[0];
      const firstHostPrompt = Number(row?.host_count || 0) === 0;
      const enoughConversation = Number(row?.user_messages_since_host || 0) >= 3;
      const hostHasRested = !row?.last_host_at || Date.now() - new Date(row.last_host_at).getTime() >= 20 * 60 * 1000;
      if (!firstHostPrompt && (!enoughConversation || !hostHasRested)) return null;

      const transcriptResult = await client.query<{ display_name: string; message_text: string }>(
        `SELECT COALESCE(profile.display_name, 'A Kindred') AS display_name, message.message_text
           FROM constellation_room_messages message
           LEFT JOIN discovery_profiles profile ON profile.user_id = message.sender_id
          WHERE message.room_key = $1 AND NOT message.is_host_message AND message.message_text <> ''
          ORDER BY message.created_at DESC LIMIT 12`, [roomKey],
      );
      if (!transcriptResult.rowCount) return null;
      const roomNameResult = /^[0-9a-f-]{36}$/i.test(roomKey)
        ? await client.query<{ name: string }>(`SELECT name FROM constellations WHERE id = $1`, [roomKey])
        : null;
      const roomName = roomNameResult?.rows[0]?.name || ({ sigma: "Sigma", "dog-people": "Dog People", "faith-purpose": "Faith & Purpose", "family-centered": "Family-Centered", "fitness-nerds": "Fitness Nerds" } as Record<string, string>)[roomKey] || "Kindred";
      const transcript = transcriptResult.rows.reverse().map((item) => `${item.display_name}: ${item.message_text}`).join("\n").slice(0, 6000);
      const question = await this.generateAmaraHostFollowUp(roomName, transcript);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO constellation_room_messages (room_key, sender_id, message_text, is_host_message)
         VALUES ($1, $2, $3, true) RETURNING id`, [roomKey, triggeringUserId, question],
      );
      return { id: inserted.rows[0]!.id, question };
    });
    if (posted) await this.pushNotifications.sendConstellationRoomNotification(roomKey, triggeringUserId, "Amara", posted.question, true);
  }

  private async generateAmaraHostFollowUp(constellationName: string, transcript: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "What part of that would you most enjoy sharing with a Kindred?";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODERATOR_MODEL || "gpt-5-mini",
        input: `You are Amara, the warm, perceptive host of the ${constellationName} social room in KindredCube. Based only on the public conversation, write one brief natural host message. Usually address the latest speaker by first name and ask one insightful, playful follow-up that helps people reveal compatibility. Do not summarize everyone, mention algorithms, expose private reactions, or interrupt with generic advice. Maximum 42 words. Public conversation:\n${transcript}`,
        max_output_tokens: 90,
      }),
    });
    if (!response.ok) return "What part of that would you most enjoy sharing with a Kindred?";
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const generated = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    return (generated || "What part of that would you most enjoy sharing with a Kindred?").trim().slice(0, 500);
  }

  private async generateModeratorQuestion(client: import("pg").PoolClient, constellationId: string, constellationName: string, previousQuestion: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException("AI moderation is not configured yet.");
    const messages = await client.query<{ display_name: string; message_text: string }>(
      `SELECT COALESCE(profile.display_name, 'Participant') AS display_name, message.message_text
         FROM constellation_room_messages message LEFT JOIN discovery_profiles profile ON profile.user_id = message.sender_id
        WHERE message.room_key = $1 ORDER BY message.created_at DESC LIMIT 24`, [constellationId],
    );
    const privateSignals = await client.query<{ reason_code: string; count: string }>(
      `SELECT decision.reason_code, count(*)::text AS count FROM constellation_balloon_decisions decision
         JOIN constellation_match_sessions session ON session.id = decision.session_id
        WHERE session.constellation_id = $1 AND decision.balloon_active = false AND decision.reason_code IS NOT NULL
        GROUP BY decision.reason_code`, [constellationId],
    );
    const transcript = messages.rows.reverse().map((item) => `${item.display_name}: ${item.message_text}`).join("\n").slice(0, 7000);
    const signals = privateSignals.rows.map((item) => `${item.reason_code}:${item.count}`).join(", ");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODERATOR_MODEL || "gpt-5-mini",
        input: `You moderate a respectful adult relationship conversation called ${constellationName}. Ask exactly one concise, open-ended next question. Build naturally from participants' public answers. Never reveal private rejection data or identify who rejected whom. Use these rejection categories only as anonymous guidance: ${signals || "none"}. Previous question: ${previousQuestion}. Public conversation:\n${transcript || "No answers yet."}`,
        max_output_tokens: 100,
      }),
    });
    if (!response.ok) throw new ServiceUnavailableException("The AI moderator is temporarily unavailable.");
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const generated = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    return (generated || "What matters most to you in the way a relationship grows?").trim().slice(0, 500);
  }
}

function constellationProfilePhotoUri(matching: Record<string, unknown> | null, origin: string) {
  const data = matching || {};
  const version = typeof data.photoVersion === "string" ? data.photoVersion : "";
  const candidates: unknown[] = [
    data.bestPhotoUri,
    ...(Array.isArray(data.photos) ? data.photos.map((photo) => photo && typeof photo === "object" && "uri" in photo ? (photo as { uri?: unknown }).uri : undefined) : []),
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const trimmed = candidate.trim();
    const match = trimmed.match(/\/v1\/me\/private-space\/media\/profile-photo\/[0-9a-f-]{36}/i);
    if (match?.[0]) return `${origin}${match[0]}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  }
  return undefined;
}

function constellationAge(dateOfBirth: string) {
  const birth = new Date(dateOfBirth);
  if (!Number.isFinite(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 18 && age <= 120 ? age : undefined;
}
