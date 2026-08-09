import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseError } from "pg";
import { DatabaseService } from "../database.service";
import { EmailService } from "../email.service";
import { LoginDto, RegisterDto } from "./auth.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { syncDiscoveryProfile } from "../discovery-profile";
import { deleteExpiredPendingAccounts } from "../pending-account-cleanup.service";

const GENERIC_REGISTRATION_MESSAGE =
  "If this address can be registered, a private confirmation link will be sent shortly.";
const GENERIC_RESEND_MESSAGE =
  "If this account still needs confirmation, a new private link will be sent shortly.";
const GENERIC_PASSWORD_RESET_MESSAGE =
  "If an eligible account uses this email, a private password reset link will be sent shortly.";
const LOGIN_FAILURE_WINDOW_MINUTES = 15;
const LOGIN_LOCK_MINUTES = 15;
const LOGIN_FAILURES_BEFORE_LOCK = 5;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(PasswordService)
    private readonly passwords: PasswordService,
    @Inject(TokenService)
    private readonly tokens: TokenService,
    @Inject(EmailService)
    private readonly emails: EmailService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    await this.assertNotPlatformBanned({ email, username });
    if (!isAdultDateOfBirth(input.dateOfBirth)) {
      throw new BadRequestException("KindredCube is only available to adults age 18 and older.");
    }
    this.passwords.validatePolicy(input.password, { email, username });

    // Hash before the account lookup so registration timing does not reveal existing email addresses.
    const passwordHash = await this.passwords.hash(input.password);
    const verificationToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(verificationToken);

    let user: { id: string; email: string; first_name: string } | null = null;
    try {
      user = await this.database.transaction(async (client) => {
        await deleteExpiredPendingAccounts(client);
        const existing = await client.query<{
          id: string;
          email: string;
          first_name: string;
          status: string;
          email_verified_at: Date | null;
        }>(
          "SELECT id, email::text, first_name, status, email_verified_at FROM users WHERE email = $1 FOR UPDATE",
          [email],
        );
        const existingAccount = existing.rows[0];
        if (existingAccount) {
          if (
            existingAccount.status === "pending_email_verification" &&
            !existingAccount.email_verified_at
          ) {
            await client.query(
              `UPDATE email_verification_tokens
                  SET consumed_at = now()
                WHERE user_id = $1 AND consumed_at IS NULL`,
              [existingAccount.id],
            );
            await client.query(
              `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
               VALUES ($1, $2, now() + interval '30 minutes')`,
              [existingAccount.id, tokenHash],
            );
            await client.query(
              `INSERT INTO auth_audit_events (user_id, event_type)
               VALUES ($1, 'email_verification_resent_from_registration')`,
              [existingAccount.id],
            );
            return existingAccount;
          }
          return null;
        }

        const usernameTaken = await client.query(
          "SELECT 1 FROM users WHERE public_username = $1",
          [username],
        );
        if (usernameTaken.rowCount) {
          throw new ConflictException("That username is unavailable. Choose another one.");
        }

        const inserted = await client.query<{ id: string; email: string; first_name: string }>(
          `INSERT INTO users (email, public_username, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email::text, first_name`,
          [email, username, input.firstName.trim(), input.lastName.trim()],
        );
        const created = inserted.rows[0]!;
        await client.query(
          "INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)",
          [created.id, passwordHash],
        );
        await client.query("SELECT set_config('app.user_id', $1, true)", [created.id]);
        await client.query(
          `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '30 minutes')`,
          [created.id, tokenHash],
        );
        const initialProfile = {
          identity: input.identity,
          seeking: input.seeking,
          dateOfBirth: input.dateOfBirth,
          details: {
            Gender: input.identity,
            "Star sign": starSignFromDateOfBirth(input.dateOfBirth),
          },
        };
        await client.query(
          `INSERT INTO user_private_spaces (user_id, profile_data)
           VALUES ($1, $2::jsonb)`,
          [created.id, JSON.stringify(initialProfile)],
        );
        await syncDiscoveryProfile(client, created.id, initialProfile, {});
        await client.query(
          `INSERT INTO auth_audit_events (user_id, event_type)
           VALUES ($1, 'account_registered')`,
          [created.id],
        );
        return created;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof DatabaseError && error.code === "23505") {
        if (error.constraint?.includes("public_username")) {
          throw new ConflictException("That username is unavailable. Choose another one.");
        }
        return { accepted: true, message: GENERIC_REGISTRATION_MESSAGE };
      }
      throw error;
    }

    if (!user) return { accepted: true, message: GENERIC_REGISTRATION_MESSAGE };
    const delivery = await this.emails.sendVerification(
      user.email,
      user.first_name,
      verificationToken,
    );
    return {
      accepted: true,
      message: GENERIC_REGISTRATION_MESSAGE,
      ...(process.env.NODE_ENV !== "production" && "developmentVerificationUrl" in delivery
        ? { developmentVerificationUrl: delivery.developmentVerificationUrl }
        : {}),
    };
  }

  async verifyEmail(rawToken: string) {
    if (!rawToken || rawToken.length > 256) return { verified: false as const };
    const tokenHash = sha256(rawToken);
    const loginTicket = randomBytes(32).toString("base64url");
    const loginTicketHash = sha256(loginTicket);
    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM email_verification_tokens
          WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
          FOR UPDATE`,
        [tokenHash],
      );
      const token = result.rows[0];
      if (!token) return { verified: false as const };
      await client.query(
        "UPDATE email_verification_tokens SET consumed_at = now() WHERE id = $1",
        [token.id],
      );
      await client.query(
        `UPDATE users SET email_verified_at = now(), status = 'active', updated_at = now()
          WHERE id = $1 AND status = 'pending_email_verification'`,
        [token.user_id],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type)
         VALUES ($1, 'email_verified')`,
        [token.user_id],
      );
      await client.query(
        `INSERT INTO email_login_tickets (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '5 minutes')`,
        [token.user_id, loginTicketHash],
      );
      return { verified: true as const, ticket: loginTicket };
    });
  }

  async resendVerification(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const verificationToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(verificationToken);
    const user = await this.database.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        email: string;
        first_name: string;
        email_verified_at: Date | null;
        status: string;
      }>(
        `SELECT id, email::text, first_name, email_verified_at, status
           FROM users WHERE email = $1 FOR UPDATE`,
        [email],
      );
      const account = found.rows[0];
      if (
        !account ||
        account.email_verified_at ||
        account.status !== "pending_email_verification"
      ) {
        return null;
      }
      await client.query(
        `UPDATE email_verification_tokens
            SET consumed_at = now()
          WHERE user_id = $1 AND consumed_at IS NULL`,
        [account.id],
      );
      await client.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 minutes')`,
        [account.id, tokenHash],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type)
         VALUES ($1, 'email_verification_resent')`,
        [account.id],
      );
      return account;
    });
    if (user) {
      const delivery = await this.emails.sendVerification(
        user.email,
        user.first_name,
        verificationToken,
      );
      return {
        accepted: true,
        message: GENERIC_RESEND_MESSAGE,
        ...(process.env.NODE_ENV !== "production" && "developmentVerificationUrl" in delivery
          ? { developmentVerificationUrl: delivery.developmentVerificationUrl }
          : {}),
      };
    }
    return { accepted: true, message: GENERIC_RESEND_MESSAGE };
  }

  async login(input: LoginDto, userAgent: string) {
    const email = input.email.trim().toLowerCase();
    const loginIdentifier = loginAttemptIdentifier(email);
    await this.assertLoginAllowed(loginIdentifier);
    const result = await this.database.query<{
      id: string;
      status: string;
      email_verified_at: Date | null;
      password_hash: string;
    }>(
      `SELECT u.id, u.status, u.email_verified_at, pc.password_hash
         FROM users u
         JOIN password_credentials pc ON pc.user_id = u.id
        WHERE u.email = $1`,
      [email],
    );
    const user = result.rows[0];
    const fallbackHash = await this.passwords.getDummyHash();
    const valid = await this.passwords
      .verify(user?.password_hash || fallbackHash, input.password)
      .catch(() => false);
    if (!user || !valid || user.status === "deleted" || user.status === "banned") {
      await this.recordFailedLogin(loginIdentifier);
      await this.database.query(
        `INSERT INTO auth_audit_events (user_id, event_type, metadata)
         VALUES ($1, 'login_failed', '{"reason":"invalid_credentials"}')`,
        [user?.id || null],
      );
      throw new UnauthorizedException("Email or password is incorrect.");
    }
    if (!user.email_verified_at || user.status === "pending_email_verification") {
      await this.recordFailedLogin(loginIdentifier);
      await this.database.query(
        `INSERT INTO auth_audit_events (user_id, event_type, metadata)
         VALUES ($1, 'login_failed', '{"reason":"email_unverified"}')`,
        [user.id],
      );
      throw new UnauthorizedException("Confirm your email before signing in.");
    }
    if (user.status !== "active") {
      await this.recordFailedLogin(loginIdentifier);
      await this.database.query(
        `INSERT INTO auth_audit_events (user_id, event_type, metadata)
         VALUES ($1, 'login_failed', '{"reason":"account_restricted"}')`,
        [user.id],
      );
      throw new UnauthorizedException("This account cannot sign in. Contact support.");
    }
    const pair = await this.tokens.createSession(user.id, input.deviceName, userAgent);
    await this.clearFailedLogins(loginIdentifier);
    await this.database.query(
      `INSERT INTO auth_audit_events (user_id, event_type)
       VALUES ($1, 'login_succeeded')`,
      [user.id],
    );
    return pair;
  }

  private async assertLoginAllowed(identifierHash: string) {
    const result = await this.database.query<{ locked_until: Date | null }>(
      `SELECT locked_until
         FROM login_attempt_limits
        WHERE identifier_hash = $1
          AND locked_until IS NOT NULL
          AND locked_until > now()`,
      [identifierHash],
    );
    if (result.rowCount) {
      throw new HttpException(
        "Too many sign-in attempts. Wait 15 minutes, then try again or reset your password.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedLogin(identifierHash: string) {
    await this.database.query(
      `INSERT INTO login_attempt_limits
          (identifier_hash, failed_count, first_failed_at, last_failed_at, locked_until)
       VALUES ($1, 1, now(), now(), NULL)
       ON CONFLICT (identifier_hash) DO UPDATE
         SET failed_count = CASE
               WHEN login_attempt_limits.first_failed_at < now() - interval '${LOGIN_FAILURE_WINDOW_MINUTES} minutes'
                 THEN 1
               ELSE login_attempt_limits.failed_count + 1
             END,
             first_failed_at = CASE
               WHEN login_attempt_limits.first_failed_at < now() - interval '${LOGIN_FAILURE_WINDOW_MINUTES} minutes'
                 THEN now()
               ELSE login_attempt_limits.first_failed_at
             END,
             last_failed_at = now(),
             locked_until = CASE
               WHEN (
                 CASE
                   WHEN login_attempt_limits.first_failed_at < now() - interval '${LOGIN_FAILURE_WINDOW_MINUTES} minutes'
                     THEN 1
                   ELSE login_attempt_limits.failed_count + 1
                 END
               ) >= ${LOGIN_FAILURES_BEFORE_LOCK}
                 THEN now() + interval '${LOGIN_LOCK_MINUTES} minutes'
               ELSE login_attempt_limits.locked_until
             END`,
      [identifierHash],
    );
  }

  private async clearFailedLogins(identifierHash: string) {
    await this.database.query(
      "DELETE FROM login_attempt_limits WHERE identifier_hash = $1",
      [identifierHash],
    );
  }

  async forgotPassword(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const user = await this.database.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        email: string;
        first_name: string;
      }>(
        `SELECT u.id, u.email::text, u.first_name
           FROM users u
           JOIN password_credentials pc ON pc.user_id = u.id
          WHERE u.email = $1
            AND u.status IN ('active', 'pending_email_verification')
          FOR UPDATE`,
        [email],
      );
      const account = found.rows[0];
      if (!account) return null;
      await client.query(
        `UPDATE password_reset_tokens
            SET consumed_at = now()
          WHERE user_id = $1 AND consumed_at IS NULL`,
        [account.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requires_current_password)
         VALUES ($1, $2, now() + interval '30 minutes', false)`,
        [account.id, tokenHash],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type)
         VALUES ($1, 'password_reset_requested')`,
        [account.id],
      );
      return account;
    });
    if (user) {
      const delivery = await this.emails.sendPasswordReset(user.email, user.first_name, rawToken);
      return {
        accepted: true,
        message: GENERIC_PASSWORD_RESET_MESSAGE,
        ...(process.env.NODE_ENV !== "production" && "developmentResetUrl" in delivery
          ? { developmentResetUrl: delivery.developmentResetUrl }
          : {}),
      };
    }
    return { accepted: true, message: GENERIC_PASSWORD_RESET_MESSAGE };
  }

  async requestSignedInPasswordReset(userId: string) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const user = await this.database.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        email: string;
        first_name: string;
      }>(
        `SELECT id, email::text, first_name
           FROM users
          WHERE id = $1 AND status = 'active'
          FOR UPDATE`,
        [userId],
      );
      const account = found.rows[0];
      if (!account) throw new UnauthorizedException("Authentication is required.");
      await client.query(
        `UPDATE password_reset_tokens
            SET consumed_at = now()
          WHERE user_id = $1 AND consumed_at IS NULL`,
        [account.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requires_current_password)
         VALUES ($1, $2, now() + interval '30 minutes', true)`,
        [account.id, tokenHash],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type)
         VALUES ($1, 'signed_in_password_reset_requested')`,
        [account.id],
      );
      return account;
    });
    const delivery = await this.emails.sendPasswordReset(user.email, user.first_name, rawToken);
    return {
      accepted: true,
      message:
        "A secure password reset link has been sent to your email. Because you requested it from Settings, you will need your last password before choosing a new one.",
      ...(process.env.NODE_ENV !== "production" && "developmentResetUrl" in delivery
        ? { developmentResetUrl: delivery.developmentResetUrl }
        : {}),
    };
  }

  async passwordResetRequiresCurrentPassword(rawToken: string) {
    if (!rawToken || rawToken.length > 512) return false;
    const tokenHash = sha256(rawToken);
    const found = await this.database.query<{ requires_current_password: boolean }>(
      `SELECT requires_current_password
         FROM password_reset_tokens
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND expires_at > now()`,
      [tokenHash],
    );
    return Boolean(found.rows[0]?.requires_current_password);
  }

  async resetPassword(rawToken: string, password: string, currentPassword?: string) {
    if (!rawToken || rawToken.length > 512) {
      throw new UnauthorizedException("This password reset link is invalid or has expired.");
    }
    const tokenHash = sha256(rawToken);
    const found = await this.database.query<{
      user_id: string;
      email: string;
      public_username: string;
      password_hash: string;
      requires_current_password: boolean;
    }>(
      `SELECT prt.user_id, u.email::text, u.public_username::text,
              pc.password_hash, prt.requires_current_password
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         JOIN password_credentials pc ON pc.user_id = u.id
        WHERE prt.token_hash = $1
          AND prt.consumed_at IS NULL
          AND prt.expires_at > now()
          AND u.status IN ('active', 'pending_email_verification')`,
      [tokenHash],
    );
    const account = found.rows[0];
    if (!account) {
      throw new UnauthorizedException("This password reset link is invalid or has expired.");
    }
    if (account.requires_current_password) {
      if (!currentPassword) {
        throw new BadRequestException("Enter your last password before choosing a new one.");
      }
      const currentPasswordValid = await this.passwords.verify(account.password_hash, currentPassword);
      if (!currentPasswordValid) {
        throw new UnauthorizedException("Your last password was not correct.");
      }
    }
    this.passwords.validatePolicy(password, {
      email: account.email,
      username: account.public_username,
    });
    const passwordHash = await this.passwords.hash(password);
    return this.database.transaction(async (client) => {
      const locked = await client.query<{ id: string }>(
        `SELECT id FROM password_reset_tokens
          WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
          FOR UPDATE`,
        [tokenHash],
      );
      if (!locked.rowCount) {
        throw new UnauthorizedException("This password reset link is invalid or has expired.");
      }
      await client.query(
        `UPDATE password_credentials
            SET password_hash = $2, hash_algorithm = 'argon2id',
                hash_version = hash_version + 1, password_changed_at = now()
          WHERE user_id = $1`,
        [account.user_id, passwordHash],
      );
      await client.query(
        "UPDATE password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
        [account.user_id],
      );
      await client.query(
        `UPDATE auth_sessions
            SET revoked_at = now(), revoke_reason = 'password_reset'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [account.user_id],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type)
         VALUES ($1, 'password_reset_completed')`,
        [account.user_id],
      );
      return { changed: true, message: "Your password has been changed. You can now sign in." };
    });
  }

  async me(userId: string) {
    const result = await this.database.query<{
      id: string;
      email: string;
      public_username: string;
      first_name: string;
      last_name: string;
      email_verified_at: Date;
    }>(
      `SELECT id, email::text, public_username::text, first_name, last_name, email_verified_at
         FROM users WHERE id = $1 AND status = 'active'`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException();
    const privateSpace = await this.database.withUser(userId, async (client) => {
      const result = await client.query<{ profile_data: Record<string, unknown> }>(
        "SELECT profile_data FROM user_private_spaces WHERE user_id = $1",
        [userId],
      );
      return result.rows[0]?.profile_data || {};
    });
    return {
      id: user.id,
      email: user.email,
      username: user.public_username,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: Boolean(user.email_verified_at),
      identity: typeof privateSpace.identity === "string" ? privateSpace.identity : "",
      seeking: typeof privateSpace.seeking === "string" ? privateSpace.seeking : "",
    };
  }

  async updateUsername(userId: string, usernameInput: string) {
    const username = usernameInput.trim();
    await this.assertNotPlatformBanned({ username });
    try {
      const result = await this.database.query<{ public_username: string }>(
        `UPDATE users
            SET public_username = $2, updated_at = now()
          WHERE id = $1 AND status = 'active'
          RETURNING public_username::text`,
        [userId, username],
      );
      if (!result.rowCount) throw new UnauthorizedException();
      await this.database.query(
        `INSERT INTO auth_audit_events (user_id, event_type)
         VALUES ($1, 'username_updated')`,
        [userId],
      );
      return { username: result.rows[0]!.public_username };
    } catch (error) {
      if (error instanceof DatabaseError && error.code === "23505") {
        throw new ConflictException("That username is unavailable. Choose another one.");
      }
      throw error;
    }
  }

  async deleteAccount(userId: string, input: { reasons?: string[]; details?: string }) {
    const reasons = Array.isArray(input.reasons)
      ? input.reasons
          .filter((reason): reason is string => typeof reason === "string")
          .map((reason) => reason.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const details =
      typeof input.details === "string" ? input.details.trim().slice(0, 1000) : "";

    await this.database.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const account = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 AND status <> 'deleted'",
        [userId],
      );
      if (!account.rowCount) throw new UnauthorizedException();

      await client.query("DELETE FROM discovery_profiles WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM user_private_spaces WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM email_login_tickets WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM password_credentials WHERE user_id = $1", [userId]);
      await client.query(
        `UPDATE auth_sessions
            SET revoked_at = COALESCE(revoked_at, now()),
                revoke_reason = COALESCE(revoke_reason, 'account_deleted')
          WHERE user_id = $1`,
        [userId],
      );
      await client.query(
        `UPDATE users
            SET status = 'deleted',
                email = ('deleted+' || id::text || '@deleted.kindredcube.local')::citext,
                public_username = ('deleted_' || replace(id::text, '-', ''))::citext,
                first_name = 'Deleted',
                last_name = 'Account',
                email_verified_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO auth_audit_events (user_id, event_type, metadata)
         VALUES ($1, 'account_deleted', $2::jsonb)`,
        [userId, JSON.stringify({ reasons, details })],
      );
    });

    return { deleted: true };
  }

  private async assertNotPlatformBanned(input: { email?: string; username?: string }) {
    const emailHash = input.email ? sha256(input.email.trim().toLowerCase()) : null;
    const usernameHash = input.username ? sha256(input.username.trim().toLowerCase()) : null;
    if (!emailHash && !usernameHash) return;
    const result = await this.database.query(
      `SELECT 1 FROM platform_bans
        WHERE active = true
          AND (
            ($1::char(64) IS NOT NULL AND email_hash = $1::char(64))
            OR ($2::char(64) IS NOT NULL AND username_hash = $2::char(64))
          )
        LIMIT 1`,
      [emailHash, usernameHash],
    );
    if (result.rowCount) {
      throw new HttpException(GENERIC_REGISTRATION_MESSAGE, HttpStatus.ACCEPTED);
    }
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function loginAttemptIdentifier(email: string) {
  return sha256(`kindredcube-login:${email}:${process.env.PASSWORD_PEPPER || ""}`);
}

function isAdultDateOfBirth(value: string) {
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) return false;
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
  return birthDate <= cutoff && birthDate.getUTCFullYear() >= 1900;
}

function starSignFromDateOfBirth(dateOfBirth: string) {
  const [, monthText, dayText] = dateOfBirth.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const boundaries = [
    [1, 20, "Aquarius", "Capricorn"], [2, 19, "Pisces", "Aquarius"],
    [3, 21, "Aries", "Pisces"], [4, 20, "Taurus", "Aries"],
    [5, 21, "Gemini", "Taurus"], [6, 21, "Cancer", "Gemini"],
    [7, 23, "Leo", "Cancer"], [8, 23, "Virgo", "Leo"],
    [9, 23, "Libra", "Virgo"], [10, 23, "Scorpio", "Libra"],
    [11, 22, "Sagittarius", "Scorpio"], [12, 22, "Capricorn", "Sagittarius"],
  ] as const;
  const boundary = boundaries[month - 1];
  return boundary ? (day >= boundary[1] ? boundary[2] : boundary[3]) : "";
}
