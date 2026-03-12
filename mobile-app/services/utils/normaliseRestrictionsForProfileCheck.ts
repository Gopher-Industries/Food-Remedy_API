/**
 * Frontend-only mapper to collapse our raw data (from Open Food Facts) tags into our
 * app retriction (allergen, introlerence, additives, etc) buckets
 */
// 

import { ADDITIVES, ALLERGIES, INTOLERANCES } from "../constants/NutritionalTags";

export type SimpleProduct = {
  allergens: string[];
  traces: string[];
  additives: string[];
  ingredientAnalysis?: string[];
};

export type NormalisedForCheck = {
  allergens: string[];     // values come from ALLERGIES constants
  additives: string[];     // values come from ADDITIVES constants
  intolerances: string[];  // values come from INTOLERANCES constants

  // for debugging or chips if you want
  _matched: {
    rawAllergenHits: Record<string, string[]>;
    rawAdditiveHits: Record<string, string[]>;
    rawIntoleranceHits: Record<string, string[]>;
  };
};

type AllergenLabel = typeof ALLERGIES[number];
type AdditiveLabel = typeof ADDITIVES[number];
type IntoleranceLabel = typeof INTOLERANCES[number];

// --------------- basics ---------------
const norm = (s: string) =>
  (s || "")
    .trim()
    .toLowerCase()
    .replace(/^([a-z]{2,3}):/, "")      // drop lang prefix if any slipped through
    .replace(/\s+/g, "-");

const uniqPreserve = <T>(arr: T[]) => Array.from(new Set(arr));

const has = (tag: string, needles: (string | RegExp)[]) =>
  needles.some(n => (typeof n === "string" ? tag.includes(n) : n.test(tag)));

// --------------- allergen lexicon ---------------
// Order matters. We resolve Peanuts before Tree Nuts to avoid double counting.
const ALLERGEN_RULES: { label: AllergenLabel; needles: (string | RegExp)[] }[] = [
  // Peanuts
  { label: "Peanuts", needles: ["peanut", "peanuts", "groundnut"] },
  // Egg
  { label: "Egg", needles: ["egg", "eggs", "albumen", "ovalbumin", "lysozyme"] },
  // Soy
  { label: "Soy", needles: ["soy", "soya", "soybean", "soybeans", "tofu", /大.?豆/] },
  // Garlic
  { label: "Garlic", needles: ["garlic"] },
  // Mustard
  { label: "Mustard", needles: ["mustard"] },
  // Seafood
  {
    label: "Seafood",
    needles: [
      "fish", "crustacea", "crustaceans", "prawn", "shrimp", "mollusc", "molluscs",
      "oyster", "hoki", "anchovy", "anchovies"
    ]
  },
  // Tree Nuts
  {
    label: "Tree Nuts",
    needles: [
      "tree-nuts", "nut-tree", "nuts", "hazelnut", "hazelnuts",
      "cashew", "cashew-nuts", "pistach", "macadamia", "walnut", "wallnuts",
      "almond", "brazil-nut", "pecan", "chestnut"
    ]
  },
];

// --------------- intolerance lexicon ---------------
const INTOLERANCE_RULES: { label: IntoleranceLabel; needles: (string | RegExp)[]; fromENumbers?: (n: number) => boolean }[] = [
  // Gluten and cereals
  {
    label: "Gluten",
    needles: [
      "gluten", "contains-cereals-containing-gluten", "gluten-containing-cereals",
      "wheat", "wheaten", "wheat-gluten", "weizenmehl", /小.?麦/, // jp/zh for wheat
      "barley", "rye", "spelt", "triticale",
      "oat", "oats", "oat-bran", "rolled-barley", "avoine" // FR oats
    ]
  },
  // Lactose and dairy signals
  {
    label: "Lactose",
    needles: [
      "milk", "contains-milk", "lait", "magemilchpulver", "butterfat", "lactic-culture",
      "milk-solids", "cheese", "edamer", "kase", "cream", "yoghurt", "yogurt"
    ]
  },
  // Caffeine
  { label: "Caffeine", needles: ["caffeine", "guarana", "guarana-extract", "coffee", "mate"] },
  // Glucose
  { label: "Glucose", needles: ["glucose", "glucose-syrup"] },
  // Sorbitol from tag or E420
  {
    label: "Sorbitol",
    needles: ["sorbitol", "polyol"],
    fromENumbers: (n) => n === 420
  },
  // Fructose only if explicit
  { label: "Fructose", needles: ["fructose"] },
  // Histamine and Salicylate are hard to infer reliably from OFF tags, leave to explicit tags if present
  { label: "Histamine", needles: ["histamine"] },
  { label: "Salicylate", needles: ["salicylate", "salicylates"] },
  // Low-FODMAP cannot be auto-inferred, only respect explicit tag
  { label: "Low-FODMAP", needles: ["low-fodmap"] },
];

// --------------- additive classification ---------------

function parseENumber(s: string): number | null {
  const m = s.toLowerCase().match(/\b(?:e\s*[-\s]?)?(\d{3,4})[a-z]?\b/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function addAdditiveByENum(n: number, out: Set<AdditiveLabel>) {
  if (n >= 100 && n <= 199) out.add("Food Dye");
  if ((n >= 338 && n <= 343) || (n >= 450 && n <= 459)) out.add("Artificial Phosphates");
  if (n >= 600 && n <= 699) out.add("Flavour Enhancers");
  if (n >= 950 && n <= 969) out.add("Sweeteners");
}

const ADDITIVE_WORD_RULES: { label: AdditiveLabel; needles: (string | RegExp)[] }[] = [
  { label: "Food Dye", needles: ["colour", "color", "caramel"] }, // e.g. caramel-e150d
  { label: "Flavour Enhancers", needles: ["glutamate", "msg", "guanylate", "inosinate"] },
  { label: "Artificial Phosphates", needles: ["phosphate", "phosphates"] },
  { label: "Sweeteners", needles: ["sweetener", "aspartame", "acesulfame", "sucralose", "steviol", "stevia", "neotame"] },
  { label: "Palm Oil", needles: ["palm", "palm-oil", "palm-kernel", "palmitate"] },
  { label: "Yeast", needles: ["yeast", "yeast-extract"] },
];

// Some garbage terms in sample that we should ignore
const NOISE = new Set([
  "nil", "none", "none-specified", "not-indicated", "water", "fibre", "flour",
  "emulsifier", "emulsifiers", "flavours", "expired-cocaine"
]);




/**
 * Normalise Restrictions For Profile Check
 * @param product 
 * @returns 
 */
export function normaliseRetrictionsForProfileCheck(product: SimpleProduct): NormalisedForCheck {
  const raw = uniqPreserve([
    ...(product.allergens || []),
    ...(product.traces || []),
  ]).map(norm).filter(Boolean);

  const addTags = uniqPreserve(product.additives || []).map(norm).filter(Boolean);

  const allergenHits = new Set<AllergenLabel>();
  const allergenDebug: Record<string, string[]> = {};
  for (const tag of raw) {
    if (NOISE.has(tag)) continue;
    for (const rule of ALLERGEN_RULES) {
      if (has(tag, rule.needles)) {
        allergenHits.add(rule.label);
        (allergenDebug[rule.label] ||= []).push(tag);
        break; // avoid double assignment
      }
    }
  }

  const additiveHits = new Set<AdditiveLabel>();
  const additiveDebug: Record<string, string[]> = {};
  for (const tag of addTags) {
    if (NOISE.has(tag)) continue;
    // E-number route
    const e = parseENumber(tag);
    if (e !== null) {
      const before = new Set(additiveHits);
      addAdditiveByENum(e, additiveHits);
      for (const lab of additiveHits) {
        if (!before.has(lab)) (additiveDebug[lab] ||= []).push(tag);
      }
    }
    // word route
    for (const rule of ADDITIVE_WORD_RULES) {
      if (has(tag, rule.needles)) {
        additiveHits.add(rule.label);
        (additiveDebug[rule.label] ||= []).push(tag);
      }
    }
  }

  // e420 is both a sweetener and a Sorbitol intolerance trigger
  if (addTags.some(t => parseENumber(t) === 420 || t.includes("sorbitol"))) {
    additiveHits.add("Sweeteners");
  }

  // intolerances from raw and additives
  const intoleranceHits = new Set<IntoleranceLabel>();
  const intoleranceDebug: Record<string, string[]> = {};

  const checkAgainst = [...raw, ...addTags];
  for (const tag of checkAgainst) {
    if (NOISE.has(tag)) continue;
    // by words
    for (const rule of INTOLERANCE_RULES) {
      if (has(tag, rule.needles)) {
        intoleranceHits.add(rule.label);
        (intoleranceDebug[rule.label] ||= []).push(tag);
      }
    }
    // by E-number
    const en = parseENumber(tag);
    if (en !== null) {
      for (const rule of INTOLERANCE_RULES) {
        if (rule.fromENumbers && rule.fromENumbers(en)) {
          intoleranceHits.add(rule.label);
          (intoleranceDebug[rule.label] ||= []).push(`e${en}`);
        }
      }
    }
    // phenylalanine often signals aspartame warning on labels
    if (tag.includes("phenylalanine")) {
      additiveHits.add("Sweeteners");
      (additiveDebug["Sweeteners"] ||= []).push(tag);
    }
  }

  return {
    allergens: Array.from(allergenHits),
    additives: Array.from(additiveHits),
    intolerances: Array.from(intoleranceHits),
    _matched: {
      rawAllergenHits: allergenDebug,
      rawAdditiveHits: additiveDebug,
      rawIntoleranceHits: intoleranceDebug,
    }
  };
}
