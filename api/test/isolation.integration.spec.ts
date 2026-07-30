import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration("PostgreSQL private-space isolation", () => {
  it("prevents one authenticated user from reading or updating another user's row", async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    const first = randomUUID();
    const second = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, public_username, first_name, last_name, status)
         VALUES ($1, $2, $3, 'First', 'User', 'active'),
                ($4, $5, $6, 'Second', 'User', 'active')`,
        [first, `${first}@example.test`, `u_${first.replaceAll("-", "").slice(0, 20)}`,
          second, `${second}@example.test`, `u_${second.replaceAll("-", "").slice(0, 20)}`],
      );

      await client.query("SELECT set_config('app.user_id', $1, true)", [first]);
      await client.query(
        "INSERT INTO user_private_spaces (user_id, profile_data) VALUES ($1, '{\"owner\":\"first\"}')",
        [first],
      );
      await client.query("SELECT set_config('app.user_id', $1, true)", [second]);
      await client.query(
        "INSERT INTO user_private_spaces (user_id, profile_data) VALUES ($1, '{\"owner\":\"second\"}')",
        [second],
      );

      await client.query("SELECT set_config('app.user_id', $1, true)", [first]);
      const visible = await client.query<{ user_id: string; profile_data: { owner: string } }>(
        "SELECT user_id, profile_data FROM user_private_spaces ORDER BY user_id",
      );
      expect(visible.rows).toEqual([
        { user_id: first, profile_data: { owner: "first" } },
      ]);

      const crossUpdate = await client.query(
        "UPDATE user_private_spaces SET profile_data = '{\"owner\":\"stolen\"}' WHERE user_id = $1",
        [second],
      );
      expect(crossUpdate.rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
});

