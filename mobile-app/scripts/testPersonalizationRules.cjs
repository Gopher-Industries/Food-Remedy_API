/* Run with: npx firebase emulators:exec --only firestore --project demo-food-remedy-personalization 'node mobile-app/scripts/testPersonalizationRules.cjs' */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, deleteDoc, updateDoc } = require('firebase/firestore');

const projectId = 'demo-food-remedy-personalization';
const now = '2026-09-26T00:00:00Z';
const preference = profileId => ({ schemaVersion: '1.0.0', profileId, entries: [{
  dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'explicit',
  confidence: 1, sourceVersion: 'mobile-1', updatedAt: now,
}], updatedAt: now });
const intent = profileId => ({ schemaVersion: '1.0.0', intentId: 'intent_1', profileId,
  text: 'Lunchbox snack', provenance: 'explicit', createdAt: now, updatedAt: now });

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'USERS/owner/PROFILES/self'), { status: true, relationship: 'Self' });
      await setDoc(doc(context.firestore(), 'USERS/owner/PROFILES/child'), { status: true, relationship: 'Child' });
      await setDoc(doc(context.firestore(), 'USERS/other/PROFILES/self'), { status: true, relationship: 'Self' });
      await setDoc(doc(context.firestore(), 'USERS/owner/PROFILES/self/PERSONALIZATION/preferences'), preference('self'));
      await setDoc(doc(context.firestore(), 'USERS/owner/PROFILES/child/PERSONALIZATION/preferences'), preference('child'));
      await setDoc(doc(context.firestore(), 'USERS/owner/PROFILES/child/RECOMMENDATION_SESSIONS/session_1'), { sessionId: 'session_1' });
      await setDoc(doc(context.firestore(), 'USERS/owner/PROFILES/child/RECOMMENDATION_EVENTS/event_1'), { event: { eventId: 'event_1' } });
      await setDoc(doc(context.firestore(), 'PRODUCTS/semantic-eval'), { productName: 'Evaluation product', semanticAttributes: { schemaVersion: '1.0.0' } });
      await setDoc(doc(context.firestore(), 'SERVER_CONFIG/jev'), { schemaVersion: 1, mode: 'disabled' });
    });
    const owner = env.authenticatedContext('owner').firestore();
    const attacker = env.authenticatedContext('other').firestore();
    const guest = env.unauthenticatedContext().firestore();
    const self = 'USERS/owner/PROFILES/self/PERSONALIZATION/preferences';
    const child = 'USERS/owner/PROFILES/child/PERSONALIZATION/preferences';
    const saved = 'USERS/owner/PROFILES/child/SAVED_INTENTS/intent_1';
    const session = 'USERS/owner/PROFILES/child/RECOMMENDATION_SESSIONS/session_1';
    const evidence = 'USERS/owner/PROFILES/child/RECOMMENDATION_EVENTS/event_1';

    await assertSucceeds(setDoc(doc(owner, saved), intent('child')));
    assert.deepEqual((await getDoc(doc(owner, self))).data(), preference('self'));
    assert.deepEqual((await getDoc(doc(owner, saved))).data(), intent('child'));
    await assertFails(setDoc(doc(owner, self), preference('self')));
    await assertSucceeds(getDoc(doc(owner, self)));
    await assertSucceeds(getDoc(doc(owner, child)));
    await assertSucceeds(getDocs(collection(owner, 'USERS/owner/PROFILES/child/SAVED_INTENTS')));
    await assertFails(getDoc(doc(attacker, self)));
    await assertFails(setDoc(doc(attacker, saved), intent('child')));
    await assertFails(getDoc(doc(guest, self)));
    await assertFails(setDoc(doc(guest, self), preference('self')));
    await assertFails(setDoc(doc(owner, child), preference('self')));
    await assertFails(setDoc(doc(owner, saved), { ...intent('child'), profileId: 'self' }));
    await assertFails(setDoc(doc(owner, saved), { ...intent('child'), text: 'x'.repeat(241) }));
    await assertFails(setDoc(doc(owner, saved), { ...intent('child'), deletedAt: now }));
    await assertFails(setDoc(doc(owner, 'PRODUCTS/12345678'), { productName: 'Untrusted' }));
    await assertSucceeds(getDoc(doc(owner, 'PRODUCTS/semantic-eval')));
    await assertFails(updateDoc(doc(owner, 'PRODUCTS/semantic-eval'), { 'semanticAttributes.texture': { value: 'crunchy' } }));
    await assertFails(updateDoc(doc(attacker, 'PRODUCTS/semantic-eval'), { 'semanticAttributes.texture': { value: 'soft' } }));
    await assertSucceeds(getDoc(doc(owner, session)));
    await assertSucceeds(getDoc(doc(owner, evidence)));
    await assertFails(getDoc(doc(attacker, evidence)));
    await assertFails(getDoc(doc(guest, session)));
    await assertFails(setDoc(doc(owner, session), { sessionId: 'forged' }));
    await assertFails(setDoc(doc(owner, evidence), { event: { eventId: 'forged' } }));
    for (const client of [owner, attacker, guest]) {
      await assertFails(getDoc(doc(client, 'SERVER_CONFIG/jev')));
      await assertFails(setDoc(doc(client, 'SERVER_CONFIG/jev'), { mode: 'enabled' }));
    }

    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'USERS/owner/PROFILES/child'), { status: false }));
    await assertSucceeds(getDoc(doc(owner, child)));
    await assertFails(setDoc(doc(owner, child), preference('child')));
    await env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), 'USERS/owner/PROFILES/child')));
    await assertFails(getDoc(doc(owner, child)));
    await assertFails(getDoc(doc(owner, saved)));
    await assertFails(getDoc(doc(owner, session)));
    await assertFails(getDoc(doc(owner, evidence)));
    console.log('BE059-BE060/BE070 Firestore rules: owner/attacker/guest, server-only config and event writes, saved-intent shape, inactive and orphan assertions passed');
  } finally {
    await env.cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
