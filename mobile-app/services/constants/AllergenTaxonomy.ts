export type RestrictionResolution = "declaration" | "positive-only";

export interface RestrictionRule {
  aliases: readonly string[];
  resolution: RestrictionResolution;
}

/**
 * Canonical profile-to-product evidence mapping.
 *
 * `declaration` restrictions may resolve safe when the product's allergen and
 * trace declarations are complete. `positive-only` restrictions can identify
 * a conflict from explicit ingredient evidence, but absence is not proof of
 * safety and therefore resolves to unknown.
 */
export const RESTRICTION_RULES: Readonly<Record<string, RestrictionRule>> = {
  Egg: {
    resolution: "declaration",
    aliases: [
      "egg", "eggs", "albumen", "ovalbumin", "lysozyme", "ovo", "ovum",
      "meringue", "mayonnaise",
    ],
  },
  Soy: {
    resolution: "declaration",
    aliases: ["soy", "soya", "soybean", "soybeans", "tofu", "edamame", "miso", "tempeh", "大豆"],
  },
  Garlic: {
    resolution: "positive-only",
    aliases: ["garlic", "garlic powder"],
  },
  Mustard: {
    resolution: "declaration",
    aliases: ["mustard", "mustard powder", "mustard seed", "mustard seeds"],
  },
  Seafood: {
    resolution: "declaration",
    aliases: [
      "seafood",
      "fish", "fishes", "salmon", "tuna", "sardine", "sardines", "anchovy", "anchovies",
      "cod", "haddock", "basa", "hoki", "fish oil", "fish sauce",
      "crustacea", "crustacean", "crustaceans", "shellfish", "crab", "crabs", "prawn",
      "prawns", "shrimp", "shrimps", "lobster", "lobsters", "crayfish", "krill", "yabby",
      "mollusc", "molluscs", "mollusk", "mollusks", "oyster", "oysters", "mussel",
      "mussels", "clam", "clams", "scallop", "scallops", "squid", "octopus", "abalone",
    ],
  },
  "Tree Nuts": {
    resolution: "declaration",
    aliases: [
      "tree nut", "tree nuts", "nuts", "hazelnut", "hazelnuts", "cashew", "cashews",
      "cashew nuts", "pistachio", "pistachios", "macadamia", "macadamias", "walnut",
      "walnuts", "almond", "almonds", "brazil nut", "brazil nuts", "pecan", "pecans",
      "chestnut", "chestnuts", "pine nut", "pine nuts",
    ],
  },
  Peanuts: {
    resolution: "declaration",
    aliases: ["peanut", "peanuts", "groundnut", "groundnuts", "monkey nut", "arachis"],
  },
  Gluten: {
    resolution: "declaration",
    aliases: [
      "gluten", "wheat", "barley", "rye", "oat", "oats", "triticale", "spelt",
      "semolina", "couscous", "malt", "contains cereals containing gluten",
      "gluten containing cereals", "wheaten", "wheat gluten", "weizenmehl",
      "小麦", "oat bran", "rolled barley", "avoine",
    ],
  },
  Lactose: {
    resolution: "positive-only",
    aliases: [
      "lactose", "milk", "dairy", "casein", "whey", "butter", "cream", "cheese",
      "yoghurt", "yogurt", "milk powder", "milk solids", "lait", "magermilchpulver",
      "magemilchpulver", "butterfat", "lactic culture", "edamer", "kase",
    ],
  },
  Caffeine: {
    resolution: "positive-only",
    aliases: ["caffeine", "guarana", "guarana extract", "coffee", "mate"],
  },
  Fructose: {
    resolution: "positive-only",
    aliases: ["fructose", "fructose syrup"],
  },
  Glucose: {
    resolution: "positive-only",
    aliases: ["glucose", "glucose syrup"],
  },
  Histamine: {
    resolution: "positive-only",
    aliases: ["histamine"],
  },
  "Low-FODMAP": {
    resolution: "positive-only",
    aliases: ["low fodmap"],
  },
  Sorbitol: {
    resolution: "positive-only",
    aliases: ["sorbitol", "polyol", "e420"],
  },
  Salicylate: {
    resolution: "positive-only",
    aliases: ["salicylate", "salicylates"],
  },

  // Legacy/canonical values that may already exist in stored profiles.
  Milk: {
    resolution: "declaration",
    aliases: ["milk", "dairy", "casein", "whey", "butter", "cream", "cheese", "yoghurt", "yogurt"],
  },
  Fish: {
    resolution: "declaration",
    aliases: ["fish", "fishes", "salmon", "tuna", "sardine", "sardines", "anchovy", "anchovies", "cod", "haddock", "basa", "hoki"],
  },
  Crustacea: {
    resolution: "declaration",
    aliases: ["crustacea", "crustacean", "crustaceans", "crab", "prawn", "prawns", "shrimp", "lobster", "crayfish", "krill", "yabby"],
  },
  Molluscs: {
    resolution: "declaration",
    aliases: ["mollusc", "molluscs", "mollusk", "mollusks", "oyster", "mussel", "clam", "scallop", "squid", "octopus", "abalone"],
  },
};

export function findRestrictionRule(value: string): RestrictionRule | undefined {
  const normalized = value.trim().toLowerCase();
  const entry = Object.entries(RESTRICTION_RULES).find(
    ([label]) => label.toLowerCase() === normalized
  );
  return entry?.[1];
}
