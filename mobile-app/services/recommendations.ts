/**
 * Recommendation Engine
 * Identifies safer or healthier alternatives for scanned products.
 * Evaluates allergen safety, dietary constraints, and category similarity.
 */

import type { Product } from "@/types/Product";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import {
  assessCandidateSafety,
  rankSubstitutionCandidates,
  type SubstitutionReasonCode,
} from "@/services/substitutionEligibility";

export interface RecommendationScore {
  product: Product;
  score: number;
  reasons: string[];
  safetyRating: "green" | "grey" | "red";
  reasonCodes?: SubstitutionReasonCode[];
}

/**
 * Classify product safety based on nutrient levels and additives
 * Green: safe, meeting nutritional goals
 * Grey: acceptable, neutral profile
 * Red: unsuitable, high sugar/salt/fat or contains problematic additives
 */
function classifyProductSafety(product: Product): "green" | "grey" | "red" {
  const nutrientLevels = product.nutrientLevels || {};

  // Red flags: high sugar, high salt, high saturated fat
  const redFlags = [
    nutrientLevels.sugars === "high",
    nutrientLevels.salt === "high",
    nutrientLevels["saturated-fat"] === "high",
  ].filter(Boolean).length;

  // Nutri-score: a/b = green, c = grey, d/e = red
  const nutriscoreGrade = String(product.nutriscoreGrade || "").toUpperCase();
  const nutriscoreColor = nutriscoreGrade <= "B" ? "green" : nutriscoreGrade === "C" ? "grey" : "red";

  if (redFlags >= 2) return "red";
  if (nutriscoreColor === "red") return "red";
  if (nutriscoreColor === "green") return "green";
  return "grey";
}

/**
 * Get alternative product suggestions
 * @param original - Original scanned product
 * @param candidates - Pool of candidate products to rank
 * @param profile - User's nutritional profile
 * @param limit - Max results to return (default 5)
 * @returns Sorted recommendations (highest score first)
 */
export function getAlternatives(
  original: Product,
  candidates: Product[],
  profile: NutritionalProfile,
  limit = 5
): RecommendationScore[] {
  if (!original || !candidates?.length) return [];
  return rankSubstitutionCandidates(original, candidates, profile, limit).substitutions.map(
    (candidate) => ({
      product: candidate.product,
      score: candidate.score,
      reasons: candidate.reasons,
      safetyRating: candidate.safetyRating,
      reasonCodes: candidate.reasonCodes,
    })
  );
}

/**
 * Determine if a product is unsuitable for the profile
 */
export function isUnsuitableForProfile(
  product: Product,
  profile: NutritionalProfile
): { unsuitable: boolean; reason: string } {
  const assessment = assessCandidateSafety(product, profile);
  if (assessment.eligible) return { unsuitable: false, reason: "" };
  if (assessment.exclusionReason === "ALLERGEN_CONFLICT") {
    return { unsuitable: true, reason: `Contains allergen: ${assessment.matchedRestriction || "restricted ingredient"}` };
  }
  if (assessment.exclusionReason === "ALLERGEN_EVIDENCE_INCOMPLETE") {
    return { unsuitable: true, reason: "Allergen information is incomplete." };
  }
  if (assessment.exclusionReason === "AVOIDED_ADDITIVE") {
    return { unsuitable: true, reason: "Contains an avoided additive." };
  }
  return { unsuitable: true, reason: "Does not meet a mandatory dietary restriction." };
}

/**
 * Get recommendation summary: is product safe, and why/why not
 */
export function getRecommendationSummary(
  product: Product,
  profile: NutritionalProfile
): {
  safe: boolean;
  safetyRating: "green" | "grey" | "red";
  reasons: string[];
} {
  const unsafe = isUnsuitableForProfile(product, profile);
  const safety = classifyProductSafety(product);
  const reasons: string[] = [];

  if (unsafe.unsuitable) {
    reasons.push(`⚠️ ${unsafe.reason}`);
  }

  if (safety === "red") {
    reasons.push("⚠️ High in sugar/salt/fat (Red Nutri-score)");
  } else if (safety === "green") {
    reasons.push("✓ Good nutritional profile");
  } else {
    reasons.push("⚪ Neutral nutritional profile");
  }

  return {
    safe: !unsafe.unsuitable && safety !== "red",
    safetyRating: safety,
    reasons,
  };
}
