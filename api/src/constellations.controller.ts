import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Param, Post, Req, Res, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { Response } from "express";
import sharp from "sharp";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";

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
}

class BalloonDecisionInput {
  @IsBoolean() keep!: boolean;
  @IsOptional() @IsIn(["children", "distance", "work_lifestyle", "family_goals", "values", "attraction", "communication", "other"]) reasonCode?: string;
  @IsOptional() @IsString() @MaxLength(500) privateNote?: string;
}

class MatchVoteInput { @IsIn(["yes", "not_yet", "no"]) vote!: "yes" | "not_yet" | "no"; }
class NextModeratorQuestionInput { @IsOptional() @IsString() @MaxLength(500) question?: string; }

class GenerateConstellationCoverInput {
  @IsString() @MinLength(2) @MaxLength(40) name!: string;
}

class SendConstellationRoomMessageInput {
  @IsString() @MinLength(1) @MaxLength(1000) text!: string;
}

class ReportConstellationRoomMessageInput {
  @IsString() @MaxLength(500) details!: string;
}

type ConstellationRow = {
  id: string; creator_id: string; name: string; description: string; requires_approval: boolean;
  published_at: string | null; created_at: string; member_count: string; membership_status: string | null;
  origin_city: string | null; origin_country: string | null; origin_latitude: number | null; origin_longitude: number | null;
  experience_type: "community" | "moderated_match"; moderator_type: "ai" | "human";
  featured_gender: "Man" | "Woman" | "Nonbinary"; audience_gender: "Men" | "Women" | "Everyone";
};

@Controller("v1/constellations")
export class ConstellationsController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get("rooms/:roomKey/messages")
  @UseGuards(AccessTokenGuard)
  async roomMessages(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const result = await client.query<{ id: string; sender_id: string; display_name: string; message_text: string; created_at: string }>(
        `SELECT message.id, message.sender_id, COALESCE(profile.display_name, 'Kindred') AS display_name,
                message.message_text, message.created_at
           FROM constellation_room_messages message
           LEFT JOIN discovery_profiles profile ON profile.user_id = message.sender_id
          WHERE message.room_key = $1
            AND NOT EXISTS (
              SELECT 1 FROM user_blocks block
               WHERE (block.blocker_id = $2 AND block.blocked_profile_id = message.sender_id::text)
                  OR (block.blocker_id = message.sender_id AND block.blocked_profile_id = $2::text)
            )
          ORDER BY message.created_at DESC LIMIT 100`,
        [roomKey, request.user.id],
      );
      return { messages: result.rows.reverse().map((row) => ({ id: row.id, senderId: row.sender_id, senderName: row.display_name, text: row.message_text, createdAt: row.created_at, own: row.sender_id === request.user.id })) };
    });
  }

  @Post("rooms/:roomKey/messages")
  @UseGuards(AccessTokenGuard)
  async sendRoomMessage(@Req() request: AuthenticatedRequest, @Param("roomKey") roomKey: string, @Body() input: SendConstellationRoomMessageInput) {
    return this.database.withUser(request.user.id, async (client) => {
      await this.assertRoomAccess(client, request.user.id, roomKey);
      const text = input.text.trim();
      if (!text) throw new BadRequestException("Write a message first.");
      const sender = await client.query<{ display_name: string }>(`SELECT display_name FROM discovery_profiles WHERE user_id = $1`, [request.user.id]);
      const created = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO constellation_room_messages (room_key, sender_id, message_text) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [roomKey, request.user.id, text],
      );
      return { id: created.rows[0]!.id, senderId: request.user.id, senderName: sender.rows[0]?.display_name || "Kindred", text, createdAt: created.rows[0]!.created_at, own: true };
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
              c.experience_type, c.moderator_type, c.featured_gender, c.audience_gender,
              c.origin_city, c.origin_country, c.origin_latitude, c.origin_longitude,
              c.accepted_count::text AS member_count,
              (SELECT m.status FROM constellation_members m WHERE m.constellation_id = c.id AND m.user_id = $1) AS membership_status
         FROM visible_constellations c CROSS JOIN viewer
        WHERE c.creator_id = $1
           OR EXISTS (SELECT 1 FROM constellation_members own_membership WHERE own_membership.constellation_id = c.id AND own_membership.user_id = $1 AND own_membership.status = 'accepted')
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
      const generated = await this.generateConstellationCover(input.name.trim());
      cover = await sharp(generated).rotate().resize(900, 900, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 86 }).toBuffer();
    }
    const row = await this.database.withUser(request.user.id, async (client) => {
      const origin = await client.query<{ city: string | null; country: string | null; latitude: number | null; longitude: number | null }>(
        `SELECT NULLIF(matching_data->>'currentLocation', '') AS city,
                NULLIF(matching_data->>'currentCountry', '') AS country,
                area_latitude AS latitude, area_longitude AS longitude
           FROM discovery_profiles WHERE user_id = $1`,
        [request.user.id],
      );
      const area = origin.rows[0];
      if (!area || area.latitude === null || area.longitude === null) {
        throw new BadRequestException("Add your current city to your profile before creating a local constellation.");
      }
      const created = await client.query<ConstellationRow>(
        `INSERT INTO constellations (creator_id, name, description, requires_approval, cover_mime_type, cover_data,
                                    origin_city, origin_country, origin_latitude, origin_longitude,
                                    experience_type, moderator_type, featured_gender, audience_gender)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, creator_id, name, description, requires_approval, published_at, created_at,
                   origin_city, origin_country, origin_latitude, origin_longitude,
                   experience_type, moderator_type, featured_gender, audience_gender,
                   '1'::text AS member_count, 'accepted'::text AS membership_status`,
        [request.user.id, input.name.trim(), input.description.trim(), input.requiresApproval, cover ? "image/webp" : null, cover,
          area.city || "Local community", area.country, area.latitude, area.longitude,
          input.experienceType || "community", input.moderatorType || "human", input.featuredGender || "Man", input.audienceGender || "Women"],
      );
      await client.query(
        `INSERT INTO constellation_members (constellation_id, user_id, status) VALUES ($1, $2, 'accepted')`,
        [created.rows[0]!.id, request.user.id],
      );
      return created.rows[0]!;
    });
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
      if (!room || room.experience_type !== "moderated_match") throw new BadRequestException("This is not a moderated match constellation.");
      await this.assertRoomAccess(client, request.user.id, id);
      let session = await client.query<{ id: string; featured_user_id: string | null; candidate_user_id: string | null; current_question: string; question_count: number; status: string }>(
        `SELECT id, featured_user_id, candidate_user_id, current_question, question_count, status
           FROM constellation_match_sessions WHERE constellation_id = $1
          ORDER BY created_at DESC LIMIT 1`, [id],
      );
      if (!session.rows[0]) {
        const featured = await client.query<{ user_id: string }>(
          `SELECT member.user_id FROM constellation_members member
             JOIN discovery_profiles profile ON profile.user_id = member.user_id
            WHERE member.constellation_id = $1 AND member.status = 'accepted' AND profile.gender = $2
            ORDER BY member.joined_at LIMIT 1`, [id, room.featured_gender],
        );
        session = await client.query(
          `INSERT INTO constellation_match_sessions (constellation_id, featured_user_id)
           VALUES ($1, $2) RETURNING id, featured_user_id, candidate_user_id, current_question, question_count, status`,
          [id, featured.rows[0]?.user_id || null],
        );
      }
      const active = session.rows[0]!;
      const ownDecision = await client.query<{ balloon_active: boolean; reason_code: string | null }>(
        `SELECT balloon_active, reason_code FROM constellation_balloon_decisions WHERE session_id = $1 AND user_id = $2`, [active.id, request.user.id],
      );
      const ownVote = await client.query<{ vote: "yes" | "not_yet" | "no" }>(
        `SELECT vote FROM constellation_match_votes WHERE session_id = $1 AND user_id = $2`, [active.id, request.user.id],
      );
      return {
        sessionId: active.id, featuredUserId: active.featured_user_id, candidateUserId: active.candidate_user_id,
        question: active.current_question, questionCount: active.question_count, status: active.status,
        moderatorType: room.moderator_type, featuredGender: room.featured_gender, audienceGender: room.audience_gender,
        creatorId: room.creator_id, ownBalloonActive: ownDecision.rows[0]?.balloon_active ?? true,
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
      if (!active || active.featured_user_id === request.user.id) throw new BadRequestException("A balloon decision is not available.");
      if (!input.keep && !input.reasonCode) throw new BadRequestException("Choose a private reason so future introductions can improve.");
      await client.query(
        `INSERT INTO constellation_balloon_decisions (session_id, user_id, balloon_active, reason_code, private_note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, user_id) DO UPDATE SET balloon_active = EXCLUDED.balloon_active,
           reason_code = EXCLUDED.reason_code, private_note = EXCLUDED.private_note, decided_at = now()`,
        [active.id, request.user.id, input.keep, input.keep ? null : input.reasonCode, input.keep ? "" : input.privateNote || ""],
      );
      return { balloonActive: input.keep };
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
    if (["sigma", "dog-people", "faith-purpose", "family-centered"].includes(roomKey)) return;
    if (!/^[0-9a-f-]{36}$/i.test(roomKey)) throw new BadRequestException("Constellation room is unavailable.");
    const membership = await client.query(
      `SELECT 1 FROM constellations constellation
        WHERE constellation.id = $1
          AND (constellation.creator_id = $2 OR EXISTS (
            SELECT 1 FROM constellation_members member
             WHERE member.constellation_id = constellation.id AND member.user_id = $2 AND member.status = 'accepted'
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
