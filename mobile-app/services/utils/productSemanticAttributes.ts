import {
  CONVENIENCES, FLAVOUR_FAMILIES, FLAVOUR_INTENSITIES, OCCASIONS,
  PERSONALIZATION_SCHEMA_VERSION, TEXTURES,
  type ProductSemanticAttributes,
} from '@/types/Personalization';

const values = {
  texture: TEXTURES,
  flavourFamily: FLAVOUR_FAMILIES,
  flavourIntensity: FLAVOUR_INTENSITIES,
  foodRole: ['main', 'side', 'treat', 'ingredient', 'drink'],
  occasion: OCCASIONS,
  portability: ['portable', 'requires_container', 'not_portable'],
  shareability: ['single_serve', 'shareable'],
  preparation: CONVENIENCES,
  messRisk: ['low', 'medium', 'high'],
  meltRisk: ['low', 'medium', 'high'],
  servingFormat: ['single', 'multi_pack', 'bulk'],
} as const;

export const PRODUCT_SEMANTIC_FIELDS = Object.keys(values) as (keyof typeof values)[];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reject the whole block if any attribute lacks provenance or has an unknown value. */
export function validateProductSemanticAttributes(value: unknown): ProductSemanticAttributes | null {
  if (!record(value) || value.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION ||
      !['complete', 'partial'].includes(String(value.evidenceCompleteness)) ||
      Object.keys(value).some(key => !['schemaVersion', 'evidenceCompleteness', ...PRODUCT_SEMANTIC_FIELDS].includes(key))) return null;
  let populated = 0;
  for (const field of PRODUCT_SEMANTIC_FIELDS) {
    const attribute = value[field];
    if (attribute === undefined) continue;
    if (!record(attribute) || Object.keys(attribute).length !== 5 ||
        !['value', 'source', 'sourceVersion', 'confidence', 'generatedAt'].every(key => key in attribute) ||
        ![...values[field], 'not_applicable'].includes(attribute.value as never) ||
        !['catalogue', 'manual', 'deterministic', 'model_inferred'].includes(String(attribute.source)) ||
        typeof attribute.sourceVersion !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(attribute.sourceVersion) ||
        typeof attribute.confidence !== 'number' || !Number.isFinite(attribute.confidence) ||
        attribute.confidence < 0 || attribute.confidence > 1 ||
        typeof attribute.generatedAt !== 'string' || attribute.generatedAt.length > 35 ||
        !Number.isFinite(Date.parse(attribute.generatedAt))) return null;
    populated++;
  }
  if (!populated || (value.evidenceCompleteness === 'complete' && populated !== PRODUCT_SEMANTIC_FIELDS.length)) return null;
  return value as unknown as ProductSemanticAttributes;
}
