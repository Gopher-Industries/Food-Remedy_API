import { auth } from '@/config/firebaseConfig';
import { initialiseSQLiteDatabase } from '@/config/sqlConfig';
import { parseRecommendationEventInput } from '@/services/recommendationEventValidation';
import {
  delayQueuedRecommendationEvent, listDueRecommendationEvents, removeQueuedRecommendationEvent,
} from '@/services/sqlDatabase/recommendationEvents.dao';

export interface EventDrainResult { delivered: number; rejected: number; deferred: number }

/** Bounded offline retry. A successful duplicate response acknowledges the same event ID. */
export async function drainRecommendationEvents(uid: string, now = Date.now()): Promise<EventDrainResult> {
  const result: EventDrainResult = { delivered: 0, rejected: 0, deferred: 0 };
  if (auth.currentUser?.uid !== uid) return result;
  const base = process.env.EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL?.replace(/\/$/, '');
  if (!base) return result;
  const db = await initialiseSQLiteDatabase();
  const due = await listDueRecommendationEvents(db, uid, now, 20);
  for (const item of due) {
    let event;
    try { event = parseRecommendationEventInput(item.event, now); }
    catch {
      await removeQueuedRecommendationEvent(db, uid, item.profileId, item.eventId);
      result.rejected += 1;
      continue;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${base}/api/recommendations/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event), signal: controller.signal,
      });
      if (response.status === 200 || response.status === 201) {
        await removeQueuedRecommendationEvent(db, uid, item.profileId, item.eventId);
        result.delivered += 1;
      } else if ([400, 409, 413].includes(response.status)) {
        await removeQueuedRecommendationEvent(db, uid, item.profileId, item.eventId);
        result.rejected += 1;
      } else {
        await delayQueuedRecommendationEvent(db, uid, item, now);
        result.deferred += 1;
      }
    } catch {
      await delayQueuedRecommendationEvent(db, uid, item, now);
      result.deferred += 1;
    } finally { clearTimeout(timeout); }
  }
  return result;
}
