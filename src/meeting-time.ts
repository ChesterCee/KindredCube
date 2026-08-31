/** Meeting timestamps are epoch milliseconds; accept legacy ISO/numeric strings too. */
export function meetingEndTime(scheduledAt: unknown, durationMinutes: unknown): number {
  const start = typeof scheduledAt === "number" ? scheduledAt
    : typeof scheduledAt === "string" && scheduledAt.trim()
      ? (/^\d+$/.test(scheduledAt) ? Number(scheduledAt) : Date.parse(scheduledAt))
      : NaN;
  const duration = Number(durationMinutes);
  return Number.isFinite(start) && Number.isFinite(duration) && duration > 0
    ? start + duration * 60_000 : Number.POSITIVE_INFINITY;
}
