import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import type { Product } from "@/types/Product";

/**
 * BE035 - Category-aware substitution candidate retrieval.
 *
 * DB019 integration decision:
 * DB019's category-constrained "similar" and "healthier" peer strategy is
 * reused conceptually here. DB019 runs in the catalogue enrichment pipeline,
 * while this service operates against the mobile Firestore catalogue.
 *
 * This service deliberately performs candidate retrieval only.
 * User-profile filtering and final recommendation ranking remain downstream.
 */

const DEFAULT_MAX_POOL = 200;
const MAX_POOL_SIZE = 300;
const MAX_QUERY_CATEGORIES = 10;

/**
 * Categories that are too broad to prove that two products are plausible
 * substitutes.
 */
const BROAD_CATEGORIES = new Set([
  "food",
  "foods",
  "product",
  "products",
  "groceries",
  "grocery",
  "meal",
  "meals",
  "dish",
  "dishes",
  "prepared-meal",
  "prepared-meals",
  "prepared-food",
  "prepared-foods",
]);

export type CandidateSource = "firestore-category";

export type CandidateNoResultReason =
  | "MISSING_CATEGORY"
  | "NO_MATCHING_CANDIDATES";

export interface CandidateRetrievalMetadata {
  source: CandidateSource;
  normalizedCategories: string[];
  queryCategories: string[];
  documentsRead: number;
  candidatesReturned: number;
  excludedOriginal: number;
  excludedDuplicates: number;
  excludedInvalid: number;
  excludedIrrelevant: number;
  maxPool: number;
  noCandidateReason?: CandidateNoResultReason;
}

export interface CandidateRetrievalResult {
  candidates: Product[];
  metadata: CandidateRetrievalMetadata;
}

/**
 * Normalise catalogue category values into a stable comparable form.
 *
 * Examples:
 *   "en:Dark Chocolates" -> "dark-chocolates"
 *   " Breakfast Cereals " -> "breakfast-cereals"
 */
export function normalizeCategory(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^en:/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Return only useful category/subcategory tags.
 *
 * The existing catalogue generally places broader categories before more
 * specific categories, so the final tags are preferred for querying.
 */
export function getSpecificCategories(product: Product): string[] {
  const raw = Array.isArray(product?.categories) ? product.categories : [];

  const normalized = unique(
    raw
      .map(normalizeCategory)
      .filter((category) => category && !BROAD_CATEGORIES.has(category))
  );

  return normalized;
}

/**
 * Select a small deterministic set of the most specific categories.
 *
 * Firestore array-contains-any supports a bounded list of comparison values;
 * keeping this small also prevents BE035 from becoming a broad fuzzy search.
 */
export function getQueryCategories(product: Product): string[] {
  const categories = getSpecificCategories(product);

  return categories
    .slice(-MAX_QUERY_CATEGORIES)
    .sort((a, b) => a.localeCompare(b));
}

function getBarcode(product: Product, fallback = ""): string {
  return String(product?.barcode || fallback).trim();
}

function isValidProduct(product: Product, fallbackBarcode = ""): boolean {
  const barcode = getBarcode(product, fallbackBarcode);
  const productName = String(product?.productName ?? "").trim();

  return Boolean(barcode && productName);
}

function categoriesOverlap(
  candidate: Product,
  originalCategories: string[]
): boolean {
  const candidateCategories = getSpecificCategories(candidate);

  return candidateCategories.some((category) =>
    originalCategories.includes(category)
  );
}

function createMetadata(
  normalizedCategories: string[],
  queryCategories: string[],
  maxPool: number
): CandidateRetrievalMetadata {
  return {
    source: "firestore-category",
    normalizedCategories,
    queryCategories,
    documentsRead: 0,
    candidatesReturned: 0,
    excludedOriginal: 0,
    excludedDuplicates: 0,
    excludedInvalid: 0,
    excludedIrrelevant: 0,
    maxPool,
  };
}

/**
 * Detailed BE035 retrieval API.
 *
 * This version exposes candidate-source and data-quality metadata for tests,
 * coverage measurement and diagnostics.
 */
export async function retrieveCandidatePool(
  original: Product,
  maxPool = DEFAULT_MAX_POOL
): Promise<CandidateRetrievalResult> {
  const boundedPoolSize = Math.max(
    1,
    Math.min(Math.floor(maxPool || DEFAULT_MAX_POOL), MAX_POOL_SIZE)
  );

  const normalizedCategories = getSpecificCategories(original);
  const queryCategories = getQueryCategories(original);

  const metadata = createMetadata(
    normalizedCategories,
    queryCategories,
    boundedPoolSize
  );

  /**
   * Explicit missing-category behaviour.
   *
   * Do not fall back to unrelated products or a static chocolate pool.
   */
  if (queryCategories.length === 0) {
    metadata.noCandidateReason = "MISSING_CATEGORY";

    return {
      candidates: [],
      metadata,
    };
  }

  const productsRef = collection(fdb, "PRODUCTS");

  const categoryQuery = query(
    productsRef,
    where("categories", "array-contains-any", queryCategories),
    limit(boundedPoolSize)
  );

  const snapshot = await getDocs(categoryQuery);

  const originalBarcode = getBarcode(original);
  const seenBarcodes = new Set<string>();
  const candidates: Product[] = [];

  metadata.documentsRead = snapshot.size;

  snapshot.forEach((document) => {
    const product = document.data() as Product;
    const barcode = getBarcode(product, document.id);

    if (!isValidProduct(product, document.id)) {
      metadata.excludedInvalid += 1;
      return;
    }

    if (barcode === originalBarcode) {
      metadata.excludedOriginal += 1;
      return;
    }

    if (seenBarcodes.has(barcode)) {
      metadata.excludedDuplicates += 1;
      return;
    }

    /**
     * Firestore performs the first category constraint, but we verify category
     * overlap locally as well. This keeps the public candidate contract strict
     * even if catalogue records contain unexpected category values.
     */
    if (!categoriesOverlap(product, normalizedCategories)) {
      metadata.excludedIrrelevant += 1;
      return;
    }

    seenBarcodes.add(barcode);

    candidates.push({
      ...product,
      barcode,
    });
  });

  /**
   * Firestore does not guarantee a useful recommendation order here.
   * Barcode ordering gives us deterministic output for the same snapshot.
   * Final recommendation ranking remains outside BE035.
   */
  candidates.sort((a, b) =>
    getBarcode(a).localeCompare(getBarcode(b))
  );

  const boundedCandidates = candidates.slice(0, boundedPoolSize);

  metadata.candidatesReturned = boundedCandidates.length;

  if (boundedCandidates.length === 0) {
    metadata.noCandidateReason = "NO_MATCHING_CANDIDATES";
  }

  return {
    candidates: boundedCandidates,
    metadata,
  };
}

/**
 * Backwards-compatible API used by recommendations.ts.
 *
 * Existing callers still receive Product[] so BE035 does not change the
 * downstream recommendation contract.
 */
export async function getCandidatesForRecommendations(
  original: Product,
  maxPool = DEFAULT_MAX_POOL
): Promise<Product[]> {
  const result = await retrieveCandidatePool(original, maxPool);
  return result.candidates;
}
