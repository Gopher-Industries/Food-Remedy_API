export type AlternativeItem = {
  barcode: string;
  productName?: string;
  brand?: string;
  imageUrl?: string;
  nutriScore?: string | null;
  reasonTags?: string[];
};

export type AlternativesResponse = {
  barcode: string;
  unsuitable: boolean;
  reasons: string[];
  alternatives: AlternativeItem[];
};

// ----------------------------
// Helpers
// ----------------------------
function asString(x: unknown): string {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function normalizeBarcode(x: unknown): string {
  return asString(x).trim();
}

function normalizeAllergenList(xs: unknown): string[] {
  const arr = Array.isArray(xs) ? xs : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of arr) {
    const n = asString(v).trim().toLowerCase();
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out;
}

function normalizeReasons(xs: unknown): string[] {
  const arr = Array.isArray(xs) ? xs : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of arr) {
    const s = asString(v).trim();
    if (!s) continue;

    // De-dupe case-insensitive, but keep original casing of first occurrence
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }

  return out;
}

function normalizeAlternativeItem(x: any): AlternativeItem | null {
  const barcode = normalizeBarcode(x?.barcode);
  if (!barcode) return null;

  const productName = asString(x?.productName).trim();
  const brand = asString(x?.brand).trim();
  const imageUrl = asString(x?.imageUrl).trim();
  const nutriScoreRaw = x?.nutriScore;
  const nutriScore = nutriScoreRaw == null ? null : asString(nutriScoreRaw).trim();

  const reasonTagsArr = Array.isArray(x?.reasonTags) ? x.reasonTags : [];
  const reasonTags = reasonTagsArr
    .map((t: any) => asString(t).trim())
    .filter(Boolean);

  return {
    barcode,
    productName: productName || undefined,
    brand: brand || undefined,
    imageUrl: imageUrl || undefined,
    nutriScore: nutriScore || null,
    reasonTags: reasonTags.length ? reasonTags : undefined,
  };
}

// ----------------------------
// UI text helpers
// ----------------------------
export function formatUnsuitableReason(reasons?: string[] | null): string {
  const rs = Array.isArray(reasons) ? reasons : [];
  if (rs.length === 0) return "This product may not be suitable for your profile.";

  // Prefer a single, clear primary reason
  if (rs.includes("INSUFFICIENT_ALLERGEN_DATA")) {
    return "Allergen or ingredient information is incomplete. Please check the product packaging.";
  }

  const contains = rs.filter(
    (x) => typeof x === "string" && x.toLowerCase().startsWith("contains ")
  );
  if (contains.length > 0) {
    return "Not suitable: " + contains.join(", ");
  }

  if (rs.includes("INSUFFICIENT_CATEGORY_DATA")) {
    return "Product category information is incomplete. Reliable alternatives cannot be generated.";
  }

  return "This product may not be suitable. Please review the information on the packaging.";
}

export function formatAlternativesEmptyMessage(reasons?: string[] | null): string {
  const rs = Array.isArray(reasons) ? reasons : [];

  if (rs.includes("INSUFFICIENT_CATEGORY_DATA")) {
    return "Not enough product category information to suggest alternatives.";
  }
  if (rs.includes("INSUFFICIENT_ALLERGEN_DATA")) {
    return "Not enough allergen or ingredient information to find safe alternatives.";
  }
  if (rs.includes("NO_ALTERNATIVES_FOUND")) {
    return "No suitable alternatives are currently available.";
  }

  return "No alternatives available at the moment.";
}

// ----------------------------
// API
// ----------------------------
export async function fetchAlternatives(
  barcode: string,
  avoidAllergens: string[] = []
): Promise<AlternativesResponse> {
  const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  if (!rawBaseUrl) {
    throw new Error(
      "Missing EXPO_PUBLIC_API_BASE_URL. Set it in mobile-app/.env (e.g., EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:8000)."
    );
  }

  // Prevent accidental double slashes when composing URLs
  const baseUrl = String(rawBaseUrl).replace(/\/+$/, "");

  // Normalize + de-dupe allergens before sending to backend
  const normalizedAvoidAllergens = normalizeAllergenList(avoidAllergens);

  // Add a timeout to avoid hanging UI/network calls
  const controller = new AbortController();
  const timeoutMs = 12_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/scan/alternatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        barcode: normalizeBarcode(barcode),
        preferences: { avoidAllergens: normalizedAvoidAllergens },
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(
        `Failed to fetch alternatives (${res.status})${bodyText ? `: ${bodyText}` : ""}`
      );
    }

    const raw = (await res.json()) as any;

    const outBarcode = normalizeBarcode(raw?.barcode) || normalizeBarcode(barcode);
    const outUnsuitable = Boolean(raw?.unsuitable);
    const outReasons = normalizeReasons(raw?.reasons);

    // Defensive de-dupe in case backend returns duplicate barcodes
    const rawAlternatives = Array.isArray(raw?.alternatives) ? raw.alternatives : [];
    const map = new Map<string, AlternativeItem>();

    for (const a of rawAlternatives) {
      const item = normalizeAlternativeItem(a);
      if (!item) continue;
      if (!map.has(item.barcode)) map.set(item.barcode, item);
    }

    return {
      barcode: outBarcode,
      unsuitable: outUnsuitable,
      reasons: outReasons,
      alternatives: Array.from(map.values()),
    };
  } catch (err: any) {
    // Standardize timeout error message
    if (err?.name === "AbortError") {
      throw new Error(
        `Failed to fetch alternatives (timeout after ${Math.round(timeoutMs / 1000)}s)`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}