import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreProductSubmissionStore } from "@/server/firestoreProductSubmissionStore";
import {
  ProductAlreadyExistsError,
  SubmissionRateLimitError,
  SubmissionStorageTimeoutError,
} from "@/server/productSubmissions";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithFirestoreEmulator = emulatorHost ? describe : describe.skip;

const BARCODE = "036000291452";
const APP_NAME = "be042-product-submission-store";

function submission(barcode = BARCODE) {
  return {
    barcode,
    productName: "Example product",
    brand: "Example brand",
  };
}

describeWithFirestoreEmulator("FirestoreProductSubmissionStore", () => {
  const app = getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp({ projectId: "demo-food-remedy-be042" }, APP_NAME);
  const firestore = getFirestore(app);

  async function clearCollection(collectionName: string) {
    const snapshot = await firestore.collection(collectionName).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }

  beforeEach(async () => {
    await Promise.all([
      clearCollection("PRODUCTS"),
      clearCollection("PRODUCT_SUBMISSIONS"),
      clearCollection("PRODUCT_SUBMISSION_REPORTERS"),
      clearCollection("PRODUCT_SUBMISSION_RATE_LIMITS"),
    ]);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it("uses one queue document and one reporter record for concurrent duplicate requests", async () => {
    const store = new FirestoreProductSubmissionStore(firestore);

    const results = await Promise.all([
      store.submit("reporter-a", submission()),
      store.submit("reporter-a", submission()),
    ]);

    expect(results.map((result) => result.idempotent).sort()).toEqual([false, true]);
    expect(results.every((result) => result.submissionId === `ps_${BARCODE}`)).toBe(true);

    const submissions = await firestore.collection("PRODUCT_SUBMISSIONS").get();
    const reporters = await firestore.collection("PRODUCT_SUBMISSION_REPORTERS").get();
    expect(submissions.docs).toHaveLength(1);
    expect(submissions.docs[0].data()).toEqual(
      expect.objectContaining({
        barcode: BARCODE,
        status: "PENDING",
        unverified: true,
        reportCount: 1,
      })
    );
    expect(reporters.docs).toHaveLength(1);
  });

  it("aggregates a different reporter without creating another moderation queue item", async () => {
    const store = new FirestoreProductSubmissionStore(firestore);

    await store.submit("reporter-a", submission());
    const second = await store.submit("reporter-b", submission());

    expect(second).toEqual({
      submissionId: `ps_${BARCODE}`,
      barcode: BARCODE,
      status: "PENDING",
      idempotent: false,
    });
    expect((await firestore.collection("PRODUCT_SUBMISSIONS").get()).docs).toHaveLength(1);
    expect(
      (await firestore.doc(`PRODUCT_SUBMISSIONS/ps_${BARCODE}`).get()).data()
    ).toEqual(expect.objectContaining({ reportCount: 2 }));
  });

  it("returns PRODUCT_ALREADY_EXISTS when PRODUCTS gains the barcode", async () => {
    await firestore.doc(`PRODUCTS/${BARCODE}`).set({ barcode: BARCODE });
    const store = new FirestoreProductSubmissionStore(firestore);

    await expect(store.submit("reporter-a", submission())).rejects.toBeInstanceOf(
      ProductAlreadyExistsError
    );
    expect((await firestore.collection("PRODUCT_SUBMISSIONS").get()).empty).toBe(true);
  });

  it("enforces the per-reporter hourly limit without applying it to a repeat", async () => {
    const store = new FirestoreProductSubmissionStore(firestore, () => 1_000_000);

    await store.submit("reporter-a", submission("rate-duplicate"));
    await expect(store.submit("reporter-a", submission("rate-duplicate"))).resolves.toEqual(
      expect.objectContaining({ idempotent: true })
    );

    for (let index = 0; index < 9; index += 1) {
      await store.submit("reporter-a", submission(`rate-${index}`));
    }

    await expect(store.submit("reporter-a", submission("rate-exhausted"))).rejects.toBeInstanceOf(
      SubmissionRateLimitError
    );
  });
});

describe("FirestoreProductSubmissionStore timeout", () => {
  it("fails a stalled Firestore transaction with a sanitized timeout type", async () => {
    const stalledFirestore = {
      runTransaction: () => new Promise(() => undefined),
    };
    const store = new FirestoreProductSubmissionStore(stalledFirestore as any, () => 0, 1);

    await expect(store.submit("reporter-a", submission())).rejects.toBeInstanceOf(
      SubmissionStorageTimeoutError
    );
  });
});
