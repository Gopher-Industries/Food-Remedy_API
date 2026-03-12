// JS runtime copy of conflictResolver.ts

function resolveConflicts(tags) {
  const TAG_PRIORITY = {
    allergen: 100,
    heartHealth: 80,
    gutHealth: 80,
    weightLoss: 80,
    bloodSugarFriendly: 80,
    antiInflammatory: 75,
    highSugar: 60,
    moderateSugar: 55,
    lowSugar: 55,
    highFat: 60,
    highSaturatedFat: 65,
    lowFat: 55,
    highFibre: 60,
    lowSodium: 55,
    highSodium: 65,
    lowEnergyDensity: 55,
    highEnergyDensity: 60,
    balancedNutrition: 70,
    energyBoost: 40,
    focus: 40,
    relax: 40,
  };

  const CONFLICT_MAP = {
    highSugar: ['weightLoss','bloodSugarFriendly','lowSugar','balancedNutrition','weightLossFriendly'],
    highSaturatedFat: ['heartHealth','lowSaturatedFat','balancedNutrition'],
    highFat: ['weightLoss'],
    highSodium: ['heartHealth'],
    weightLoss: ['highSugar'],
    bloodSugarFriendly: ['highSugar'],
  };

  const byTag = {};
  for (const t of tags) {
    if (!byTag[t.tag]) byTag[t.tag] = t;
    else {
      const existing = byTag[t.tag];
      if ((t.confidence || 0) > (existing.confidence || 0)) byTag[t.tag] = t;
    }
  }
  const current = Object.values(byTag);
  const toRemove = new Map();
  for (const present of current) {
    const conflicts = CONFLICT_MAP[present.tag];
    if (!conflicts) continue;
    for (const c of conflicts) {
      if (byTag[c]) {
        const pPresent = TAG_PRIORITY[present.tag] || 50;
        const pConf = TAG_PRIORITY[c] || 50;
        if (pPresent >= pConf) {
          toRemove.set(c, byTag[c]);
        } else {
          toRemove.set(present.tag, present);
        }
      }
    }
  }

  const finalSet = new Map(current.map(t => [t.tag, t]));
  for (const a of current) {
    for (const b of current) {
      if (a.tag === b.tag) continue;
      const pA = TAG_PRIORITY[a.tag] || 50;
      const pB = TAG_PRIORITY[b.tag] || 50;
      if (a.tag.startsWith('high') && b.tag.startsWith('low') && a.tag.slice(4) === b.tag.slice(3)) {
        if (pA >= pB) finalSet.delete(b.tag); else finalSet.delete(a.tag);
      }
    }
  }

  for (const key of toRemove.keys()) finalSet.delete(key);
  const removed = [];
  for (const t of current) {
    if (!finalSet.has(t.tag)) removed.push(t);
  }
  return { finalTags: Array.from(finalSet.values()), removed };
}

function finalizeTagSet(categories) {
  // categories: { nutritionScoring, moodHealth, dietLifestyle, ingredientRisk, allergen }
  const merged = [];
  for (const key of Object.keys(categories)) {
    const list = categories[key] || [];
    for (const t of list) {
      if (!t) continue;
      if (typeof t === 'string') merged.push({ tag: t, source: key });
      else merged.push({ ...t, source: key });
    }
  }
  return resolveConflicts(merged);
}

module.exports = { resolveConflicts, finalizeTagSet };
