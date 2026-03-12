import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import type { Product } from "@/types/Product";

const BROAD_CATEGORIES = new Set([
  "food",
  "foods",
  "products",
  "groceries",
  "grocery",
  "meals",
  "meal",
  "dishes",
  "dish",
  "prepared-meals",
  "prepared-foods",
]);

function cleanTag(x: unknown): string {
  const s = String(x ?? "").trim().toLowerCase();
  return s.startsWith("en:") ? s.slice(3) : s;
}

function pickSpecificCategories(categories: string[]): string[] {
  const cleaned: string[] = [];
  for (const c of categories || []) {
    const cc = cleanTag(c);
    if (!cc || BROAD_CATEGORIES.has(cc)) continue;
    if (!cleaned.includes(cc)) cleaned.push(cc);
  }
  if (cleaned.length >= 2) return cleaned.slice(-2);
  return cleaned;
}

export async function getCandidatesForRecommendations(
  original: Product,
  maxPool = 200
): Promise<Product[]> {
  const allCats = Array.isArray(original?.categories) ? original.categories : [];
  const specific = pickSpecificCategories(allCats).slice(0, 10);
  if (specific.length === 0) return [];

  const productsRef = collection(fdb, "PRODUCTS");
  const q = query(
    productsRef,
    where("categories", "array-contains-any", specific),
    limit(Math.max(1, Math.min(maxPool, 300)))
  );

  const snap = await getDocs(q);
  const out: Product[] = [];
  const seen = new Set<string>();
  const currentBarcode = String(original?.barcode || "").trim();

  snap.forEach((doc) => {
    const p = doc.data() as Product;
    const b = String((p as any)?.barcode || doc.id || "").trim();
    if (!b || b === currentBarcode) return;
    if (seen.has(b)) return;
    seen.add(b);
    out.push(p);
  });

  return out;
}
