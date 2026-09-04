import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import { getProfileRestrictions } from "@/services/profileProductSuitability";
import {
  assessAllergenSafety,
  INCOMPLETE_ALLERGEN_DATA_REASON,
} from "@/services/allergenSafety";
import { errorEnvelope, getRequestId, jsonResponse, safeLog } from "@/services/backend/safeErrors";

type ClassificationColour = "red" | "green" | "grey";

interface UserProfile {
  allergies?: string[];
  intolerances?: string[];
  dietaryPreferences?: string[];
}

interface ProductDoc {
  barcode: string;
  productName?: string;
  brand?: string;
  allergens?: unknown;
  traces?: unknown;
  tracesFromIngredients?: unknown;
  ingredients?: unknown;
  ingredientsText?: unknown;
  additives?: string[];
  nutrientLevels?: {
    fat?: string;
    sugars?: string;
    salt?: string;
    "saturated-fat"?: string;
    [key: string]: string | undefined;
  };
  nutriscoreGrade?: string;
  categories?: string[];
  [key: string]: any;
}

interface ClassificationResult {
  barcode: string;
  colour: ClassificationColour;
  score: number;
  reasons: string[];
  productName?: string;
  brand?: string;
}

function classifyProduct(
  product: ProductDoc,
  profile: UserProfile = {},
  fallbackBarcode?: string
): ClassificationResult {
  const reasons: string[] = [];
  let score = 100;

  const profileRestrictions = getProfileRestrictions({
    allergies: profile.allergies ?? [],
    intolerances: profile.intolerances ?? [],
  });

  const allergenSafety = assessAllergenSafety(
    product,
    profileRestrictions
  );

  const finalBarcode = product.barcode ?? fallbackBarcode ?? "";

  // Known allergen or trace conflicts always return an unsafe result.
  if (allergenSafety.status === "unsafe") {
    reasons.push(
      `Contains allergens for this profile: ${allergenSafety.matchedAllergen}`
    );

    return {
      barcode: finalBarcode,
      colour: "red",
      score: 0,
      reasons,
      productName: product.productName,
      brand: product.brand,
    };
  }

  // Missing or incomplete allergen information should not be considered safe.
  if (allergenSafety.status === "unknown") {
    reasons.push(INCOMPLETE_ALLERGEN_DATA_REASON);
  }

  const nl = product.nutrientLevels || {};

  const penaltyMap: Record<
    string,
    { label: string; weight: number }
  > = {
    fat: {
      label: "High fat",
      weight: 20,
    },
    "saturated-fat": {
      label: "High saturated fat",
      weight: 25,
    },
    sugars: {
      label: "High sugars",
      weight: 25,
    },
    salt: {
      label: "High salt",
      weight: 20,
    },
  };

  Object.entries(penaltyMap).forEach(([key, meta]) => {
    const level = nl[key];

    if (level === "high") {
      score -= meta.weight;
      reasons.push(meta.label);
    }
  });

  // If nutrition information is unavailable, return a conservative result.
  if (!Object.keys(nl).length) {
    reasons.push(
      "Insufficient nutrition data; classified as GREY by default."
    );

    return {
      barcode: finalBarcode,
      colour: "grey",
      score: 50,
      reasons,
      productName: product.productName,
      brand: product.brand,
    };
  }

  let colour: ClassificationColour = "green";

  if (score >= 70) {
    colour = "green";
  } else if (score >= 40) {
    colour = "grey";
    reasons.push("Moderate nutritional risk.");
  } else {
    colour = "red";
    reasons.push("High nutritional risk.");
  }

  // Unknown allergen safety must not be presented as green.
  // Do not downgrade an already red nutritional classification.
  if (
    allergenSafety.status === "unknown" &&
    colour === "green"
  ) {
    colour = "grey";
    score = Math.min(score, 50);
  }

  return {
    barcode: finalBarcode,
    colour,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    productName: product.productName,
    brand: product.brand,
  };
}

export async function POST(
  request: Request
): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    let body: any;

    // Malformed JSON is a client request error rather than a server error.
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        errorEnvelope("INVALID_REQUEST", "Request body must contain valid JSON.", requestId),
        400,
        requestId
      );
    }

    const barcode: unknown = body?.barcode;

    const profile: UserProfile =
      body?.profile && typeof body.profile === "object"
        ? body.profile
        : {};

    // Barcode is required and must be a non-empty string.
    if (
      typeof barcode !== "string" ||
      !barcode.trim()
    ) {
      return jsonResponse(
        errorEnvelope("INVALID_REQUEST", "Missing or invalid 'barcode' in request body.", requestId),
        400,
        requestId
      );
    }

    const trimmedBarcode = barcode.trim();

    const productRef = doc(
      fdb,
      "PRODUCTS",
      trimmedBarcode
    );

    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return jsonResponse(
        errorEnvelope("PRODUCT_NOT_FOUND", "Product not found.", requestId),
        404,
        requestId
      );
    }

    const product =
      productSnap.data() as ProductDoc;

    const result = classifyProduct(
      product,
      profile,
      trimmedBarcode
    );

    return jsonResponse(result, 200, requestId);
  } catch (err) {
    safeLog("error", "product_classification.failed", { requestId, error: err });
    return jsonResponse(
      errorEnvelope("CLASSIFICATION_FAILED", "Unable to classify product.", requestId),
      500,
      requestId
    );
  }
}
