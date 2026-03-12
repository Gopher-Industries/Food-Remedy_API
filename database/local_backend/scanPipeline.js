const NUTRITION_LIMITS = {
  sugarHighG: 20
};

const SEVERITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3
};

const PIPELINE_VERSION = "1.1.0";

function cleanData(raw) {
  const normalizeList = (text) =>
    text
      ? text
          .toLowerCase()
          .split(/[,;().]/)
          .map(i => i.trim())
          .filter(Boolean)
      : [];

  return {
    barcode: raw.barcode?.toString().trim() || "",
    name: raw.productName?.trim() || raw.name?.trim() || "Unknown product",
    ingredients: normalizeList(raw.ingredientsText || raw.ingredients),
    additives: normalizeList(raw.additivesText || raw.additives),
    nutrition: raw.nutrition || {}
  };
}

function getWarnings(cleaned, user) {
  const warnings = [];
  const ingredients = cleaned.ingredients;
  const additives = cleaned.additives;
  const nutrition = cleaned.nutrition;

  if (user.allergies) {
    user.allergies.forEach(allergen => {
      if (ingredients.some(i => i.includes(allergen.toLowerCase()))) {
        warnings.push({
          type: "allergen",
          code: `ALLERGEN_${allergen.toUpperCase()}`,
          message: `Contains ${allergen}`,
          severity: "high"
        });
      }
    });
  }

  if (user.avoidAdditives) {
    user.avoidAdditives.forEach(additive => {
      if (additives.some(a => a.includes(additive.toLowerCase()))) {
        warnings.push({
          type: "additive",
          code: `ADDITIVE_${additive}`,
          message: `Contains additive ${additive}, which you prefer to avoid`,
          severity: "medium"
        });
      }
    });
  }

  if (user.dietPreferences?.includes("vegan")) {
    const nonVeganList = [
      "milk", "egg", "honey", "gelatin", "cheese",
      "butter", "cream", "whey", "casein"
    ];

    if (
      ingredients.some(ing =>
        nonVeganList.some(blocked => ing.includes(blocked))
      )
    ) {
      warnings.push({
        type: "diet",
        code: "DIET_VEGAN_UNSUITABLE",
        message: "Not suitable for a vegan diet",
        severity: "medium"
      });
    }
  }

  if (user.dietPreferences?.includes("glutenFree")) {
    const glutenSources = ["wheat", "barley", "rye", "malt"];

    if (
      ingredients.some(ing =>
        glutenSources.some(src => ing.includes(src))
      )
    ) {
      warnings.push({
        type: "diet",
        code: "DIET_GLUTEN_UNSUITABLE",
        message: "Contains gluten sources (not suitable for a gluten-free diet)",
        severity: "medium"
      });
    }
  }

  if (typeof nutrition.sugarG === "number" &&
      nutrition.sugarG > NUTRITION_LIMITS.sugarHighG) {
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
  const hasHigh = warnings.some(w => w.severity === "high");
  const hasMedium = warnings.some(w => w.severity === "medium");

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

function getAlternatives(cleaned, classification) {
  const base = [
    { name: "Dark Chocolate 85%", brand: "Lindt", barcode: "99901", classification: "green" },
    { name: "Organic Vegan Chocolate", brand: "Loving Earth", barcode: "99902", classification: "green" },
    { name: "Cocoa Nibs (Sugar-Free)", brand: "HealthyCo", barcode: "99903", classification: "green" }
  ];

  if (classification === "green") return base.slice(0, 2);
  return base;
}

function buildScanResult(rawData, userProfile) {
  const cleaned = cleanData(rawData);
  const warnings = getWarnings(cleaned, userProfile);
  const classification = classifyProduct(warnings);
  const riskScore = calculateRiskScore(warnings);

  return {
    product: cleaned,
    classification,
    warnings,
    suitability: {
      isSafe: classification === "green",
      reasons: warnings.map(w => w.message),
      riskScore
    },
    alternatives: getAlternatives(cleaned, classification),
    metadata: {
      processedAt: new Date().toISOString(),
      pipelineVersion: PIPELINE_VERSION,
      userId: userProfile.id || null
    }
  };
}

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
