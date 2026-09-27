export type SubstitutionReasonCode =
  | "CATEGORY_MATCH"
  | "DB019_SIMILAR_PRODUCT"
  | "DB019_HEALTHIER_PRODUCT"
  | "ALLERGEN_DECLARATIONS_CHECKED"
  | "DIETARY_REQUIREMENT_MATCH"
  | "ADDITIVE_PREFERENCE_CHECKED"
  | "LOWER_ENERGY_FOR_GOAL"
  | "LOWER_SUGAR_FOR_GOAL"
  | "LOWER_SODIUM_FOR_GOAL"
  | "HIGHER_PROTEIN_FOR_GOAL"
  | "SOURCE_ALLERGEN_CONFLICT"
  | "SOURCE_DIETARY_CONFLICT"
  | "SOURCE_ADDITIVE_CONFLICT";

export interface SubstitutionReason {
  code: SubstitutionReasonCode;
  message: string;
  evidence: string[];
}

export interface ProductSubstitution {
  barcode: string;
  productName: string;
  brand: string | null;
  imageUrl: string | null;
  nutriscoreGrade: string | null;
  score: number;
  reasons: SubstitutionReason[];
}

export interface SubstitutionResponse {
  contractVersion: "1.0";
  status: "ok" | "empty";
  source: {
    barcode: string;
    productName: string;
    categoryKeys: string[];
    profileConflicts?: SubstitutionReason[];
  };
  substitutions: ProductSubstitution[];
  emptyState?: { code: string; message: string };
  meta: {
    requestId: string;
    algorithmVersion: "be033-v1";
    candidateCount: number;
    evaluatedCount: number;
    returnedCount: number;
  };
}

export function substitutionsEnabled(): boolean {
  return String(process.env.EXPO_PUBLIC_SUBSTITUTIONS_ENABLED ?? "true").toLowerCase() !== "false";
}

function isValidResponse(raw: any): raw is SubstitutionResponse {
  if (raw?.contractVersion !== "1.0" || !["ok", "empty"].includes(raw?.status)) return false;
  if (typeof raw?.source?.barcode !== "string" || !Array.isArray(raw?.source?.categoryKeys)) return false;
  if (raw?.meta?.algorithmVersion !== "be033-v1" || !Number.isInteger(raw?.meta?.returnedCount)) return false;
  if (!Array.isArray(raw?.substitutions) || raw.substitutions.length > 10) return false;
  if (raw.status === "empty" && (raw.substitutions.length !== 0 || typeof raw?.emptyState?.message !== "string")) return false;
  if (raw.status === "ok" && raw.substitutions.length === 0) return false;
  return raw.substitutions.every((item: any) =>
    typeof item?.barcode === "string" &&
    typeof item?.productName === "string" &&
    Number.isFinite(item?.score) &&
    item.score >= 0 && item.score <= 100 &&
    Array.isArray(item?.reasons) && item.reasons.length > 0 &&
    item.reasons.every((entry: any) => typeof entry?.code === "string" && typeof entry?.message === "string" && Array.isArray(entry?.evidence))
  );
}

export async function fetchSubstitutions(input: {
  barcode: string;
  profileId: string;
  idToken: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<SubstitutionResponse> {
  const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Profile-aware substitutions are not configured.");
  const response = await fetch(`${baseUrl}/api/v1/scan/substitutions`, {
    method: "POST",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.idToken}`,
    },
    body: JSON.stringify({
      barcode: String(input.barcode).trim(),
      profileId: String(input.profileId).trim(),
      limit: Math.max(1, Math.min(input.limit ?? 5, 10)),
    }),
  });

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(raw?.message || `Substitutions could not be loaded (${response.status}).`);
  }
  if (!isValidResponse(raw)) {
    throw new Error("The substitution service returned an unsupported response.");
  }
  return raw as SubstitutionResponse;
}
