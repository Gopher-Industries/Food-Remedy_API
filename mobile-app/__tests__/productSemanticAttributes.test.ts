import { buildProductDetailResponse } from '@/services/utils/productDetail';
import { normaliseFirestoreProduct } from '@/services/utils/normaliseFirestoreProduct';
import { validateProductSemanticAttributes } from '@/services/utils/productSemanticAttributes';

const evidence = {
  schemaVersion: '1.0.0', evidenceCompleteness: 'partial',
  texture: { value: 'crunchy', source: 'manual', sourceVersion: 'fixture-v1', confidence: 1, generatedAt: '2026-09-26T00:00:00Z' },
};

describe('product semantic evidence', () => {
  it('preserves valid evidence without changing safety facts', () => {
    const raw = { barcode: '123', productName: 'Cracker', allergens: ['milk'], nutriments: { fat: 12 }, semanticAttributes: evidence };
    const normalized = normaliseFirestoreProduct(raw);
    const detail = buildProductDetailResponse(raw);
    expect(normalized.semanticAttributes).toEqual(evidence);
    expect(detail.semanticAttributes).toEqual(evidence);
    expect(normalized.allergens).toEqual(['milk']);
    expect(detail.nutriments).toEqual({ fat: 12 });
  });

  it('accepts old documents without evidence', () => {
    expect(normaliseFirestoreProduct({ barcode: '123' }).semanticAttributes).toBeUndefined();
    expect(buildProductDetailResponse({ barcode: '123' }).semanticAttributes).toBeUndefined();
  });

  it('drops unsupported and unproven semantic blocks', () => {
    expect(validateProductSemanticAttributes({ ...evidence, texture: { ...evidence.texture, confidence: 2 } })).toBeNull();
    expect(validateProductSemanticAttributes({ ...evidence, texture: { value: 'crunchy' } })).toBeNull();
    expect(validateProductSemanticAttributes({ ...evidence, allergenSafe: true })).toBeNull();
    expect(validateProductSemanticAttributes({ ...evidence, evidenceCompleteness: 'complete' })).toBeNull();
  });
});
