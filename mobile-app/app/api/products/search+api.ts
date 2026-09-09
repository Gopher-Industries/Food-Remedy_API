import { fdb } from "@/config/firebaseConfig";
import { FirestoreProductSearchRepository } from "@/server/firestoreProductSearchRepository";
import { createProductSearchHandler } from "@/server/productSearchHandler";

const repository = new FirestoreProductSearchRepository(fdb);

const handler = createProductSearchHandler({
  repository,
  metrics: {
    record: ({ outcome, durationMs, resultCount }) => {
      // This event intentionally contains no raw query, token, or profile data.
      console.info("product_search", { outcome, durationMs, resultCount });
    },
  },
});

/** GET /api/products/search?q=<prefix>&limit=<1..25>&cursor=<opaque> */
export async function GET(request: Request): Promise<Response> {
  return handler(request);
}
