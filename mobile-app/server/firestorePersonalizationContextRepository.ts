import type { Firestore } from 'firebase-admin/firestore';
import type { FoodPreferenceProfile, SavedShoppingIntent, ProductSemanticAttributes } from '@/types/Personalization';
import { parseFoodPreferenceProfile, parseSavedShoppingIntent } from '@/services/personalizationValidation';
import { validateProductSemanticAttributes } from '@/services/utils/productSemanticAttributes';
import type { ContextEvent, PersonalizationContextRepository } from './personalizationContext';

/** All household reads are beneath the verified UID. This class is server-only. */
export class FirestorePersonalizationContextRepository implements PersonalizationContextRepository {
  constructor(private readonly firestore: Firestore) {}

  private profile(uid: string, profileId: string) {
    return this.firestore.collection('USERS').doc(uid).collection('PROFILES').doc(profileId);
  }

  async getOwnedProfile(uid: string, profileId: string) {
    const snapshot = await this.profile(uid, profileId).get();
    const data = snapshot.data();
    if (!snapshot.exists || (data?.userId != null && data.userId !== uid)) return null;
    return {
      active: data?.status !== false,
      child: String(data?.relationship ?? '').toLowerCase() === 'child' ||
        (typeof data?.age === 'number' && data.age < 18),
      evidenceConsent: data?.recommendationEvidenceConsent === true,
    };
  }

  async getExplicitPreferences(uid: string, profileId: string): Promise<FoodPreferenceProfile | null> {
    const snapshot = await this.profile(uid, profileId).collection('PERSONALIZATION').doc('preferences').get();
    if (!snapshot.exists) return null;
    return parseFoodPreferenceProfile(snapshot.data());
  }

  async getSavedIntent(uid: string, profileId: string, intentId: string): Promise<SavedShoppingIntent | null> {
    const snapshot = await this.profile(uid, profileId).collection('SAVED_INTENTS').doc(intentId).get();
    if (!snapshot.exists) return null;
    return parseSavedShoppingIntent(snapshot.data());
  }

  async getRecentEvents(uid: string, profileId: string, maximum: number): Promise<ContextEvent[]> {
    const snapshot = await this.profile(uid, profileId).collection('RECOMMENDATION_EVENTS')
      .orderBy('event.receivedAt', 'desc').limit(Math.max(1, Math.min(maximum, 40))).get();
    return snapshot.docs.flatMap(document => {
      const event = document.data().event;
      if (!event || typeof event !== 'object' || typeof event.action !== 'string' ||
          typeof event.candidateBarcode !== 'string' || typeof event.occurredAt !== 'string' ||
          typeof event.receivedAt !== 'string' || event.profileId !== profileId) return [];
      return [{ action: event.action, candidateBarcode: event.candidateBarcode,
        occurredAt: event.occurredAt, receivedAt: event.receivedAt } as ContextEvent];
    });
  }

  async getProductSemantics(barcode: string): Promise<ProductSemanticAttributes | null> {
    const snapshot = await this.firestore.collection('PRODUCTS').doc(barcode).get();
    return snapshot.exists ? validateProductSemanticAttributes(snapshot.data()?.semanticAttributes) : null;
  }
}
