import { getAdminAuth, getAdminFirestore } from '@/server/firebaseAdmin';
import { FirestoreRecommendationEvidenceRepository } from '@/server/recommendationEvidenceRepository';
import { createRecommendationEventHandler } from '@/server/recommendationEventHandler';

export async function POST(request: Request): Promise<Response> {
  try {
    return await createRecommendationEventHandler(
      getAdminAuth(), new FirestoreRecommendationEvidenceRepository(getAdminFirestore())
    )(request);
  } catch {
    return new Response(JSON.stringify({ error: { code: 'EVIDENCE_UNAVAILABLE' } }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
