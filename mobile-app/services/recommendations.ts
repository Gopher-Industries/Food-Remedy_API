/**
 * Recommendation Engine
 * Identifies safer or healthier alternatives for scanned products.
 * Evaluates allergen safety, dietary constraints, and category similarity.
 */

import type { Product } from "@/types/Product";
import type { NutritionalProfile } from "@/types/NutritionalProfile";

export interface RecommendationScore {
  product: Product;
  score: number;
  reasons: string[];
  safetyRating: "green" | "grey" | "red";
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
 * Check if product is safe for the given profile
 * Returns true if product contains no allergens/forbidden additives
 */
function isSafeForProfile(product: Product, profile: NutritionalProfile): boolean {
  // Check allergens
  const productAllergens = (product.allergens || []).map((a) => a.toLowerCase());
  const profileAllergies = (profile.allergies || []).map((a) => a.toLowerCase());
  const hasAllergen = profileAllergies.some((allergy) =>
    productAllergens.some((allergen) => allergen.includes(allergy) || allergy.includes(allergen))
  );
  if (hasAllergen) return false;

  // Check traces (if critical)
  const productTraces = (product.traces || "").toLowerCase();
  if (productTraces && profileAllergies.some((allergy) => productTraces.includes(allergy))) {
    return false;
  }

  // Check forbidden additives
  const productAdditives = (product.additives || []).map((a) => a.toLowerCase());
  const forbiddenAdditives = (profile.additives || []).map((a) => a.toLowerCase());
  const hasForbiddenAdditive = forbiddenAdditives.some((additive) =>
    productAdditives.some((p) => p.includes(additive) || additive.includes(p))
  );
  if (hasForbiddenAdditive) return false;

  return true;
}

/**
 * Check if product aligns with dietary preferences
 */
function meetsdietary(product: Product, profile: NutritionalProfile): boolean {
  const dietaryForms = (profile.dietaryForm || []).map((d) => d.toLowerCase());
  const labels = (product.labels || []).map((l) => l.toLowerCase());
  const categories = (product.categories || []).map((c) => c.toLowerCase());

  for (const diet of dietaryForms) {
    // Vegetarian: no meat
    if (diet === "vegetarian") {
      const hasVegetarian = labels.some((l) => l.includes("vegetarian"));
      if (!hasVegetarian) return false;
    }
    // Vegan: vegetarian + no animal products
    if (diet === "vegan") {
      const hasVegan = labels.some((l) => l.includes("vegan"));
      if (!hasVegan) return false;
    }
    // Gluten-free
    if (diet === "gluten-free") {
      const hasGlutenFree = labels.some((l) => l.includes("gluten"));
      if (!hasGlutenFree) return false;
    }
  }

  return true;
}

/**
 * Calculate category similarity score (0..1)
 * Exact category match = 1, substring match = 0.7, no match = 0
 */
function calculateCategorySimilarity(original: Product, alternative: Product): number {
  const origCategories = (original.categories || []).map((c) => c.toLowerCase());
  const altCategories = (alternative.categories || []).map((c) => c.toLowerCase());

  if (origCategories.length === 0 || altCategories.length === 0) return 0.3; // default low match

  const matches = origCategories.filter((oc) =>
    altCategories.some((ac) => {
      if (oc === ac) return 1; // exact match
      if (oc.includes(ac) || ac.includes(oc)) return 0.7; // substring match
      return 0;
    })
  );

  return matches.length > 0 ? 0.8 : 0.3;
}

/**
 * Calculate overall recommendation score for a candidate product
 */
function scoreAlternative(
  original: Product,
  alternative: Product,
  profile: NutritionalProfile
): RecommendationScore {
  const reasons: string[] = [];
  let score = 0;

  // Base score: category similarity (25 points max)
  const categorySimilarity = calculateCategorySimilarity(original, alternative);
  const categoryScore = categorySimilarity * 25;
  score += categoryScore;

  // Safety score: classify and boost green products (40 points max)
  const altSafety = classifyProductSafety(alternative);
  const origSafety = classifyProductSafety(original);
  if (altSafety === "green") {
    score += 40;
    reasons.push("✓ Healthier option (Green rating)");
  } else if (altSafety === "grey") {
    score += 20;
    reasons.push("⚪ Acceptable nutritional profile (Grey rating)");
  } else {
    score += 0; // Red products should be filtered but scored low if not
    reasons.push("⚠️ Higher concern (Red rating)");
  }

  // Allergen safety (20 points if safe)
  if (isSafeForProfile(alternative, profile)) {
    score += 20;
    reasons.push("✓ Safe for your allergies");
  } else {
    score -= 30; // penalize unsafe products heavily
    reasons.push("✗ Contains allergen/additive concern");
  }

  // Dietary alignment (15 points if aligned)
  if (meetsdietary(alternative, profile)) {
    score += 15;
    reasons.push(`✓ Aligns with ${(profile.dietaryForm || [])[0] || "your diet"}`);
  }

  return {
    product: alternative,
    score: Math.max(0, score), // clamp to 0 minimum
    reasons,
    safetyRating: altSafety,
  };
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
  // Filter: exclude red products, prioritize green > grey
  const scored = candidates
    .map((cand) => scoreAlternative(original, cand, profile))
    .filter((rec) => rec.score > 0) // exclude zero-score products
    .sort((a, b) => {
      // Primary: safety rating (green > grey > red)
      const safetyOrder = { green: 3, grey: 2, red: 1 };
      if (safetyOrder[a.safetyRating] !== safetyOrder[b.safetyRating]) {
        return safetyOrder[b.safetyRating] - safetyOrder[a.safetyRating];
      }
      // Secondary: score (descending)
      return b.score - a.score;
    });

  return scored.slice(0, limit);
}

/**
 * Determine if a product is unsuitable for the profile
 */
export function isUnsuitableForProfile(
  product: Product,
  profile: NutritionalProfile
): { unsuitable: boolean; reason: string } {
  // Check allergens
  const productAllergens = (product.allergens || []).map((a) => a.toLowerCase());
  const profileAllergies = (profile.allergies || []).map((a) => a.toLowerCase());
  const allergenMatch = profileAllergies.find((allergy) =>
    productAllergens.some((allergen) => allergen.includes(allergy) || allergy.includes(allergen))
  );
  if (allergenMatch) {
    return { unsuitable: true, reason: `Contains allergen: ${allergenMatch}` };
  }

  // Check forbidden additives
  const productAdditives = (product.additives || []).map((a) => a.toLowerCase());
  const forbiddenAdditives = (profile.additives || []).map((a) => a.toLowerCase());
  const additiveMatch = forbiddenAdditives.find((additive) =>
    productAdditives.some((p) => p.includes(additive) || additive.includes(p))
  );
  if (additiveMatch) {
    return { unsuitable: true, reason: `Contains forbidden additive: ${additiveMatch}` };
  }

  // Check dietary requirements
  if (!meetsdietary(product, profile)) {
    const dietary = (profile.dietaryForm || [])[0] || "dietary preference";
    return { unsuitable: true, reason: `Not ${dietary}` };
  }

  return { unsuitable: false, reason: "" };
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
