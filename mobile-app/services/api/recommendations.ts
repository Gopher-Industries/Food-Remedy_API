/**
 * Recommendation API Service
 * Provides recommendations via REST API (if configured) or fallback to local recommendation engine
 */

import type { Product } from "@/types/Product";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { RecommendationScore } from "@/services/recommendations";
import { getAlternatives, isUnsuitableForProfile } from "@/services/recommendations";
import { apiGet, apiPost } from "@/services/apiClient";
import { normalizeError } from "@/services/errorHandler";
import { getCandidatesForRecommendations } from "@/services/database/products/getCandidatesForRecommendations";
import { getProductById as getProductFromFirestore } from "@/services/api/products";

/**
 * Get alternative product recommendations from backend API
 * Falls back to local recommendation engine if API not available
 * @param productBarcode - Barcode of the original scanned product
 * @param profile - User's nutritional profile
 * @param limit - Max recommendations (default 5)
 */
export async function getRecommendations(
  productBarcode: string,
  profile: NutritionalProfile,
  limit = 5
): Promise<RecommendationScore[]> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const source = String(process.env.EXPO_PUBLIC_API_SOURCE || "auto").toLowerCase();

  try {
    if (source === "firestore") {
      const original = await getProductFromFirestore(productBarcode);
      if (!original) return [];
      const pool = await getCandidatesForRecommendations(original, 200);
      return getAlternatives(original, pool, profile, limit);
    }
    if (base) {
      // REST API path: POST /recommendations with barcode + profile
      return await apiPost<RecommendationScore[]>("/recommendations", {
        barcode: productBarcode,
        profile,
        limit,
      });
    }

    // Fallback: return empty for now (backend data required)
    // In production, integrate with a local product database or Firebase query
    console.warn("[Recommendations] No API configured and local fallback not yet implemented");
    return [];
  } catch (err) {
    console.error("[Recommendations API Error]", err);
    throw normalizeError(err);
  }
}

/**
 * Get recommendations with full product objects
 * Requires a local product data source (Firestore, SQLite, or in-memory)
 * @param originalProduct - Full product object to find alternatives for
 * @param profile - User's nutritional profile
 * @param candidates - Pool of candidate products (from search, category, or cache)
 * @param limit - Max recommendations
 */
export async function getRecommendationsWithCandidates(
  originalProduct: Product,
  profile: NutritionalProfile,
  candidates: Product[],
  limit = 5
): Promise<RecommendationScore[]> {
  try {
    return getAlternatives(originalProduct, candidates, profile, limit);
  } catch (err) {
    console.error("[Recommendations] Error scoring alternatives", err);
    throw normalizeError(err);
  }
}

/**
 * Check if a product is unsuitable for the user's profile
 * Useful for showing warnings on product screen
 */
export function checkUnsuitability(product: Product, profile: NutritionalProfile) {
  return isUnsuitableForProfile(product, profile);
}
