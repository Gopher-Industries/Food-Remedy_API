import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import { assessAllergenSafety, type AllergenSafetyAssessment } from "@/services/allergenSafety";

export function getProfileRestrictions(profile: Pick<NutritionalProfile, "allergies" | "intolerances">): string[] {
  return Array.from(new Set([...(Array.isArray(profile.allergies) ? profile.allergies : []), ...(Array.isArray(profile.intolerances) ? profile.intolerances : [])]));
}

export function assessProductForProfile(product: Product, profile: Pick<NutritionalProfile, "allergies" | "intolerances">): AllergenSafetyAssessment {
  return assessAllergenSafety(product, getProfileRestrictions(profile));
}
