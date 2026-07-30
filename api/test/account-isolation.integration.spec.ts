import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const integration = connectionString ? describe : describe.skip;

integration("complete account and payment isolation", () => {
  it("prevents profile, balance, order, ledger, and entitlement leakage between two users", async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    const first = randomUUID();
    const second = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, public_username, first_name, last_name, status, email_verified_at)
         VALUES ($1, $2, $3, 'First', 'Member', 'active', now()),
                ($4, $5, $6, 'Second', 'Member', 'active', now())`,
        [first, `${first}@example.test`, `u_${first.replaceAll("-", "").slice(0, 20)}`,
          second, `${second}@example.test`, `u_${second.replaceAll("-", "").slice(0, 20)}`],
      );

      await seedAccount(client, first, "first", 1500);
      await seedAccount(client, second, "second", 4200);

      await client.query("SELECT set_config('app.user_id', $1, true)", [first]);
      const firstProfile = await client.query<{ user_id: string; profile_data: { owner: string } }>("SELECT user_id, profile_data FROM user_private_spaces");
      const firstWallet = await client.query<{ user_id: string; balance_cents: number }>("SELECT user_id, balance_cents FROM wallet_accounts");
      const firstOrders = await client.query<{ user_id: string }>("SELECT user_id FROM payment_orders");
      const firstLedger = await client.query<{ user_id: string }>("SELECT user_id FROM wallet_ledger");
      const firstEntitlements = await client.query<{ user_id: string }>("SELECT user_id FROM user_entitlements");
      expect(firstProfile.rows).toEqual([{ user_id: first, profile_data: { owner: "first" } }]);
      expect(firstWallet.rows).toEqual([{ user_id: first, balance_cents: 1500 }]);
      expect(firstOrders.rows.every((row) => row.user_id === first)).toBe(true);
      expect(firstLedger.rows.every((row) => row.user_id === first)).toBe(true);
      expect(firstEntitlements.rows).toEqual([{ user_id: first }]);

      expect((await client.query("UPDATE user_private_spaces SET profile_data = '{\"owner\":\"leaked\"}' WHERE user_id = $1", [second])).rowCount).toBe(0);
      expect((await client.query("UPDATE wallet_accounts SET balance_cents = 999999 WHERE user_id = $1", [second])).rowCount).toBe(0);
      expect((await client.query("UPDATE payment_orders SET status = 'paid' WHERE user_id = $1", [second])).rowCount).toBe(0);
      expect((await client.query("UPDATE user_entitlements SET active = false WHERE user_id = $1", [second])).rowCount).toBe(0);

      await client.query("SELECT set_config('app.user_id', $1, true)", [second]);
      expect((await client.query<{ balance_cents: number }>("SELECT balance_cents FROM wallet_accounts")).rows).toEqual([{ balance_cents: 4200 }]);
      expect((await client.query<{ profile_data: { owner: string } }>("SELECT profile_data FROM user_private_spaces")).rows).toEqual([{ profile_data: { owner: "second" } }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });

  it("rejects duplicate Stripe credits, checkout sessions, and wallet idempotency keys globally", async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    const first = randomUUID();
    const second = randomUUID();
    const eventId = `evt_test_${randomUUID()}`;
    const sessionId = `cs_test_${randomUUID()}`;
    const idempotencyKey = `wallet-${randomUUID()}`;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (id, email, public_username, first_name, last_name, status, email_verified_at)
         VALUES ($1, $2, $3, 'First', 'Member', 'active', now()),
                ($4, $5, $6, 'Second', 'Member', 'active', now())`,
        [first, `${first}@example.test`, `u_${first.replaceAll("-", "").slice(0, 20)}`,
          second, `${second}@example.test`, `u_${second.replaceAll("-", "").slice(0, 20)}`],
      );
      await client.query("SELECT set_config('app.user_id', $1, true)", [first]);
      await client.query("INSERT INTO wallet_ledger (user_id, delta_cents, entry_type, stripe_event_id, idempotency_key) VALUES ($1, 1000, 'top_up', $2, $3)", [first, eventId, idempotencyKey]);
      await client.query("INSERT INTO payment_orders (user_id, purchase_type, amount_cents, stripe_checkout_session_id) VALUES ($1, 'wallet', 1000, $2)", [first, sessionId]);

      await client.query("SAVEPOINT duplicate_credit");
      await client.query("SELECT set_config('app.user_id', $1, true)", [second]);
      await expect(client.query("INSERT INTO wallet_ledger (user_id, delta_cents, entry_type, stripe_event_id) VALUES ($1, 1000, 'top_up', $2)", [second, eventId])).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate_credit");

      await client.query("SAVEPOINT duplicate_request");
      await client.query("SELECT set_config('app.user_id', $1, true)", [second]);
      await expect(client.query("INSERT INTO wallet_ledger (user_id, delta_cents, entry_type, idempotency_key) VALUES ($1, -100, 'photo_comment', $2)", [second, idempotencyKey])).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate_request");

      await client.query("SAVEPOINT duplicate_session");
      await client.query("SELECT set_config('app.user_id', $1, true)", [second]);
      await expect(client.query("INSERT INTO payment_orders (user_id, purchase_type, amount_cents, stripe_checkout_session_id) VALUES ($1, 'wallet', 1000, $2)", [second, sessionId])).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT duplicate_session");
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
});

async function seedAccount(client: import("pg").PoolClient, userId: string, owner: string, balance: number) {
  await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  await client.query("INSERT INTO user_private_spaces (user_id, profile_data) VALUES ($1, $2::jsonb)", [userId, JSON.stringify({ owner })]);
  await client.query("INSERT INTO wallet_accounts (user_id, balance_cents) VALUES ($1, $2)", [userId, balance]);
  await client.query("INSERT INTO payment_orders (user_id, purchase_type, amount_cents) VALUES ($1, 'wallet', $2)", [userId, balance]);
  await client.query("INSERT INTO wallet_ledger (user_id, delta_cents, entry_type, stripe_event_id) VALUES ($1, $2, 'top_up', $3)", [userId, balance, `evt_${randomUUID()}`]);
  await client.query("INSERT INTO user_entitlements (user_id, entitlement, active) VALUES ($1, 'premium', true)", [userId]);
}
