import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("discovery privacy migration", () => {
  const migration = readFileSync(join(process.cwd(), "migrations", "006_discovery_profiles.sql"), "utf8");
  const controller = readFileSync(join(process.cwd(), "src", "discovery.controller.ts"), "utf8");

  it("keeps discovery behind authenticated RLS and never grants access to private spaces", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("discovery_profiles_authenticated_read");
    expect(migration).toContain("current_setting('app.user_id', true)");
    expect(migration).not.toContain("GRANT SELECT ON user_private_spaces");
  });

  it("supports hiding candidates who blocked the viewer", () => {
    expect(migration).toContain("user_blocks_target_visibility");
    expect(migration).toContain("blocked_profile_id = nullif(current_setting('app.user_id', true), '')");
  });

  it("enforces reciprocal matching gates inside the API", () => {
    expect(controller).toContain("seekingAllows(viewer.seeking, candidate.gender)");
    expect(controller).toContain("seekingAllows(candidate.seeking, viewer.gender)");
    expect(controller).toContain("age >= viewerRules.minAge");
    expect(controller).toContain("viewerAge >= candidateRules.minAge");
    expect(controller).toContain("distanceAllowed(distanceKm, viewerRules, candidateRules)");
  });
});
