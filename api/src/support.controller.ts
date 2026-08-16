import { randomBytes } from "node:crypto";
import { Body, Controller, ForbiddenException, Get, Headers, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Resend } from "resend";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";

const SUPPORT_REASONS = [
  "Profile setup",
  "Account access",
  "Photos",
  "Verification",
  "Payments",
  "Ready to Meet",
  "Matches and messages",
  "Report a problem",
  "Other",
] as const;

const SUPPORT_CLOSE_REASONS = [
  "Issue resolved by support",
  "I figured it out myself",
  "No longer needed",
  "Created by mistake",
  "Other",
] as const;

class CreateSupportTicketDto {
  @IsIn(SUPPORT_REASONS)
  reason!: typeof SUPPORT_REASONS[number];

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  searchedFor = "";
}

class CloseSupportTicketDto {
  @IsIn(SUPPORT_CLOSE_REASONS)
  reason!: typeof SUPPORT_CLOSE_REASONS[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details = "";
}

class ReplySupportTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  message!: string;
}

class InboundSupportEmailDto {
  from?: unknown;
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  textBody?: unknown;
  html?: unknown;
  messageId?: unknown;
  headers?: unknown;
}

function createTicketNumber() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `KC-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

@Controller("v1/support")
@UseGuards(AccessTokenGuard)
export class SupportController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get("tickets")
  getTickets(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query(
        `SELECT id, ticket_number AS "ticketNumber", reason, message, status,
                close_reason AS "closeReason", closed_at AS "closedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM support_tickets
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 25`,
        [request.user.id],
      );
      return { tickets: await hydrateTicketMessages(client, result.rows) };
    });
  }

  @Post("tickets")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  createTicket(@Req() request: AuthenticatedRequest, @Body() input: CreateSupportTicketDto) {
    return this.database.withUser(request.user.id, async (client) => {
      const ticketNumber = createTicketNumber();
      const fullMessage = input.searchedFor.trim()
        ? `Searched first: ${input.searchedFor.trim()}\n\n${input.message.trim()}`
        : input.message.trim();
      const result = await client.query(
        `INSERT INTO support_tickets (ticket_number, user_id, reason, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, ticket_number AS "ticketNumber", reason, message, status,
                   close_reason AS "closeReason", closed_at AS "closedAt",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ticketNumber, request.user.id, input.reason, fullMessage],
      );
      const ticket = result.rows[0];
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, body, source)
         VALUES ($1, 'user', $2, $3, 'app')`,
        [ticket.id, request.user.id, fullMessage],
      );
      const hydrated = await hydrateTicketMessages(client, [ticket]);
      return { ticket: hydrated[0], created: true };
    });
  }

  @Post("tickets/:ticketId/close")
  closeTicket(
    @Req() request: AuthenticatedRequest,
    @Param("ticketId") ticketId: string,
    @Body() input: CloseSupportTicketDto,
  ) {
    return this.database.withUser(request.user.id, async (client) => {
      const closeReason = input.details.trim()
        ? `${input.reason}: ${input.details.trim()}`
        : input.reason;
      const result = await client.query(
        `UPDATE support_tickets
            SET status = 'closed',
                close_reason = $3,
                closed_at = now(),
                updated_at = now()
          WHERE id = $1
            AND user_id = $2
          RETURNING id, ticket_number AS "ticketNumber", reason, message, status,
                    close_reason AS "closeReason", closed_at AS "closedAt",
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ticketId, request.user.id, closeReason],
      );
      if (!result.rows[0]) return { closed: false, ticket: null };
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, body, source)
         VALUES ($1, 'user', $2, $3, 'app')`,
        [ticketId, request.user.id, `Closed ticket: ${closeReason}`],
      );
      const hydrated = await hydrateTicketMessages(client, [result.rows[0]]);
      return { closed: true, ticket: hydrated[0] };
    });
  }

  @Post("tickets/:ticketId/messages")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  replyToTicket(
    @Req() request: AuthenticatedRequest,
    @Param("ticketId") ticketId: string,
    @Body() input: ReplySupportTicketDto,
  ) {
    return this.database.withUser(request.user.id, async (client) => {
      const ticketResult = await client.query(
        `SELECT id, ticket_number AS "ticketNumber", reason, message, status,
                close_reason AS "closeReason", closed_at AS "closedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM support_tickets
          WHERE id = $1
            AND user_id = $2
          LIMIT 1`,
        [ticketId, request.user.id],
      );
      const ticket = ticketResult.rows[0];
      if (!ticket) throw new ForbiddenException("Support ticket not found.");
      if (ticket.status === "closed") throw new ForbiddenException("This support ticket is closed.");
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_user_id, body, source)
         VALUES ($1, 'user', $2, $3, 'app')`,
        [ticketId, request.user.id, input.message.trim()],
      );
      const updated = await client.query(
        `UPDATE support_tickets
            SET status = 'open',
                updated_at = now()
          WHERE id = $1
          RETURNING id, ticket_number AS "ticketNumber", reason, message, status,
                    close_reason AS "closeReason", closed_at AS "closedAt",
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [ticketId],
      );
      const hydrated = await hydrateTicketMessages(client, [updated.rows[0]]);
      return { ticket: hydrated[0], sent: true };
    });
  }
}

@Controller("v1/support/email-replies")
export class SupportEmailRepliesController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Post()
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async receiveReply(
    @Headers("x-support-inbound-secret") secret: string | undefined,
    @Query("secret") querySecret: string | undefined,
    @Body() input: InboundSupportEmailDto,
  ) {
    const expectedSecret = process.env.SUPPORT_EMAIL_WEBHOOK_SECRET || "";
    if (process.env.NODE_ENV === "production" && !expectedSecret) {
      throw new ForbiddenException("Support inbound email is not configured.");
    }
    if (expectedSecret && secret !== expectedSecret && querySecret !== expectedSecret) {
      throw new ForbiddenException("Support inbound email secret is invalid.");
    }

    const email = await resolveInboundEmail(input);
    const fromEmail = extractEmail(asText(email.from));
    const subject = asText(email.subject);
    const toText = flattenText(email.to);
    const body = (asText(email.text) || asText(email.textBody) || stripHtml(asText(email.html))).trim();
    const externalMessageId = asText(email.messageId) || asText(email.message_id) || headerValue(email.headers, "message-id");
    const ticketNumber = findTicketNumber(`${subject}\n${toText}\n${body}`);
    const replyToken = findReplyToken(toText);
    if (!fromEmail || !body) {
      return { accepted: false, reason: "missing_sender_or_body" };
    }

    return this.database.transaction(async (client) => {
      const adminEmail = (process.env.ADMIN_OWNER_EMAIL || "chester.chirenje@tectavis.com").trim().toLowerCase();
      const admin = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE lower(email::text) = $1 LIMIT 1",
        [adminEmail],
      );
      const adminId = admin.rows[0]?.id;
      if (!adminId) throw new ForbiddenException("Support inbound owner account is not configured.");
      await client.query("SELECT set_config('app.user_id', $1, true)", [adminId]);
      await client.query("SELECT set_config('app.admin', 'true', true)");
      if (externalMessageId) {
        const duplicate = await client.query(
          "SELECT id FROM support_ticket_messages WHERE external_message_id = $1 LIMIT 1",
          [externalMessageId],
        );
        if (duplicate.rows[0]) return { accepted: true, duplicate: true };
      }
      if (!ticketNumber) {
        const created = await createInboundEmailTicket(client, fromEmail, body, subject, externalMessageId);
        return { accepted: true, ticketNumber: created.ticketNumber, created: true };
      }
      const ticket = await client.query<{
        id: string;
        user_id: string | null;
        email: string;
        status: string;
        email_reply_token: string | null;
      }>(
        `SELECT st.id, st.user_id, COALESCE(u.email::text, st.contact_email) AS email,
                st.status, st.email_reply_token
           FROM support_tickets st
           LEFT JOIN users u ON u.id = st.user_id
          WHERE upper(st.ticket_number) = upper($1)
          LIMIT 1`,
        [ticketNumber],
      );
      const row = ticket.rows[0];
      if (!row) {
        const created = await createInboundEmailTicket(client, fromEmail, body, subject, externalMessageId);
        return { accepted: true, ticketNumber: created.ticketNumber, created: true };
      }
      if (replyToken && row.email_reply_token && replyToken !== row.email_reply_token) {
        return { accepted: false, reason: "ticket_token_mismatch" };
      }
      if ((row.email || "").trim().toLowerCase() !== fromEmail.trim().toLowerCase()) {
        return { accepted: false, reason: "sender_does_not_match_ticket_owner" };
      }
      if (row.status === "closed" || row.status === "resolved") {
        const created = await createInboundEmailTicket(
          client,
          fromEmail,
          `Follow-up to closed ticket ${ticketNumber}:\n\n${body}`,
          subject,
          externalMessageId,
        );
        return { accepted: true, ticketNumber: created.ticketNumber, created: true, previousTicketClosed: true };
      }
      await client.query(
        `INSERT INTO support_ticket_messages
          (ticket_id, sender_type, sender_email, body, source, external_message_id)
         VALUES ($1, 'email', $2, $3, 'email', $4)`,
        [row.id, fromEmail, cleanEmailReply(body), externalMessageId || null],
      );
      await client.query(
        `UPDATE support_tickets
            SET status = CASE WHEN status IN ('closed', 'resolved') THEN status ELSE 'open' END,
                updated_at = now()
          WHERE id = $1`,
        [row.id],
      );
      return { accepted: true, ticketNumber };
    });
  }
}

async function resolveInboundEmail(input: InboundSupportEmailDto): Promise<Record<string, unknown>> {
  const event = input as Record<string, unknown>;
  const eventData = event.data && typeof event.data === "object"
    ? event.data as Record<string, unknown>
    : {};
  const emailId = asText(eventData.email_id) || asText(eventData.emailId) || asText(event.email_id) || asText(event.emailId);
  const baseEmail = Object.keys(eventData).length ? eventData : event;
  const hasBody = Boolean(asText(baseEmail.text) || asText(baseEmail.textBody) || asText(baseEmail.html));
  if (!emailId || hasBody || !process.env.RESEND_API_KEY) {
    return baseEmail;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const response = await (resend.emails as any).receiving.get(emailId);
    const receivedEmail = response?.data || response;
    if (receivedEmail && typeof receivedEmail === "object") {
      return { ...baseEmail, ...(receivedEmail as Record<string, unknown>) };
    }
  } catch {
    return baseEmail;
  }
  return baseEmail;
}

async function createInboundEmailTicket(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  fromEmail: string,
  body: string,
  subject: string,
  externalMessageId?: string,
) {
  const user = await client.query(
    "SELECT id, public_username FROM users WHERE lower(email::text) = lower($1) LIMIT 1",
    [fromEmail],
  );
  const userId = user.rows[0]?.id || null;
  const message = cleanEmailReply(body);
  const reason = subject.trim() ? `Email support: ${subject.trim().slice(0, 120)}` : "Email support";
  const created = await client.query(
    `INSERT INTO support_tickets (ticket_number, user_id, contact_email, reason, message, status)
     VALUES ($1, $2, $3, $4, $5, 'open')
     RETURNING id, ticket_number AS "ticketNumber"`,
    [createTicketNumber(), userId, fromEmail, reason, message],
  );
  await client.query(
    `INSERT INTO support_ticket_messages
      (ticket_id, sender_type, sender_user_id, sender_email, body, source, external_message_id)
     VALUES ($1, 'email', $2, $3, $4, 'email', $5)`,
    [created.rows[0].id, userId, fromEmail, message, externalMessageId || null],
  );
  return created.rows[0];
}

async function hydrateTicketMessages(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }, tickets: any[]) {
  if (!tickets.length) return tickets;
  const ids = tickets.map((ticket) => ticket.id);
  const messages = await client.query(
    `SELECT id, ticket_id AS "ticketId", sender_type AS "senderType",
            sender_user_id AS "senderUserId", sender_email AS "senderEmail",
            body, source, created_at AS "createdAt"
       FROM support_ticket_messages
      WHERE ticket_id = ANY($1::uuid[])
      ORDER BY created_at ASC`,
    [ids],
  );
  const byTicket = new Map<string, any[]>();
  for (const message of messages.rows) {
    const list = byTicket.get(message.ticketId) || [];
    list.push(message);
    byTicket.set(message.ticketId, list);
  }
  return tickets.map((ticket) => ({ ...ticket, messages: byTicket.get(ticket.id) || [] }));
}

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "email" in value && typeof (value as { email?: unknown }).email === "string") {
    return (value as { email: string }).email;
  }
  return "";
}

function flattenText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flattenText).join(" ");
  return "";
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || "";
}

function findTicketNumber(value: string) {
  return value.match(/KC-\d{8}-[A-F0-9]{6}/i)?.[0]?.toUpperCase() || "";
}

function findReplyToken(value: string) {
  return value.match(/support\+kc-\d{8}-[a-f0-9]{6}\.([a-f0-9]{32})@kindredcube\.com/i)?.[1] || "";
}

function headerValue(headers: unknown, name: string) {
  if (!headers || typeof headers !== "object") return "";
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === "string") return value;
  }
  return "";
}

function stripHtml(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function cleanEmailReply(value: string) {
  const withoutQuotedReply = value
    .split(/\nOn .+ wrote:\n/i)[0]
    ?.split(/\nFrom:\s.+\n/i)[0] || value;
  return withoutQuotedReply
    .trim()
    .slice(0, 5000);
}
