const NUTRITION_LIMITS = {
  sugarHighG: 20
};

const SEVERITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3
};

const PIPELINE_VERSION = "1.4.0";

// Simple in-memory cache for repeated evaluations
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
    allergies: safeUserProfile.allergies || [],
    avoidAdditives: safeUserProfile.avoidAdditives || [],
    dietPreferences: safeUserProfile.dietPreferences || [],
    allergiesSet: new Set(
      (safeUserProfile.allergies || []).map((item) => item.toLowerCase())
    ),
    avoidAdditivesSet: new Set(
      (safeUserProfile.avoidAdditives || []).map((item) => item.toLowerCase())
    ),
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
  return JSON.stringify({
    barcode: cleaned.barcode,
    ingredients: cleaned.ingredients,
    additives: cleaned.additives,
    nutrition: cleaned.nutrition,
    allergies: processedUserProfile.allergies,
    avoidAdditives: processedUserProfile.avoidAdditives,
    dietPreferences: processedUserProfile.dietPreferences
  });
}

function containsMatchingValue(setValues, candidates) {
  for (const value of setValues) {
    for (const candidate of candidates) {
      if (value.includes(candidate) || candidate.includes(value)) {
        return candidate;
      }
    }
  }
  return null;
}

function getWarnings(cleaned, processedUserProfile, productSets) {
  const warnings = [];
  const nutrition = cleaned.nutrition || {};

  const nonVeganList = [
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

  const glutenSources = ["wheat", "barley", "rye", "malt"];

  const matchedAllergen = containsMatchingValue(
    productSets.ingredientSet,
    [...processedUserProfile.allergiesSet]
  );

  if (matchedAllergen) {
    warnings.push({
      type: "allergen",
      code: `ALLERGEN_${matchedAllergen.toUpperCase()}`,
      message: `Contains ${matchedAllergen}`,
      severity: "high"
    });
  }

  const matchedAdditive = containsMatchingValue(
    productSets.additiveSet,
    [...processedUserProfile.avoidAdditivesSet]
  );

  if (matchedAdditive) {
    warnings.push({
      type: "additive",
      code: `ADDITIVE_${matchedAdditive}`,
      message: `Contains additive ${matchedAdditive}, which you prefer to avoid`,
      severity: "medium"
    });
  }

  if (processedUserProfile.dietPreferencesSet.has("vegan")) {
    const hasNonVeganIngredient = containsMatchingValue(
      productSets.ingredientSet,
      nonVeganList
    );

    if (hasNonVeganIngredient) {
      warnings.push({
        type: "diet",
        code: "DIET_VEGAN_UNSUITABLE",
        message: "Not suitable for a vegan diet",
        severity: "medium"
      });
    }
  }

  if (processedUserProfile.dietPreferencesSet.has("glutenFree")) {
    const hasGluten = containsMatchingValue(
      productSets.ingredientSet,
      glutenSources
    );

    if (hasGluten) {
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
  const hasHigh = warnings.some((w) => w.severity === "high");
  const hasMedium = warnings.some((w) => w.severity === "medium");

  if (hasHigh) return "red";
  if (hasMedium) return "grey";
  return "green";
}

function calculateRiskScore(warnings) {
  if (!warnings.length) return 0;

  const total = warnings.reduce((sum, w) => {
    return sum + (SEVERITY_WEIGHTS[w.severity] || 1);
  }, 0);

  return Math.min(100, total * 20);
}

function calculateRecommendationScore(cleaned, processedUserProfile, warnings, productSets) {
  let score = 100;
  const nutrition = cleaned.nutrition || {};

  const nonVeganList = [
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

  const glutenSources = ["wheat", "barley", "rye", "malt"];

  warnings.forEach((warning) => {
    score -= (SEVERITY_WEIGHTS[warning.severity] || 1) * 15;
  });

  if (processedUserProfile.dietPreferencesSet.has("vegan")) {
    const hasNonVeganIngredient = containsMatchingValue(
      productSets.ingredientSet,
      nonVeganList
    );

    if (!hasNonVeganIngredient) {
      score += 10;
    }
  }

  if (processedUserProfile.dietPreferencesSet.has("glutenFree")) {
    const hasGluten = containsMatchingValue(
      productSets.ingredientSet,
      glutenSources
    );

    if (!hasGluten) {
      score += 10;
    }
  }

  if (typeof nutrition.sugarG === "number" && nutrition.sugarG <= 5) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function getAlternatives(cleaned, classification, processedUserProfile) {
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

  if (classification === "green") {
    return filtered.slice(0, 2);
  }

  return filtered;
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

  const productSets = buildProductLookupSets(cleaned);
  const warnings = getWarnings(cleaned, processedUserProfile, productSets);
  const classification = classifyProduct(warnings);
  const riskScore = calculateRiskScore(warnings);
  const recommendationScore = calculateRecommendationScore(
    cleaned,
    processedUserProfile,
    warnings,
    productSets
  );

  const alternatives = getAlternatives(
    cleaned,
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
      reasons: warnings.map((w) => w.message),
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

  recommendationCache.set(cacheKey, result);
  return result;
}

module.exports = {
  cleanData,
  buildProcessedUserProfile,
  buildProductLookupSets,
  createCacheKey,
  containsMatchingValue,
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

  console.log("Structured Scan Result:");
  console.log(JSON.stringify(buildScanResult(testRaw, testUser), null, 2));

  console.log("\nRunning same input again to test cache:");
  console.log(JSON.stringify(buildScanResult(testRaw, testUser), null, 2));
}