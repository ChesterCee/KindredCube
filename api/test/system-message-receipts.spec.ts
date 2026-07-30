import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("system message receipt isolation migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "migrations", "004_system_message_receipts.sql"),
    "utf8",
  );

  it("keeps every receipt owner-scoped with forced row-level security", () => {
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("system_message_receipt_owner_only");
    expect(migration).toContain("current_setting('app.user_id', true)");
    expect(migration).toContain("PRIMARY KEY (user_id, message_key)");
  });
});
