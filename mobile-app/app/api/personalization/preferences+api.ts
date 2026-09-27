import { getAdminAuth, getAdminFirestore } from '@/server/firebaseAdmin';
import { createPreferenceWriteHandler, type PreferenceWriteRepository } from '@/server/personalizationPreferenceHandler';

/** Authenticated server validation is required for the bounded preference array. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const firestore = getAdminFirestore();
    const repository: PreferenceWriteRepository = {
      async isActiveOwnedProfile(uid, profileId) {
        const snapshot = await firestore.collection('USERS').doc(uid).collection('PROFILES').doc(profileId).get();
        return snapshot.exists && snapshot.data()?.status !== false &&
          (snapshot.data()?.userId == null || snapshot.data()?.userId === uid);
      },
      async write(uid, profile) {
        await firestore.collection('USERS').doc(uid).collection('PROFILES').doc(profile.profileId)
          .collection('PERSONALIZATION').doc('preferences').set(profile);
      },
    };
    return await createPreferenceWriteHandler(getAdminAuth(), repository)(request);
  } catch {
    return new Response(JSON.stringify({ error: { code: 'PREFERENCES_UNAVAILABLE' } }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
