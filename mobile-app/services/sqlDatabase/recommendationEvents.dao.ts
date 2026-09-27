import type { SQLiteDatabase } from 'expo-sqlite';
import type { RecommendationEventInput } from '@/types/Personalization';
import { parseRecommendationEventInput } from '@/services/recommendationEventValidation';
import { getProfile } from './profiles.dao';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function queueRecommendationEvent(
  db: SQLiteDatabase, uid: string, value: unknown, now = Date.now()
): Promise<void> {
  const event = parseRecommendationEventInput(value, now);
  const profile = await getProfile(db, uid, event.profileId);
  if (!profile?.status) throw new Error('Profile unavailable.');
  const payload = JSON.stringify(event);
  if (new TextEncoder().encode(payload).byteLength > 2048) throw new Error('Event is too large.');
  const existing = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM recommendation_event_outbox
     WHERE user_id=? AND profile_id=? AND event_id=?`, [uid, event.profileId, event.eventId]
  );
  if (existing) {
    if (stableJson(JSON.parse(existing.payload_json)) !== stableJson(event)) throw new Error('Event ID conflict.');
    return;
  }
  const count = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM recommendation_event_outbox WHERE user_id=? AND profile_id=?`,
    [uid, event.profileId]
  );
  if ((count?.count ?? 0) >= 500) throw new Error('Event queue is full.');
  const timestamp = new Date(now).toISOString();
  await db.runAsync(
    `INSERT INTO recommendation_event_outbox
     (user_id, profile_id, event_id, payload_json, created_at, attempt_count, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [uid, event.profileId, event.eventId, payload, timestamp, timestamp]
  );
}

export interface QueuedRecommendationEvent {
  profileId: string;
  eventId: string;
  event: unknown;
  attemptCount: number;
}

export async function listDueRecommendationEvents(
  db: SQLiteDatabase, uid: string, now = Date.now(), limit = 20
): Promise<QueuedRecommendationEvent[]> {
  const rows = await db.getAllAsync<{
    profile_id: string; event_id: string; payload_json: string; attempt_count: number;
  }>(
    `SELECT q.profile_id, q.event_id, q.payload_json, q.attempt_count
     FROM recommendation_event_outbox q
     JOIN profiles p ON p.user_id=q.user_id AND p.profile_id=q.profile_id
     WHERE q.user_id=? AND q.next_attempt_at<=? AND p.status=1
     ORDER BY q.next_attempt_at ASC, q.event_id ASC LIMIT ?`,
    [uid, new Date(now).toISOString(), Math.max(1, Math.min(50, Math.floor(limit)))]
  );
  return rows.map(row => ({ profileId: row.profile_id, eventId: row.event_id,
    event: JSON.parse(row.payload_json), attemptCount: row.attempt_count }));
}

export async function removeQueuedRecommendationEvent(
  db: SQLiteDatabase, uid: string, profileId: string, eventId: string
): Promise<void> {
  await db.runAsync(
    `DELETE FROM recommendation_event_outbox WHERE user_id=? AND profile_id=? AND event_id=?`,
    [uid, profileId, eventId]
  );
}

export async function delayQueuedRecommendationEvent(
  db: SQLiteDatabase, uid: string, item: QueuedRecommendationEvent, now = Date.now()
): Promise<void> {
  const attempt = Math.min(item.attemptCount + 1, 12);
  const delayMs = Math.min(60 * 60 * 1000, 1000 * 2 ** attempt);
  await db.runAsync(
    `UPDATE recommendation_event_outbox SET attempt_count=?, next_attempt_at=?
     WHERE user_id=? AND profile_id=? AND event_id=?`,
    [attempt, new Date(now + delayMs).toISOString(), uid, item.profileId, item.eventId]
  );
}
