import { Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { AccessTokenGuard, AuthenticatedRequest } from "./auth/auth.guard";
import { DatabaseService } from "./database.service";

const AMARA_WELCOME_KEY = "amara-welcome-v1";

type MessageReceiptRow = {
  delivered_at: Date;
  read_at: Date | null;
};

@Controller("v1/me/system-messages/amara-welcome")
@UseGuards(AccessTokenGuard)
export class SystemMessagesController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  readReceipt(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<MessageReceiptRow>(
        `SELECT delivered_at, read_at
           FROM system_message_receipts
          WHERE user_id = $1 AND message_key = $2`,
        [request.user.id, AMARA_WELCOME_KEY],
      );
      return this.toResponse(result.rows[0]);
    });
  }

  @Post("delivered")
  markDelivered(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<MessageReceiptRow>(
        `INSERT INTO system_message_receipts (user_id, message_key)
         VALUES ($1, $2)
         ON CONFLICT (user_id, message_key) DO UPDATE
           SET delivered_at = system_message_receipts.delivered_at
         RETURNING delivered_at, read_at`,
        [request.user.id, AMARA_WELCOME_KEY],
      );
      return this.toResponse(result.rows[0]);
    });
  }

  @Post("read")
  markRead(@Req() request: AuthenticatedRequest) {
    return this.database.withUser(request.user.id, async (client) => {
      const result = await client.query<MessageReceiptRow>(
        `INSERT INTO system_message_receipts (user_id, message_key, read_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, message_key) DO UPDATE
           SET read_at = COALESCE(system_message_receipts.read_at, now())
         RETURNING delivered_at, read_at`,
        [request.user.id, AMARA_WELCOME_KEY],
      );
      return this.toResponse(result.rows[0]);
    });
  }

  private toResponse(row?: MessageReceiptRow) {
    return {
      delivered: Boolean(row),
      read: Boolean(row?.read_at),
      deliveredAt: row?.delivered_at?.toISOString() ?? null,
      readAt: row?.read_at?.toISOString() ?? null,
    };
  }
}
