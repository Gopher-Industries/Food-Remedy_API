// API-level product service. Uses REST API if `EXPO_PUBLIC_API_BASE_URL` is set,
// otherwise falls back to the existing Firestore DAO implementation.
import type { Product } from "@/types/Product";
import { apiGet } from "../apiClient";
import { normalizeError } from "../errorHandler";

async function getProductByIdRemote(barcode: string): Promise<Product | null> {
  return apiGet<Product>(`/products/${barcode}`);
}

// Fallback to Firestore DAO if remote base URL not configured
async function getProductByIdFallback(barcode: string): Promise<Product | null> {
  const dao = await import("../database/products/getProductById");
  return dao.default(barcode);
}

export async function getProductById(barcode: string): Promise<Product | null> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  const source = String(process.env.EXPO_PUBLIC_API_SOURCE || "auto").toLowerCase();
  try {
    if (source === "firestore") {
      return await getProductByIdFallback(barcode);
    }
    if (base) {
      return await getProductByIdRemote(barcode);
    }
    return await getProductByIdFallback(barcode);
  } catch (err) {
    throw normalizeError(err);
  }
}

export default { getProductById };
