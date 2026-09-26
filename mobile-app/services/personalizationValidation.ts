import {
  CONVENIENCES, FAMILIARITIES, FLAVOUR_FAMILIES, FLAVOUR_INTENSITIES,
  OCCASIONS, PERSONALIZATION_SCHEMA_VERSION, TEXTURES,
  type FoodPreferenceProfile, type PreferenceDimension, type SavedShoppingIntent,
} from '@/types/Personalization';

const valuesByDimension: Record<PreferenceDimension, readonly string[]> = {
  texture: TEXTURES,
  flavourFamily: FLAVOUR_FAMILIES,
  flavourIntensity: FLAVOUR_INTENSITIES,
  familiarity: FAMILIARITIES,
  convenience: CONVENIENCES,
  occasion: OCCASIONS,
};
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SOURCE_VERSION = /^[A-Za-z0-9._-]{1,64}$/;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function date(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 35 && ISO_DATE.test(value) && Number.isFinite(Date.parse(value));
}

export function validPersonalizationId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function validPreference(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, ['dimension', 'value', 'sentiment', 'provenance', 'confidence', 'sourceVersion', 'updatedAt'])) return false;
  const dimension = value.dimension as PreferenceDimension;
  return Object.hasOwn(valuesByDimension, dimension) && valuesByDimension[dimension].includes(value.value as string) &&
    (value.sentiment === 'like' || value.sentiment === 'avoid') && value.provenance === 'explicit' &&
    value.confidence === 1 && typeof value.sourceVersion === 'string' && SOURCE_VERSION.test(value.sourceVersion) && date(value.updatedAt);
}

export function parseFoodPreferenceProfile(value: unknown): FoodPreferenceProfile {
  if (!record(value) || !exactKeys(value, ['schemaVersion', 'profileId', 'entries', 'updatedAt']) ||
      value.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION || !validPersonalizationId(value.profileId) ||
      !date(value.updatedAt) || !Array.isArray(value.entries) || value.entries.length > 32 ||
      !value.entries.every(validPreference)) {
    throw new Error('Invalid food preference profile.');
  }
  const keys = value.entries.map(entry => `${entry.dimension}:${entry.value}:${entry.sentiment}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate food preference.');
  return value as unknown as FoodPreferenceProfile;
}

export function parseSavedShoppingIntent(value: unknown): SavedShoppingIntent {
  if (!record(value) || !exactKeys(value,
      ['schemaVersion', 'intentId', 'profileId', 'text', 'provenance', 'createdAt', 'updatedAt'],
      ['occasion', 'convenience', 'deletedAt']) ||
      value.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION || !validPersonalizationId(value.intentId) ||
      !validPersonalizationId(value.profileId) || typeof value.text !== 'string' ||
      value.text.length > 240 || !value.text.trim() || CONTROL.test(value.text) ||
      value.provenance !== 'explicit' || !date(value.createdAt) || !date(value.updatedAt) ||
      (value.deletedAt !== undefined && !date(value.deletedAt)) ||
      (value.occasion !== undefined && !OCCASIONS.includes(value.occasion as typeof OCCASIONS[number])) ||
      (value.convenience !== undefined && !CONVENIENCES.includes(value.convenience as typeof CONVENIENCES[number]))) {
    throw new Error('Invalid saved shopping intent.');
  }
  return value as unknown as SavedShoppingIntent;
}

export function canonicalSavedShoppingIntent(value: unknown): SavedShoppingIntent {
  const intent = parseSavedShoppingIntent(value);
  if (!intent.deletedAt) return intent;
  const { occasion: _occasion, convenience: _convenience, ...rest } = intent;
  return { ...rest, text: '(deleted)' };
}
