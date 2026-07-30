import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "./database.service";

@Injectable()
export class PendingAccountCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingAccountCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  onModuleInit() {
    this.cleanup().catch((error) => this.logger.warn(`Pending account cleanup failed: ${String(error)}`));
    this.timer = setInterval(() => {
      this.cleanup().catch((error) => this.logger.warn(`Pending account cleanup failed: ${String(error)}`));
    }, 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup() {
    const deleted = await this.database.transaction((client) => deleteExpiredPendingAccounts(client));
    if (deleted > 0) this.logger.log(`Deleted ${deleted} unconfirmed account(s) older than 24 hours.`);
    return deleted;
  }
}

export async function deleteExpiredPendingAccounts(client: PoolClient) {
  const result = await client.query<{ deleted_count: number }>(
    "SELECT cleanup_expired_pending_accounts() AS deleted_count",
  );
  return result.rows[0]?.deleted_count || 0;
}
