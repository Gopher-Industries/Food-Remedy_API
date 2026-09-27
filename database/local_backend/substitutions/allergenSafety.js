/*
 * Server-side BE022 parity for substitution decisions.
 * A candidate is only eligible when every active restriction can be resolved
 * from complete declarations. Positive-only restrictions never infer safety
 * from absence.
 */

const RESTRICTION_RULES = {
  egg: { resolution: "declaration", aliases: ["egg", "eggs", "albumen", "ovalbumin", "lysozyme", "ovo", "ovum", "meringue", "mayonnaise"] },
  soy: { resolution: "declaration", aliases: ["soy", "soya", "soybean", "soybeans", "tofu", "edamame", "miso", "tempeh"] },
  garlic: { resolution: "positive-only", aliases: ["garlic", "garlic powder"] },
  mustard: { resolution: "declaration", aliases: ["mustard", "mustard powder", "mustard seed", "mustard seeds"] },
  seafood: { resolution: "declaration", aliases: ["seafood", "fish", "fishes", "salmon", "tuna", "sardine", "sardines", "anchovy", "anchovies", "cod", "haddock", "basa", "hoki", "fish oil", "fish sauce", "crustacea", "crustacean", "crustaceans", "shellfish", "crab", "crabs", "prawn", "prawns", "shrimp", "shrimps", "lobster", "lobsters", "crayfish", "krill", "yabby", "mollusc", "molluscs", "mollusk", "mollusks", "oyster", "oysters", "mussel", "mussels", "clam", "clams", "scallop", "scallops", "squid", "octopus", "abalone"] },
  "tree nuts": { resolution: "declaration", aliases: ["tree nut", "tree nuts", "nuts", "hazelnut", "hazelnuts", "cashew", "cashews", "cashew nuts", "pistachio", "pistachios", "macadamia", "macadamias", "walnut", "walnuts", "almond", "almonds", "brazil nut", "brazil nuts", "pecan", "pecans", "chestnut", "chestnuts", "pine nut", "pine nuts"] },
  peanuts: { resolution: "declaration", aliases: ["peanut", "peanuts", "groundnut", "groundnuts", "monkey nut", "arachis"] },
  gluten: { resolution: "declaration", aliases: ["gluten", "wheat", "barley", "rye", "oat", "oats", "triticale", "spelt", "semolina", "couscous", "malt", "contains cereals containing gluten", "gluten containing cereals", "wheaten", "wheat gluten", "oat bran", "rolled barley"] },
  lactose: { resolution: "positive-only", aliases: ["lactose", "milk", "dairy", "casein", "whey", "butter", "cream", "cheese", "yoghurt", "yogurt", "milk powder", "milk solids", "butterfat", "lactic culture"] },
  caffeine: { resolution: "positive-only", aliases: ["caffeine", "guarana", "guarana extract", "coffee", "mate"] },
  fructose: { resolution: "positive-only", aliases: ["fructose", "fructose syrup"] },
  glucose: { resolution: "positive-only", aliases: ["glucose", "glucose syrup"] },
  histamine: { resolution: "positive-only", aliases: ["histamine"] },
  "low-fodmap": { resolution: "positive-only", aliases: ["low fodmap"] },
  sorbitol: { resolution: "positive-only", aliases: ["sorbitol", "polyol", "e420"] },
  salicylate: { resolution: "positive-only", aliases: ["salicylate", "salicylates"] },
  milk: { resolution: "declaration", aliases: ["milk", "dairy", "casein", "whey", "butter", "cream", "cheese", "yoghurt", "yogurt"] },
  fish: { resolution: "declaration", aliases: ["fish", "fishes", "salmon", "tuna", "sardine", "sardines", "anchovy", "anchovies", "cod", "haddock", "basa", "hoki"] },
  crustacea: { resolution: "declaration", aliases: ["crustacea", "crustacean", "crustaceans", "crab", "prawn", "prawns", "shrimp", "lobster", "crayfish", "krill", "yabby"] },
  molluscs: { resolution: "declaration", aliases: ["mollusc", "molluscs", "mollusk", "mollusks", "oyster", "mussel", "clam", "scallop", "squid", "octopus", "abalone"] }
};

function list(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/^([a-z]{2,3}):/, "").replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function containsAlias(evidence, alias) {
  const actual = normalize(evidence);
  const expected = normalize(alias);
  return Boolean(expected) && (`-${actual}-`).includes(`-${expected}-`);
}

function productEvidence(product) {
  return [...new Set([
    ...list(product?.allergens),
    ...list(product?.traces),
    ...list(product?.tracesFromIngredients),
    ...list(product?.ingredients),
    ...list(product?.ingredientsText)
  ].map(normalize).filter(Boolean))];
}

function assessAllergenSafety(product, restrictions) {
  const requested = [...new Set(list(restrictions))];
  const evidence = productEvidence(product);
  const matched = requested.filter((restriction) => {
    const rule = RESTRICTION_RULES[restriction.toLowerCase()];
    return rule && rule.aliases.some((alias) => evidence.some((item) => containsAlias(item, alias)));
  });

  if (matched.length) return { status: "unsafe", matchedAllergens: matched };
  if (!requested.length) return { status: "safe", matchedAllergens: [] };

  const unsupported = requested.some((restriction) => {
    const rule = RESTRICTION_RULES[restriction.toLowerCase()];
    return !rule || rule.resolution !== "declaration";
  });
  const declarationsComplete = Array.isArray(product?.allergens) && product.allergens.length > 0 &&
    typeof product?.traces === "string" && product.traces.trim().length > 0;

  return unsupported || !declarationsComplete
    ? { status: "unknown", matchedAllergens: [] }
    : { status: "safe", matchedAllergens: [] };
}

module.exports = { RESTRICTION_RULES, assessAllergenSafety, list, normalize };
