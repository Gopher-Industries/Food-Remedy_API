import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreProductSubstitutionRepository } from "@/server/firestoreProductSubstitutionRepository";
import { createProductSubstitutionResponse } from "@/server/productSubstitutionService";
import { executeProductSubstitutionV2 } from '@/server/productSubstitutionV2';
import { FirestorePersonalizationContextRepository } from '@/server/firestorePersonalizationContextRepository';
import { resolvePersonalizationContext, PersonalizationContextUnavailableError } from '@/server/personalizationContext';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const projectId = "demo-food-remedy-be037";
const category = "be037-substitution-fixture";
const originalBarcode = "036000291452";
const safeBarcode = "036000291469";
const milkBarcode = "036000291476";

function product(barcode: string, overrides: Record<string, unknown> = {}) {
  return {
    barcode,
    productName: `Product ${barcode}`,
    categories: [category],
    allergens: ["soy"],
    traces: "sesame",
    labels: ["vegan"],
    ingredients: ["oats", "soy"],
    additives: [],
    nutriments: { sugars_100g: barcode === safeBarcode ? 2 : 12 },
    nutrientLevels: { fat: "low", salt: "low", sugars: "low", "saturated-fat": "low" },
    nutriscoreGrade: barcode === safeBarcode ? "B" : "C",
    ...overrides,
  };
}

describeWithEmulator("FirestoreProductSubstitutionRepository", () => {
  const app = initializeApp({ projectId }, "be037-substitutions-test");
  const firestore = getFirestore(app);
  const repository = new FirestoreProductSubstitutionRepository(firestore);

  beforeAll(async () => {
    await Promise.all([
      firestore.collection("PRODUCTS").doc(originalBarcode).set(product(originalBarcode)),
      firestore.collection("PRODUCTS").doc(safeBarcode).set(product(safeBarcode, { semanticAttributes: {
        schemaVersion: '1.0.0', evidenceCompleteness: 'partial',
        texture: { value: 'soft', source: 'manual', sourceVersion: 'fixture-v1', confidence: 1, generatedAt: '2026-09-25T00:00:00Z' },
      } })),
      firestore.collection("PRODUCTS").doc(milkBarcode).set(product(milkBarcode, { allergens: ["milk"], traces: "sesame" })),
      firestore.collection("USERS").doc("owner").collection("PROFILES").doc("self").set({ relationship: "Self", allergies: ["Milk"], additives: [], intolerances: [], dietaryForm: [] }),
      firestore.collection("USERS").doc("other-user").collection("PROFILES").doc("self").set({ relationship: "Self", allergies: [], additives: [], intolerances: [], dietaryForm: ["Vegan"] }),
      firestore.collection("USERS").doc("inactive-user").collection("PROFILES").doc("self").set({ relationship: "Self", status: false, allergies: [] }),
      firestore.collection("USERS").doc("ambiguous-user").collection("PROFILES").doc("self-1").set({ relationship: "Self", allergies: [] }),
      firestore.collection("USERS").doc("ambiguous-user").collection("PROFILES").doc("self-2").set({ relationship: "Self", allergies: ["Milk"] }),
      firestore.collection('USERS').doc('owner').collection('PROFILES').doc('child').set({ relationship: 'Child', age: 9, status: true, recommendationEvidenceConsent: true, allergies: ['Milk'] }),
      firestore.collection('USERS').doc('owner').collection('PROFILES').doc('self').collection('PERSONALIZATION').doc('preferences').set({
        schemaVersion: '1.0.0', profileId: 'self', updatedAt: '2026-09-25T00:00:00Z',
        entries: [{ dimension: 'texture', value: 'crunchy', sentiment: 'like', provenance: 'explicit', confidence: 1, sourceVersion: 'fixture-v1', updatedAt: '2026-09-25T00:00:00Z' }],
      }),
      firestore.collection('USERS').doc('owner').collection('PROFILES').doc('child').collection('PERSONALIZATION').doc('preferences').set({
        schemaVersion: '1.0.0', profileId: 'child', updatedAt: '2026-09-25T00:00:00Z',
        entries: [{ dimension: 'texture', value: 'soft', sentiment: 'like', provenance: 'explicit', confidence: 1, sourceVersion: 'fixture-v1', updatedAt: '2026-09-25T00:00:00Z' }],
      }),
      firestore.collection('USERS').doc('owner').collection('PROFILES').doc('child').collection('RECOMMENDATION_EVENTS').doc('event-1').set({
        event: { profileId: 'child', action: 'thumbs_up', candidateBarcode: safeBarcode, occurredAt: '2026-09-25T00:00:00Z', receivedAt: '2026-09-25T00:00:00Z' },
      }),
    ]);
  });

  afterAll(async () => {
    await firestore.terminate();
    await deleteApp(app);
  });

  it("reads only the verified owner's Self profile and bounded category candidates", async () => {
    const original = await repository.getProduct(originalBarcode);
    expect(original).toEqual(expect.objectContaining({ barcode: originalBarcode }));

    const [owner, other, candidates] = await Promise.all([
      repository.getAuthoritativeProfile("owner"),
      repository.getAuthoritativeProfile("other-user"),
      repository.getCandidates(original!, 1),
    ]);

    expect(owner?.allergies).toEqual(["Milk"]);
    expect(other?.allergies).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].barcode).not.toBe(originalBarcode);
  });

  it("uses the repository with canonical eligibility and never returns the milk conflict", async () => {
    const response = await createProductSubstitutionResponse(repository, "owner", {
      barcode: originalBarcode,
      limit: 20,
    });

    expect(response.status).toBe("success");
    expect(response.substitutions.map((item) => item.barcode)).toContain(safeBarcode);
    expect(response.substitutions.map((item) => item.barcode)).not.toContain(milkBarcode);
  });

  it("rejects inactive or ambiguous authoritative profiles", async () => {
    expect(await repository.getAuthoritativeProfile("inactive-user")).toBeNull();
    expect(await repository.getAuthoritativeProfile("ambiguous-user")).toBeNull();
  });

  it('resolves independent owner and child contexts without crossing a UID path', async () => {
    const contextRepository = new FirestorePersonalizationContextRepository(firestore);
    const clock = Date.parse('2026-09-26T00:00:00Z');
    const self = await resolvePersonalizationContext(contextRepository, 'owner', 'self', undefined, clock);
    const child = await resolvePersonalizationContext(contextRepository, 'owner', 'child', undefined, clock);
    expect(self.explicit[0].value).toBe('crunchy');
    expect(self.observed).toEqual([]);
    expect(child.explicit[0].value).toBe('soft');
    expect(child.observed).toEqual([expect.objectContaining({ value: 'soft', provenance: 'observed' })]);
    expect(JSON.stringify(child)).not.toContain('Milk');
    await expect(resolvePersonalizationContext(contextRepository, 'other-user', 'child', undefined, clock))
      .rejects.toBeInstanceOf(PersonalizationContextUnavailableError);
  });

  it('uses the selected child safety profile for v2 while preserving hard exclusions', async () => {
    const contexts = new FirestorePersonalizationContextRepository(firestore);
    const child = await executeProductSubstitutionV2(repository, contexts, 'owner', {
      barcode: originalBarcode, profileId: 'child', limit: 20, intention: 'Lunchbox snack',
    });
    expect(child.response.version).toBe('2.0.0');
    expect(child.response.substitutions.map(item => item.barcode)).toContain(safeBarcode);
    expect(child.response.substitutions.map(item => item.barcode)).not.toContain(milkBarcode);
    expect(child.context.intention?.source).toBe('one_off');
    await expect(executeProductSubstitutionV2(repository, contexts, 'other-user', {
      barcode: originalBarcode, profileId: 'child', limit: 20,
    })).rejects.toThrow('Profile unavailable.');
  });
});
