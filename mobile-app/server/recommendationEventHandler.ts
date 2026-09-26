import type { RecommendationEventInput } from '@/types/Personalization';
import { parseRecommendationEventInput } from '@/services/recommendationEventValidation';
import { AuthenticationError, requireVerifiedIdentity, type TokenVerifier } from '@/server/verifiedAuth';
import type { EventIngestionOutcome } from '@/server/recommendationEvidenceRepository';

export const MAX_EVENT_BODY_BYTES = 2048;
export interface EventIngestionRepository {
  ingest(uid: string, event: RecommendationEventInput): Promise<EventIngestionOutcome>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_EVENT_BODY_BYTES) throw new RangeError('body');
  if (!request.body) throw new SyntaxError('body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_EVENT_BODY_BYTES) throw new RangeError('body');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function createRecommendationEventHandler(tokenVerifier: TokenVerifier, repository: EventIngestionRepository) {
  return async (request: Request): Promise<Response> => {
    try {
      const { uid } = await requireVerifiedIdentity(request, tokenVerifier);
      const event = parseRecommendationEventInput(await readBody(request));
      const outcome = await repository.ingest(uid, event);
      if (outcome === 'stored') return json(201, { status: 'stored', eventId: event.eventId });
      if (outcome === 'duplicate') return json(200, { status: 'duplicate', eventId: event.eventId });
      return json(409, { error: { code: 'EVIDENCE_UNAVAILABLE' } });
    } catch (error) {
      if (error instanceof AuthenticationError) return json(401, { error: { code: 'UNAUTHENTICATED' } });
      if (error instanceof RangeError) return json(413, { error: { code: 'REQUEST_TOO_LARGE' } });
      if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid event.')) {
        return json(400, { error: { code: 'INVALID_REQUEST' } });
      }
      // No event, profile, UID, intention, safety value, token or upstream error is logged.
      return json(503, { error: { code: 'EVIDENCE_UNAVAILABLE' } });
    }
  };
}
