const NUTRITION_LIMITS = {
  sugarHighG: 20
};

const SEVERITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3
};

const PIPELINE_VERSION = "1.4.1";
const CACHE_LIMIT = 50;

const NON_VEGAN_INGREDIENTS = [
  "milk",
  "egg",
  "honey",
  "gelatin",
  "cheese",
  "butter",
  "cream",
  "whey",
  "casein"
];

const GLUTEN_SOURCES = ["wheat", "barley", "rye", "malt"];

const recommendationCache = new Map();

function cleanData(raw) {
  const normalizeList = (text) =>
    text
      ? text
          .toLowerCase()
          .split(/[,;().]/)
          .map((i) => i.trim())
          .filter(Boolean)
      : [];

  return {
    barcode: raw?.barcode?.toString().trim() || "",
    name: raw?.productName?.trim() || raw?.name?.trim() || "Unknown product",
    ingredients: normalizeList(raw?.ingredientsText || raw?.ingredients),
    additives: normalizeList(raw?.additivesText || raw?.additives),
    nutrition: raw?.nutrition || {}
  };
}

function buildProcessedUserProfile(userProfile) {
  const safeUserProfile = userProfile || {};

  return {
    id: safeUserProfile.id || null,
    allergies: (safeUserProfile.allergies || []).map((item) =>
      item.toLowerCase()
    ),
    avoidAdditives: (safeUserProfile.avoidAdditives || []).map((item) =>
      item.toLowerCase()
    ),
    dietPreferences: safeUserProfile.dietPreferences || [],
    dietPreferencesSet: new Set(safeUserProfile.dietPreferences || [])
  };
}

function buildProductLookupSets(cleaned) {
  return {
    ingredientSet: new Set(cleaned.ingredients || []),
    additiveSet: new Set(cleaned.additives || [])
  };
}

function createCacheKey(cleaned, processedUserProfile) {
  const barcode = cleaned.barcode || "no-barcode";
  const userId = processedUserProfile.id || "anonymous";
  return `${barcode}_${userId}`;
}

function hasIngredientMatch(ingredients, targets) {
  return ingredients.some((ingredient) =>
    targets.some((target) => ingredient.includes(target))
  );
}

function hasAdditiveMatch(additives, targets) {
  return additives.some((additive) =>
    targets.some((target) => additive.includes(target))
  );
}

function getWarnings(cleaned, processedUserProfile) {
  const warnings = [];
  const ingredients = cleaned.ingredients || [];
  const additives = cleaned.additives || [];
  const nutrition = cleaned.nutrition || {};

  processedUserProfile.allergies.forEach((allergen) => {
    if (ingredients.some((ingredient) => ingredient.includes(allergen))) {
      warnings.push({
        type: "allergen",
        code: `ALLERGEN_${allergen.toUpperCase()}`,
        message: `Contains ${allergen}`,
        severity: "high"
      });
    }
  });

  processedUserProfile.avoidAdditives.forEach((additive) => {
    if (additives.some((item) => item.includes(additive))) {
      warnings.push({
        type: "additive",
        code: `ADDITIVE_${additive}`,
        message: `Contains additive ${additive}, which you prefer to avoid`,
        severity: "medium"
      });
    }
  });

  if (processedUserProfile.dietPreferencesSet.has("vegan")) {
    if (hasIngredientMatch(ingredients, NON_VEGAN_INGREDIENTS)) {
      warnings.push({
        type: "diet",
        code: "DIET_VEGAN_UNSUITABLE",
        message: "Not suitable for a vegan diet",
        severity: "medium"
      });
    }
  }

  if (processedUserProfile.dietPreferencesSet.has("glutenFree")) {
    if (hasIngredientMatch(ingredients, GLUTEN_SOURCES)) {
      warnings.push({
        type: "diet",
        code: "DIET_GLUTEN_UNSUITABLE",
        message: "Contains gluten sources (not suitable for a gluten-free diet)",
        severity: "medium"
      });
    }
  }

  if (
    typeof nutrition.sugarG === "number" &&
    nutrition.sugarG > NUTRITION_LIMITS.sugarHighG
  ) {
    warnings.push({
      type: "nutrition",
      code: "HIGH_SUGAR",
      message: `High sugar content (> ${NUTRITION_LIMITS.sugarHighG}g per serving)`,
      severity: "medium"
    });
  }

  return warnings;
}

function classifyProduct(warnings) {
  const hasHigh = warnings.some((warning) => warning.severity === "high");
  const hasMedium = warnings.some((warning) => warning.severity === "medium");

  if (hasHigh) return "red";
  if (hasMedium) return "grey";
  return "green";
}

function calculateRiskScore(warnings) {
  if (!warnings.length) return 0;

  const total = warnings.reduce((sum, warning) => {
    return sum + (SEVERITY_WEIGHTS[warning.severity] || 1);
  }, 0);

  return Math.min(100, total * 20);
}

function calculateRecommendationScore(cleaned, processedUserProfile, warnings) {
  let score = 100;
  const ingredients = cleaned.ingredients || [];
  const nutrition = cleaned.nutrition || {};

  warnings.forEach((warning) => {
    score -= (SEVERITY_WEIGHTS[warning.severity] || 1) * 15;
  });

  if (
    processedUserProfile.dietPreferencesSet.has("vegan") &&
    !hasIngredientMatch(ingredients, NON_VEGAN_INGREDIENTS)
  ) {
    score += 10;
  }

  if (
    processedUserProfile.dietPreferencesSet.has("glutenFree") &&
    !hasIngredientMatch(ingredients, GLUTEN_SOURCES)
  ) {
    score += 10;
  }

  if (typeof nutrition.sugarG === "number" && nutrition.sugarG <= 5) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function getAlternatives(classification, processedUserProfile) {
  const base = [
    {
      name: "Dark Chocolate 85%",
      brand: "Lindt",
      barcode: "99901",
      classification: "green",
      tags: []
    },
    {
      name: "Organic Vegan Chocolate",
      brand: "Loving Earth",
      barcode: "99902",
      classification: "green",
      tags: ["vegan"]
    },
    {
      name: "Cocoa Nibs (Sugar-Free)",
      brand: "HealthyCo",
      barcode: "99903",
      classification: "green",
      tags: ["vegan", "glutenFree", "lowSugar"]
    }
  ];

  let filtered = base;

  if (processedUserProfile.dietPreferencesSet.has("vegan")) {
    filtered = filtered.filter((item) => item.tags.includes("vegan"));
  }

  if (processedUserProfile.dietPreferencesSet.has("glutenFree")) {
    filtered = filtered.filter((item) => item.tags.includes("glutenFree"));
  }

  if (filtered.length === 0) {
    filtered = base;
  }

  return classification === "green" ? filtered.slice(0, 2) : filtered;
}

function generateRecommendationReason(item, processedUserProfile) {
  const reasons = [];
  const tags = item.tags || [];

  if (
    processedUserProfile.dietPreferencesSet.has("vegan") &&
    tags.includes("vegan")
  ) {
    reasons.push("Matches vegan preference");
  }

  if (
    processedUserProfile.dietPreferencesSet.has("glutenFree") &&
    tags.includes("glutenFree")
  ) {
    reasons.push("Matches gluten-free preference");
  }

  if (tags.includes("lowSugar")) {
    reasons.push("Low sugar alternative");
  }

  return reasons.length ? reasons : ["General healthier alternative"];
}

function enforceCacheLimit() {
  if (recommendationCache.size >= CACHE_LIMIT) {
    recommendationCache.clear();
  }
}

function buildScanResult(rawData, userProfile) {
  const cleaned = cleanData(rawData || {});
  const processedUserProfile = buildProcessedUserProfile(userProfile);
  const cacheKey = createCacheKey(cleaned, processedUserProfile);

  if (recommendationCache.has(cacheKey)) {
    const cachedResult = recommendationCache.get(cacheKey);

    return {
      ...cachedResult,
      metadata: {
        ...cachedResult.metadata,
        servedFromCache: true
      }
    };
  }

  const warnings = getWarnings(cleaned, processedUserProfile);
  const classification = classifyProduct(warnings);
  const riskScore = calculateRiskScore(warnings);
  const recommendationScore = calculateRecommendationScore(
    cleaned,
    processedUserProfile,
    warnings
  );

  const alternatives = getAlternatives(
    classification,
    processedUserProfile
  ).map((item) => ({
    ...item,
    reason: generateRecommendationReason(item, processedUserProfile)
  }));

  const result = {
    product: cleaned,
    classification,
    warnings,
    suitability: {
      isSafe: classification !== "red",
      reasons: warnings.map((warning) => warning.message),
      riskScore,
      recommendationScore,
      matchedPreferences: processedUserProfile.dietPreferences
    },
    alternatives,
    metadata: {
      processedAt: new Date().toISOString(),
      pipelineVersion: PIPELINE_VERSION,
      userId: processedUserProfile.id,
      servedFromCache: false
    }
  };

  enforceCacheLimit();
  recommendationCache.set(cacheKey, result);

  return result;
}

module.exports = {
  cleanData,
  buildProcessedUserProfile,
  buildProductLookupSets,
  createCacheKey,
  getWarnings,
  classifyProduct,
  calculateRiskScore,
  calculateRecommendationScore,
  getAlternatives,
  generateRecommendationReason,
  buildScanResult
};

if (require.main === module) {
  const testRaw = {
    barcode: "12345",
    productName: "Milk Chocolate",
    ingredientsText: "Milk, Cocoa, Sugar, Wheat flour",
    additivesText: "621",
    nutrition: { sugarG: 25 }
  };

  const testUser = {
    id: "user-123",
    allergies: ["milk"],
    avoidAdditives: ["621"],
    dietPreferences: ["vegan", "glutenFree"]
  };

  const firstRun = buildScanResult(testRaw, testUser);
  const secondRun = buildScanResult(testRaw, testUser);

  console.log("Structured Scan Result:");
  console.log(JSON.stringify(firstRun, null, 2));

  console.log("\nRunning same input again to test cache:");
  console.log(JSON.stringify(secondRun, null, 2));

  console.log("\nBasic cache check:");
  console.log("First run servedFromCache:", firstRun.metadata.servedFromCache);
  console.log("Second run servedFromCache:", secondRun.metadata.servedFromCache);
}