import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "../database.service";

type AccessClaims = { sub: string; sid: string; type: "access" };

@Injectable()
export class TokenService {
  private readonly tokenPepper: string;
  private readonly refreshTokenTtlDays: number;

  constructor(
    @Inject(JwtService)
    private readonly jwt: JwtService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {
    this.tokenPepper = process.env.SESSION_TOKEN_PEPPER || "";
    if (this.tokenPepper.length < 32) {
      throw new Error("SESSION_TOKEN_PEPPER must be at least 32 characters");
    }
    const configuredRefreshDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || "180");
    this.refreshTokenTtlDays = Number.isFinite(configuredRefreshDays)
      ? Math.min(Math.max(Math.trunc(configuredRefreshDays), 1), 365)
      : 180;
  }

  async createSession(userId: string, deviceName: string | undefined, userAgent: string) {
    return this.database.transaction(async (client) => {
      const userAgentHash = this.hashOpaque(userAgent || "unknown");
      const session = await client.query<{ id: string }>(
        `INSERT INTO auth_sessions (user_id, device_name, user_agent_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, deviceName || null, userAgentHash],
      );
      return this.issuePair(client, userId, session.rows[0]!.id);
    });
  }

  async exchangeEmailLoginTicket(
    rawTicket: string,
    deviceName: string | undefined,
    userAgent: string,
  ) {
    const ticketHash = createHash("sha256").update(rawTicket).digest("hex");
    return this.database.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        user_id: string;
        email: string;
        public_username: string;
        first_name: string;
        last_name: string;
      }>(
        `SELECT t.id, t.user_id, u.email::text, u.public_username::text,
                u.first_name, u.last_name
           FROM email_login_tickets t
           JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1
            AND t.consumed_at IS NULL
            AND t.expires_at > now()
            AND u.status = 'active'
            AND u.email_verified_at IS NOT NULL
          FOR UPDATE OF t`,
        [ticketHash],
      );
      const ticket = found.rows[0];
      if (!ticket) {
        throw new UnauthorizedException(
          "This confirmation link is invalid or has expired. Request a new confirmation email.",
        );
      }
      await client.query(
        "UPDATE email_login_tickets SET consumed_at = now() WHERE id = $1",
        [ticket.id],
      );
      await client.query("SELECT set_config('app.user_id', $1, true)", [ticket.user_id]);
      const privateSpace = await client.query<{
        profile_data: Record<string, unknown>;
      }>(
        "SELECT profile_data FROM user_private_spaces WHERE user_id = $1",
        [ticket.user_id],
      );
      const profile = privateSpace.rows[0]?.profile_data || {};
      const userAgentHash = this.hashOpaque(userAgent || "unknown");
      const session = await client.query<{ id: string }>(
        `INSERT INTO auth_sessions (user_id, device_name, user_agent_hash)
         VALUES ($1, $2, $3) RETURNING id`,
        [ticket.user_id, deviceName || null, userAgentHash],
      );
      const pair = await this.issuePair(client, ticket.user_id, session.rows[0]!.id);
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type, session_id, metadata)
         VALUES ($1, 'login_succeeded', $2, '{"method":"email_confirmation"}')`,
        [ticket.user_id, session.rows[0]!.id],
      );
      return {
        ...pair,
        user: {
          id: ticket.user_id,
          email: ticket.email,
          username: ticket.public_username,
          firstName: ticket.first_name,
          lastName: ticket.last_name,
          emailVerified: true,
          identity: typeof profile.identity === "string" ? profile.identity : "",
          seeking: typeof profile.seeking === "string" ? profile.seeking : "",
        },
      };
    });
  }

  async rotate(refreshToken: string) {
    const tokenHash = this.hashOpaque(refreshToken);
    const result = await this.database.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        session_id: string;
        user_id: string;
        used_at: Date | null;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT rt.id, rt.session_id, rt.used_at, rt.expires_at,
                s.user_id, s.revoked_at
           FROM session_refresh_tokens rt
           JOIN auth_sessions s ON s.id = rt.session_id
          WHERE rt.token_hash = $1
          FOR UPDATE`,
        [tokenHash],
      );
      const row = found.rows[0];
      if (!row || row.revoked_at || row.expires_at <= new Date()) {
        throw new UnauthorizedException("Session is no longer valid.");
      }
      if (row.used_at) {
        await client.query(
          `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'refresh_token_reuse'
            WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.user_id],
        );
        await client.query(
          `INSERT INTO auth_audit_events (user_id, event_type, session_id, metadata)
           VALUES ($1, 'refresh_token_reuse_detected', $2, '{"action":"all_sessions_revoked"}')`,
          [row.user_id, row.session_id],
        );
        return { reuseDetected: true as const };
      }
      await client.query("UPDATE session_refresh_tokens SET used_at = now() WHERE id = $1", [row.id]);
      await client.query("UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1", [row.session_id]);
      return { pair: await this.issuePair(client, row.user_id, row.session_id) };
    });
    if ("reuseDetected" in result) {
      throw new UnauthorizedException("Session reuse was detected. Sign in again.");
    }
    return result.pair;
  }

  async revoke(refreshToken: string) {
    const tokenHash = this.hashOpaque(refreshToken);
    await this.database.query(
      `UPDATE auth_sessions s SET revoked_at = now(), revoke_reason = 'user_logout'
        FROM session_refresh_tokens rt
       WHERE rt.session_id = s.id AND rt.token_hash = $1 AND s.revoked_at IS NULL`,
      [tokenHash],
    );
  }

  async verifyAccessToken(token: string): Promise<AccessClaims> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        issuer: "kindredcube-api",
        audience: "kindredcube-app",
      });
    } catch {
      throw new UnauthorizedException("Session expired. Sign in again.");
    }
    if (claims.type !== "access" || !claims.sub || !claims.sid) {
      throw new UnauthorizedException("Invalid access token.");
    }
    const session = await this.database.query(
      `SELECT 1
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1
          AND s.user_id = $2
          AND s.revoked_at IS NULL
          AND u.status = 'active'`,
      [claims.sid, claims.sub],
    );
    if (!session.rowCount) throw new UnauthorizedException("Session is no longer valid.");
    await this.database.recordActivity(claims.sub);
    return claims;
  }

  private async issuePair(client: PoolClient, userId: string, sessionId: string) {
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = this.hashOpaque(refreshToken);
    await client.query(
      `INSERT INTO session_refresh_tokens (session_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3::int * interval '1 day'))`,
      [sessionId, refreshTokenHash, this.refreshTokenTtlDays],
    );
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, type: "access" },
      { issuer: "kindredcube-api", audience: "kindredcube-app", expiresIn: "10m" },
    );
    return { accessToken, refreshToken, accessTokenExpiresInSeconds: 600 };
  }

  private hashOpaque(value: string) {
    return createHmac("sha256", this.tokenPepper).update(value).digest("hex");
  }
}
