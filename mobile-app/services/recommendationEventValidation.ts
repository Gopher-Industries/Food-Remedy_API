import {
  PERSONALIZATION_SCHEMA_VERSION, RECOMMENDATION_ACTIONS, REJECTION_REASONS,
  type RecommendationEventInput,
} from '@/types/Personalization';
import { validPersonalizationId } from '@/services/personalizationValidation';

const BARCODE = /^[0-9]{8,14}$/;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

export function parseRecommendationEventInput(value: unknown, now = Date.now()): RecommendationEventInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid event.');
  const event = value as Record<string, unknown>;
  const required = ['schemaVersion', 'eventId', 'profileId', 'recommendationSessionId',
    'originalBarcode', 'candidateBarcode', 'action', 'occurredAt'];
  const allowed = [...required, 'rejectionReason'];
  if (!required.every(key => Object.hasOwn(event, key)) || Object.keys(event).some(key => !allowed.includes(key)) ||
      event.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION ||
      !validPersonalizationId(event.eventId) || !validPersonalizationId(event.profileId) ||
      !validPersonalizationId(event.recommendationSessionId) ||
      typeof event.originalBarcode !== 'string' || !BARCODE.test(event.originalBarcode) ||
      typeof event.candidateBarcode !== 'string' || !BARCODE.test(event.candidateBarcode) ||
      !RECOMMENDATION_ACTIONS.includes(event.action as typeof RECOMMENDATION_ACTIONS[number]) ||
      typeof event.occurredAt !== 'string' || event.occurredAt.length > 35 || !ISO_DATE.test(event.occurredAt)) {
    throw new Error('Invalid event.');
  }
  const occurredAt = Date.parse(event.occurredAt);
  if (!Number.isFinite(occurredAt) || occurredAt < now - MAX_EVENT_AGE_MS || occurredAt > now + MAX_FUTURE_MS) {
    throw new Error('Invalid event.');
  }
  if (event.rejectionReason !== undefined &&
      (!['dismissed', 'thumbs_down'].includes(event.action as string) ||
        !REJECTION_REASONS.includes(event.rejectionReason as typeof REJECTION_REASONS[number]))) {
    throw new Error('Invalid event.');
  }
  return event as unknown as RecommendationEventInput;
}
