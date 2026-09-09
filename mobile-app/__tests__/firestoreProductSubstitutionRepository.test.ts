import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreProductSubstitutionRepository } from "@/server/firestoreProductSubstitutionRepository";
import { createProductSubstitutionResponse } from "@/server/productSubstitutionService";

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
      firestore.collection("PRODUCTS").doc(safeBarcode).set(product(safeBarcode)),
      firestore.collection("PRODUCTS").doc(milkBarcode).set(product(milkBarcode, { allergens: ["milk"], traces: "sesame" })),
      firestore.collection("USERS").doc("owner").collection("PROFILES").doc("self").set({ relationship: "Self", allergies: ["Milk"], additives: [], intolerances: [], dietaryForm: [] }),
      firestore.collection("USERS").doc("other-user").collection("PROFILES").doc("self").set({ relationship: "Self", allergies: [], additives: [], intolerances: [], dietaryForm: ["Vegan"] }),
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
});
