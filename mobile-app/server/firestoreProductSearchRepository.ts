import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type Firestore,
  where,
} from "firebase/firestore";
import {
  ProductSearchTimeoutError,
  type ProductSearchDocument,
  type ProductSearchRepository,
} from "@/server/productSearch";

const PRODUCTS_COLLECTION = "PRODUCTS";
const FIRESTORE_TIMEOUT_MS = 4_000;

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new ProductSearchTimeoutError()), FIRESTORE_TIMEOUT_MS);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  }) as Promise<T>;
}

function documentFromSnapshot(snapshot: { id: string; data(): Record<string, unknown> }): ProductSearchDocument {
  return { id: snapshot.id, data: snapshot.data() };
}

/** Bounded Firestore reader for BE041's normalized search fields. */
export class FirestoreProductSearchRepository implements ProductSearchRepository {
  constructor(private readonly firestore: Firestore) {}

  async findExactBarcode(barcode: string): Promise<ProductSearchDocument | null> {
    const snapshot = await withTimeout(getDoc(doc(this.firestore, PRODUCTS_COLLECTION, barcode)));
    return snapshot.exists() ? documentFromSnapshot(snapshot) : null;
  }

  async findProductNamePrefix(queryText: string, readLimit: number): Promise<ProductSearchDocument[]> {
    return this.findPrefix("productNameSearch", queryText, readLimit);
  }

  async findBrandPrefix(queryText: string, readLimit: number): Promise<ProductSearchDocument[]> {
    return this.findPrefix("brandSearch", queryText, readLimit);
  }

  private async findPrefix(
    field: "productNameSearch" | "brandSearch",
    queryText: string,
    readLimit: number
  ): Promise<ProductSearchDocument[]> {
    const products = collection(this.firestore, PRODUCTS_COLLECTION);
    const prefixQuery = query(
      products,
      where(field, ">=", queryText),
      where(field, "<=", `${queryText}\uf8ff`),
      orderBy(field),
      limit(readLimit)
    );
    const snapshot = await withTimeout(getDocs(prefixQuery));
    return snapshot.docs.map(documentFromSnapshot);
  }
}
