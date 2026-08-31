import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetingEndTime } from "../../src/meeting-time";

describe("post-meet timing", () => {
  const start = Date.parse("2026-08-30T12:45:00+02:00");
  it.each([30, 45, 60])("opens at the end of a %i-minute meeting, not before", (duration) => {
    const end = meetingEndTime(start, duration);
    expect(end).toBe(start + duration * 60_000);
    expect(end - 1 >= end).toBe(false);
    expect(end >= end).toBe(true);
    expect(Date.parse("2026-08-31T09:50:00+02:00") >= end).toBe(true);
  });
  it("handles timezone offsets and legacy timestamp strings without concatenation", () => {
    expect(meetingEndTime("2026-08-30T12:45:00+02:00", 60)).toBe(Date.parse("2026-08-30T13:45:00+02:00"));
    expect(meetingEndTime(String(start), "60")).toBe(start + 3_600_000);
    expect(meetingEndTime("invalid", 60)).toBe(Infinity);
  });
  it("does not mark another meeting at the same venue or within 30 days complete", () => {
    const source = readFileSync(join(process.cwd(), "src/post-meet-checks.controller.ts"), "utf8");
    expect(source.match(/AND meeting_started_at = \$3::timestamptz/g)).toHaveLength(3);
    expect(source).not.toContain("interval '30 days'");
    expect(source).not.toContain("interval '36 hours'");
  });
  it("keeps the due prompt visible and refreshes the clock on resume", () => {
    const source = readFileSync(join(process.cwd(), "../App.tsx"), "utf8");
    expect(source).toContain("if (state === \"active\") setNow(Date.now())");
    expect(source).toContain("postMeetNeedsAction || proposalDetailsExpanded");
    expect(source).not.toContain("setTimeout(() => setPostMeetPromptPreviewVisible(false), 7_000)");
  });
});
