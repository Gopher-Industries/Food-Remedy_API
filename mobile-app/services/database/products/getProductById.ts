import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import type { Product } from "@/types/Product";
import { normaliseFirestoreProduct } from "@/services/utils/normaliseFirestoreProduct";

/**
 * Fetch a single Product by its Firestore ID
 * @param id Firestore document ID (matches product.id you stored)
 * @returns Product object or null
 */
export default async function getProductByBarcode(barcode: string): Promise<Product | null> {
  try {
    const ref = doc(fdb, "PRODUCTS", barcode);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    const productData = snap.data();
    return normaliseFirestoreProduct({
      id: snap.id,
      ...productData,
      barcode,
    }) as Product;
  } catch (err) {
    console.error("[Firestore] getProductByBarcode error:", err);
    return null;
  }
}
