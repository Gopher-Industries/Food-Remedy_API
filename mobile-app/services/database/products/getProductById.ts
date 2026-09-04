import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import type { Product } from "@/types/Product";
import { normaliseFirestoreProduct } from "@/services/utils/normaliseFirestoreProduct";
import { getRequestId, safeLog } from "@/services/backend/safeErrors";

/**
 * Fetch a single Product by its Firestore ID
 * @param id Firestore document ID (matches product.id you stored)
 * @returns Product object or null
 */
export default async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const requestId = getRequestId();
  try {
    const ref = doc(fdb, "PRODUCTS", barcode);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    return normaliseFirestoreProduct({ id: snap.id, ...snap.data() }) as Product;
  } catch (err) {
    safeLog("error", "product_lookup.failed", { requestId, error: err });
    return null;
  }
}
