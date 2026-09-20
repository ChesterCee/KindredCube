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
}

class GenerateConstellationCoverInput {
  @IsString() @MinLength(2) @MaxLength(40) name!: string;
}

type ConstellationRow = {
  id: string; creator_id: string; name: string; description: string; requires_approval: boolean;
  published_at: string | null; created_at: string; member_count: string; membership_status: string | null;
};

@Controller("v1/constellations")
export class ConstellationsController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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
      `SELECT c.id, c.creator_id, c.name, c.description, c.requires_approval, c.published_at, c.created_at,
              (SELECT count(*) FROM constellation_members m WHERE m.constellation_id = c.id AND m.status = 'accepted')::text AS member_count,
              (SELECT m.status FROM constellation_members m WHERE m.constellation_id = c.id AND m.user_id = $1) AS membership_status
         FROM constellations c
        WHERE c.published_at IS NOT NULL OR c.creator_id = $1
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
      const created = await client.query<ConstellationRow>(
        `INSERT INTO constellations (creator_id, name, description, requires_approval, cover_mime_type, cover_data)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, creator_id, name, description, requires_approval, published_at, created_at,
                   '1'::text AS member_count, 'accepted'::text AS membership_status`,
        [request.user.id, input.name.trim(), input.description.trim(), input.requiresApproval, cover ? "image/webp" : null, cover],
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
      const network = await client.query(
        `SELECT 1 WHERE EXISTS (
           SELECT 1 FROM chat_messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
         ) OR EXISTS (
           SELECT 1 FROM member_likes a JOIN member_likes b ON b.liker_id = a.liked_user_id AND b.liked_user_id = a.liker_id
            WHERE a.liker_id = $1 AND a.liked_user_id = $2
         )`, [request.user.id, row.creator_id],
      );
      if (!network.rowCount) throw new BadRequestException("This constellation is currently limited to the creator's network.");
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
    return {
      id: row.id, creatorId: row.creator_id, name: row.name, description: row.description,
      requiresApproval: row.requires_approval, memberCount, membershipStatus: row.membership_status,
      published: Boolean(row.published_at), membersNeededToPublish: Math.max(0, 10 - memberCount),
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
}
