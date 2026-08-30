import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    this.pool = new Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000 });
  }

  query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async withUser<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const context = await client.query<{ user_id: string }>("SELECT current_setting('app.user_id', true) AS user_id");
      if (context.rows[0]?.user_id !== userId) {
        throw new Error("Could not prepare secure user database context.");
      }
      return work(client);
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
