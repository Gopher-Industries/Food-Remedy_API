import { normaliseAllergens } from "./allergens";

type Images = {
  root: string;
  primary: string | null;
  variants: Record<string, number>;
};

type ProductDetailV1 = {
  barcode: string;
  productName: string;
  brand: string | null;
  genericName: string | null;
  additives: string[];
  allergens: string[];
  ingredients: string[];
  ingredientsText: string | null;
  category: string | null;
  categories: string[];
  labels: string[];
  nutrientLevels: Record<string, string>;
  nutriments: Record<string, unknown>;
  nutriments_normalized: Record<string, number | null>;
  nutriscoreGrade: string | null;
  productQuantity: number | null;
  productQuantityUnit: string | null;
  servingQuantity: number | null;
  servingQuantityUnit: string | null;
  traces: string | null;
  completeness: number | null;
  images: Images;
  tags: {
    final: string[];
    removed: string[];
  };
  metadata: Record<string, unknown>;
  enrichmentMetadata?: Record<string, unknown>;
  dateAdded?: string | null;
  lastUpdated?: string | null;
};

const NORMALIZED_NUTRIMENT_KEYS = [
  "energy_kj",
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrates_g",
  "sugars_g",
  "proteins_g",
  "salt_g",
  "sodium_mg",
  "fiber_g",
];

function nullIfEmpty(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function safeStringArray(value: unknown): string[] {
  if (value == null) return [];
  const source = Array.isArray(value) ? value : [value];
  return source
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "tag" in item) {
        return String((item as { tag?: unknown }).tag ?? "").trim();
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeCategories(value: unknown): { category: string | null; categories: string[] } {
  const categories = Array.from(new Set(safeStringArray(value)));
  return {
    category: categories[0] ?? null,
    categories,
  };
}

function normalizeNutrientLevels(value: unknown): Record<string, string> {
  const levels = safeRecord(value);
  return Object.fromEntries(
    Object.entries(levels)
      .filter(([, level]) => level != null)
      .map(([key, level]) => [key, String(level)])
  );
}

function normalizeNutriments(value: unknown): Record<string, unknown> {
  return safeRecord(value);
}

function normalizeNutrimentsNormalized(value: unknown): Record<string, number | null> {
  const source = safeRecord(value);
  const normalized: Record<string, number | null> = {};

  for (const key of NORMALIZED_NUTRIMENT_KEYS) {
    normalized[key] = safeNumber(source[key]);
  }

  for (const [key, rawValue] of Object.entries(source)) {
    if (!(key in normalized)) {
      normalized[key] = safeNumber(rawValue);
    }
  }

  return normalized;
}

function normalizeImages(raw: Record<string, unknown>): Images {
  const images = safeRecord(raw.images);
  const legacyImage = safeRecord(raw.imageURL);
  const source = Object.keys(images).length ? images : legacyImage;
  const variants = safeRecord(source.variants);

  return {
    root: String(source.root ?? ""),
    primary: nullIfEmpty(source.primary),
    variants: Object.fromEntries(
      Object.entries(variants)
        .map(([key, value]) => [key, Number(value)])
        .filter(([, value]) => Number.isInteger(value))
    ),
  };
}

function normalizeTags(value: unknown): { final: string[]; removed: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { final: [], removed: [] };
  }

  const tags = value as Record<string, unknown>;
  return {
    final: safeStringArray(tags.final),
    removed: safeStringArray(tags.removed),
  };
}

export function buildProductDetailResponse(
  rawProduct: Record<string, unknown>,
  fallbackBarcode?: string
): ProductDetailV1 {
  const categories = normalizeCategories(rawProduct.categories);
  const metadata = safeRecord(rawProduct.metadata);
  const enrichmentMetadata = safeRecord(rawProduct.enrichmentMetadata);

  const response: ProductDetailV1 = {
    barcode: String(rawProduct.barcode ?? fallbackBarcode ?? ""),
    productName: String(rawProduct.productName ?? ""),
    brand: nullIfEmpty(rawProduct.brand),
    genericName: nullIfEmpty(rawProduct.genericName),
    additives: safeStringArray(rawProduct.additives),
    allergens: normaliseAllergens(
      rawProduct.allergens,
      rawProduct.allergensDetected,
    ),
    ingredients: safeStringArray(rawProduct.ingredients),
    ingredientsText: nullIfEmpty(rawProduct.ingredientsText),
    category: nullIfEmpty(rawProduct.category) ?? categories.category,
    categories: categories.categories,
    labels: safeStringArray(rawProduct.labels),
    nutrientLevels: normalizeNutrientLevels(rawProduct.nutrientLevels),
    nutriments: normalizeNutriments(rawProduct.nutriments),
    nutriments_normalized: normalizeNutrimentsNormalized(rawProduct.nutriments_normalized),
    nutriscoreGrade: nullIfEmpty(rawProduct.nutriscoreGrade),
    productQuantity: safeNumber(rawProduct.productQuantity),
    productQuantityUnit: nullIfEmpty(rawProduct.productQuantityUnit),
    servingQuantity: safeNumber(rawProduct.servingQuantity),
    servingQuantityUnit: nullIfEmpty(rawProduct.servingQuantityUnit),
    traces: nullIfEmpty(rawProduct.traces),
    completeness: safeNumber(rawProduct.completeness),
    images: normalizeImages(rawProduct),
    tags: normalizeTags(rawProduct.tags),
    metadata: Object.keys(metadata).length ? metadata : { source: "firestore" },
  };

  if (Object.keys(enrichmentMetadata).length) {
    response.enrichmentMetadata = enrichmentMetadata;
  }
  if (rawProduct.dateAdded != null) {
    response.dateAdded = String(rawProduct.dateAdded);
  }
  if (rawProduct.lastUpdated != null) {
    response.lastUpdated = String(rawProduct.lastUpdated);
  }

  return response;
}
