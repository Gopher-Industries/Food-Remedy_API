const NUTRITION_LIMITS = {
  sugarHighG: 20
};

const SEVERITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3
};

const PIPELINE_VERSION = "1.2.0";

function cleanData(raw) {
  const normalizeList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((x) => String(x || "").trim().toLowerCase())
        .filter(Boolean);
    }
    return String(value)
      .toLowerCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const productName = raw.productName || raw.name || "Unknown product";
  const barcode = raw.barcode || null;

  const ingredients = normalizeList(raw.ingredientsText || raw.ingredients);
  const additives = normalizeList(raw.additivesText || raw.additives);
  const allergens = normalizeList(raw.allergensText || raw.allergens);

  const nutrition = raw.nutrition || {};
  const sugarG = typeof nutrition.sugarG === "number" ? nutrition.sugarG : null;

  return {
    productName,
    barcode,
    ingredients,
    additives,
    allergens,
    nutrition: { sugarG }
  };
}

function buildWarnings(product, userProfile) {
  const warnings = [];


  const allergies = Array.isArray(userProfile?.allergies) ? userProfile.allergies : [];
  const intolerances = Array.isArray(userProfile?.intolerances) ? userProfile.intolerances : [];
  const avoidAdditives = Array.isArray(userProfile?.avoidAdditives) ? userProfile.avoidAdditives : [];
  const avoidIngredients = Array.isArray(userProfile?.avoidIngredients) ? userProfile.avoidIngredients : [];
  const dietPreferences = Array.isArray(userProfile?.dietPreferences) ? userProfile.dietPreferences : [];

  const hasAnyProfileInfo =
    allergies.length > 0 ||
    intolerances.length > 0 ||
    avoidAdditives.length > 0 ||
    avoidIngredients.length > 0 ||
    dietPreferences.length > 0;

  if (!hasAnyProfileInfo) {
    warnings.push({
      type: "profile_missing",
      message: "Profile info missing/incomplete: risk classification may be limited.",
      severity: "medium"
    });
  }

  const setify = (arr) =>
    new Set((arr || []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean));

  const productAllergens = setify(product.allergens);
  const productIngredients = setify(product.ingredients);
  const productAdditives = setify(product.additives);

  for (const a of setify(allergies)) {
    if (productAllergens.has(a) || productIngredients.has(a)) {
      warnings.push({
        type: "allergen",
        message: `Contains allergen: ${a}`,
        severity: "high"
      });
    }
  }

 
  for (const t of setify(intolerances)) {
    if (productIngredients.has(t) || productAllergens.has(t)) {
      warnings.push({
        type: "intolerance",
        message: `May trigger intolerance: ${t}`,
        severity: "medium"
      });
    }
  }

  
  for (const ing of setify(avoidIngredients)) {
    if (productIngredients.has(ing)) {
      warnings.push({
        type: "ingredient",
        message: `Avoid ingredient: ${ing}`,
        severity: "medium"
      });
    }
  }


  for (const add of setify(avoidAdditives)) {
    if (productAdditives.has(add)) {
      warnings.push({
        type: "additive",
        message: `Contains avoided additive: ${add}`,
        severity: "medium"
      });
    }
  }

  
  const dietSet = setify(dietPreferences);
  if (dietSet.has("vegan")) {
    const nonVegan = ["milk", "egg", "honey", "gelatin"];
    for (const nv of nonVegan) {
      if (productIngredients.has(nv) || productAllergens.has(nv)) {
        warnings.push({
          type: "diet",
          message: `Not suitable for vegan diet: contains ${nv}`,
          severity: "medium"
        });
      }
    }
  }


  if (typeof product.nutrition?.sugarG === "number" && product.nutrition.sugarG >= NUTRITION_LIMITS.sugarHighG) {
    warnings.push({
      type: "nutrition",
      message: `High sugar (${product.nutrition.sugarG}g)`,
      severity: "medium"
    });
  }

  return warnings;
}

function classify(warnings) {
  const hasHigh = warnings.some((w) => w.severity === "high");
  const hasMedium = warnings.some((w) => w.severity === "medium");
  if (hasHigh) return "red";
  if (hasMedium) return "grey";
  return "green";
}

function computeSuitability(warnings) {
  let riskScore = 0;
  for (const w of warnings) {
    riskScore += SEVERITY_WEIGHTS[w.severity] || 0;
  }

  let score = 100;
  for (const w of warnings) {
    if (w.severity === "high") score -= 60;
    else if (w.severity === "medium") score -= 25;
    else score -= 10;
  }
  if (score < 0) score = 0;

  const isSafe = !warnings.some((w) => w.severity === "high");
  const reasons = warnings.map((w) => w.message);

  return { isSafe, reasons, riskScore, suitabilityScore: score };
}

function buildScanResult(rawProductData, userProfile) {
  const product = cleanData(rawProductData);
  const warnings = buildWarnings(product, userProfile);
  const classification = classify(warnings);
  const suitability = computeSuitability(warnings);

  return {
    version: PIPELINE_VERSION,
    product,
    classification,
    warnings,
    suitability,
    alternatives: rawProductData.alternatives || []
  };
}

module.exports = {
  cleanData,
  buildWarnings,
  classify,
  computeSuitability,
  buildScanResult
};
