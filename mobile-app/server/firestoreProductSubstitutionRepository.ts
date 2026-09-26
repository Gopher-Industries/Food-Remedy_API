import type { Firestore } from "firebase-admin/firestore";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import { normaliseFirestoreProduct } from "@/services/utils/normaliseFirestoreProduct";
import type { ProductSubstitutionRepository } from "@/server/productSubstitutionService";
import type { PersonalizationContext } from './personalizationContext';
import { HYBRID_READ_BUDGET, intendedOccasion, meaningfulCategories, namePrefix,
  type HybridCandidatePool } from './hybridCandidateRetrieval';
import { normalizeBarcodeCandidate } from './productBarcode';

const PRODUCTS_COLLECTION = "PRODUCTS";
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
    const snapshot = await this.firestore.collection("USERS").doc(uid).collection("PROFILES")
      .where("relationship", "==", "Self").limit(2).get();
    // Multiple or inactive Self profiles are ambiguous; never choose one by
    // query order when making profile-sensitive recommendations.
    if (snapshot.docs.length !== 1) return null;
    const self = snapshot.docs[0];
    if (self.data().status === false) return null;
    return toProfile(self.data(), uid, self.id);
  }

  async getOwnedProfile(uid: string, profileId: string): Promise<NutritionalProfile | null> {
    const snapshot = await this.firestore.collection('USERS').doc(uid).collection('PROFILES').doc(profileId).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data || data.status === false ||
        (data.userId != null && data.userId !== uid)) return null;
    return toProfile(data, uid, profileId);
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

  /** Five bounded deterministic branches; no arbitrary broad-category scan. */
  async getHybridCandidates(original: Product, context: PersonalizationContext, maximum: number): Promise<HybridCandidatePool> {
    const startedAt = Date.now();
    const collection = this.firestore.collection(PRODUCTS_COLLECTION);
    const max = Math.max(1, Math.min(HYBRID_READ_BUDGET, Math.floor(maximum)));
    const categories = meaningfulCategories(original);
    const occasion = intendedOccasion(context);
    const role = original.semanticAttributes?.foodRole;
    const prefix = namePrefix(original);
    const label = original.labels.find(value => typeof value === 'string' && value.trim().length > 2);
    const branches = [
      categories.length ? { name: 'category' as const, budget: 60,
        query: collection.where('categories', 'array-contains-any', categories).limit(Math.min(60, max)) } : null,
      occasion ? { name: 'occasion' as const, budget: 36,
        query: collection.where('semanticAttributes.occasion.value', '==', occasion).limit(Math.min(36, max)) } : null,
      role && role.value !== 'not_applicable' && role.confidence >= 0.7 ? { name: 'role' as const, budget: 36,
        query: collection.where('semanticAttributes.foodRole.value', '==', role.value).limit(Math.min(36, max)) } : null,
      prefix ? { name: 'name' as const, budget: 24,
        query: collection.orderBy('productNameSearch').startAt(prefix).endAt(`${prefix}\uf8ff`).limit(Math.min(24, max)) } : null,
      label ? { name: 'label' as const, budget: 24,
        query: collection.where('labels', 'array-contains', label).limit(Math.min(24, max)) } : null,
    ].filter((item): item is NonNullable<typeof item> => item !== null);
    const settled = await Promise.allSettled(branches.map(branch => branch.query.get()));
    const documents = new Map<string, Product>();
    const branchCounts: HybridCandidatePool['branchCounts'] = {};
    let readCount = 0;
    for (let index = 0; index < branches.length; index++) {
      const result = settled[index];
      if (result.status !== 'fulfilled') continue;
      const sorted = [...result.value.docs].sort((a, b) => a.id.localeCompare(b.id));
      branchCounts[branches[index].name] = sorted.length;
      readCount += sorted.length;
      for (const document of sorted) {
        const product = toProduct(document.data(), document.id);
        const barcode = normalizeBarcodeCandidate(product.barcode);
        if (!barcode.ok || barcode.barcode === original.barcode || documents.has(barcode.barcode)) continue;
        documents.set(barcode.barcode, product);
      }
    }
    return {
      candidates: [...documents.values()].sort((a, b) => a.barcode.localeCompare(b.barcode)).slice(0, max),
      readCount,
      latencyMs: Date.now() - startedAt,
      branchCounts,
    };
  }
}
