const test = require("node:test");
const assert = require("node:assert/strict");
const { createProductCatalog } = require("../substitutions/productCatalog");
const { createSubstitutionService } = require("../substitutions/substitutionService");

function product(overrides = {}) {
  return {
    barcode: "10000001",
    productName: "Wholemeal Bread",
    brand: "Test Foods",
    categories: ["foods", "breads", "wholemeal-breads"],
    allergens: ["soy"],
    traces: "sesame",
    ingredientsText: "wholemeal flour, water, soy",
    ingredients: [],
    additives: [],
    labels: ["vegetarian"],
    nutriments: { "energy-kcal_100g": 250, sugars_100g: 5, sodium_100g: 0.4, proteins_100g: 8 },
    ...overrides,
  };
}

function serviceFor(products, alternatives = {}) {
  const catalog = createProductCatalog({ products, alternatives });
  return createSubstitutionService({ catalog, logger: { info() {} } });
}

test("non-chocolate scans only return products sharing a specific category", () => {
  const source = product();
  const bread = product({ barcode: "10000002", productName: "Seeded Bread" });
  const chocolate = product({ barcode: "10000003", productName: "Dark Chocolate", categories: ["foods", "chocolates"] });
  const service = serviceFor([source, bread, chocolate], {
    [source.barcode]: { similar: [{ barcode: chocolate.barcode, rank: 1 }, { barcode: bread.barcode, rank: 2 }], healthier: [] },
  });

  const result = service.getSubstitutions({ barcode: source.barcode, profile: {}, requestId: "category-test" });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.substitutions.map((item) => item.productName), ["Seeded Bread"]);
  assert.ok(result.substitutions[0].reasons.some((item) => item.code === "CATEGORY_MATCH"));
});

test("known canonical allergen conflicts are never recommended", () => {
  const source = product();
  const unsafe = product({ barcode: "10000002", productName: "Milk Bread", allergens: ["milk"], ingredientsText: "wheat flour, milk" });
  const safe = product({ barcode: "10000003", productName: "Soy Bread", allergens: ["soy"], traces: "sesame" });
  const result = serviceFor([source, unsafe, safe]).getSubstitutions({
    barcode: source.barcode,
    profile: { allergies: ["Milk"] },
    requestId: "allergen-test",
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.substitutions.map((item) => item.barcode), [safe.barcode]);
  assert.ok(result.substitutions[0].reasons.some((item) => item.code === "ALLERGEN_DECLARATIONS_CHECKED"));
});

test("incomplete candidate declarations fail closed with an explicit empty state", () => {
  const source = product();
  const incomplete = product({ barcode: "10000002", allergens: [], traces: "" });
  const result = serviceFor([source, incomplete]).getSubstitutions({
    barcode: source.barcode,
    profile: { allergies: ["Milk"] },
    requestId: "incomplete-test",
  });
  assert.equal(result.status, "empty");
  assert.equal(result.emptyState.code, "INSUFFICIENT_SAFETY_DATA");
  assert.deepEqual(result.substitutions, []);
});

test("dietary and additive constraints are hard filters", () => {
  const source = product();
  const wrongDiet = product({ barcode: "10000002", labels: ["vegetarian"] });
  const additiveConflict = product({ barcode: "10000003", labels: ["vegan"], additives: ["e621"] });
  const eligible = product({ barcode: "10000004", labels: ["vegan"], additives: ["e300"] });
  const result = serviceFor([source, wrongDiet, additiveConflict, eligible]).getSubstitutions({
    barcode: source.barcode,
    profile: { dietaryForm: ["Vegan"], additives: ["E621"] },
    requestId: "constraints-test",
  });
  assert.deepEqual(result.substitutions.map((item) => item.barcode), [eligible.barcode]);
  assert.deepEqual(
    result.substitutions[0].reasons.map((item) => item.code),
    ["CATEGORY_MATCH", "DIETARY_REQUIREMENT_MATCH", "ADDITIVE_PREFERENCE_CHECKED"]
  );
});

test("health goals require measurable improvement and explain the evidence", () => {
  const source = product();
  const notImproved = product({ barcode: "10000002", nutriments: { "energy-kcal_100g": 270, sugars_100g: 6 } });
  const improved = product({ barcode: "10000003", nutriments: { "energy-kcal_100g": 210, sugars_100g: 3 } });
  const result = serviceFor([source, notImproved, improved]).getSubstitutions({
    barcode: source.barcode,
    profile: { healthGoal: "weight_loss" },
    requestId: "goal-test",
  });
  assert.deepEqual(result.substitutions.map((item) => item.barcode), [improved.barcode]);
  assert.ok(result.substitutions[0].reasons.some((item) => item.code === "LOWER_ENERGY_FOR_GOAL"));
  assert.ok(result.substitutions[0].reasons.some((item) => item.code === "LOWER_SUGAR_FOR_GOAL"));
});

test("missing source category and no-result cases are explicit safe empty states", () => {
  const uncategorized = product({ barcode: "10000009", categories: [] });
  const result = serviceFor([uncategorized]).getSubstitutions({ barcode: uncategorized.barcode, profile: {}, requestId: "empty-test" });
  assert.equal(result.status, "empty");
  assert.equal(result.emptyState.code, "INSUFFICIENT_CATEGORY_DATA");
  assert.equal(result.meta.returnedCount, 0);
});

test("results and candidate evaluation are bounded", () => {
  const source = product();
  const candidates = Array.from({ length: 20 }, (_, index) => product({ barcode: String(20000000 + index), productName: `Bread ${index}` }));
  const result = serviceFor([source, ...candidates]).getSubstitutions({ barcode: source.barcode, profile: {}, limit: 10, requestId: "bounds-test" });
  assert.equal(result.substitutions.length, 10);
  assert.ok(result.meta.evaluatedCount <= 60);
});

test("active local scan pipeline no longer returns fixed chocolate products", () => {
  const { getAlternatives } = require("../scanPipeline");
  const alternatives = getAlternatives({ barcode: "9310232957876" }, "red", {});
  assert.deepEqual(alternatives.map((item) => item.name), ["Vitasoy Soy Milk Calci-Plus"]);
  assert.equal(alternatives.some((item) => /chocolate|cocoa nib/i.test(item.name)), false);
});
