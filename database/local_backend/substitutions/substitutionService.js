const { randomUUID } = require("crypto");
const { assessAllergenSafety, list, normalize } = require("./allergenSafety");
const { createProductCatalog, specificCategoryKeys } = require("./productCatalog");

const CONTRACT_VERSION = "1.0";
const ALGORITHM_VERSION = "be033-v1";
const MAX_LIMIT = 10;
const MAX_CANDIDATES = 60;

const EMPTY_MESSAGES = {
  SOURCE_PRODUCT_NOT_FOUND: "The scanned product is not available in the substitution catalogue.",
  INSUFFICIENT_CATEGORY_DATA: "This product does not have enough category data to identify relevant substitutes.",
  NO_RELEVANT_CANDIDATES: "No products in a sufficiently similar category are currently available.",
  INSUFFICIENT_SAFETY_DATA: "Candidate safety data is incomplete, so no substitute can be recommended safely.",
  NO_SAFE_SUBSTITUTES: "No relevant candidate satisfies all active profile constraints."
};

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeProfile(profile = {}) {
  const dietary = unique([
    ...list(profile.dietaryForm),
    ...list(profile.dietPreferences),
    ...list(profile.preferences?.dietaryForm)
  ]).map(normalize);
  const allergens = unique([
    ...list(profile.allergies),
    ...list(profile.intolerances),
    ...list(profile.avoidAllergens),
    ...list(profile.preferences?.avoidAllergens),
    ...(dietary.includes("gluten-free") || dietary.includes("glutenfree") ? ["Gluten"] : [])
  ]);
  const additives = unique([
    ...list(profile.additives),
    ...list(profile.avoidAdditives),
    ...list(profile.preferences?.avoidAdditives)
  ]).map(normalize);
  const goals = unique([
    ...list(profile.healthGoal),
    ...list(profile.healthGoals),
    ...list(profile.goals),
    ...list(profile.preferences?.goals)
  ]).map(normalize);
  return { allergens, additives, dietary, goals };
}

function productLabels(product) {
  return unique([
    ...list(product?.labels),
    ...list(product?.ingredientsAnalysis),
    ...list(product?.tags?.final)
  ]).map(normalize);
}

function dietaryAssessment(product, dietary) {
  const labels = productLabels(product);
  const failures = [];
  const matched = [];
  for (const diet of dietary) {
    if (diet === "gluten-free" || diet === "glutenfree") {
      matched.push("gluten-free");
      continue;
    }
    if (diet === "vegan") {
      if (!labels.some((label) => label === "vegan" || label.includes("vegan"))) failures.push(diet);
      else matched.push(diet);
      continue;
    }
    if (diet === "vegetarian") {
      if (!labels.some((label) => label.includes("vegetarian") || label.includes("vegan"))) failures.push(diet);
      else matched.push(diet);
      continue;
    }
    failures.push(diet);
  }
  return { status: failures.length ? "unknown" : "safe", failures, matched };
}

function additiveAssessment(product, avoided) {
  const declared = Array.isArray(product?.additives) ? product.additives.map(normalize) : null;
  if (!avoided.length) return { status: "safe", matched: [] };
  if (!declared) return { status: "unknown", matched: [] };
  const matched = avoided.filter((blocked) => declared.some((actual) => actual === blocked || actual.includes(blocked) || blocked.includes(actual)));
  return { status: matched.length ? "unsafe" : "safe", matched };
}

function nutrient(product, names) {
  const raw = product?.nutriments || {};
  const normalized = product?.nutriments_normalized || {};
  for (const name of names) {
    const value = raw[name] ?? normalized[name];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const NUTRIENTS = {
  energy: ["energy-kcal_100g", "energy_kcal", "energy-kcal"],
  sugar: ["sugars_100g", "sugars_g", "sugars"],
  sodium: ["sodium_100g", "sodium_mg", "sodium"],
  protein: ["proteins_100g", "proteins_g", "proteins"]
};

function lowerIsBetter(original, candidate, key, code, label) {
  const sourceValue = nutrient(original, NUTRIENTS[key]);
  const candidateValue = nutrient(candidate, NUTRIENTS[key]);
  if (sourceValue === null || candidateValue === null || candidateValue >= sourceValue) return null;
  return {
    code,
    message: `${label} than the scanned product based on comparable per-100 g data.`,
    evidence: [`source:${sourceValue}`, `candidate:${candidateValue}`]
  };
}

function higherIsBetter(original, candidate, key, code, label) {
  const sourceValue = nutrient(original, NUTRIENTS[key]);
  const candidateValue = nutrient(candidate, NUTRIENTS[key]);
  if (sourceValue === null || candidateValue === null || candidateValue <= sourceValue) return null;
  return {
    code,
    message: `${label} than the scanned product based on comparable per-100 g data.`,
    evidence: [`source:${sourceValue}`, `candidate:${candidateValue}`]
  };
}

function healthGoalAssessment(original, candidate, goals) {
  const reasons = [];
  const unsupported = [];
  for (const goal of goals) {
    if (["maintenance", "maintain", "balanced-diet"].includes(goal)) continue;
    if (["weight-loss", "weight_loss", "lower-calorie", "lower-energy"].includes(goal)) {
      const energy = lowerIsBetter(original, candidate, "energy", "LOWER_ENERGY_FOR_GOAL", "Lower energy");
      const sugar = lowerIsBetter(original, candidate, "sugar", "LOWER_SUGAR_FOR_GOAL", "Lower sugar");
      if (!energy && !sugar) unsupported.push(goal);
      else reasons.push(...[energy, sugar].filter(Boolean));
      continue;
    }
    if (["muscle-gain", "muscle_gain", "high-protein", "higher-protein"].includes(goal)) {
      const protein = higherIsBetter(original, candidate, "protein", "HIGHER_PROTEIN_FOR_GOAL", "Higher protein");
      if (!protein) unsupported.push(goal);
      else reasons.push(protein);
      continue;
    }
    if (["heart-health", "lower-sodium", "low-sodium"].includes(goal)) {
      const sodium = lowerIsBetter(original, candidate, "sodium", "LOWER_SODIUM_FOR_GOAL", "Lower sodium");
      if (!sodium) unsupported.push(goal);
      else reasons.push(sodium);
      continue;
    }
    if (["lower-sugar", "low-sugar"].includes(goal)) {
      const sugar = lowerIsBetter(original, candidate, "sugar", "LOWER_SUGAR_FOR_GOAL", "Lower sugar");
      if (!sugar) unsupported.push(goal);
      else reasons.push(sugar);
      continue;
    }
    unsupported.push(goal);
  }
  return { status: unsupported.length ? "not-aligned" : "aligned", reasons, unsupported };
}

function reason(code, message, evidence) {
  return { code, message, evidence: unique(evidence) };
}

function sourceProfileConflicts(product, profile) {
  const conflicts = [];
  const allergen = assessAllergenSafety(product, profile.allergens);
  if (allergen.status === "unsafe") {
    conflicts.push(reason("SOURCE_ALLERGEN_CONFLICT", "The scanned product has a declared allergen conflict.", allergen.matchedAllergens));
  }
  const diet = dietaryAssessment(product, profile.dietary);
  if (diet.failures.length) conflicts.push(reason("SOURCE_DIETARY_CONFLICT", "The scanned product lacks evidence for an active dietary requirement.", diet.failures));
  const additives = additiveAssessment(product, profile.additives);
  if (additives.status === "unsafe") conflicts.push(reason("SOURCE_ADDITIVE_CONFLICT", "The scanned product contains an additive selected for avoidance.", additives.matched));
  return conflicts;
}

function imageUrl(product) {
  const images = product?.images || product?.imageURL || {};
  if (typeof images === "string") return images || null;
  if (typeof images?.primary === "string" && /^https?:\/\//.test(images.primary)) return images.primary;
  if (images?.root && images?.primary) return `${String(images.root).replace(/\/$/, "")}/${images.primary}.400.jpg`;
  return null;
}

function emptyResponse({ barcode, source, code, requestId, candidateCount = 0, evaluatedCount = 0 }) {
  return {
    contractVersion: CONTRACT_VERSION,
    status: "empty",
    source: source || { barcode, productName: "", categoryKeys: [], profileConflicts: [] },
    substitutions: [],
    emptyState: { code, message: EMPTY_MESSAGES[code] },
    meta: { requestId, algorithmVersion: ALGORITHM_VERSION, candidateCount, evaluatedCount, returnedCount: 0 }
  };
}

function createSubstitutionService(options = {}) {
  const catalog = options.catalog || createProductCatalog(options.catalogOptions);
  const logger = options.logger || console;
  const maxCandidates = Math.max(1, Math.min(Number(options.maxCandidates) || MAX_CANDIDATES, MAX_CANDIDATES));

  function getSubstitutions({ barcode, profile: rawProfile, limit = 5, requestId = randomUUID() }) {
    const startedAt = Date.now();
    const cleanBarcode = String(barcode || "").trim();
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 5, MAX_LIMIT));
    const profile = normalizeProfile(rawProfile);
    const finishEmpty = ({ source, code, candidateCount = 0, evaluatedCount = 0, exclusions = {} }) => {
      logger.info?.(JSON.stringify({
        event: "substitution.completed",
        requestId,
        barcode: cleanBarcode,
        algorithmVersion: ALGORITHM_VERSION,
        status: "empty",
        emptyReason: code,
        candidateCount,
        evaluatedCount,
        returnedCount: 0,
        exclusions,
        durationMs: Date.now() - startedAt
      }));
      return emptyResponse({ barcode: cleanBarcode, source, code, requestId, candidateCount, evaluatedCount });
    };
    const original = catalog.getProduct(cleanBarcode);
    if (!original) return finishEmpty({ code: "SOURCE_PRODUCT_NOT_FOUND" });

    const categoryKeys = (catalog.specificCategoryKeys || specificCategoryKeys)(original);
    const source = {
      barcode: cleanBarcode,
      productName: String(original.productName || original.name || ""),
      categoryKeys,
      profileConflicts: sourceProfileConflicts(original, profile)
    };
    if (!categoryKeys.length) return finishEmpty({ source, code: "INSUFFICIENT_CATEGORY_DATA" });

    const candidates = catalog.getCandidates(original, maxCandidates);
    if (!candidates.length) return finishEmpty({ source, code: "NO_RELEVANT_CANDIDATES" });

    const exclusions = { allergenConflict: 0, unknownSafety: 0, dietary: 0, additive: 0, healthGoal: 0 };
    const eligible = [];
    for (const entry of candidates.slice(0, maxCandidates)) {
      const candidate = entry.product;
      const allergen = assessAllergenSafety(candidate, profile.allergens);
      if (allergen.status === "unsafe") { exclusions.allergenConflict += 1; continue; }
      if (allergen.status === "unknown") { exclusions.unknownSafety += 1; continue; }

      const diet = dietaryAssessment(candidate, profile.dietary);
      if (diet.status !== "safe") { exclusions.dietary += 1; continue; }
      const additives = additiveAssessment(candidate, profile.additives);
      if (additives.status !== "safe") {
        if (additives.status === "unknown") exclusions.unknownSafety += 1;
        else exclusions.additive += 1;
        continue;
      }
      const goal = healthGoalAssessment(original, candidate, profile.goals);
      if (goal.status !== "aligned") { exclusions.healthGoal += 1; continue; }

      const reasons = [
        reason("CATEGORY_MATCH", "Matches a specific category of the scanned product.", entry.categoryOverlap),
        ...(entry.mapping ? [reason(
          entry.mapping.mappingType === "healthier" ? "DB019_HEALTHIER_PRODUCT" : "DB019_SIMILAR_PRODUCT",
          entry.mapping.mappingType === "healthier" ? "Identified by the DB019 healthier-product mapping." : "Identified by the DB019 similar-product mapping.",
          [`rank:${entry.mapping.rank || "unranked"}`, ...(entry.mapping.similarity == null ? [] : [`similarity:${entry.mapping.similarity}`])]
        )] : []),
        ...(profile.allergens.length ? [reason("ALLERGEN_DECLARATIONS_CHECKED", "No conflict was found in the candidate's complete allergen and trace declarations.", profile.allergens)] : []),
        ...(profile.dietary.length ? [reason("DIETARY_REQUIREMENT_MATCH", "The candidate has evidence for the active dietary requirements.", diet.matched)] : []),
        ...(profile.additives.length ? [reason("ADDITIVE_PREFERENCE_CHECKED", "No selected additive was found in the candidate's additive declaration.", profile.additives)] : []),
        ...goal.reasons
      ];
      const mappingBoost = entry.mapping?.mappingType === "healthier" ? 25 : entry.mapping ? 18 : 0;
      const similarityBoost = Math.round(Math.max(0, Math.min(1, Number(entry.mapping?.similarity) || 0)) * 10);
      const score = Math.min(100, 45 + entry.categoryOverlap.length * 5 + mappingBoost + similarityBoost + goal.reasons.length * 5);
      eligible.push({
        barcode: String(candidate.barcode),
        productName: String(candidate.productName || candidate.name || "Unknown product"),
        brand: candidate.brand ? String(candidate.brand) : null,
        imageUrl: imageUrl(candidate),
        nutriscoreGrade: candidate.nutriscoreGrade ? String(candidate.nutriscoreGrade) : null,
        score,
        reasons
      });
    }

    eligible.sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName) || a.barcode.localeCompare(b.barcode));
    const substitutions = eligible.slice(0, boundedLimit);
    const meta = { requestId, algorithmVersion: ALGORITHM_VERSION, candidateCount: candidates.length, evaluatedCount: Math.min(candidates.length, maxCandidates), returnedCount: substitutions.length };
    const event = { event: "substitution.completed", requestId, barcode: cleanBarcode, ...meta, exclusions, durationMs: Date.now() - startedAt };

    if (!substitutions.length) {
      const code = exclusions.unknownSafety > 0 && exclusions.unknownSafety === candidates.length
        ? "INSUFFICIENT_SAFETY_DATA"
        : "NO_SAFE_SUBSTITUTES";
      return finishEmpty({ source, code, candidateCount: candidates.length, evaluatedCount: meta.evaluatedCount, exclusions });
    }
    logger.info?.(JSON.stringify({ ...event, status: "ok" }));
    return { contractVersion: CONTRACT_VERSION, status: "ok", source, substitutions, meta };
  }

  return { getSubstitutions };
}

module.exports = {
  ALGORITHM_VERSION,
  CONTRACT_VERSION,
  MAX_CANDIDATES,
  MAX_LIMIT,
  createSubstitutionService,
  normalizeProfile,
  dietaryAssessment,
  additiveAssessment,
  healthGoalAssessment
};
