import {
  createProductSearchHandler,
  type ProductSearchHandlerDependencies,
} from "@/server/productSearchHandler";
import {
  MAX_SOURCE_READS,
  ProductSearchTimeoutError,
  type ProductSearchDocument,
} from "@/server/productSearch";

const BARCODES = {
  exactName: "036000291452",
  namePrefix: "4006381333931",
  exactBrand: "00012345600012",
  brandPrefix: "96385074",
};

function product(
  barcode: string,
  fields: Record<string, unknown>
): ProductSearchDocument {
  return {
    id: barcode,
    data: {
      barcode,
      productName: `Product ${barcode}`,
      brand: "Example brand",
      category: "Drinks",
      nutriscoreGrade: "B",
      ...fields,
    },
  };
}

function createDependencies(
  overrides: Partial<ProductSearchHandlerDependencies["repository"]> = {}
) {
  const metrics = { record: jest.fn() };
  const repository = {
    findExactBarcode: jest.fn().mockResolvedValue(null),
    findProductNamePrefix: jest.fn().mockResolvedValue([]),
    findBrandPrefix: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return { repository, metrics };
}

function searchRequest(query: string): Request {
  return new Request(`http://localhost/api/products/search?${query}`);
}

describe("GET /api/products/search", () => {
  it("uses BE040 normalization, ranks deterministically, and deduplicates barcodes", async () => {
    const dependencies = createDependencies({
      findProductNamePrefix: jest.fn().mockResolvedValue([
        product(BARCODES.namePrefix, {
          productName: "Milk Chocolate",
          productNameSearch: "milk chocolate",
        }),
        product(BARCODES.exactName, {
          productName: "Milk",
          productNameSearch: "milk",
        }),
      ]),
      findBrandPrefix: jest.fn().mockResolvedValue([
        product(BARCODES.exactName, {
          productName: "Milk",
          productNameSearch: "milk",
          brand: "Milk Company",
          brandSearch: "milk company",
        }),
        product(BARCODES.brandPrefix, {
          productName: "Water",
          brand: "Milk Foods",
          brandSearch: "milk foods",
        }),
        product(BARCODES.exactBrand, {
          productName: "Yoghurt",
          brand: "Milk",
          brandSearch: "milk",
        }),
      ]),
    });
    const handler = createProductSearchHandler(dependencies);

    const response = await handler(searchRequest("q=%20MILK%20%20&limit=25"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dependencies.repository.findProductNamePrefix).toHaveBeenCalledWith("milk", MAX_SOURCE_READS);
    expect(dependencies.repository.findBrandPrefix).toHaveBeenCalledWith("milk", MAX_SOURCE_READS);
    expect(body).toEqual({
      version: "v1",
      results: [
        expect.objectContaining({ barcode: BARCODES.exactName, productName: "Milk" }),
        expect.objectContaining({ barcode: BARCODES.namePrefix }),
        expect.objectContaining({ barcode: BARCODES.exactBrand }),
        expect.objectContaining({ barcode: BARCODES.brandPrefix }),
      ],
      nextCursor: null,
    });
    expect(new Set(body.results.map((item: { barcode: string }) => item.barcode)).size).toBe(4);
  });

  it("returns an exact barcode match first with no prefix reads", async () => {
    const dependencies = createDependencies({
      findExactBarcode: jest.fn().mockResolvedValue(
        product(BARCODES.exactName, { productName: "Exact barcode product" })
      ),
    });
    const response = await createProductSearchHandler(dependencies)(
      searchRequest(`q=${BARCODES.exactName}`)
    );

    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([
      expect.objectContaining({ barcode: BARCODES.exactName }),
    ]);
    expect(dependencies.repository.findExactBarcode).toHaveBeenCalledWith(BARCODES.exactName);
    expect(dependencies.repository.findProductNamePrefix).not.toHaveBeenCalled();
    expect(dependencies.repository.findBrandPrefix).not.toHaveBeenCalled();
  });

  it("uses an opaque cursor without repeats or skipped results on an unchanged catalogue", async () => {
    const results = [
      product(BARCODES.exactName, { productNameSearch: "tea" }),
      product(BARCODES.namePrefix, { productNameSearch: "tea bags" }),
      product(BARCODES.exactBrand, { productNameSearch: "tea leaves" }),
      product(BARCODES.brandPrefix, { productNameSearch: "tea tonic" }),
      product("01234567890128", { productNameSearch: "tea tree" }),
    ];
    const dependencies = createDependencies({
      findProductNamePrefix: jest.fn().mockResolvedValue(results),
      findBrandPrefix: jest.fn().mockResolvedValue([]),
    });
    const handler = createProductSearchHandler(dependencies);

    const first = await handler(searchRequest("q=tea&limit=2"));
    const firstBody = await first.json();
    const second = await handler(searchRequest(`q=tea&limit=2&cursor=${firstBody.nextCursor}`));
    const secondBody = await second.json();
    const third = await handler(searchRequest(`q=tea&limit=2&cursor=${secondBody.nextCursor}`));
    const thirdBody = await third.json();

    const returned = [
      ...firstBody.results,
      ...secondBody.results,
      ...thirdBody.results,
    ].map((item: { barcode: string }) => item.barcode);
    expect(returned).toEqual([
      BARCODES.exactName,
      ...results.slice(1).map((item) => item.id).sort(),
    ]);
    expect(new Set(returned).size).toBe(results.length);
    expect(thirdBody.nextCursor).toBeNull();

    const wrongQuery = await handler(searchRequest(`q=coffee&limit=2&cursor=${firstBody.nextCursor}`));
    expect(wrongQuery.status).toBe(400);
    expect((await wrongQuery.json()).error.code).toBe("INVALID_CURSOR");
  });

  it.each([
    ["missing q", "limit=2", "INVALID_QUERY"],
    ["too-short q", "q=x", "INVALID_QUERY"],
    ["oversized q", `q=${"a".repeat(81)}`, "INVALID_QUERY"],
    ["control character", "q=tea%00milk", "INVALID_QUERY"],
    ["invalid barcode check digit", "q=036000291453", "INVALID_QUERY"],
    ["zero limit", "q=tea&limit=0", "INVALID_LIMIT"],
    ["oversized limit", "q=tea&limit=26", "INVALID_LIMIT"],
    ["malformed cursor", "q=tea&cursor=not-a-cursor", "INVALID_CURSOR"],
  ])("rejects %s predictably", async (_label, query, code) => {
    const dependencies = createDependencies();
    const response = await createProductSearchHandler(dependencies)(searchRequest(query));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(code);
    expect(dependencies.repository.findProductNamePrefix).not.toHaveBeenCalled();
  });

  it("returns an explicit empty result and does not expose timeout or Firestore failures", async () => {
    const emptyDependencies = createDependencies();
    const emptyResponse = await createProductSearchHandler(emptyDependencies)(searchRequest("q=none"));
    expect(await emptyResponse.json()).toEqual({ version: "v1", results: [], nextCursor: null });

    for (const failure of [
      new ProductSearchTimeoutError("request contained private search text"),
      new Error("Firestore failed for raw-term@example.com"),
    ]) {
      const dependencies = createDependencies({
        findProductNamePrefix: jest.fn().mockRejectedValue(failure),
      });
      const response = await createProductSearchHandler(dependencies)(searchRequest("q=private"));
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({
        version: "v1",
        error: {
          code: "SEARCH_UNAVAILABLE",
          message: "Product search is temporarily unavailable. Please try again.",
        },
      });
      expect(JSON.stringify(body)).not.toContain("raw-term@example.com");
    }
  });

  it("records timing and result-count metrics without the raw search term", async () => {
    const dependencies = createDependencies({
      findProductNamePrefix: jest.fn().mockResolvedValue([
        product(BARCODES.exactName, { productNameSearch: "oat milk" }),
      ]),
    });
    const handler = createProductSearchHandler({ ...dependencies, now: jest.fn().mockReturnValueOnce(100).mockReturnValueOnce(112) });

    await handler(searchRequest("q=oat%20milk"));

    expect(dependencies.metrics.record).toHaveBeenCalledWith({
      outcome: "success",
      durationMs: 12,
      resultCount: 1,
    });
    expect(JSON.stringify((dependencies.metrics.record as jest.Mock).mock.calls)).not.toContain("oat milk");
  });

  it("keeps every response bounded when both Firestore source reads are full", async () => {
    const nameMatches = Array.from({ length: MAX_SOURCE_READS }, (_value, index) =>
      product(`${String(index + 10).padStart(12, "0")}`, {
        productNameSearch: `snack ${index}`,
      })
    );
    const brandMatches = Array.from({ length: MAX_SOURCE_READS }, (_value, index) =>
      product(`${String(index + 70).padStart(12, "0")}`, {
        brandSearch: `snack brand ${index}`,
      })
    );
    const dependencies = createDependencies({
      findProductNamePrefix: jest.fn().mockResolvedValue(nameMatches),
      findBrandPrefix: jest.fn().mockResolvedValue(brandMatches),
    });

    const response = await createProductSearchHandler(dependencies)(searchRequest("q=snack&limit=25"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(25);
    expect(dependencies.repository.findProductNamePrefix).toHaveBeenCalledWith("snack", MAX_SOURCE_READS);
    expect(dependencies.repository.findBrandPrefix).toHaveBeenCalledWith("snack", MAX_SOURCE_READS);
    expect(body.nextCursor).toEqual(expect.any(String));
  });
});
