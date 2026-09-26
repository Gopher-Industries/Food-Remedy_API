import { getAdminAuth, getAdminFirestore } from "@/server/firebaseAdmin";
import { FirestoreProductSubstitutionRepository } from "@/server/firestoreProductSubstitutionRepository";
import { createProductSubstitutionHandler } from "@/server/productSubstitutionHandler";
import { SUBSTITUTION_CONTRACT_VERSION } from "@/server/productSubstitutionService";

/** POST /api/recommendations/substitutions — authenticated substitutions v1. */
export async function POST(request: Request): Promise<Response> {
  try {
    return await createProductSubstitutionHandler({
      tokenVerifier: getAdminAuth(),
      repository: new FirestoreProductSubstitutionRepository(getAdminFirestore()),
    })(request);
  } catch {
    return new Response(JSON.stringify({
      version: SUBSTITUTION_CONTRACT_VERSION,
      error: { code: "SUBSTITUTIONS_UNAVAILABLE", message: "Substitutions are temporarily unavailable. Please try again." },
    }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
