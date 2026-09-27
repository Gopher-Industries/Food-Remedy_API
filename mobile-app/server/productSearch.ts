/**
 * Server-side product-search contract helpers.
 *
 * This intentionally mirrors BE040's SearchNormalisation.py so the API query
 * uses exactly the values written to productNameSearch and brandSearch.
 */

export const PRODUCT_SEARCH_CONTRACT_VERSION = "v1" as const;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 25;
export const MAX_SOURCE_READS = 50;
export const MAX_SEARCH_QUERY_LENGTH = 80;
export const MIN_SEARCH_QUERY_LENGTH = 2;

export type ProductSearchSummary = {
  barcode: string;
  productName: string | null;
  brand: string | null;
  category: string | null;
  nutriscoreGrade: string | null;
};

export type ProductSearchDocument = {
  id: string;
  data: Record<string, unknown>;
};

export interface ProductSearchRepository {
  findExactBarcode(barcode: string): Promise<ProductSearchDocument | null>;
  findProductNamePrefix(query: string, readLimit: number): Promise<ProductSearchDocument[]>;
  findBrandPrefix(query: string, readLimit: number): Promise<ProductSearchDocument[]>;
}

export type ProductSearchMetrics = {
  record(event: {
    outcome: "success" | "invalid_request" | "unavailable";
    durationMs: number;
    resultCount: number;
  }): void;
};

export class ProductSearchValidationError extends Error {
  constructor(
    readonly code: "INVALID_QUERY" | "INVALID_LIMIT" | "INVALID_CURSOR",
    message: string
  ) {
    super(message);
  }
}

export class ProductSearchTimeoutError extends Error {}

type SearchRequest = {
  normalizedQuery: string;
  barcodeQuery: string | null;
  limit: number;
  offset: number;
};

type CursorPayload = {
  v: 1;
  h: string;
  o: number;
};

type MatchRank = 0 | 1 | 2 | 3 | 4;

type RankedCandidate = {
  summary: ProductSearchSummary;
  rank: MatchRank;
};

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return atob(padded);
}

function encodeCursor(normalizedQuery: string, offset: number): string {
  return toBase64Url(JSON.stringify({ v: 1, h: fnv1a(normalizedQuery), o: offset }));
}

function decodeCursor(value: string, normalizedQuery: string): number {
  if (!value || value.length > 256) {
    throw new ProductSearchValidationError("INVALID_CURSOR", "cursor is invalid.");
  }

  let payload: CursorPayload;
  try {
    payload = JSON.parse(fromBase64Url(value)) as CursorPayload;
  } catch {
    throw new ProductSearchValidationError("INVALID_CURSOR", "cursor is invalid.");
  }

  const maxCandidatePool = MAX_SOURCE_READS * 2 + 1;
  if (
    payload.v !== 1 ||
    payload.h !== fnv1a(normalizedQuery) ||
    !Number.isInteger(payload.o) ||
    payload.o < 0 ||
    payload.o > maxCandidatePool
  ) {
    throw new ProductSearchValidationError("INVALID_CURSOR", "cursor is invalid.");
  }

  return payload.o;
}

/** Implements BE040's NFC, quote, lowercase, and whitespace rules. */
export function normalizeProductSearchQuery(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasValidGtinCheckDigit(barcode: string): boolean {
  let sum = 0;
  for (let index = barcode.length - 2, offset = 0; index >= 0; index -= 1, offset += 1) {
    sum += Number(barcode[index]) * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(barcode[barcode.length - 1]);
}

/** Returns a canonical GTIN string or null without converting it to a number. */
export function normalizeExactBarcodeQuery(value: string): string | null {
  const barcode = value.normalize("NFKC").trim();
  if (!/^\d+$/.test(barcode) || ![8, 12, 13, 14].includes(barcode.length)) {
    return null;
  }
  return hasValidGtinCheckDigit(barcode) ? barcode : null;
}

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_SEARCH_LIMIT;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new ProductSearchValidationError("INVALID_LIMIT", "limit must be a positive integer.");
  }

  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit > MAX_SEARCH_LIMIT) {
    throw new ProductSearchValidationError(
      "INVALID_LIMIT",
      `limit must be between 1 and ${MAX_SEARCH_LIMIT}.`
    );
  }
  return limit;
}

export function parseProductSearchRequest(url: URL): SearchRequest {
  const rawQuery = url.searchParams.get("q");
  if (rawQuery === null || /[\u0000-\u001F\u007F]/.test(rawQuery)) {
    throw new ProductSearchValidationError("INVALID_QUERY", "q is required.");
  }

  const normalizedQuery = normalizeProductSearchQuery(rawQuery);
  if (!normalizedQuery) {
    throw new ProductSearchValidationError("INVALID_QUERY", "q is required.");
  }
  if (normalizedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new ProductSearchValidationError(
      "INVALID_QUERY",
      `q must be at most ${MAX_SEARCH_QUERY_LENGTH} characters.`
    );
  }

  const barcodeQuery = normalizeExactBarcodeQuery(normalizedQuery);
  if (/^\d+$/.test(normalizedQuery) && normalizedQuery.length >= 8 && !barcodeQuery) {
    throw new ProductSearchValidationError(
      "INVALID_QUERY",
      "q must be a valid barcode when it contains only barcode digits."
    );
  }
  if (!barcodeQuery && normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
    throw new ProductSearchValidationError(
      "INVALID_QUERY",
      `q must contain at least ${MIN_SEARCH_QUERY_LENGTH} characters.`
    );
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");
  const offset = cursor ? decodeCursor(cursor, normalizedQuery) : 0;

  return { normalizedQuery, barcodeQuery, limit, offset };
}

function compactText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function categoryFromDocument(data: Record<string, unknown>): string | null {
  const category = compactText(data.category, 100);
  if (category) return category;
  if (!Array.isArray(data.categories)) return null;
  return compactText(data.categories[0], 100);
}

function summaryFromDocument(document: ProductSearchDocument): ProductSearchSummary | null {
  const barcode = compactText(document.data.barcode ?? document.id, 14);
  if (!barcode || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode)) return null;

  return {
    barcode,
    productName: compactText(document.data.productName, 160),
    brand: compactText(document.data.brand, 120),
    category: categoryFromDocument(document.data),
    nutriscoreGrade: compactText(document.data.nutriscoreGrade, 12),
  };
}

function sourceRank(
  source: "exactBarcode" | "productName" | "brand",
  document: ProductSearchDocument,
  normalizedQuery: string
): MatchRank {
  if (source === "exactBarcode") return 0;
  const searchField = source === "productName" ? document.data.productNameSearch : document.data.brandSearch;
  const isExact = typeof searchField === "string" && searchField === normalizedQuery;
  if (source === "productName") return isExact ? 1 : 2;
  return isExact ? 3 : 4;
}

function addCandidates(
  candidates: Map<string, RankedCandidate>,
  source: "exactBarcode" | "productName" | "brand",
  documents: ProductSearchDocument[],
  normalizedQuery: string
) {
  for (const document of documents) {
    const summary = summaryFromDocument(document);
    if (!summary) continue;
    const rank = sourceRank(source, document, normalizedQuery);
    const current = candidates.get(summary.barcode);
    if (!current || rank < current.rank) {
      candidates.set(summary.barcode, { summary, rank });
    }
  }
}

export async function searchProducts(
  repository: ProductSearchRepository,
  request: SearchRequest
): Promise<{ results: ProductSearchSummary[]; nextCursor: string | null }> {
  if (request.barcodeQuery) {
    const exactProduct = await repository.findExactBarcode(request.barcodeQuery);
    const summary = exactProduct ? summaryFromDocument(exactProduct) : null;
    const results = summary && request.offset === 0 ? [summary] : [];
    return { results, nextCursor: null };
  }

  const [nameMatches, brandMatches] = await Promise.all([
    repository.findProductNamePrefix(request.normalizedQuery, MAX_SOURCE_READS),
    repository.findBrandPrefix(request.normalizedQuery, MAX_SOURCE_READS),
  ]);

  const candidates = new Map<string, RankedCandidate>();
  addCandidates(candidates, "productName", nameMatches, request.normalizedQuery);
  addCandidates(candidates, "brand", brandMatches, request.normalizedQuery);

  const ranked = [...candidates.values()].sort((left, right) =>
    left.rank - right.rank || left.summary.barcode.localeCompare(right.summary.barcode)
  );
  const results = ranked.slice(request.offset, request.offset + request.limit).map((candidate) => candidate.summary);
  const nextOffset = request.offset + results.length;

  return {
    results,
    nextCursor: nextOffset < ranked.length ? encodeCursor(request.normalizedQuery, nextOffset) : null,
  };
}
