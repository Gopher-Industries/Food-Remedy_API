export type TagWithMeta = { tag: string; source?: string; reason?: string; confidence?: number };

// Priority order (higher number -> higher priority)
const TAG_PRIORITY: Record<string, number> = {
  // allergen-like tags (examples) - highest
  allergen: 100,

  // health tags
  heartHealth: 80,
  gutHealth: 80,
  weightLoss: 80,
  bloodSugarFriendly: 80,
  antiInflammatory: 75,

  // nutrition tags
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

  // mood tags (lower priority)
  energyBoost: 40,
  focus: 40,
  relax: 40,
};

// Explicit conflict mappings: if key present, remove listed tags (unless higher priority)
const CONFLICT_MAP: Record<string, string[]> = {
  highSugar: ['weightLoss','bloodSugarFriendly','lowSugar','balancedNutrition','weightLossFriendly'],
  highSaturatedFat: ['heartHealth','lowSaturatedFat','balancedNutrition'],
  highFat: ['weightLoss'],
  highSodium: ['heartHealth'],
  weightLoss: ['highSugar'], // symmetric exclusion
  bloodSugarFriendly: ['highSugar'],
};

export function resolveConflicts(tags: TagWithMeta[]) : { finalTags: TagWithMeta[]; removed: TagWithMeta[] } {
  // de-duplicate by keeping highest confidence or first occurrence
  const byTag: Record<string, TagWithMeta> = {};
  for (const t of tags) {
    if (!byTag[t.tag]) byTag[t.tag] = t;
    else {
      const existing = byTag[t.tag];
      // prefer higher confidence, otherwise keep existing
      if ((t.confidence ?? 0) > (existing.confidence ?? 0)) byTag[t.tag] = t;
    }
  }

  // Start with all tags
  let current = Object.values(byTag);

  // Apply explicit conflict map: for each present tag, mark conflicts
  const toRemove = new Map<string, TagWithMeta>();

  for (const present of current) {
    const conflicts = CONFLICT_MAP[present.tag];
    if (!conflicts) continue;
    for (const c of conflicts) {
      if (byTag[c]) {
        // decide by priority
        const pPresent = TAG_PRIORITY[present.tag] ?? 50;
        const pConf = TAG_PRIORITY[c] ?? 50;
        if (pPresent >= pConf) {
          toRemove.set(c, byTag[c]);
        } else {
          toRemove.set(present.tag, present);
        }
      }
    }
  }

  // Additionally, pairwise check for logical contradictions (e.g., highSugar with bloodSugarFriendly)
  // Already covered above, but we can generalize: for each pair, if priorities differ, drop lower.
  const finalSet = new Map<string, TagWithMeta>(current.map(t => [t.tag, t]));
  for (const a of current) {
    for (const b of current) {
      if (a.tag === b.tag) continue;
      const pA = TAG_PRIORITY[a.tag] ?? 50;
      const pB = TAG_PRIORITY[b.tag] ?? 50;
      // contrapositive example: 'highSugar' vs 'weightLoss' handled above
      // generic rule: if tags are direct opposites by naming ('high' vs 'low' etc.) then remove lower priority
      if (a.tag.startsWith('high') && b.tag.startsWith('low') && a.tag.slice(4) === b.tag.slice(3)) {
        if (pA >= pB) finalSet.delete(b.tag); else finalSet.delete(a.tag);
      }
    }
  }

  // Remove any explicitly collected toRemove
  for (const key of toRemove.keys()) finalSet.delete(key);

  // Build removed list
  const removed: TagWithMeta[] = [];
  for (const t of current) {
    if (!finalSet.has(t.tag)) removed.push(t);
  }

  return { finalTags: Array.from(finalSet.values()), removed };
}

export default { resolveConflicts };

export function finalizeTagSet(categories: Record<string, TagWithMeta[] | string[]>) {
  const merged: TagWithMeta[] = [];
  for (const key of Object.keys(categories)) {
    const list = categories[key] ?? [];
    for (const t of list as any) {
      if (!t) continue;
      if (typeof t === 'string') merged.push({ tag: t, source: key });
      else merged.push({ ...t, source: key });
    }
  }
  return resolveConflicts(merged);
}
