import { doc, getDoc } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import { buildProductDetailResponse } from "@/services/utils/productDetail";
import { errorEnvelope, getRequestId, jsonResponse, safeLog } from "@/services/backend/safeErrors";

export async function GET(
  request: Request,
  context: { params?: { barcode?: string } }
): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const barcode = context.params?.barcode?.trim();

    if (!barcode) {
      return jsonResponse(errorEnvelope("INVALID_REQUEST", "Missing or invalid product barcode.", requestId), 400, requestId);
    }

    const productRef = doc(fdb, "PRODUCTS", barcode);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return jsonResponse(errorEnvelope("PRODUCT_NOT_FOUND", "Product not found.", requestId), 404, requestId);
    }

    const product = buildProductDetailResponse(
      { barcode, ...productSnap.data() },
      barcode
    );

    return jsonResponse(product, 200, requestId);
  } catch (err) {
    safeLog("error", "product_detail.failed", { requestId, error: err });
    return jsonResponse(errorEnvelope("PRODUCT_DETAIL_FAILED", "Unable to load product detail.", requestId), 500, requestId);
  }
}
