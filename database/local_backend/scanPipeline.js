const config = require("./config");
const { addToQueue } = require("./syncQueue");
const { processQueue, resolveConflict } = require("./syncService");

const {
  getProductByBarcode,
  searchByName
} = require("../pipeline/barcode_mapper");

const PIPELINE_VERSION = config.pipeline.version;

const NUTRITION_LIMITS = {
  sugarHighG: config.pipeline.sugarHighLimit
};

const SEVERITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3
};

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

function getWarnings(cleaned, user) {
  const safeUser = user || {};
  const warnings = [];
  const ingredients = cleaned.ingredients || [];
  const additives = cleaned.additives || [];
  const nutrition = cleaned.nutrition || {};

  if (Array.isArray(safeUser.allergies)) {
    safeUser.allergies.forEach((allergen) => {
      const normalizedAllergen = allergen.toLowerCase();

      if (ingredients.some((i) => i.includes(normalizedAllergen))) {
        warnings.push({
          type: "allergen",
          code: `ALLERGEN_${allergen.toUpperCase()}`,
          message: `Contains ${allergen}`,
          severity: "high"
        });
      }
    });
  }

  if (Array.isArray(safeUser.avoidAdditives)) {
    safeUser.avoidAdditives.forEach((additive) => {
      const normalizedAdditive = additive.toLowerCase();

      if (additives.some((a) => a.includes(normalizedAdditive))) {
        warnings.push({
          type: "additive",
          code: `ADDITIVE_${additive}`,
          message: `Contains additive ${additive}, which you prefer to avoid`,
          severity: "medium"
        });
      }
    });
  }

  if (safeUser.dietPreferences?.includes("vegan")) {
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

    const hasNonVeganIngredient = ingredients.some((ing) =>
      nonVeganList.some((blocked) => ing.includes(blocked))
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

  if (safeUser.dietPreferences?.includes("glutenFree")) {
    const glutenSources = ["wheat", "barley", "rye", "malt"];

    const hasGluten = ingredients.some((ing) =>
      glutenSources.some((src) => ing.includes(src))
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

function calculateRecommendationScore(cleaned, userProfile, warnings) {
  const safeUserProfile = userProfile || {};
  let score = 100;

  const ingredients = cleaned.ingredients || [];
  const nutrition = cleaned.nutrition || {};

  warnings.forEach((warning) => {
    score -= (SEVERITY_WEIGHTS[warning.severity] || 1) * 15;
  });

  if (safeUserProfile.dietPreferences?.includes("vegan")) {
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

    const hasNonVeganIngredient = ingredients.some((ing) =>
      nonVeganList.some((blocked) => ing.includes(blocked))
    );

    if (!hasNonVeganIngredient) {
      score += 10;
    }
  }

  if (safeUserProfile.dietPreferences?.includes("glutenFree")) {
    const glutenSources = ["wheat", "barley", "rye", "malt"];

    const hasGluten = ingredients.some((ing) =>
      glutenSources.some((src) => ing.includes(src))
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

function getAlternatives(cleaned, classification, userProfile) {
  const safeUserProfile = userProfile || {};

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

  if (safeUserProfile.dietPreferences?.includes("vegan")) {
    filtered = filtered.filter((item) => item.tags.includes("vegan"));
  }

  if (safeUserProfile.dietPreferences?.includes("glutenFree")) {
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

function generateRecommendationReason(item, userProfile) {
  const safeUserProfile = userProfile || {};
  const reasons = [];
  const tags = item.tags || [];

  if (
    safeUserProfile.dietPreferences?.includes("vegan") &&
    tags.includes("vegan")
  ) {
    reasons.push("Matches vegan preference");
  }

  if (
    safeUserProfile.dietPreferences?.includes("glutenFree") &&
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
  const safeUserProfile = userProfile || {};
  const cleaned = cleanData(rawData || {});

  // ===============================
  // DB036 - BARCODE MAPPING LOGIC
  // ===============================
  let enrichedProduct = null;
  let lookupMethod = "none";

  if (cleaned.barcode) {
    enrichedProduct = getProductByBarcode(cleaned.barcode);
    if (enrichedProduct) {
      lookupMethod = "barcode";
    }
  }

  // fallback if barcode not found
  if (!enrichedProduct && cleaned.name) {
    enrichedProduct = searchByName(cleaned.name);
    if (enrichedProduct) {
      lookupMethod = "name_fallback";
    }
  }

  const warnings = getWarnings(cleaned, safeUserProfile);
  const classification = classifyProduct(warnings);
  const riskScore = calculateRiskScore(warnings);
  const recommendationScore = calculateRecommendationScore(
    cleaned,
    safeUserProfile,
    warnings
  );

  const alternatives = getAlternatives(
    cleaned,
    classification,
    safeUserProfile
  ).map((item) => ({
    ...item,
    reason: generateRecommendationReason(item, safeUserProfile)
  }));

  return {
    product: cleaned,

    // DB036 ADDITION
    enrichedProduct: enrichedProduct || null,

    // optional debug/trace info
    lookup: {
      found: !!enrichedProduct,
      method: lookupMethod
    },

    classification,
    warnings,

    suitability: {
      isSafe: classification !== "red",
      reasons: warnings.map((w) => w.message),
      riskScore,
      recommendationScore,
      matchedPreferences: safeUserProfile.dietPreferences || []
    },

    alternatives,

    metadata: {
      processedAt: new Date().toISOString(),
      pipelineVersion: PIPELINE_VERSION,
      userId: safeUserProfile.id || null
    }
  };
}

function mergeScanResultWithRemote(localResult, remoteResult) {
  const resolved = resolveConflict(
    {
      ...localResult,
      updatedAt: localResult?.metadata?.processedAt
    },
    {
      ...remoteResult,
      updatedAt: remoteResult?.metadata?.processedAt
    }
  );

  return {
    mergedResult: resolved.resolved,
    strategy: resolved.strategy
  };
}

function saveScanResult(result) {
  try {
    throw new Error("Simulated network interruption");

    return {
      saved: true,
      queued: false,
      message: "Saved successfully"
    };
  } catch (error) {
    const queuedAction = {
      type: "SCAN_RESULT_SYNC",
      data: result,
      updatedAt: new Date().toISOString(),
      syncSource: "scanPipeline",
      priority: "normal"
    };

    addToQueue(queuedAction);

    console.log("Sync interrupted. Action added to offline queue.");

    return {
      saved: false,
      queued: true,
      message: "Queued for retry after interruption"
    };
  }
}

async function onNetworkReconnect() {
  console.log("Network restored. Processing queued sync actions...");
  return await processQueue();
}

module.exports = {
  cleanData,
  getWarnings,
  classifyProduct,
  calculateRiskScore,
  calculateRecommendationScore,
  getAlternatives,
  generateRecommendationReason,
  buildScanResult,
  mergeScanResultWithRemote,
  saveScanResult,
  onNetworkReconnect
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

  const result = buildScanResult(testRaw, testUser);

  console.log("Structured Scan Result:");
  console.log(JSON.stringify(result, null, 2));

  const saveStatus = saveScanResult(result);
  console.log("Save Status:");
  console.log(JSON.stringify(saveStatus, null, 2));

  const remoteResult = {
    ...result,
    metadata: {
      ...result.metadata,
      processedAt: new Date(Date.now() - 60000).toISOString()
    }
  };

  const conflictResult = mergeScanResultWithRemote(result, remoteResult);
  console.log("Conflict Resolution Result:");
  console.log(JSON.stringify(conflictResult, null, 2));

  onNetworkReconnect()
    .then((syncResult) => {
      console.log("Sync Result:");
      console.log(JSON.stringify(syncResult, null, 2));
    })
    .catch((error) => {
      console.error("Reconnect sync failed:", error.message);
    });
}
