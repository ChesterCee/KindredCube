import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Body, Controller, ForbiddenException, Get, Headers, Inject, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";
import { EmailService } from "./email.service";

class ModerationActionDto {
  @IsIn(["suspend", "reinstate", "close_reports", "ban"])
  action!: "suspend" | "reinstate" | "close_reports" | "ban";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes = "";
}

class AppealReviewDto {
  @IsIn(["reviewing", "accepted", "rejected"])
  status!: "reviewing" | "accepted" | "rejected";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes = "";
}

class AdminMfaVerifyDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

class HelpContentUpdateDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  summary = "";

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  body = "";

  @IsOptional()
  @IsArray()
  imageUrls: unknown[] = [];
}

class SupportTicketReplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  message!: string;
}

class SupportTicketCloseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

const HELP_CONTENT_SLUGS = new Set([
  "photos",
  "bio",
  "prompts",
  "interests",
  "values",
  "profile-strength",
  "login-email-password",
  "verification",
  "notifications",
  "account-access",
  "export-data",
  "privacy-choices",
  "delete-account",
  "blocked-users",
  "saved-profile-data",
]);

const HELP_CONTENT_CATEGORY_BY_SLUG = new Map<string, "profile_setup" | "account_management" | "data_management">([
  ["photos", "profile_setup"],
  ["bio", "profile_setup"],
  ["prompts", "profile_setup"],
  ["interests", "profile_setup"],
  ["values", "profile_setup"],
  ["profile-strength", "profile_setup"],
  ["login-email-password", "account_management"],
  ["verification", "account_management"],
  ["notifications", "account_management"],
  ["account-access", "account_management"],
  ["export-data", "data_management"],
  ["privacy-choices", "data_management"],
  ["delete-account", "data_management"],
  ["blocked-users", "data_management"],
  ["saved-profile-data", "data_management"],
]);

const LEGAL_CONTENT_SLUGS = new Set(["privacy", "terms", "community-guidelines"]);

const SOLE_MODERATION_OWNER_EMAIL =
  (process.env.ADMIN_OWNER_EMAIL || "chester.chirenje@tectavis.com").trim().toLowerCase();

@Controller("v1/admin/moderation")
@UseGuards(AccessTokenGuard)
export class AdminModerationController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  @Post("mfa/challenge")
  async requestMfa(@Req() request: AuthenticatedRequest) {
    const admin = await this.assertAdminAccount(request.user.id);
    if (!process.env.ADMIN_TOTP_SECRET) {
      throw new ForbiddenException("ADMIN_TOTP_SECRET is required for admin authenticator verification.");
    }
    return { totpRequired: true, account: admin.email, issuer: process.env.ADMIN_TOTP_ISSUER || "KindredCube", expiresInSeconds: 30 };
  }

  @Post("mfa/verify")
  async verifyMfa(@Req() request: AuthenticatedRequest, @Body() input: AdminMfaVerifyDto) {
    await this.assertAdminAccount(request.user.id);
    if (!verifyTotp(input.code, process.env.ADMIN_TOTP_SECRET || "")) {
      throw new ForbiddenException("Authenticator code is invalid or expired.");
    }
    return this.database.withUser(request.user.id, async (client) => {
      const token = randomBytes(32).toString("base64url");
      await client.query(
        `INSERT INTO admin_mfa_challenges (user_id, session_id, code_hash, token_hash, expires_at, verified_at)
         VALUES ($1, $2, $3, $4, now() + interval '1 hour', now())`,
        [request.user.id, request.user.sessionId, sha256("totp"), sha256(token)],
      );
      return { adminMfaToken: token, expiresInSeconds: 3600 };
    });
  }

  @Get("queue")
  async queue(@Req() request: AuthenticatedRequest, @Headers("x-admin-mfa") adminMfaToken?: string) {
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const userStats = await safeRows<{ total_users: number; active_users: number; pending_users: number; suspended_users: number; deleted_users: number }>(client,
        `SELECT
           count(*)::int AS total_users,
           count(*) FILTER (WHERE status = 'active')::int AS active_users,
           count(*) FILTER (WHERE status = 'pending_email_verification')::int AS pending_users,
           count(*) FILTER (WHERE status = 'suspended')::int AS suspended_users,
           count(*) FILTER (WHERE status = 'deleted')::int AS deleted_users
         FROM users`,
        [],
        [{ total_users: 0, active_users: 0, pending_users: 0, suspended_users: 0, deleted_users: 0 }],
        "admin user stats",
      );
      const purchaseStats = await safeRows(client,
        `SELECT purchase_type, status, count(*)::int AS count, COALESCE(sum(amount_cents), 0)::int AS amount_cents
           FROM payment_orders
          GROUP BY purchase_type, status
          ORDER BY purchase_type, status`,
        [],
        [],
        "admin purchase stats",
      );
      const purchases = await safeRows(client,
        `SELECT po.id, po.user_id, u.public_username::text AS username, po.purchase_type, po.status,
                po.amount_cents, po.currency, po.created_at, po.paid_at
           FROM payment_orders po
           JOIN users u ON u.id = po.user_id
          ORDER BY po.created_at DESC
          LIMIT 120`,
        [],
        [],
        "admin purchases",
      );
      const reports = await safeRows(client,
        `WITH targets AS (
           SELECT reported_profile_id AS profile_id FROM safety_reports
           UNION
           SELECT blocked_profile_id AS profile_id FROM user_blocks
         )
         SELECT
           t.profile_id,
           u.public_username::text AS username,
           u.email::text AS email,
           u.status AS account_status,
           COALESCE(r.report_count, 0)::int AS report_count,
           COALESCE(b.block_count, 0)::int AS block_count,
           lr.reason_code AS latest_report_reason,
           lr.details AS latest_report_details,
           lb.reason_code AS latest_block_reason,
           lb.details AS latest_block_details,
           GREATEST(COALESCE(r.latest_at, '-infinity'::timestamptz), COALESCE(b.latest_at, '-infinity'::timestamptz)) AS latest_at
          FROM targets t
          LEFT JOIN users u ON u.id::text = t.profile_id
          LEFT JOIN LATERAL (
            SELECT count(*) AS report_count, max(created_at) AS latest_at
              FROM safety_reports WHERE reported_profile_id = t.profile_id
          ) r ON true
          LEFT JOIN LATERAL (
            SELECT count(*) AS block_count, max(created_at) AS latest_at
              FROM user_blocks WHERE blocked_profile_id = t.profile_id AND status = 'active'
          ) b ON true
          LEFT JOIN LATERAL (
            SELECT reason_code, details FROM safety_reports
             WHERE reported_profile_id = t.profile_id
             ORDER BY created_at DESC LIMIT 1
          ) lr ON true
          LEFT JOIN LATERAL (
            SELECT reason_code, details FROM user_blocks
             WHERE blocked_profile_id = t.profile_id AND status = 'active'
             ORDER BY created_at DESC LIMIT 1
          ) lb ON true
         ORDER BY latest_at DESC
         LIMIT 100`,
        [],
        [],
        "admin reports and blocks",
      );
      const appeals = await safeRows(client,
        `SELECT id, user_id, email::text, public_username, details, status, created_at, reviewed_at, moderator_notes
           FROM moderation_appeals
          WHERE status IN ('submitted', 'reviewing')
          ORDER BY created_at DESC
          LIMIT 50`,
        [],
        [],
        "admin appeals",
      );
      const supportTickets = await safeRows(client,
        `SELECT st.id, st.ticket_number AS "ticketNumber", st.user_id AS "userId",
                COALESCE(u.email::text, st.contact_email) AS email,
                COALESCE(u.public_username::text, st.contact_email, 'Email support') AS username,
                st.reason, st.message, st.status, st.email_reply_token AS "emailReplyToken",
                st.close_reason AS "closeReason", st.closed_at AS "closedAt",
                st.created_at AS "createdAt",
                st.updated_at AS "updatedAt"
           FROM support_tickets st
           LEFT JOIN users u ON u.id = st.user_id
          ORDER BY st.created_at DESC
          LIMIT 100`,
        [],
        [],
        "admin support tickets",
      );
      return {
        stats: userStats[0],
        purchaseStats,
        purchases,
        queue: reports,
        appeals,
        supportTickets: await hydrateSupportTicketMessages(client, supportTickets),
      };
    });
  }

  @Post("support-tickets/:ticketId/reply")
  async replyToSupportTicket(
    @Req() request: AuthenticatedRequest,
    @Headers("x-admin-mfa") adminMfaToken: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() input: SupportTicketReplyDto,
  ) {
    const message = input.message.trim();
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const ticketResult = await client.query<{
        id: string;
        ticketNumber: string;
        email: string;
        emailReplyToken: string | null;
        status: string;
      }>(
        `SELECT st.id, st.ticket_number AS "ticketNumber",
                COALESCE(u.email::text, st.contact_email) AS email,
                st.email_reply_token AS "emailReplyToken",
                st.status
           FROM support_tickets st
           LEFT JOIN users u ON u.id = st.user_id
          WHERE st.id = $1
          LIMIT 1`,
        [ticketId],
      );
      const ticket = ticketResult.rows[0];
      if (!ticket) throw new ForbiddenException("Support ticket not found.");
      if (ticket.status === "closed" || ticket.status === "resolved") {
        throw new ForbiddenException("This support ticket is closed.");
      }
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, body, source)
         VALUES ($1, 'admin', $2, $3, 'admin')`,
        [ticket.id, request.user.id, message],
      );
      const updated = await client.query(
        `UPDATE support_tickets
            SET status = 'in_review',
                updated_at = now()
          WHERE id = $1
          RETURNING id, ticket_number AS "ticketNumber", user_id AS "userId",
                    reason, message, status, email_reply_token AS "emailReplyToken",
                    close_reason AS "closeReason", closed_at AS "closedAt",
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ticket.id],
      );
      await this.email.sendSupportTicketReply({
        to: ticket.email,
        ticketNumber: ticket.ticketNumber,
        replyToken: ticket.emailReplyToken,
        message,
      });
      const hydrated = await hydrateSupportTicketMessages(client, [{ ...updated.rows[0], email: ticket.email }]);
      return { ticket: hydrated[0], sent: true };
    });
  }

  @Post("support-tickets/:ticketId/close")
  async closeSupportTicket(
    @Req() request: AuthenticatedRequest,
    @Headers("x-admin-mfa") adminMfaToken: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() input: SupportTicketCloseDto,
  ) {
    const reason = input.reason.trim();
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const ticketResult = await client.query<{
        id: string;
        ticketNumber: string;
        email: string;
        emailReplyToken: string | null;
        status: string;
      }>(
        `SELECT st.id, st.ticket_number AS "ticketNumber",
                COALESCE(u.email::text, st.contact_email) AS email,
                st.email_reply_token AS "emailReplyToken",
                st.status
           FROM support_tickets st
           LEFT JOIN users u ON u.id = st.user_id
          WHERE st.id = $1
          LIMIT 1`,
        [ticketId],
      );
      const ticket = ticketResult.rows[0];
      if (!ticket) throw new ForbiddenException("Support ticket not found.");
      if (ticket.status === "closed" || ticket.status === "resolved") {
        throw new ForbiddenException("This support ticket is already closed.");
      }
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, body, source)
         VALUES ($1, 'admin', $2, $3, 'admin')`,
        [ticket.id, request.user.id, `Ticket closed: ${reason}`],
      );
      const updated = await client.query(
        `UPDATE support_tickets
            SET status = 'closed',
                close_reason = $2,
                closed_at = now(),
                updated_at = now()
          WHERE id = $1
          RETURNING id, ticket_number AS "ticketNumber", user_id AS "userId",
                    reason, message, status, email_reply_token AS "emailReplyToken",
                    close_reason AS "closeReason", closed_at AS "closedAt",
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ticket.id, reason],
      );
      await this.email.sendSupportTicketReply({
        to: ticket.email,
        ticketNumber: ticket.ticketNumber,
        replyToken: ticket.emailReplyToken,
        message: `Your KindredCube support ticket has been closed.\n\nReason: ${reason}`,
      });
      const hydrated = await hydrateSupportTicketMessages(client, [{ ...updated.rows[0], email: ticket.email }]);
      return { ticket: hydrated[0], closed: true };
    });
  }

  @Get("help-content")
  async helpContent(@Req() request: AuthenticatedRequest, @Headers("x-admin-mfa") adminMfaToken?: string) {
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const result = await client.query(
        `SELECT slug, category, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"
           FROM help_content_pages
          ORDER BY category, title`,
      );
      return { pages: result.rows };
    });
  }

  @Put("help-content/:slug")
  async updateHelpContent(
    @Req() request: AuthenticatedRequest,
    @Headers("x-admin-mfa") adminMfaToken: string | undefined,
    @Param("slug") slug: string,
    @Body() input: HelpContentUpdateDto,
  ) {
    if (!HELP_CONTENT_SLUGS.has(slug)) throw new ForbiddenException("Unknown help page.");
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const imageUrls = input.imageUrls
        .filter((url): url is string => typeof url === "string")
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url))
        .slice(0, 12);
      const result = await client.query(
        `INSERT INTO help_content_pages (slug, category, title, summary, body, image_urls, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
         ON CONFLICT (slug) DO UPDATE
            SET title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                body = EXCLUDED.body,
                image_urls = EXCLUDED.image_urls,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
          RETURNING slug, category, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"`,
        [
          slug,
          HELP_CONTENT_CATEGORY_BY_SLUG.get(slug) || "profile_setup",
          input.title.trim().slice(0, 120),
          input.summary.trim().slice(0, 400),
          input.body.trim().slice(0, 20_000),
          JSON.stringify(imageUrls),
          request.user.id,
        ],
      );
      return { page: result.rows[0], saved: true };
    });
  }

  @Get("legal-content")
  async legalContent(@Req() request: AuthenticatedRequest, @Headers("x-admin-mfa") adminMfaToken?: string) {
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const pages = await safeRows(client,
        `SELECT slug, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"
           FROM legal_content_pages
          ORDER BY CASE slug
            WHEN 'privacy' THEN 1
            WHEN 'terms' THEN 2
            WHEN 'community-guidelines' THEN 3
            ELSE 9
          END`,
        [],
        [],
        "admin legal content",
      );
      return { pages };
    });
  }

  @Put("legal-content/:slug")
  async updateLegalContent(
    @Req() request: AuthenticatedRequest,
    @Headers("x-admin-mfa") adminMfaToken: string | undefined,
    @Param("slug") slug: string,
    @Body() input: HelpContentUpdateDto,
  ) {
    if (!LEGAL_CONTENT_SLUGS.has(slug)) throw new ForbiddenException("Unknown legal page.");
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const imageUrls = input.imageUrls
        .filter((url): url is string => typeof url === "string")
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url))
        .slice(0, 24);
      const result = await client.query(
        `INSERT INTO legal_content_pages (slug, title, summary, body, image_urls, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
         ON CONFLICT (slug) DO UPDATE
            SET title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                body = EXCLUDED.body,
                image_urls = EXCLUDED.image_urls,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
          RETURNING slug, title, summary, body, image_urls AS "imageUrls", updated_at AS "updatedAt"`,
        [
          slug,
          input.title.trim().slice(0, 120),
          input.summary.trim().slice(0, 400),
          input.body.trim().slice(0, 50_000),
          JSON.stringify(imageUrls),
          request.user.id,
        ],
      );
      return { page: result.rows[0], saved: true };
    });
  }

  @Post("profiles/:profileId")
  action(
    @Req() request: AuthenticatedRequest,
    @Param("profileId") profileId: string,
    @Body() input: ModerationActionDto,
    @Headers("x-admin-mfa") adminMfaToken?: string,
  ) {
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      if (input.action === "suspend") {
        await client.query("UPDATE users SET status = 'suspended', updated_at = now() WHERE id::text = $1", [profileId]);
        await client.query(
          "UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'moderator_suspension' WHERE user_id::text = $1 AND revoked_at IS NULL",
          [profileId],
        );
      }
      if (input.action === "ban") {
        const target = await client.query<{
          id: string;
          email: string;
          public_username: string;
          profile_data: Record<string, unknown> | null;
        }>(
          `SELECT u.id, u.email::text, u.public_username::text, ps.profile_data
             FROM users u
             LEFT JOIN user_private_spaces ps ON ps.user_id = u.id
            WHERE u.id::text = $1
            FOR UPDATE`,
          [profileId],
        );
        const account = target.rows[0];
        if (account) {
          await client.query(
            `INSERT INTO platform_bans
              (user_id, email_hash, username_hash, photo_fingerprints, reason, notes, created_by)
             VALUES ($1, $2, $3, $4::jsonb, 'permanent_platform_ban', $5, $6)`,
            [
              account.id,
              sha256(account.email.trim().toLowerCase()),
              sha256(account.public_username.trim().toLowerCase()),
              JSON.stringify(profilePhotoFingerprints(account.profile_data || {})),
              input.notes || "",
              request.user.id,
            ],
          );
          await client.query("UPDATE users SET status = 'banned', updated_at = now() WHERE id = $1", [account.id]);
          await client.query(
            "UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'permanent_platform_ban' WHERE user_id = $1 AND revoked_at IS NULL",
            [account.id],
          );
        }
      }
      if (input.action === "reinstate") {
        await client.query("UPDATE users SET status = 'active', updated_at = now() WHERE id::text = $1 AND status = 'suspended'", [profileId]);
      }
      await client.query(
        `UPDATE safety_reports
            SET status = $2, reviewed_at = now(), reviewed_by = $3, moderator_notes = $4, action_taken = $5
          WHERE reported_profile_id = $1 AND status IN ('submitted', 'reviewing')`,
        [profileId, input.action === "close_reports" ? "closed" : "actioned", request.user.id, input.notes || "", input.action],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type, metadata)
         VALUES ((SELECT id FROM users WHERE id::text = $1), 'moderation_action', $2::jsonb)`,
        [profileId, JSON.stringify({ action: input.action, moderatorId: request.user.id })],
      );
      return { profileId, action: input.action, saved: true };
    });
  }

  @Post("appeals/:appealId")
  reviewAppeal(
    @Req() request: AuthenticatedRequest,
    @Param("appealId") appealId: string,
    @Body() input: AppealReviewDto,
    @Headers("x-admin-mfa") adminMfaToken?: string,
  ) {
    return this.withAdmin(request.user.id, request.user.sessionId, adminMfaToken, async (client) => {
      const result = await client.query<{ user_id: string | null }>(
        `UPDATE moderation_appeals
            SET status = $2, reviewer_id = $3, moderator_notes = $4,
                reviewed_at = CASE WHEN $2 IN ('accepted', 'rejected') THEN now() ELSE reviewed_at END
          WHERE id = $1
          RETURNING user_id`,
        [appealId, input.status, request.user.id, input.notes || ""],
      );
      const userId = result.rows[0]?.user_id;
      if (input.status === "accepted" && userId) {
        await client.query("UPDATE users SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'suspended'", [userId]);
      }
      return { appealId, status: input.status, saved: true };
    });
  }

  private async assertAdminAccount(userId: string) {
    const account = await this.database.query<{ email: string }>(
      "SELECT email::text FROM users WHERE id = $1",
      [userId],
    );
    const email = account.rows[0]?.email?.toLowerCase();
    if (!email || email !== SOLE_MODERATION_OWNER_EMAIL) {
      throw new ForbiddenException("Moderator access is required.");
    }
    return { email };
  }

  private async withAdmin<T>(userId: string, sessionId: string, adminMfaToken: string | undefined, work: (client: import("pg").PoolClient) => Promise<T>) {
    await this.assertAdminAccount(userId);
    if (!adminMfaToken || adminMfaToken.length > 256) throw new ForbiddenException("Admin two-factor verification is required.");
    return this.database.transaction(async (client) => {
      await client.query("SELECT set_config('app.admin', 'true', true)");
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.admin_owner_email', $1, true)", [SOLE_MODERATION_OWNER_EMAIL]);
      const verified = await client.query(
        `SELECT 1 FROM admin_mfa_challenges
          WHERE user_id = $1
            AND session_id = $2
            AND token_hash = $3
            AND verified_at IS NOT NULL
            AND expires_at > now()
            AND verified_at > now() - interval '1 hour'
          LIMIT 1`,
        [userId, sessionId, sha256(adminMfaToken)],
      );
      if (!verified.rowCount) throw new ForbiddenException("Admin two-factor verification is required.");
      return work(client);
    });
  }
}

async function hydrateSupportTicketMessages(client: import("pg").PoolClient, tickets: any[]) {
  if (!tickets.length) return tickets;
  const ids = tickets.map((ticket) => ticket.id);
  const messages = await safeRows<any>(client,
    `SELECT id, ticket_id AS "ticketId", sender_type AS "senderType",
            sender_user_id AS "senderUserId", sender_email AS "senderEmail",
            body, source, created_at AS "createdAt"
       FROM support_ticket_messages
      WHERE ticket_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [ids],
    [],
    "admin support ticket messages",
  );
  const byTicket = new Map<string, any[]>();
  for (const message of messages) {
    const list = byTicket.get(message.ticketId) || [];
    list.push(message);
    byTicket.set(message.ticketId, list);
  }
  return tickets.map((ticket) => ({ ...ticket, messages: byTicket.get(ticket.id) || [] }));
}

async function safeRows<T extends import("pg").QueryResultRow = any>(
  client: import("pg").PoolClient,
  sql: string,
  params: unknown[] = [],
  fallback: T[] = [],
  label = "admin query",
): Promise<T[]> {
  const savepoint = `admin_safe_query_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await client.query(`SAVEPOINT ${savepoint}`);
    const result = await client.query<T>(sql, params);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return result.rows;
  } catch (error) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch {
      // If the connection is already unusable, let the fallback response continue as far as possible.
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[AdminModerationController] ${label} unavailable: ${detail}`);
    return fallback;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function profilePhotoFingerprints(profile: Record<string, unknown>) {
  const photos = Array.isArray(profile.photos) ? profile.photos : [];
  const values = photos
    .map((photo) => photo && typeof photo === "object" ? (photo as Record<string, unknown>).uri : undefined)
    .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0);
  const best = typeof profile.bestPhotoUri === "string" ? profile.bestPhotoUri : "";
  return [...new Set([...values, best].filter(Boolean).map((value) => sha256(value.trim())))];
}

function verifyTotp(code: string, secret: string) {
  const normalizedCode = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalizedCode) || !secret) return false;
  const now = Math.floor(Date.now() / 1000 / 30);
  return [-2, -1, 0, 1, 2].some((offset) => safeEqual(normalizedCode, totp(secret, now + offset)));
}

function totp(secret: string, counter: number) {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | (digest[offset + 1]! << 16)
    | (digest[offset + 2]! << 8)
    | digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new ForbiddenException("ADMIN_TOTP_SECRET must be Base32.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function safeEqual(first: string, second: string) {
  const left = Buffer.from(first);
  const right = Buffer.from(second);
  return left.length === right.length && timingSafeEqual(left, right);
}
