/**
 * Frontend-only mapper to collapse our raw data (from Open Food Facts) tags into our
 * app retriction (allergen, introlerence, additives, etc) buckets
 */
// 

import { ADDITIVES, ALLERGIES, INTOLERANCES } from "../constants/NutritionalTags";
import { findRestrictionMatches } from "@/services/allergenSafety";

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

  const allergenMatches = findRestrictionMatches(
    { allergens: product.allergens, traces: product.traces.join(",") },
    ALLERGIES
  );
  const allergenHits = new Set<string>(allergenMatches);
  const allergenDebug: Record<string, string[]> = {};
  for (const label of allergenMatches) {
    for (const tag of raw) {
      if (
        findRestrictionMatches({ allergens: [tag] }, [label]).length > 0
      ) {
        (allergenDebug[label] ||= []).push(tag);
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

  // Intolerances use the same canonical matcher as backend and scan flows.
  const intoleranceMatches = findRestrictionMatches(
    {
      allergens: product.allergens,
      traces: product.traces.join(","),
      ingredients: [...(product.ingredientAnalysis || []), ...addTags],
    },
    INTOLERANCES
  );
  const intoleranceHits = new Set<IntoleranceLabel>(
    intoleranceMatches as IntoleranceLabel[]
  );
  const intoleranceDebug: Record<string, string[]> = {};
  for (const label of intoleranceMatches) {
    for (const tag of [
      ...raw,
      ...(product.ingredientAnalysis || []).map(norm),
      ...addTags,
    ]) {
      if (findRestrictionMatches({ ingredients: [tag] }, [label]).length > 0) {
        (intoleranceDebug[label] ||= []).push(tag);
      }
    }
  }

  // E420 remains a structured additive signal for Sorbitol.
  if (addTags.some((tag) => parseENumber(tag) === 420)) {
    intoleranceHits.add("Sorbitol");
    (intoleranceDebug.Sorbitol ||= []).push("e420");
  }

  for (const tag of [...raw, ...addTags]) {
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
