import type { NutritionalProfile } from "@/types/NutritionalProfile";
import type { Product } from "@/types/Product";
import {
  MAX_SUBSTITUTION_CANDIDATES,
  rankSubstitutionCandidates,
  type RankedSubstitution,
  type SubstitutionEmptyStateReason,
} from "@/services/substitutionEligibility";
import { normalizeBarcodeCandidate } from "@/server/productBarcode";

export const SUBSTITUTION_CONTRACT_VERSION = "1.0.0" as const;
export const MAX_SUBSTITUTION_BODY_BYTES = 1_024;
export const DEFAULT_SUBSTITUTION_LIMIT = 5;
export const MAX_API_SUBSTITUTION_LIMIT = 20;

export interface ValidatedSubstitutionRequest {
  barcode: string;
  limit: number;
}

export interface ProductSubstitutionRepository {
  getProduct(barcode: string): Promise<Product | null>;
  getAuthoritativeProfile(uid: string): Promise<NutritionalProfile | null>;
  getCandidates(original: Product, maximum: number): Promise<Product[]>;
}

export class SubstitutionValidationError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "INVALID_BARCODE" | "INVALID_LIMIT" | "UNSUPPORTED_FIELD" | "REQUEST_TOO_LARGE",
    readonly message: string
  ) {
    super(message);
  }
}

export class ProductNotFoundError extends Error {}
export class ProfileUnavailableError extends Error {}
export class SubstitutionTimeoutError extends Error {}
export class RequestCancelledError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates the complete v1 request before a Firestore read is made. */
export function validateSubstitutionRequest(value: unknown): ValidatedSubstitutionRequest {
  if (!isPlainObject(value)) {
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request body must be a JSON object.");
  }
  const allowedFields = new Set(["version", "barcode", "limit"]);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new SubstitutionValidationError("UNSUPPORTED_FIELD", "Request contains an unsupported field.");
  }
  if (value.version !== SUBSTITUTION_CONTRACT_VERSION) {
    throw new SubstitutionValidationError("INVALID_REQUEST", "Request must use the 1.0.0 substitutions contract.");
  }
  const barcode = normalizeBarcodeCandidate(value.barcode);
  if (!barcode.ok) {
    throw new SubstitutionValidationError("INVALID_BARCODE", "barcode must be a valid EAN-8, UPC-A, EAN-13, or GTIN-14 value.");
  }
  const limit = value.limit === undefined ? DEFAULT_SUBSTITUTION_LIMIT : value.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_API_SUBSTITUTION_LIMIT) {
    throw new SubstitutionValidationError("INVALID_LIMIT", "limit must be an integer between 1 and 20.");
  }
  return { barcode: barcode.barcode, limit: limit as number };
}

function compactText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maximum) : null;
}

function compactProduct(product: Product) {
  return {
    barcode: String(product.barcode),
    productName: compactText(product.productName, 160) ?? "Unnamed product",
    brand: compactText(product.brand, 100),
    nutriscoreGrade: ["a", "b", "c", "d", "e"].includes(String(product.nutriscoreGrade).toLowerCase())
      ? String(product.nutriscoreGrade).toLowerCase()
      : "unknown",
  };
}

function compactTarget(product: Product) {
  const category = compactText(product.category ?? product.categories?.[0], 100);
  return { ...compactProduct(product), category };
}

function compactSubstitution(candidate: RankedSubstitution) {
  return {
    ...compactProduct(candidate.product),
    safetyRating: candidate.safetyRating,
    confidenceScore: candidate.confidenceScore,
    reasonCodes: candidate.reasonCodes,
    reasons: candidate.reasons,
  };
}

export interface ProductSubstitutionResponse {
  version: typeof SUBSTITUTION_CONTRACT_VERSION;
  status: "success" | "no_eligible_candidates" | "insufficient_data";
  targetProduct: ReturnType<typeof compactTarget>;
  substitutions: ReturnType<typeof compactSubstitution>[];
  emptyStateReason: SubstitutionEmptyStateReason | null;
}

/** Runs bounded catalogue retrieval and ranking against the verified user's profile. */
export async function createProductSubstitutionResponse(
  repository: ProductSubstitutionRepository,
  uid: string,
  request: ValidatedSubstitutionRequest
): Promise<ProductSubstitutionResponse> {
  const product = await repository.getProduct(request.barcode);
  if (!product) throw new ProductNotFoundError("Target product was not found.");
  const profile = await repository.getAuthoritativeProfile(uid);
  if (!profile) throw new ProfileUnavailableError("No authoritative profile is available.");
  const candidates = await repository.getCandidates(product, MAX_SUBSTITUTION_CANDIDATES);
  const ranked = rankSubstitutionCandidates(product, candidates, profile, request.limit);
  return {
    version: SUBSTITUTION_CONTRACT_VERSION,
    status: ranked.substitutions.length ? "success" : ranked.emptyStateReason === "INSUFFICIENT_PRODUCT_DATA" ? "insufficient_data" : "no_eligible_candidates",
    targetProduct: compactTarget(product),
    substitutions: ranked.substitutions.map(compactSubstitution),
    emptyStateReason: ranked.emptyStateReason,
  };
}
