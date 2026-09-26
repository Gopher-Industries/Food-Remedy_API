import type { FoodPreferenceProfile, ExplicitPreference, SavedShoppingIntent, ProductSemanticAttributes,
  PreferenceDimension, PreferenceValueByDimension, RecommendationAction } from '@/types/Personalization';
import { PERSONALIZATION_SCHEMA_VERSION } from '@/types/Personalization';
import { validPersonalizationId, parseFoodPreferenceProfile, parseSavedShoppingIntent } from '@/services/personalizationValidation';

export const PERSONALIZATION_CONTEXT_VERSION = '1.0.0' as const;
const EVENT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 40;
const MAX_PRODUCT_READS = 20;

export class PersonalizationContextUnavailableError extends Error {}

export interface ContextEvent {
  action: RecommendationAction;
  candidateBarcode: string;
  occurredAt: string;
  receivedAt: string;
}

export interface PersonalizationContextRepository {
  getOwnedProfile(uid: string, profileId: string): Promise<{ active: boolean; child: boolean; evidenceConsent: boolean } | null>;
  getExplicitPreferences(uid: string, profileId: string): Promise<FoodPreferenceProfile | null>;
  getSavedIntent(uid: string, profileId: string, intentId: string): Promise<SavedShoppingIntent | null>;
  getRecentEvents(uid: string, profileId: string, maximum: number): Promise<ContextEvent[]>;
  getProductSemantics(barcode: string): Promise<ProductSemanticAttributes | null>;
}

export interface ObservedPreference {
  dimension: PreferenceDimension;
  value: string;
  sentiment: 'like' | 'avoid';
  provenance: 'observed';
  strength: number;
  eventCount: number;
  observedAt: string;
  sourceVersion: typeof PERSONALIZATION_CONTEXT_VERSION;
}

export interface PersonalizationContext {
  schemaVersion: typeof PERSONALIZATION_CONTEXT_VERSION;
  explicit: ExplicitPreference[];
  observed: ObservedPreference[];
  /** No model inference exists yet; it cannot be confused with user declarations. */
  inferred: [];
  intention: null | {
    text: string;
    occasion?: SavedShoppingIntent['occasion'];
    convenience?: SavedShoppingIntent['convenience'];
    provenance: 'explicit';
    source: 'saved';
  };
}

const EVENT_WEIGHT: Partial<Record<RecommendationAction, number>> = {
  opened: 0.25, added_to_list: 1, thumbs_up: 3, thumbs_down: -3,
  // Purchase is client-reported by BE060 and has no verified receipt.
  purchased: 1,
};
const DIMENSIONS: PreferenceDimension[] = ['texture', 'flavourFamily', 'flavourIntensity', 'convenience', 'occasion'];
const ATTRIBUTE: Partial<Record<PreferenceDimension, keyof ProductSemanticAttributes>> = {
  texture: 'texture', flavourFamily: 'flavourFamily', flavourIntensity: 'flavourIntensity',
  convenience: 'preparation', occasion: 'occasion',
};

function stablePreferenceOrder(a: { dimension: string; value: string; sentiment: string }, b: { dimension: string; value: string; sentiment: string }) {
  return `${a.dimension}:${a.value}:${a.sentiment}`.localeCompare(`${b.dimension}:${b.value}:${b.sentiment}`);
}

/** This context contains no UID, profile ID, barcode, allergies, restrictions or raw event history. */
export async function resolvePersonalizationContext(
  repository: PersonalizationContextRepository,
  verifiedUid: string,
  profileId: string,
  savedIntentId?: string,
  now = Date.now()
): Promise<PersonalizationContext> {
  if (!validPersonalizationId(profileId) || (savedIntentId !== undefined && !validPersonalizationId(savedIntentId))) {
    throw new PersonalizationContextUnavailableError('Personalization context unavailable.');
  }
  const profile = await repository.getOwnedProfile(verifiedUid, profileId);
  if (!profile?.active) throw new PersonalizationContextUnavailableError('Personalization context unavailable.');

  const [storedPreferences, storedIntent] = await Promise.all([
    repository.getExplicitPreferences(verifiedUid, profileId),
    savedIntentId ? repository.getSavedIntent(verifiedUid, profileId, savedIntentId) : Promise.resolve(null),
  ]);
  if (savedIntentId && !storedIntent) throw new PersonalizationContextUnavailableError('Personalization context unavailable.');
  const preferences = storedPreferences ? parseFoodPreferenceProfile(storedPreferences) : null;
  if (preferences && preferences.profileId !== profileId) throw new PersonalizationContextUnavailableError('Personalization context unavailable.');
  const intent = storedIntent ? parseSavedShoppingIntent(storedIntent) : null;
  if (intent && (intent.profileId !== profileId || intent.intentId !== savedIntentId || intent.deletedAt)) {
    throw new PersonalizationContextUnavailableError('Personalization context unavailable.');
  }
  const explicit = [...(preferences?.entries ?? [])].sort(stablePreferenceOrder);
  const context: PersonalizationContext = {
    schemaVersion: PERSONALIZATION_CONTEXT_VERSION,
    explicit,
    observed: [],
    inferred: [],
    intention: intent ? {
      text: intent.text, ...(intent.occasion ? { occasion: intent.occasion } : {}),
      ...(intent.convenience ? { convenience: intent.convenience } : {}),
      provenance: 'explicit', source: 'saved',
    } : null,
  };

  if (profile.child && !profile.evidenceConsent) return context;
  const events = await repository.getRecentEvents(verifiedUid, profileId, MAX_EVENTS);
  const recent = events.filter(event => {
    const time = Date.parse(event.occurredAt);
    return Number.isFinite(time) && time <= now && time >= now - EVENT_LOOKBACK_MS &&
      typeof event.candidateBarcode === 'string' && Boolean(EVENT_WEIGHT[event.action]);
  }).slice(0, MAX_EVENTS);
  const barcodes = [...new Set(recent.map(event => event.candidateBarcode))].slice(0, MAX_PRODUCT_READS);
  const blocks = new Map<string, ProductSemanticAttributes | null>(await Promise.all(
    barcodes.map(async barcode => [barcode, await repository.getProductSemantics(barcode)] as const)
  ));
  const summary = new Map<string, ObservedPreference>();
  for (const event of recent) {
    const semantic = blocks.get(event.candidateBarcode);
    if (!semantic) continue;
    const weight = EVENT_WEIGHT[event.action] ?? 0;
    const sentiment = weight > 0 ? 'like' : 'avoid';
    const freshness = Math.max(0.25, 1 - (now - Date.parse(event.occurredAt)) / EVENT_LOOKBACK_MS);
    for (const dimension of DIMENSIONS) {
      const field = ATTRIBUTE[dimension];
      const attribute = field ? semantic[field] : undefined;
      if (!attribute || typeof attribute !== 'object' || !('value' in attribute) ||
          attribute.value === 'not_applicable' || attribute.confidence < 0.7) continue;
      const value = attribute.value as PreferenceValueByDimension[typeof dimension];
      if (explicit.some(item => item.dimension === dimension && item.value === value && item.sentiment !== sentiment)) continue;
      const key = `${dimension}:${value}:${sentiment}`;
      const existing = summary.get(key);
      const strength = Math.round(Math.min(12, (existing?.strength ?? 0) + Math.abs(weight) * freshness * attribute.confidence) * 100) / 100;
      summary.set(key, {
        dimension, value, sentiment, provenance: 'observed', strength,
        eventCount: Math.min(MAX_EVENTS, (existing?.eventCount ?? 0) + 1),
        observedAt: existing && existing.observedAt > event.occurredAt ? existing.observedAt : event.occurredAt,
        sourceVersion: PERSONALIZATION_CONTEXT_VERSION,
      });
    }
  }
  context.observed = [...summary.values()].sort(stablePreferenceOrder);
  return context;
}

/** Fixed key and array ordering for deterministic fixtures and cache keys. */
export function serializePersonalizationContext(context: PersonalizationContext): string {
  return JSON.stringify({
    schemaVersion: context.schemaVersion,
    explicit: [...context.explicit].sort(stablePreferenceOrder),
    observed: [...context.observed].sort(stablePreferenceOrder),
    inferred: [],
    intention: context.intention,
  });
}
