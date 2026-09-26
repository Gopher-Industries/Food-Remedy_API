import { deleteApp, getApps, initializeApp } from "firebase/app";
import { deleteApp as deleteAdminApp, getApps as getAdminApps, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";
import { FirestoreProductSearchRepository } from "@/server/firestoreProductSearchRepository";

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const PROJECT_ID = "demo-food-remedy-be041";
const APP_NAME = "be041-product-search-repository";

describeWithFirestoreEmulator("FirestoreProductSearchRepository", () => {
  const app = getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  const firestore = getFirestore(app);
  const adminApp = getAdminApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeAdminApp({ projectId: PROJECT_ID }, APP_NAME);
  const adminFirestore = getAdminFirestore(adminApp);
  const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorAddress) {
    const [emulatorHost, emulatorPort] = emulatorAddress.split(":");
    connectFirestoreEmulator(firestore, emulatorHost, Number(emulatorPort));
  }
  const repository = new FirestoreProductSearchRepository(firestore);

  beforeEach(async () => {
    const products = await adminFirestore.collection("PRODUCTS").get();
    await Promise.all(products.docs.map((snapshot) => snapshot.ref.delete()));

    await Promise.all([
      adminFirestore.doc("PRODUCTS/036000291452").set({
        barcode: "036000291452",
        productName: "Milk",
        brand: "Dairy Co",
        productNameSearch: "milk",
        brandSearch: "dairy co",
      }),
      adminFirestore.doc("PRODUCTS/4006381333931").set({
        barcode: "4006381333931",
        productName: "Milk Chocolate",
        brand: "Sweet Co",
        productNameSearch: "milk chocolate",
        brandSearch: "sweet co",
      }),
      adminFirestore.doc("PRODUCTS/96385074").set({
        barcode: "96385074",
        productName: "Sparkling Water",
        brand: "Milk Foods",
        productNameSearch: "sparkling water",
        brandSearch: "milk foods",
      }),
    ]);
  });

  afterAll(async () => {
    await deleteApp(app);
    await deleteAdminApp(adminApp);
  });

  it("uses normalized fields for bounded exact and prefix retrieval", async () => {
    await expect(repository.findExactBarcode("036000291452")).resolves.toEqual(
      expect.objectContaining({ id: "036000291452" })
    );
    await expect(repository.findProductNamePrefix("milk", 2)).resolves.toEqual([
      expect.objectContaining({ id: "036000291452" }),
      expect.objectContaining({ id: "4006381333931" }),
    ]);
    await expect(repository.findBrandPrefix("milk", 2)).resolves.toEqual([
      expect.objectContaining({ id: "96385074" }),
    ]);
  });
});
