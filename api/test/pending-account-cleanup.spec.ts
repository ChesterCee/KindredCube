import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("pending account cleanup", () => {
  const cleanup = readFileSync(join(process.cwd(), "src", "pending-account-cleanup.service.ts"), "utf8");
  const auth = readFileSync(join(process.cwd(), "src", "auth", "auth.service.ts"), "utf8");
  const migration = readFileSync(join(process.cwd(), "migrations", "009_pending_account_cleanup_function.sql"), "utf8");

  it("deletes unconfirmed accounts after 24 hours and frees usernames", () => {
    expect(cleanup).toContain("cleanup_expired_pending_accounts()");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("status = 'pending_email_verification'");
    expect(migration).toContain("email_verified_at IS NULL");
    expect(migration).toContain("created_at < now() - interval '24 hours'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION cleanup_expired_pending_accounts() TO kindred_app");
    expect(auth).toContain("deleteExpiredPendingAccounts(client)");
  });
});
