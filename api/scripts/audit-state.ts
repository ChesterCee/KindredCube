import "dotenv/config";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

async function main() {
  const fileEnvironment = parse(readFileSync(".env"));
  console.log(JSON.stringify({
    runtime_database_matches_env_file: process.env.DATABASE_URL === fileEnvironment.DATABASE_URL,
    migration_database_matches_env_file: process.env.MIGRATION_DATABASE_URL === fileEnvironment.MIGRATION_DATABASE_URL,
  }));
  const inspect = async (connectionString: string | undefined, label: string) => {
    if (!connectionString) return { label, configured: false };
    const pool = new Pool({ connectionString });
    const result = await pool.query(`
  SELECT
    (SELECT count(*)::int FROM users WHERE status = 'active') AS active_users,
    (SELECT count(*)::int FROM discovery_profiles) AS discovery_profiles,
    (SELECT count(*)::int FROM discovery_profiles WHERE visible) AS visible_profiles,
    (SELECT count(*)::int FROM discovery_profiles
      WHERE coalesce((matching_data->>'profileStrength')::numeric, 0) >= 25) AS eligible_profiles,
    (SELECT count(*)::int FROM user_private_spaces) AS private_spaces,
    (SELECT count(*)::int FROM user_private_spaces WHERE profile_data ? 'dateOfBirth') AS profiles_with_dob,
    (SELECT count(*)::int FROM user_private_spaces
      WHERE coalesce((profile_data->>'profileStrength')::numeric, 0) >= 25) AS completed_private_profiles
    `);
    await pool.end();
    return { label, configured: true, ...result.rows[0] };
  };
  console.log(JSON.stringify(await inspect(process.env.DATABASE_URL, "runtime")));
  console.log(JSON.stringify(await inspect(process.env.MIGRATION_DATABASE_URL, "migration")));
  try {
    console.log(JSON.stringify(await inspect("postgresql://kindred_admin:local-admin-only@127.0.0.1:5432/kindredcube", "legacy-compose")));
  } catch {
    console.log(JSON.stringify({ label: "legacy-compose", reachable: false }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Audit failed");
  process.exitCode = 1;
});
