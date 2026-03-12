from typing import List, Dict, Any, Tuple

# Priority values: higher number = higher priority
TAG_PRIORITY = {
    'allergen': 100,
    # Health-focused tags (highest priority)
    'healthy': 95,
    'weightLoss': 85,
    'heartHealth': 80,
    # Nutrition-focused
    'balancedNutrition': 70,
    'bloodSugarFriendly': 70,
    'nutrition': 70,
    # Mood / non-critical informational
    'mood': 40,
    # Specific nutrient indicators
    'highSugar': 60,
    'lowSugar': 60,
    'sugarFriendly': 65,
    'highFat': 55,
    'highSaturatedFat': 55,
}

# Conflicts: if key present, listed tags are considered conflicting and should be removed
CONFLICT_MAP = {
    'highSugar': ['weightLoss', 'bloodSugarFriendly', 'lowSugar', 'balancedNutrition', 'weightLossFriendly'],
    'highFat': ['weightLoss'],
    'highSaturatedFat': ['heartHealth'],
    # healthy should not coexist with obvious "high" nutrient tags
    'healthy': ['highSugar', 'highFat', 'highSaturatedFat'],
    # weightLoss conflicts with nutrient-dense indicators
    'weightLoss': ['highSugar', 'highFat'],
    'bloodSugarFriendly': ['highSugar'],
    # allergens should suppress lower-priority mood/nonspecific tags
    'allergen': ['weightLoss', 'mood'],
    # mood tags are informational and conflict with allergen presence
    'mood': ['allergen'],
}

# Tag -> group mapping for broader category-based priority
TAG_GROUP = {
    'allergen': 'allergen',
    'healthy': 'health',
    'weightLoss': 'health',
    'heartHealth': 'health',
    'balancedNutrition': 'nutrition',
    'bloodSugarFriendly': 'nutrition',
    'nutrition': 'nutrition',
    'mood': 'mood',
    'highSugar': 'nutrition',
    'lowSugar': 'nutrition',
    'sugarFriendly': 'nutrition',
    'highFat': 'nutrition',
    'highSaturatedFat': 'nutrition',
}

# Group priorities: higher number wins when groups conflict
GROUP_PRIORITY = {
    'allergen': 100,
    'health': 90,
    'nutrition': 70,
    'mood': 40,
}


def _normalize(tags: List[Any]) -> Dict[str, Dict[str, Any]]:
    """Normalize input tags into a map tag -> {'tag':..., 'confidence':...} keeping highest confidence."""
    by_tag: Dict[str, Dict[str, Any]] = {}
    for t in tags:
        if isinstance(t, str):
            tag = t
            conf = 0.5
            obj = {'tag': tag, 'confidence': conf}
        elif isinstance(t, dict):
            tag = t.get('tag')
            conf = float(t.get('confidence', 0.5))
            obj = {'tag': tag, 'confidence': conf}
        else:
            continue

        if not tag:
            continue
        existing = by_tag.get(tag)
        if not existing or obj['confidence'] > existing.get('confidence', 0):
            by_tag[tag] = obj
    return by_tag


def resolve_conflicts(tags: List[Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Resolve tag conflicts.

    Input: list of strings or dicts {'tag', 'confidence'}
    Returns: {'final_tags': [...], 'removed': [...]} where items are dicts with at least 'tag' and 'confidence'.
    """
    by_tag = _normalize(tags)

    present = set(by_tag.keys())
    to_remove = set()

    # First pass: explicit conflict map
    for tag in list(present):
        conflicts = CONFLICT_MAP.get(tag, [])
        for other in conflicts:
            if other in present:
                # Prefer group-level priority first
                g_tag = TAG_GROUP.get(tag)
                g_other = TAG_GROUP.get(other)
                g_p_tag = GROUP_PRIORITY.get(g_tag, 50)
                g_p_other = GROUP_PRIORITY.get(g_other, 50)
                if g_p_tag > g_p_other:
                    to_remove.add(other)
                    continue
                if g_p_other > g_p_tag:
                    to_remove.add(tag)
                    continue

                # Fallback to tag-level priority
                p_tag = TAG_PRIORITY.get(tag, 50)
                p_other = TAG_PRIORITY.get(other, 50)
                if p_tag > p_other:
                    to_remove.add(other)
                elif p_other > p_tag:
                    to_remove.add(tag)
                else:
                    # tie -> use confidence
                    if by_tag[tag]['confidence'] >= by_tag[other]['confidence']:
                        to_remove.add(other)
                    else:
                        to_remove.add(tag)

    # Second pass: healthy vs high/low semantics (e.g., highSugar vs lowSugar)
    for a in list(present):
        if a.startswith('high'):
            counterpart = 'low' + a[4:]
            if counterpart in present:
                p_a = TAG_PRIORITY.get(a, 50)
                p_b = TAG_PRIORITY.get(counterpart, 50)
                if p_a > p_b:
                    to_remove.add(counterpart)
                elif p_b > p_a:
                    to_remove.add(a)
                else:
                    if by_tag[a]['confidence'] >= by_tag[counterpart]['confidence']:
                        to_remove.add(counterpart)
                    else:
                        to_remove.add(a)

    # Build final lists
    removed = []
    for r in sorted(to_remove):
        if r in by_tag:
            removed.append(by_tag[r])

    final = []
    for tag, obj in by_tag.items():
        if tag not in to_remove:
            final.append(obj)

    return {'final_tags': final, 'removed': removed}


if __name__ == '__main__':
    # quick manual demo
    sample = [{'tag': 'highSugar'}, {'tag': 'weightLoss', 'confidence': 0.7}]
    print(resolve_conflicts(sample))
