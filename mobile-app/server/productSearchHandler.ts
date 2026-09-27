import {
  PRODUCT_SEARCH_CONTRACT_VERSION,
  ProductSearchTimeoutError,
  type ProductSearchMetrics,
  type ProductSearchRepository,
  ProductSearchValidationError,
  parseProductSearchRequest,
  searchProducts,
} from "@/server/productSearch";

export interface ProductSearchHandlerDependencies {
  repository: ProductSearchRepository;
  metrics: ProductSearchMetrics;
  now?: () => number;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function error(code: string, message: string, status: number): Response {
  return json({ version: PRODUCT_SEARCH_CONTRACT_VERSION, error: { code, message } }, status);
}

/** Produces a testable GET handler without ever recording the raw search term. */
export function createProductSearchHandler(dependencies: ProductSearchHandlerDependencies) {
  const now = dependencies.now ?? (() => Date.now());

  return async function getProductSearch(request: Request): Promise<Response> {
    const startedAt = now();
    try {
      const searchRequest = parseProductSearchRequest(new URL(request.url));
      const page = await searchProducts(dependencies.repository, searchRequest);
      dependencies.metrics.record({
        outcome: "success",
        durationMs: Math.max(0, now() - startedAt),
        resultCount: page.results.length,
      });
      return json({ version: PRODUCT_SEARCH_CONTRACT_VERSION, ...page }, 200);
    } catch (caught) {
      const durationMs = Math.max(0, now() - startedAt);
      if (caught instanceof ProductSearchValidationError) {
        dependencies.metrics.record({ outcome: "invalid_request", durationMs, resultCount: 0 });
        return error(caught.code, caught.message, 400);
      }
      dependencies.metrics.record({ outcome: "unavailable", durationMs, resultCount: 0 });
      if (caught instanceof ProductSearchTimeoutError) {
        return error("SEARCH_UNAVAILABLE", "Product search is temporarily unavailable. Please try again.", 503);
      }

      // Do not log the thrown error. Firestore errors and request URL strings
      // can contain raw search terms; the metric above deliberately does not.
      return error("SEARCH_UNAVAILABLE", "Product search is temporarily unavailable. Please try again.", 503);
    }
  };
}
