import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  assessAllergenSafety,
  type AllergenSafetyAssessment,
} from "@/services/allergenSafety";

export function getProfileRestrictions(
  profile: Pick<NutritionalProfile, "allergies" | "intolerances">
): string[] {
  const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];
  const intolerances = Array.isArray(profile.intolerances)
    ? profile.intolerances
    : [];
  return Array.from(
    new Set([...allergies, ...intolerances])
  );
}

export function assessProductForProfile(
  product: Product,
  profile: Pick<NutritionalProfile, "allergies" | "intolerances">
): AllergenSafetyAssessment {
  return assessAllergenSafety(product, getProfileRestrictions(profile));
}

export interface AllergenSuitabilityPresentation {
  status: "good" | "watch" | "bad";
  label: string;
  description: string;
}

export interface OverallFitGuard {
  percentage: number;
  label: "Moderate fit" | "Poor fit";
  status: "watch" | "bad";
}

/** Prevent nutrition scores from overriding a safety conflict or uncertainty. */
export function guardOverallFitForAllergenSafety(
  percentage: number,
  assessment: AllergenSafetyAssessment
): OverallFitGuard | null {
  if (assessment.status === "unsafe") {
    return { percentage: 0, label: "Poor fit", status: "bad" };
  }
  if (assessment.status === "unknown") {
    return {
      percentage: Math.min(percentage, 74),
      label: "Moderate fit",
      status: "watch",
    };
  }
  return null;
}

export function presentAllergenSuitability(
  assessment: AllergenSafetyAssessment
): AllergenSuitabilityPresentation {
  if (assessment.status === "unsafe") {
    const conflicts = assessment.matchedAllergens ||
      (assessment.matchedAllergen ? [assessment.matchedAllergen] : []);
    return {
      status: "bad",
      label: "Contains allergen",
      description: `This product may conflict with: ${conflicts.join(", ")}.`,
    };
  }

  if (assessment.status === "unknown") {
    return {
      status: "watch",
      label: "Check allergen information",
      description:
        "The available product data is not complete enough to confirm allergen safety.",
    };
  }

  return {
    status: "good",
    label: "No conflict found",
    description:
      "No listed allergen conflict was found between your profile and this product.",
  };
}
