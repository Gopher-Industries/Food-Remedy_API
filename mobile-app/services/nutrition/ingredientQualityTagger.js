// Ingredient Quality Tagger
// Classify ingredients as natural / processed / ultra-processed, detect additives,
// compute per-ingredient risk scores and an aggregated product processing score.

function _norm(s) {
  if (!s) return '';
  return String(s).toLowerCase();
}

// Config-driven additive risk table - easier to tune or load from JSON/YAML later
const ADDITIVE_RISK_TABLE = {
  'high_intensity_sweetener': { keywords: ['sucralose','aspartame','acesulfame','acesulfame-k','saccharin','neotame','sodium cyclamate'], weight: 0.9 },
  'synthetic_colourant': { keywords: ['e102','e110','titanium dioxide','tartrazine','allura red','ponceau','sunset yellow','caramel color','caramel colour'], weight: 0.8 },
  'preservative': { keywords: ['sodium benzoate','potassium sorbate','benzoate','sorbate','sulphite','sulphates','sulfite','sulphur dioxide'], weight: 0.7 },
  'emulsifier_stabiliser': { keywords: ['lecithin','polysorbate','polysorbate 80','mono-','diglyceride','monoglyceride','diglyceride','starch','modified starch','stabiliser','stabilizer','carrageenan'], weight: 0.6 },
  'flavouring': { keywords: ['artificial flavour','artificial flavor','natural flavour','natural flavor','flavouring','flavoring'], weight: 0.4 },
  'thickener': { keywords: ['maltodextrin','pectin','xanthan','guar gum'], weight: 0.35 }
};

// Ingredient classification heuristics (config-driven-ish)
const ULTRA_PROCESSED_KEYWORDS = ['maltodextrin','hydrolysed','hydrolyzed','textured','texturised','texturised','emulsifier','mono','diglyceride','polysorbate','flavour','flavor','artificial','synthetic','isolate','concentrate','instant','modified','enriched','fortified','stabiliser','stabilizer'];
const PROCESSED_KEYWORDS = ['powdered','dried','roasted','salted','smoked','pasteurised','pasteurized','canned','dehydrated','paste','cream','butter','cheese','oil'];
const MINIMALLY_PROCESSED_KEYWORDS = ['fermented','yogurt','yoghurt','cheese','olive oil','extra virgin','cold-pressed','fresh','raw','pasteurised milk'];

function detectAdditivesInIngredient(ingText) {
  const found = {};
  const text = _norm(ingText);
  for (const [cat, conf] of Object.entries(ADDITIVE_RISK_TABLE)) {
    for (const kw of conf.keywords) {
      if (text.indexOf(kw) !== -1) {
        found[cat] = found[cat] || { count: 0, keywords: new Set(), weight: conf.weight };
        found[cat].count += 1;
        found[cat].keywords.add(kw);
      }
    }
  }
  // convert sets to arrays
  for (const k of Object.keys(found)) {
    found[k].keywords = Array.from(found[k].keywords);
  }
  return found;
}

function classifyIngredient(ingName) {
  const text = _norm(ingName);
  if (!text) return { classification: 'unknown' };

  // Ultra-processed heuristics
  for (const kw of ULTRA_PROCESSED_KEYWORDS) {
    if (text.indexOf(kw) !== -1) return { classification: 'ultraProcessed' };
  }
  // Minimally processed heuristics
  for (const kw of MINIMALLY_PROCESSED_KEYWORDS) {
    if (text.indexOf(kw) !== -1) return { classification: 'minimallyProcessed' };
  }
  // Processed heuristics
  for (const kw of PROCESSED_KEYWORDS) {
    if (text.indexOf(kw) !== -1) return { classification: 'processed' };
  }
  // Default to natural for single whole-food items
  const naturalHints = ['apple','banana','orange','almond','walnut','peanut','chicken','beef','pork','tuna','salmon','oat','oats','rice','water','tomato','lettuce','potato','milk','yogurt','yoghurt','cheese','egg','spinach','broccoli','carrot','beet'];
  for (const kw of naturalHints) {
    if (text.indexOf(kw) !== -1) return { classification: 'natural' };
  }
  // fallback to processed
  return { classification: 'processed' };
}

function ingredientRiskScore(ingName, options = {}) {
  const text = _norm(ingName);
  if (!text) return { score: 0.0, classification: 'unknown', additives: {} };
  const cls = classifyIngredient(text).classification;

  // Base scores by processing level (calibrated)
  const BASE_SCORES = {
    natural: 0.02,
    minimallyProcessed: 0.08,
    processed: 0.25,
    ultraProcessed: 0.7
  };
  const base = BASE_SCORES[cls] != null ? BASE_SCORES[cls] : 0.25;

  // Detect additives and compute contributions using the risk table
  const additives = detectAdditivesInIngredient(text);
  const contributions = [];
  for (const [cat, info] of Object.entries(additives)) {
    const w = info.weight || 0.4;
    // contribution to additive impact: higher weight -> larger contribution, but scaled down
    contributions.push(w * 0.6);
  }

  // Capped additive aggregation: sort desc, sum top 3, cap at 0.6
  contributions.sort((a,b)=>b-a);
  const topN = contributions.slice(0,3);
  const additiveTotal = Math.min(0.6, topN.reduce((s,x)=>s+x,0));

  // Context-aware adjustment: productCategory can reduce/increase additive impact
  let contextMultiplier = 1.0;
  const cat = (options.productCategory || '').toLowerCase();
  if (cat === 'dairy' && cls === 'minimallyProcessed') {
    // e.g., yogurt with stabiliser should be less penalised than candy with stabiliser
    contextMultiplier = 0.6;
  } else if (cat === 'snack') {
    contextMultiplier = 1.1;
  } else if (cat === 'beverage') {
    contextMultiplier = 1.0;
  }

  const finalAdditiveImpact = additiveTotal * contextMultiplier;

  let rawScore = base + finalAdditiveImpact;
  // clamp and round
  const score = Math.min(1.0, Number(rawScore.toFixed(3)));
  return { score, classification: cls, additives };
}

function aggregateProductScore(ingredientList, options = {}) {
  if (!ingredientList || !ingredientList.length) return { productScore: 0, riskLevel: 'lowRisk' };
  const results = ingredientList.map(i => {
    const r = ingredientRiskScore(i, options);
    return { name: i, ...r };
  });
  // Weighted average: emphasize higher-risk ingredients but cap extremes
  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of results) {
    const w = 1 + Math.pow(r.score, 1.2) * 6; // more separation for higher scores
    weightedSum += r.score * w;
    weightTotal += w;
  }
  const productScore = weightTotal ? Number((weightedSum / weightTotal).toFixed(3)) : 0;
  let riskLevel = 'lowRisk';
  if (productScore >= 0.55) riskLevel = 'highRisk';
  else if (productScore >= 0.25) riskLevel = 'moderateRisk';

  // aggregate additive counts
  const additiveSummary = {};
  for (const r of results) {
    for (const [cat, info] of Object.entries(r.additives || {})) {
      additiveSummary[cat] = additiveSummary[cat] || { count: 0, keywords: new Set() };
      additiveSummary[cat].count += info.count || 0;
      for (const k of info.keywords || []) additiveSummary[cat].keywords.add(k);
    }
  }
  for (const k of Object.keys(additiveSummary)) additiveSummary[k].keywords = Array.from(additiveSummary[k].keywords);

  return { productScore, riskLevel, ingredientResults: results, additiveSummary };
}

module.exports = { classifyIngredient, ingredientRiskScore, aggregateProductScore, detectAdditivesInIngredient };
