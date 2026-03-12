import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";

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
  allergens?: string[];
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

function normaliseList(list?: string[]): string[] {
  if (!list) return [];
  return list.map((x) => x.toLowerCase().trim()).filter(Boolean);
}

function classifyProduct(
  product: ProductDoc,
  profile: UserProfile = {},
  fallbackBarcode?: string
): ClassificationResult {
  const reasons: string[] = [];
  let score = 100;

  const productAllergens = normaliseList(product.allergens);
  const userAllergies = normaliseList(profile.allergies);

  const matchedAllergens = userAllergies.filter((a) =>
    productAllergens.includes(a.toLowerCase())
  );

  const finalBarcode = product.barcode ?? fallbackBarcode ?? "";

  if (matchedAllergens.length > 0) {
    reasons.push(
      `Contains allergens for this profile: ${matchedAllergens.join(", ")}`
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

  const nl = product.nutrientLevels || {};

  const penaltyMap: Record<string, { label: string; weight: number }> = {
    fat: { label: "High fat", weight: 20 },
    "saturated-fat": { label: "High saturated fat", weight: 25 },
    sugars: { label: "High sugars", weight: 25 },
    salt: { label: "High salt", weight: 20 },
  };

  Object.entries(penaltyMap).forEach(([key, meta]) => {
    const level = nl[key];
    if (level === "high") {
      score -= meta.weight;
      reasons.push(meta.label);
    }
  });

  if (!Object.keys(nl).length) {
    reasons.push("Insufficient nutrition data; classified as GREY by default.");
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

  return {
    barcode: finalBarcode,
    colour,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    productName: product.productName,
    brand: product.brand,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    const barcode: unknown = body?.barcode;
    const profile: UserProfile = body?.profile || {};

    if (typeof barcode !== "string" || !barcode.trim()) {
      return new Response(
        JSON.stringify({
          error: "INVALID_REQUEST",
          message: "Missing or invalid 'barcode' in request body.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const trimmedBarcode = barcode.trim();

    const productRef = doc(fdb, "PRODUCTS", trimmedBarcode);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return new Response(
        JSON.stringify({
          error: "PRODUCT_NOT_FOUND",
          message: `No product found for barcode ${trimmedBarcode}.`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }


    const product = productSnap.data() as ProductDoc;

    const result = classifyProduct(product, profile, trimmedBarcode);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in /api/products/classify:", err);

    return new Response(
      JSON.stringify({
        error: "SERVER_ERROR",
        message: "Unexpected error while classifying product.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
