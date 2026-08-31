import { PoolClient } from "pg";
import type { ChatMessageResponse } from "./chat.service";

export async function schedulePostMeet(client: PoolClient, message: ChatMessageResponse) {
  const response = message.meetingResponse;
  if (message.kind !== 'meeting_response' || !response || message.unsentAt) return;
  const start = Number(response.proposal.scheduledAt);
  const end = start + Number(response.proposal.durationMinutes) * 60_000;
  if (!Number.isFinite(end) || end < Date.now() - 7 * 86400_000) return;
  for (const [userId, otherId] of [[message.senderId, message.recipientId], [message.recipientId, message.senderId]]) {
    const key = `post-meet:${userId}:${otherId}:${start}`;
    if (response.status !== 'accepted') {
      await client.query("UPDATE notification_jobs SET status = 'skipped', completed_at = now() WHERE dedupe_key = $1 AND status = 'pending'", [key]);
      continue;
    }
    await client.query(
      `INSERT INTO notification_jobs(dedupe_key,user_id,other_user_id,kind,meeting_started_at,due_at,available_at)
       VALUES ($1,$2,$3,'post_meet',$4,$5,$5) ON CONFLICT (dedupe_key) DO NOTHING`,
      [key, userId, otherId, new Date(start), new Date(end)],
    );
  }
}
