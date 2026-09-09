import { deleteApp, getApps, initializeApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import { FirestoreProductSearchRepository } from "@/server/firestoreProductSearchRepository";

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const APP_NAME = "be041-product-search-repository";

describeWithFirestoreEmulator("FirestoreProductSearchRepository", () => {
  const app = getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp({ projectId: "demo-food-remedy-be041" }, APP_NAME);
  const firestore = getFirestore(app);
  const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorAddress) {
    const [emulatorHost, emulatorPort] = emulatorAddress.split(":");
    connectFirestoreEmulator(firestore, emulatorHost, Number(emulatorPort));
  }
  const repository = new FirestoreProductSearchRepository(firestore);

  beforeEach(async () => {
    const products = await getDocs(collection(firestore, "PRODUCTS"));
    await Promise.all(products.docs.map((snapshot) => deleteDoc(snapshot.ref)));

    await Promise.all([
      setDoc(doc(firestore, "PRODUCTS", "036000291452"), {
        barcode: "036000291452",
        productName: "Milk",
        brand: "Dairy Co",
        productNameSearch: "milk",
        brandSearch: "dairy co",
      }),
      setDoc(doc(firestore, "PRODUCTS", "4006381333931"), {
        barcode: "4006381333931",
        productName: "Milk Chocolate",
        brand: "Sweet Co",
        productNameSearch: "milk chocolate",
        brandSearch: "sweet co",
      }),
      setDoc(doc(firestore, "PRODUCTS", "96385074"), {
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
