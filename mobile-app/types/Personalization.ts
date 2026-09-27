/** Shared v1 personalization wire contracts. Safety restrictions stay in NutritionalProfile. */
export const PERSONALIZATION_SCHEMA_VERSION = '1.0.0' as const;

export const TEXTURES = ['crunchy', 'crispy', 'soft', 'chewy', 'creamy', 'smooth', 'liquid'] as const;
export const FLAVOUR_FAMILIES = ['sweet', 'savoury', 'salty', 'sour', 'bitter', 'spicy', 'neutral'] as const;
export const FLAVOUR_INTENSITIES = ['mild', 'medium', 'strong'] as const;
export const FAMILIARITIES = ['familiar', 'open_to_new', 'adventurous'] as const;
export const CONVENIENCES = ['ready_to_eat', 'minimal_prep', 'requires_prep'] as const;
export const OCCASIONS = ['breakfast', 'lunchbox', 'commute', 'snack', 'shared', 'recipe', 'other'] as const;
export const REJECTION_REASONS = ['too_strong', 'wrong_texture', 'messy', 'unfamiliar', 'too_different', 'other'] as const;
export const RECOMMENDATION_ACTIONS = ['shown', 'opened', 'added_to_list', 'dismissed', 'thumbs_up', 'thumbs_down', 'purchased'] as const;

export type Texture = typeof TEXTURES[number];
export type FlavourFamily = typeof FLAVOUR_FAMILIES[number];
export type FlavourIntensity = typeof FLAVOUR_INTENSITIES[number];
export type Familiarity = typeof FAMILIARITIES[number];
export type Convenience = typeof CONVENIENCES[number];
export type Occasion = typeof OCCASIONS[number];
export type RejectionReason = typeof REJECTION_REASONS[number];
export type RecommendationAction = typeof RECOMMENDATION_ACTIONS[number];

export interface PreferenceValueByDimension {
  texture: Texture;
  flavourFamily: FlavourFamily;
  flavourIntensity: FlavourIntensity;
  familiarity: Familiarity;
  convenience: Convenience;
  occasion: Occasion;
}

export type PreferenceDimension = keyof PreferenceValueByDimension;
export type PreferenceSentiment = 'like' | 'avoid';

/** User declarations are the only entries allowed in FoodPreferenceProfile. */
export type ExplicitPreference = {
  [D in PreferenceDimension]: {
    dimension: D;
    value: PreferenceValueByDimension[D];
    sentiment: PreferenceSentiment;
    provenance: 'explicit';
    confidence: 1;
    sourceVersion: string;
    updatedAt: string;
  }
}[PreferenceDimension];

/** Observations and model inferences cannot be assigned to ExplicitPreference. */
export type DerivedPreference = {
  [D in PreferenceDimension]: {
    dimension: D;
    value: PreferenceValueByDimension[D];
    sentiment: PreferenceSentiment;
    provenance: 'observed' | 'inferred';
    confidence: number;
    sourceVersion: string;
    observedAt: string;
    updatedAt: string;
    expiresAt?: string;
  }
}[PreferenceDimension];

export interface FoodPreferenceProfile {
  schemaVersion: typeof PERSONALIZATION_SCHEMA_VERSION;
  profileId: string;
  entries: ExplicitPreference[];
  updatedAt: string;
}

/** A current, unsaved intention is request context and is never this record. */
export interface SavedShoppingIntent {
  schemaVersion: typeof PERSONALIZATION_SCHEMA_VERSION;
  intentId: string;
  profileId: string;
  text: string;
  occasion?: Occasion;
  convenience?: Convenience;
  provenance: 'explicit';
  createdAt: string;
  updatedAt: string;
  /** Sync tombstone; records with this value are hidden from active intent lists. */
  deletedAt?: string;
}

export interface RecommendationEvent {
  schemaVersion: typeof PERSONALIZATION_SCHEMA_VERSION;
  eventId: string;
  profileId: string;
  recommendationSessionId: string;
  originalBarcode: string;
  candidateBarcode: string;
  action: RecommendationAction;
  rejectionReason?: RejectionReason;
  occurredAt: string;
  /** Assigned by the authenticated ingestion service, never supplied by a client. */
  receivedAt: string;
}

export type RecommendationEventInput = Omit<RecommendationEvent, 'receivedAt'>;

export type SemanticSource = 'catalogue' | 'manual' | 'deterministic' | 'model_inferred';
export interface SemanticAttribute<T extends string> {
  /** Absence means unknown; not_applicable is a documented, evidenced value. */
  value: T | 'not_applicable';
  source: SemanticSource;
  sourceVersion: string;
  confidence: number;
  generatedAt: string;
}

/** Ranking evidence only. Never read these attributes as nutrition or safety facts. */
export interface ProductSemanticAttributes {
  schemaVersion: typeof PERSONALIZATION_SCHEMA_VERSION;
  evidenceCompleteness: 'complete' | 'partial';
  texture?: SemanticAttribute<Texture>;
  flavourFamily?: SemanticAttribute<FlavourFamily>;
  flavourIntensity?: SemanticAttribute<FlavourIntensity>;
  foodRole?: SemanticAttribute<'main' | 'side' | 'treat' | 'ingredient' | 'drink'>;
  occasion?: SemanticAttribute<Occasion>;
  portability?: SemanticAttribute<'portable' | 'requires_container' | 'not_portable'>;
  shareability?: SemanticAttribute<'single_serve' | 'shareable'>;
  preparation?: SemanticAttribute<Convenience>;
  messRisk?: SemanticAttribute<'low' | 'medium' | 'high'>;
  meltRisk?: SemanticAttribute<'low' | 'medium' | 'high'>;
  servingFormat?: SemanticAttribute<'single' | 'multi_pack' | 'bulk'>;
}

export function emptyFoodPreferenceProfile(profileId: string, updatedAt: string): FoodPreferenceProfile {
  return { schemaVersion: PERSONALIZATION_SCHEMA_VERSION, profileId, entries: [], updatedAt };
}
