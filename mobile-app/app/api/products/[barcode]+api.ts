import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import { buildProductDetailResponse } from "@/services/utils/productDetail";

function toJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  _request: Request,
  context: { params?: { barcode?: string } }
): Promise<Response> {
  try {
    const barcode = context.params?.barcode?.trim();

    if (!barcode) {
      return toJsonResponse(
        {
          error: "INVALID_REQUEST",
          message: "Missing or invalid product barcode.",
        },
        400
      );
    }

    const productRef = doc(fdb, "PRODUCTS", barcode);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return toJsonResponse(
        {
          error: "PRODUCT_NOT_FOUND",
          message: `No product found for barcode ${barcode}.`,
        },
        404
      );
    }

    const product = buildProductDetailResponse(
      { barcode, ...productSnap.data() },
      barcode
    );

    return toJsonResponse(product, 200);
  } catch (err) {
    console.error("Error in /api/products/[barcode]:", err);

    return toJsonResponse(
      {
        error: "SERVER_ERROR",
        message: "Unexpected error while loading product detail.",
      },
      500
    );
  }
}

