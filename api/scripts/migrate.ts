import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  try {
    const migrationDirectory = join(process.cwd(), "migrations");
    const availableMigrations = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const requestedMigrations = process.argv.slice(2).map((file) => file.trim()).filter(Boolean);
    const migrations = requestedMigrations.length
      ? requestedMigrations
      : availableMigrations;
    const missingMigrations = migrations.filter((file) => !availableMigrations.includes(file));
    if (missingMigrations.length) {
      throw new Error(`Migration file not found: ${missingMigrations.join(", ")}`);
    }
    for (const migration of migrations) {
      const sql = await readFile(join(migrationDirectory, migration), "utf8");
      await pool.query(sql);
      process.stdout.write(`Applied ${migration}.\n`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Migration failed"}\n`);
  process.exitCode = 1;
});
