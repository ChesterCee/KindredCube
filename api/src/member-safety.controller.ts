import { Body, Controller, Delete, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsEmail } from "class-validator";
import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";

export const safetyReasons = [
  "fake_profile",
  "harassment",
  "scam_or_money_request",
  "hate_or_discrimination",
  "inappropriate_content",
  "safety_concern",
  "other",
] as const;

class BlockMemberDto {
  @IsString()
  @Length(3, 128)
  profileId!: string;

  @IsOptional()
  @IsIn(safetyReasons)
  reason?: (typeof safetyReasons)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details = "";
}

class ReportMemberDto {
  @IsString()
  @Length(3, 128)
  profileId!: string;

  @IsIn(safetyReasons)
  reason!: (typeof safetyReasons)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details = "";
}

class AppealRevocationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  username = "";

  @IsString()
  @Length(20, 2000)
  details = "";
}

const autoSuspendUniqueSafetySignals = 5;

@Controller("v1/member-safety")
@UseGuards(AccessTokenGuard)
export class MemberSafetyController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post("blocks")
  block(@Req() request: AuthenticatedRequest, @Body() input: BlockMemberDto) {
    return this.database.withUser(request.user.id, async (client) => {
      await client.query(
        `INSERT INTO user_blocks (blocker_id, blocked_profile_id)
         VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_profile_id) DO UPDATE
           SET reason_code = COALESCE($3, user_blocks.reason_code),
               details = COALESCE(NULLIF($4, ''), user_blocks.details),
               status = 'active'`,
        [request.user.id, input.profileId, input.reason || null, input.details || ""],
      );
      const moderationAction = await maybeSuspendForSafetySignals(client, input.profileId, request.user.id);
      return { blocked: true, moderationAction };
    });
  }

  @Delete("blocks/:profileId")
  unblock(@Req() request: AuthenticatedRequest, @Param("profileId") profileId: string) {
    return this.database.withUser(request.user.id, async (client) => {
      await client.query(
        "DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_profile_id = $2",
        [request.user.id, profileId],
      );
      return { blocked: false };
    });
  }

  @Post("reports")
  report(@Req() request: AuthenticatedRequest, @Body() input: ReportMemberDto) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO safety_reports
          (reporter_id, reported_profile_id, reason_code, details)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [request.user.id, input.profileId, input.reason, input.details || ""],
      );
      const moderationAction = await maybeSuspendForSafetySignals(client, input.profileId, request.user.id);
      return { reportId: result.rows[0]!.id, status: "submitted", createdAt: result.rows[0]!.created_at, moderationAction };
    });
  }

  @Post("appeals")
  appeal(@Body() input: AppealRevocationDto) {
    return this.database.transaction(async (client) => {
      await client.query("SELECT set_config('app.admin', 'true', true)");
      const account = await client.query<{ id: string; public_username: string }>(
        `SELECT id, public_username::text FROM users
          WHERE email = $1 OR lower(public_username::text) = lower($2)
          LIMIT 1`,
        [input.email.trim().toLowerCase(), input.username.trim()],
      );
      const user = account.rows[0];
      const result = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO moderation_appeals (user_id, email, public_username, details)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [user?.id || null, input.email.trim().toLowerCase(), input.username.trim() || user?.public_username || "", input.details.trim()],
      );
      return { appealId: result.rows[0]!.id, status: "submitted", createdAt: result.rows[0]!.created_at };
    });
  }
}

async function maybeSuspendForSafetySignals(
  client: import("pg").PoolClient,
  profileId: string,
  actorId: string,
) {
  const target = await client.query<{ id: string; status: string }>(
    "SELECT id, status FROM users WHERE id::text = $1 FOR UPDATE",
    [profileId],
  );
  const user = target.rows[0];
  if (!user || user.status !== "active") return null;
  const counts = await client.query<{ blocks: string; reports: string }>(
    `SELECT
       (SELECT count(DISTINCT blocker_id)::text FROM user_blocks WHERE blocked_profile_id = $1 AND status = 'active') AS blocks,
       (SELECT count(DISTINCT reporter_id)::text FROM safety_reports WHERE reported_profile_id = $1 AND status IN ('submitted', 'reviewing')) AS reports`,
    [profileId],
  );
  const uniqueSignals = Number(counts.rows[0]?.blocks || 0) + Number(counts.rows[0]?.reports || 0);
  if (uniqueSignals < autoSuspendUniqueSafetySignals) return null;
  await client.query(
    `UPDATE users SET status = 'suspended', updated_at = now()
      WHERE id = $1 AND status = 'active'`,
    [user.id],
  );
  await client.query(
    `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'safety_auto_suspension'
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [user.id],
  );
  await client.query(
    `INSERT INTO auth_audit_events (user_id, event_type, metadata)
     VALUES ($1, 'account_suspended_for_safety_signals', $2::jsonb)`,
    [user.id, JSON.stringify({ uniqueSignals, triggeredBy: actorId })],
  );
  return { action: "suspended_pending_review", uniqueSignals };
}
