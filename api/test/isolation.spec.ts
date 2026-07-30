import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("private-space isolation migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "migrations", "001_auth_foundation.sql"),
    "utf8",
  );

  it("forces row-level security and binds access to app.user_id", () => {
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("private_space_owner_only");
    expect(migration).toContain("current_setting('app.user_id', true)");
    expect(migration).toContain("WITH CHECK");
  });
});

