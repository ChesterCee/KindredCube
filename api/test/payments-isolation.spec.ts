import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("payment storage isolation migration", () => {
  const migration = readFileSync(join(process.cwd(), "migrations", "005_payments.sql"), "utf8");

  it("forces owner-only row-level security on balances, orders, ledger, and entitlements", () => {
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)).toHaveLength(4);
    expect(migration).toContain("payment_orders_owner_only");
    expect(migration).toContain("wallet_accounts_owner_only");
    expect(migration).toContain("wallet_ledger_owner_only");
    expect(migration).toContain("user_entitlements_owner_only");
    expect(migration).toContain("current_setting('app.user_id', true)");
  });

  it("makes Stripe credits and wallet requests idempotent", () => {
    expect(migration).toContain("stripe_event_id text UNIQUE");
    expect(migration).toContain("idempotency_key text UNIQUE");
    expect(migration).toContain("stripe_checkout_session_id text UNIQUE");
  });
});
