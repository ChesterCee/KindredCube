import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("moderation isolation", () => {
  const memberSafety = readFileSync(join(process.cwd(), "migrations", "002_member_safety.sql"), "utf8");
  const moderation = readFileSync(join(process.cwd(), "migrations", "007_moderation_queue.sql"), "utf8");
  const controller = readFileSync(join(process.cwd(), "src", "member-safety.controller.ts"), "utf8");

  it("stores blocks as blocker-specific relationships", () => {
    expect(memberSafety).toContain("PRIMARY KEY (blocker_id, blocked_profile_id)");
    expect(memberSafety).toContain("user_blocks_owner_only");
    expect(memberSafety).toContain("blocker_id = nullif(current_setting('app.user_id', true), '')::uuid");
    expect(controller).toContain("request.user.id");
    expect(controller).not.toContain("input.blockerId");
  });

  it("keeps moderation review behind an explicit admin context", () => {
    expect(moderation).toContain("current_setting('app.admin', true) = 'true'");
    expect(moderation).toContain("safety_reports_admin_review");
    expect(moderation).toContain("user_blocks_admin_review");
    expect(moderation).toContain("moderation_appeals_admin_review");
  });

  it("requires authenticator-based admin verification", () => {
    const controller = readFileSync(join(process.cwd(), "src", "admin-moderation.controller.ts"), "utf8");
    expect(controller).toContain("ADMIN_TOTP_SECRET");
    expect(controller).toContain("verifyTotp");
    expect(controller).toContain("createHmac(\"sha1\"");
    expect(controller).toContain("Admin two-factor verification is required.");
  });
});
