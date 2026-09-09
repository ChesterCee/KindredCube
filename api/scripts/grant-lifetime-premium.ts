import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Usage: npm run grant:lifetime-premium -- user@example.com");
  }

  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string; email: string; public_username: string }>(
      `SELECT id, email::text, public_username::text
         FROM users
        WHERE lower(email::text) = $1
          AND status <> 'deleted'
        LIMIT 1`,
      [email],
    );
    const account = user.rows[0];
    if (!account) throw new Error(`No active account found for ${email}`);

    await client.query("SELECT set_config('app.user_id', $1, true)", [account.id]);

    await client.query(
      `INSERT INTO user_entitlements (
         user_id, entitlement, active, starts_at, expires_at, stripe_subscription_id, updated_at
       ) VALUES ($1, 'premium', true, now(), NULL, $2, now())
       ON CONFLICT (user_id, entitlement) DO UPDATE SET
         active = true,
         starts_at = LEAST(user_entitlements.starts_at, now()),
         expires_at = NULL,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         updated_at = now()`,
      [account.id, `manual_lifetime:${account.id}`],
    );

    const entitlement = await client.query<{ active: boolean; expires_at: string | null }>(
      `SELECT active, expires_at
         FROM user_entitlements
        WHERE user_id = $1 AND entitlement = 'premium'`,
      [account.id],
    );
    await client.query("COMMIT");
    const granted = entitlement.rows[0];
    if (!granted?.active || granted.expires_at !== null) {
      throw new Error("Lifetime Premium verification failed");
    }
    process.stdout.write(`Lifetime Premium granted to ${account.email} (${account.public_username}).\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Lifetime Premium grant failed"}\n`);
  process.exitCode = 1;
});
