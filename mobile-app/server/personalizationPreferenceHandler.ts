import type { FoodPreferenceProfile } from '@/types/Personalization';
import { parseFoodPreferenceProfile } from '@/services/personalizationValidation';
import { AuthenticationError, requireVerifiedIdentity, type TokenVerifier } from '@/server/verifiedAuth';

export const MAX_PREFERENCE_BODY_BYTES = 8192;

export interface PreferenceWriteRepository {
  isActiveOwnedProfile(uid: string, profileId: string): Promise<boolean>;
  write(uid: string, profile: FoodPreferenceProfile): Promise<void>;
}

function json(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function boundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PREFERENCE_BODY_BYTES) throw new RangeError('body');
  if (!request.body) throw new SyntaxError('body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PREFERENCE_BODY_BYTES) throw new RangeError('body');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Account UID comes only from the verified token; malformed and foreign profiles share a generic error. */
export function createPreferenceWriteHandler(tokenVerifier: TokenVerifier, repository: PreferenceWriteRepository) {
  return async (request: Request): Promise<Response> => {
    try {
      const { uid } = await requireVerifiedIdentity(request, tokenVerifier);
      const input = parseFoodPreferenceProfile(await boundedJson(request));
      if (!(await repository.isActiveOwnedProfile(uid, input.profileId))) return json(409, 'PROFILE_UNAVAILABLE');
      await repository.write(uid, input);
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof AuthenticationError) return json(401, 'UNAUTHENTICATED');
      if (error instanceof RangeError) return json(413, 'REQUEST_TOO_LARGE');
      if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Invalid food preference profile.')) {
        return json(400, 'INVALID_REQUEST');
      }
      // Never log raw preference fields, IDs, tokens or upstream error objects.
      return json(503, 'PREFERENCES_UNAVAILABLE');
    }
  };
}
