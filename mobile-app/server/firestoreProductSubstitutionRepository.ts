import type { Firestore } from "firebase-admin/firestore";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import { normaliseFirestoreProduct } from "@/services/utils/normaliseFirestoreProduct";
import type { ProductSubstitutionRepository } from "@/server/productSubstitutionService";

const PRODUCTS_COLLECTION = "PRODUCTS";
const PROFILE_READ_LIMIT = 20;
const BROAD_CATEGORIES = new Set(["food", "foods", "products", "groceries", "grocery", "meals", "meal", "dishes", "dish", "prepared-meals", "prepared-foods"]);

function normaliseCategory(value: unknown): string {
  const category = String(value ?? "").trim().toLowerCase();
  return category.startsWith("en:") ? category.slice(3) : category;
}

function candidateCategories(product: Product): string[] {
  const all = [...(Array.isArray(product.categories) ? product.categories : []), product.category ?? ""];
  const selected: string[] = [];
  for (const value of all) {
    const category = normaliseCategory(value);
    if (!category || BROAD_CATEGORIES.has(category) || selected.includes(category)) continue;
    selected.push(category);
  }
  return selected.slice(-2).slice(0, 10);
}

function toProduct(raw: Record<string, unknown>, documentId: string): Product {
  return normaliseFirestoreProduct({ ...raw, id: documentId, barcode: String(raw.barcode ?? documentId).trim() });
}

function toProfile(raw: Record<string, unknown>, uid: string, profileId: string): NutritionalProfile {
  return {
    userId: uid,
    profileId,
    firstName: "",
    lastName: "",
    status: raw.status !== false,
    relationship: typeof raw.relationship === "string" ? raw.relationship : "Self",
    age: Number.isFinite(Number(raw.age)) ? Number(raw.age) : 0,
    avatarUrl: "",
    additives: Array.isArray(raw.additives) ? raw.additives.filter((value): value is string => typeof value === "string") : [],
    allergies: Array.isArray(raw.allergies) ? raw.allergies.filter((value): value is string => typeof value === "string") : [],
    intolerances: Array.isArray(raw.intolerances) ? raw.intolerances.filter((value): value is string => typeof value === "string") : [],
    dietaryForm: Array.isArray(raw.dietaryForm) ? raw.dietaryForm.filter((value): value is string => typeof value === "string") : [],
    healthGoal: raw.healthGoal === "weight_loss" || raw.healthGoal === "muscle_gain" || raw.healthGoal === "maintenance" ? raw.healthGoal : undefined,
  };
}

/** Admin-only repository; clients cannot select another user's profile path. */
export class FirestoreProductSubstitutionRepository implements ProductSubstitutionRepository {
  constructor(private readonly firestore: Firestore) {}

  async getProduct(barcode: string): Promise<Product | null> {
    const snapshot = await this.firestore.collection(PRODUCTS_COLLECTION).doc(barcode).get();
    if (!snapshot.exists) return null;
    const raw = snapshot.data();
    return raw ? toProduct(raw, snapshot.id) : null;
  }

  async getAuthoritativeProfile(uid: string): Promise<NutritionalProfile | null> {
    const snapshot = await this.firestore.collection("USERS").doc(uid).collection("PROFILES").limit(PROFILE_READ_LIMIT).get();
    const self = snapshot.docs.find((document) => document.data().relationship === "Self");
    if (!self) return null;
    return toProfile(self.data(), uid, self.id);
  }

  async getCandidates(original: Product, maximum: number): Promise<Product[]> {
    const categories = candidateCategories(original);
    if (!categories.length) return [];
    const boundedMaximum = Math.max(1, Math.min(200, Math.floor(maximum)));
    const snapshot = await this.firestore.collection(PRODUCTS_COLLECTION)
      .where("categories", "array-contains-any", categories)
      // The target product can be present in the category query and is removed
      // below, so read one additional bounded document to honour the caller's
      // candidate maximum.
      .limit(boundedMaximum + 1)
      .get();
    const products = new Map<string, Product>();
    for (const document of snapshot.docs) {
      const product = toProduct(document.data(), document.id);
      if (!product.barcode || product.barcode === original.barcode || products.has(product.barcode)) continue;
      products.set(product.barcode, product);
    }
    return [...products.values()].slice(0, boundedMaximum);
  }
}
