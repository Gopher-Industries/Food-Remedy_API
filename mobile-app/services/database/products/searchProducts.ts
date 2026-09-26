import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import { Product } from "@/types/Product";

/**
 * Search products by barcode, productName, or brand (case-insensitive).
 * Returns up to 20 results.
 */
export default async function searchProducts(term: string): Promise<Product[]> {
  if (!term) return [];

  const productsRef = collection(fdb, "PRODUCTS");
  const searchTerm = term // .trim().toLowerCase();

  const results = new Map<string, Product>();
  const addProduct = (documentId: string, product: Product) => {
    // The same product can turn up in both name and brand searches.
    if (!results.has(documentId)) {
      results.set(documentId, product);
    }
  };

  // 1. Direct barcode lookup (cheap)
  const barcodeSnap = await getDoc(doc(productsRef, searchTerm));
  if (barcodeSnap.exists()) {
    addProduct(barcodeSnap.id, barcodeSnap.data() as Product);
  }

  // 2. Search by productName
  const productNameQuery = query(
    productsRef,
    where("productName", ">=", searchTerm),
    where("productName", "<=", searchTerm + "\uf8ff"),
    limit(20)
  );
  const productNameSnap = await getDocs(productNameQuery);
  productNameSnap.forEach(snapshot => {
    addProduct(snapshot.id, snapshot.data() as Product);
  });

  if (results.size >= 20) return [...results.values()].slice(0, 20);

  // 3. Search by brand
  const brandQuery = query(
    productsRef,
    where("brand", ">=", searchTerm),
    where("brand", "<=", searchTerm + "\uf8ff"),
    limit(20 - results.size)
  );
  const brandSnap = await getDocs(brandQuery);
  brandSnap.forEach(snapshot => {
    addProduct(snapshot.id, snapshot.data() as Product);
  });

  return [...results.values()].slice(0, 20);
}
