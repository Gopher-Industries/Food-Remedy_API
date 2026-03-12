import type { Product } from "@/types/Product";
import { normaliseRetrictionsForProfileCheck } from "@/services/utils/normaliseRestrictionsForProfileCheck";
import { scoreProduct } from "@/services/nutrition/nutritionScorer";

export type ProductTagTone = "success" | "warning" | "danger" | "neutral";
export type ProductTagKind = "allergen" | "diet" | "risk";

export type ProductTagItem = {
  id: string;
  label: string;
  kind: ProductTagKind;
  tone: ProductTagTone;
  priority: number;
};

const DIET_LABELS: Record<string, string> = {
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  "gluten-free": "Gluten-Free",
  "no-alcohol": "No Alcohol",
  "alcohol-free": "No Alcohol",
};

const RISK_TAGS: Record<
  string,
  { label: string; tone: ProductTagTone; priority: number }
> = {
  highSugar: { label: "High Sugar", tone: "danger", priority: 30 },
  moderateSugar: { label: "Moderate Sugar", tone: "warning", priority: 40 },
  highSodium: { label: "High Sodium", tone: "danger", priority: 30 },
  moderateSodium: { label: "Moderate Sodium", tone: "warning", priority: 40 },
  highFat: { label: "High Fat", tone: "danger", priority: 30 },
  moderateFat: { label: "Moderate Fat", tone: "warning", priority: 40 },
  highSaturatedFat: { label: "High Saturated Fat", tone: "danger", priority: 30 },
  moderateSaturatedFat: { label: "Moderate Saturated Fat", tone: "warning", priority: 40 },
  highEnergyDensity: { label: "High Energy Density", tone: "danger", priority: 30 },
  moderateEnergyDensity: { label: "Moderate Energy Density", tone: "warning", priority: 40 },
};

const sortTags = (a: ProductTagItem, b: ProductTagItem) =>
  a.priority === b.priority ? a.label.localeCompare(b.label) : a.priority - b.priority;

const normalizeTag = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^([a-z]{2,3}):/, "")
    .replace(/[_\s]+/g, "-");

const splitTagString = (value: string | null | undefined): string[] =>
  String(value || "")
    .split(/[;,]/g)
    .map((s) => s.trim())
    .filter(Boolean);

function buildAllergenTags(product: Product): ProductTagItem[] {
  const mapped = normaliseRetrictionsForProfileCheck({
    allergens: product.allergens ?? [],
    traces: [
      ...splitTagString(product.traces),
      ...splitTagString(product.tracesFromIngredients),
    ],
    additives: product.additives ?? [],
    ingredientAnalysis: product.ingredientsAnalysis ?? undefined,
  });

  return mapped.allergens.map((label) => ({
    id: `allergen:${label}`,
    label: `Allergen: ${label}`,
    kind: "allergen",
    tone: "danger",
    priority: 10,
  }));
}

function buildDietTags(product: Product): ProductTagItem[] {
  const tags = new Set(
    (product.labels || []).map((t) => normalizeTag(t)).filter(Boolean)
  );
  const analysis = new Set(
    (product.ingredientsAnalysis || []).map((t) => normalizeTag(t)).filter(Boolean)
  );

  const positives = new Set<string>();
  const negatives = new Set<string>();

  for (const raw of tags) {
    if (raw in DIET_LABELS) positives.add(DIET_LABELS[raw]);
  }

  if (analysis.has("non-vegan")) negatives.add("Vegan");
  if (analysis.has("non-vegetarian")) negatives.add("Vegetarian");
  if (tags.has("contains-alcohol")) negatives.add("No Alcohol");

  for (const neg of negatives) positives.delete(neg);

  const items: ProductTagItem[] = [];

  for (const label of Array.from(negatives)) {
    items.push({
      id: `diet:avoid:${label}`,
      label: `Not ${label}`,
      kind: "diet",
      tone: "warning",
      priority: 20,
    });
  }

  for (const label of Array.from(positives)) {
    items.push({
      id: `diet:allow:${label}`,
      label,
      kind: "diet",
      tone: "success",
      priority: 50,
    });
  }

  return items;
}

function buildRiskTags(product: Product): ProductTagItem[] {
  const scored = scoreProduct(product.nutriments || {});
  const items: ProductTagItem[] = [];
  const seen = new Set<string>();

  for (const tag of scored.tags) {
    const mapped = RISK_TAGS[tag];
    if (!mapped) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    items.push({
      id: `risk:${tag}`,
      label: mapped.label,
      kind: "risk",
      tone: mapped.tone,
      priority: mapped.priority,
    });
  }

  return items;
}

export function getProductTags(product: Product): ProductTagItem[] {
  return [
    ...buildAllergenTags(product),
    ...buildDietTags(product),
    ...buildRiskTags(product),
  ].sort(sortTags);
}
