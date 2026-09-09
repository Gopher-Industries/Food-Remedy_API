import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import { assessProductForProfile, getProfileRestrictions } from "@/services/profileProductSuitability";

/** Values are deliberately bounded even when this module is used outside the API. */
export const MAX_SUBSTITUTION_CANDIDATES = 200;
export const MAX_SUBSTITUTION_RESULTS = 20;

export type SubstitutionReasonCode =
  | "MATCH_CATEGORY_EXACT"
  | "MATCH_CATEGORY_SUBSTRING"
  | "SAFE_ALLERGEN_FREE"
  | "ALLERGEN_EVIDENCE_INCOMPLETE"
  | "DIET_ALIGNED_VEGAN"
  | "DIET_ALIGNED_VEGETARIAN"
  | "DIET_ALIGNED_GLUTEN_FREE"
  | "BETTER_NUTRI_SCORE"
  | "LOWER_SUGAR"
  | "LOWER_SODIUM"
  | "LOWER_SATURATED_FAT"
  | "HIGHER_FIBER"
  | "HIGHER_PROTEIN"
  | "HEALTH_GOAL_WEIGHT_LOSS_ALIGNED"
  | "HEALTH_GOAL_MUSCLE_GAIN_ALIGNED";

export type SubstitutionEmptyStateReason =
  | "INSUFFICIENT_PRODUCT_DATA"
  | "NO_SAFE_ALTERNATIVES_IN_CATEGORY"
  | "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES";

type ExclusionReason =
  | "ALLERGEN_CONFLICT"
  | "ALLERGEN_EVIDENCE_INCOMPLETE"
  | "AVOIDED_ADDITIVE"
  | "DIETARY_RESTRICTION"
  | "INSUFFICIENT_CATEGORY_DATA";

export interface CandidateSafetyAssessment {
  eligible: boolean;
  safetyRating: "green" | "grey" | "red";
  exclusionReason?: ExclusionReason;
  /** Kept internal to the server-side consumer; never put in a response. */
  matchedRestriction?: string;
  reasonCodes: SubstitutionReasonCode[];
}

export interface RankedSubstitution {
  product: Product;
  barcode: string;
  score: number;
  confidenceScore: number;
  safetyRating: "green" | "grey";
  reasonCodes: SubstitutionReasonCode[];
  reasons: string[];
}

export interface SubstitutionRankingResult {
  substitutions: RankedSubstitution[];
  emptyStateReason: SubstitutionEmptyStateReason | null;
  metrics: SubstitutionRankingMetrics;
}

/** Aggregate-only outcomes suitable for operational metrics; no profile values. */
export interface SubstitutionRankingMetrics {
  candidatesExamined: number;
  eligibleCandidates: number;
  excludedAllergenConflict: number;
  excludedAllergenEvidenceIncomplete: number;
  excludedAvoidedAdditive: number;
  excludedDietaryRestriction: number;
  categoryDataFailures: number;
  targetCategoryMissing: boolean;
  reasonCodeCounts: Partial<Record<SubstitutionReasonCode, number>>;
}

const REASON_TEXT: Record<SubstitutionReasonCode, string> = {
  MATCH_CATEGORY_EXACT: "Matches the product category.",
  MATCH_CATEGORY_SUBSTRING: "Matches a related product category.",
  SAFE_ALLERGEN_FREE: "Allergen and trace declarations show no profile conflict.",
  ALLERGEN_EVIDENCE_INCOMPLETE: "Allergen information is incomplete, so this option needs caution.",
  DIET_ALIGNED_VEGAN: "Has a vegan label.",
  DIET_ALIGNED_VEGETARIAN: "Has a vegetarian label.",
  DIET_ALIGNED_GLUTEN_FREE: "Has a gluten-free label.",
  BETTER_NUTRI_SCORE: "Has a better Nutri-Score.",
  LOWER_SUGAR: "Has less sugar per 100g.",
  LOWER_SODIUM: "Has less sodium or salt per 100g.",
  LOWER_SATURATED_FAT: "Has less saturated fat per 100g.",
  HIGHER_FIBER: "Has more fibre per 100g.",
  HIGHER_PROTEIN: "Has more protein per 100g.",
  HEALTH_GOAL_WEIGHT_LOSS_ALIGNED: "Has fewer calories per 100g for the selected health goal.",
  HEALTH_GOAL_MUSCLE_GAIN_ALIGNED: "Has more protein per 100g for the selected health goal.",
};

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/^([a-z]{2,3}):/, "").replace(/[ _]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

function comparable(value: unknown): string {
  return normalise(value).replace(/-/g, "");
}

function nonEmptyStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function productLabels(product: Product): Set<string> {
  return new Set(nonEmptyStrings(product.labels).map(normalise));
}

function containsLabel(labels: Set<string>, label: string): boolean {
  return labels.has(label) || labels.has(`en-${label}`);
}

function categories(product: Product): string[] {
  const values = [...nonEmptyStrings(product.categories), typeof product.category === "string" ? product.category : ""];
  return Array.from(new Set(values.map(normalise).filter(Boolean)));
}

function categoryMatch(original: Product, candidate: Product): SubstitutionReasonCode | null {
  const originalCategories = categories(original);
  const candidateCategories = categories(candidate);
  if (!originalCategories.length || !candidateCategories.length) return null;
  if (originalCategories.some((left) => candidateCategories.includes(left))) return "MATCH_CATEGORY_EXACT";
  return originalCategories.some((left) => candidateCategories.some((right) => left.includes(right) || right.includes(left)))
    ? "MATCH_CATEGORY_SUBSTRING"
    : null;
}

function avoidedAdditiveMatch(product: Product, profile: NutritionalProfile): boolean {
  const avoided = new Set(nonEmptyStrings(profile.additives).map(comparable).filter(Boolean));
  return nonEmptyStrings(product.additives).some((additive) => avoided.has(comparable(additive)));
}

function dietRequirements(profile: NutritionalProfile): string[] {
  return Array.from(new Set(nonEmptyStrings(profile.dietaryForm).map(normalise).filter(Boolean)));
}

function dietAssessment(product: Product, profile: NutritionalProfile): { eligible: boolean; reasonCodes: SubstitutionReasonCode[] } {
  const labels = productLabels(product);
  const codes: SubstitutionReasonCode[] = [];
  for (const requirement of dietRequirements(profile)) {
    if (requirement === "vegan") {
      if (!containsLabel(labels, "vegan")) return { eligible: false, reasonCodes: [] };
      codes.push("DIET_ALIGNED_VEGAN");
    } else if (requirement === "vegetarian") {
      if (!containsLabel(labels, "vegetarian") && !containsLabel(labels, "vegan")) return { eligible: false, reasonCodes: [] };
      codes.push("DIET_ALIGNED_VEGETARIAN");
    } else if (requirement === "gluten-free") {
      if (!containsLabel(labels, "gluten-free")) return { eligible: false, reasonCodes: [] };
      codes.push("DIET_ALIGNED_GLUTEN_FREE");
    } else {
      // A stored mandatory diet without a defined, verified evidence rule is fail-closed.
      return { eligible: false, reasonCodes: [] };
    }
  }
  return { eligible: true, reasonCodes: codes };
}

/**
 * Applies profile-derived hard gates only. A caller must not use this result to
 * expose matched restrictions or profile values in an API response.
 */
export function assessCandidateSafety(product: Product, profile: NutritionalProfile): CandidateSafetyAssessment {
  const allergenAssessment = assessProductForProfile(product, profile);
  const hasRestrictions = getProfileRestrictions(profile).length > 0;
  if (allergenAssessment.status === "unsafe") {
    return { eligible: false, safetyRating: "red", exclusionReason: "ALLERGEN_CONFLICT", matchedRestriction: allergenAssessment.matchedAllergen, reasonCodes: [] };
  }
  if (allergenAssessment.status === "unknown" && hasRestrictions) {
    return { eligible: false, safetyRating: "red", exclusionReason: "ALLERGEN_EVIDENCE_INCOMPLETE", reasonCodes: [] };
  }
  if (avoidedAdditiveMatch(product, profile)) {
    return { eligible: false, safetyRating: "red", exclusionReason: "AVOIDED_ADDITIVE", reasonCodes: [] };
  }
  const diet = dietAssessment(product, profile);
  if (!diet.eligible) return { eligible: false, safetyRating: "red", exclusionReason: "DIETARY_RESTRICTION", reasonCodes: [] };
  if (allergenAssessment.status === "unknown") {
    return { eligible: true, safetyRating: "grey", reasonCodes: ["ALLERGEN_EVIDENCE_INCOMPLETE", ...diet.reasonCodes] };
  }
  return { eligible: true, safetyRating: "green", reasonCodes: ["SAFE_ALLERGEN_FREE", ...diet.reasonCodes] };
}

function nutrient(product: Product, keys: string[], normalizedKeys: string[] = []): number | null {
  const values = product.nutriments || {};
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value)) return value;
  }
  const normalized = product.nutriments_normalized || {};
  for (const key of normalizedKeys) {
    const value = Number(normalized[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function nutriScore(product: Product): number | null {
  const value = String(product.nutriscoreGrade || "").trim().toUpperCase();
  const score: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  return score[value] ?? null;
}

function improved(candidate: number | null, original: number | null, direction: "lower" | "higher"): boolean {
  return candidate !== null && original !== null && (direction === "lower" ? candidate < original : candidate > original);
}

function nutritionReasons(original: Product, candidate: Product, profile: NutritionalProfile): { score: number; reasonCodes: SubstitutionReasonCode[] } {
  const codes: SubstitutionReasonCode[] = [];
  let score = 0;
  if (improved(nutriScore(candidate), nutriScore(original), "higher")) { score += 10; codes.push("BETTER_NUTRI_SCORE"); }
  const sugarCandidate = nutrient(candidate, ["sugars_100g"], ["sugars_g"]);
  const sugarOriginal = nutrient(original, ["sugars_100g"], ["sugars_g"]);
  if (improved(sugarCandidate, sugarOriginal, "lower")) { score += 3; codes.push("LOWER_SUGAR"); }
  const sodiumCandidate = nutrient(candidate, ["sodium_100g", "salt_100g"], ["sodium_mg", "salt_g"]);
  const sodiumOriginal = nutrient(original, ["sodium_100g", "salt_100g"], ["sodium_mg", "salt_g"]);
  if (improved(sodiumCandidate, sodiumOriginal, "lower")) { score += 3; codes.push("LOWER_SODIUM"); }
  const saturatedCandidate = nutrient(candidate, ["saturated-fat_100g"], ["saturated_fat_g"]);
  const saturatedOriginal = nutrient(original, ["saturated-fat_100g"], ["saturated_fat_g"]);
  if (improved(saturatedCandidate, saturatedOriginal, "lower")) { score += 3; codes.push("LOWER_SATURATED_FAT"); }
  const fibreCandidate = nutrient(candidate, ["fiber_100g", "fibre_100g"], ["fiber_g"]);
  const fibreOriginal = nutrient(original, ["fiber_100g", "fibre_100g"], ["fiber_g"]);
  if (improved(fibreCandidate, fibreOriginal, "higher")) { score += 3; codes.push("HIGHER_FIBER"); }
  const proteinCandidate = nutrient(candidate, ["proteins_100g"], ["proteins_g"]);
  const proteinOriginal = nutrient(original, ["proteins_100g"], ["proteins_g"]);
  if (improved(proteinCandidate, proteinOriginal, "higher")) { score += 3; codes.push("HIGHER_PROTEIN"); }
  const caloriesCandidate = nutrient(candidate, ["energy-kcal_100g"], ["energy_kcal"]);
  const caloriesOriginal = nutrient(original, ["energy-kcal_100g"], ["energy_kcal"]);
  if (profile.healthGoal === "weight_loss" && improved(caloriesCandidate, caloriesOriginal, "lower")) { score += 10; codes.push("HEALTH_GOAL_WEIGHT_LOSS_ALIGNED"); }
  if (profile.healthGoal === "muscle_gain" && improved(proteinCandidate, proteinOriginal, "higher")) { score += 10; codes.push("HEALTH_GOAL_MUSCLE_GAIN_ALIGNED"); }
  return { score, reasonCodes: codes };
}

function rankCandidate(original: Product, product: Product, profile: NutritionalProfile, safety: CandidateSafetyAssessment): RankedSubstitution | null {
  if (!categories(product).length) return null;
  const category = categoryMatch(original, product);
  const nutrition = nutritionReasons(original, product, profile);
  const categoryScore = category === "MATCH_CATEGORY_EXACT" ? 30 : category === "MATCH_CATEGORY_SUBSTRING" ? 20 : 0;
  const safetyScore = safety.safetyRating === "green" ? 25 : 0;
  const dietScore = safety.reasonCodes.filter((code) => code.startsWith("DIET_ALIGNED_")).length ? 10 : 0;
  const reasonCodes = [...(category ? [category] : []), ...safety.reasonCodes, ...nutrition.reasonCodes];
  const score = Math.min(100, categoryScore + safetyScore + dietScore + nutrition.score);
  const barcode = String(product.barcode || "").trim();
  if (!barcode) return null;
  return { product, barcode, score, confidenceScore: Math.round((score / 100) * 1000) / 1000, safetyRating: safety.safetyRating as "green" | "grey", reasonCodes, reasons: reasonCodes.map((code) => REASON_TEXT[code]) };
}

function compareRanked(left: RankedSubstitution, right: RankedSubstitution): number {
  if (left.safetyRating !== right.safetyRating) return left.safetyRating === "green" ? -1 : 1;
  if (left.score !== right.score) return right.score - left.score;
  return left.barcode < right.barcode ? -1 : left.barcode > right.barcode ? 1 : 0;
}

/**
 * Ranks only candidates that pass the non-negotiable safety gates. The input
 * order cannot affect ordering, deduplication, or a no-results reason.
 */
export function rankSubstitutionCandidates(original: Product, candidates: Product[], profile: NutritionalProfile, limit = 5): SubstitutionRankingResult {
  const metrics: SubstitutionRankingMetrics = {
    candidatesExamined: 0,
    eligibleCandidates: 0,
    excludedAllergenConflict: 0,
    excludedAllergenEvidenceIncomplete: 0,
    excludedAvoidedAdditive: 0,
    excludedDietaryRestriction: 0,
    categoryDataFailures: 0,
    targetCategoryMissing: false,
    reasonCodeCounts: {},
  };
  if (!categories(original).length) {
    metrics.targetCategoryMissing = true;
    metrics.categoryDataFailures = 1;
    return { substitutions: [], emptyStateReason: "INSUFFICIENT_PRODUCT_DATA", metrics };
  }
  const bounded = Array.isArray(candidates) ? candidates.slice(0, MAX_SUBSTITUTION_CANDIDATES) : [];
  const byBarcode = new Map<string, RankedSubstitution>();
  let categoryDataMissing = 0;
  let strictAllergenExclusions = 0;
  let usableCandidates = 0;
  for (const candidate of bounded) {
    if (!candidate || String(candidate.barcode || "").trim() === String(original.barcode || "").trim()) continue;
    usableCandidates += 1;
    metrics.candidatesExamined += 1;
    const safety = assessCandidateSafety(candidate, profile);
    if (!safety.eligible) {
      if (safety.exclusionReason === "ALLERGEN_CONFLICT") {
        strictAllergenExclusions += 1;
        metrics.excludedAllergenConflict += 1;
      } else if (safety.exclusionReason === "ALLERGEN_EVIDENCE_INCOMPLETE") {
        strictAllergenExclusions += 1;
        metrics.excludedAllergenEvidenceIncomplete += 1;
      } else if (safety.exclusionReason === "AVOIDED_ADDITIVE") {
        metrics.excludedAvoidedAdditive += 1;
      } else if (safety.exclusionReason === "DIETARY_RESTRICTION") {
        metrics.excludedDietaryRestriction += 1;
      }
      continue;
    }
    metrics.eligibleCandidates += 1;
    const ranked = rankCandidate(original, candidate, profile, safety);
    if (!ranked) {
      categoryDataMissing += 1;
      metrics.categoryDataFailures += 1;
      continue;
    }
    const existing = byBarcode.get(ranked.barcode);
    if (!existing || compareRanked(ranked, existing) < 0) byBarcode.set(ranked.barcode, ranked);
  }
  const substitutions = [...byBarcode.values()].sort(compareRanked).slice(0, Math.max(1, Math.min(MAX_SUBSTITUTION_RESULTS, Math.floor(limit) || 5)));
  for (const substitution of substitutions) {
    for (const code of substitution.reasonCodes) {
      metrics.reasonCodeCounts[code] = (metrics.reasonCodeCounts[code] ?? 0) + 1;
    }
  }
  if (substitutions.length) return { substitutions, emptyStateReason: null, metrics };
  if (usableCandidates > 0 && strictAllergenExclusions === usableCandidates) {
    return { substitutions, emptyStateReason: "STRICT_ALLERGEN_EXCLUSION_ALL_CANDIDATES", metrics };
  }
  if (usableCandidates > 0 && categoryDataMissing === usableCandidates) {
    return { substitutions, emptyStateReason: "INSUFFICIENT_PRODUCT_DATA", metrics };
  }
  return { substitutions, emptyStateReason: "NO_SAFE_ALTERNATIVES_IN_CATEGORY", metrics };
}
