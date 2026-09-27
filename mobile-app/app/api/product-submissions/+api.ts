import { FirestoreProductSubmissionStore } from "@/server/firestoreProductSubmissionStore";
import { getAdminAuth, getAdminFirestore } from "@/server/firebaseAdmin";
import { createProductSubmissionHandler } from "@/server/productSubmissionHandler";
import { PRODUCT_SUBMISSIONS_CONTRACT_VERSION } from "@/server/productSubmissions";

/** POST /api/product-submissions — v1 authenticated moderation submission API. */
export async function POST(request: Request): Promise<Response> {
  try {
    const handler = createProductSubmissionHandler({
      tokenVerifier: getAdminAuth(),
      submissionStore: new FirestoreProductSubmissionStore(getAdminFirestore()),
    });

    return handler(request);
  } catch {
    // Server credential/startup failures must not be exposed to the caller.
    return new Response(
      JSON.stringify({
        version: PRODUCT_SUBMISSIONS_CONTRACT_VERSION,
        error: {
          code: "SUBMISSION_UNAVAILABLE",
          message: "Product submissions are temporarily unavailable. Please try again.",
        },
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
