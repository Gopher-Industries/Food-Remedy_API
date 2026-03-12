import pytest
from utils.conflict_resolver import resolve_conflicts


def sample_product_tags_a():
    # Product with both healthy and high sugar indicators
    return [
        {'tag': 'healthy', 'confidence': 0.6},
        {'tag': 'highSugar', 'confidence': 0.9},
        {'tag': 'balancedNutrition', 'confidence': 0.5},
    ]


def sample_product_tags_b():
    # Product with allergen and mood tags
    return [
        {'tag': 'mood', 'confidence': 0.8},
        {'tag': 'allergen', 'confidence': 0.4},
        {'tag': 'nutrition', 'confidence': 0.6},
    ]


def sample_product_tags_c():
    # Many conflicting tags to stress-test resolver
    return [
        {'tag': 'weightLoss', 'confidence': 0.6},
        {'tag': 'highFat', 'confidence': 0.7},
        {'tag': 'highSaturatedFat', 'confidence': 0.8},
        {'tag': 'sugarFriendly', 'confidence': 0.5},
        {'tag': 'bloodSugarFriendly', 'confidence': 0.9},
    ]


def test_product_a_prefers_health_over_high_nutrients():
    tags = sample_product_tags_a()
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    assert 'highSugar' in removed
    assert 'healthy' in final


def test_product_b_allergen_overrides_mood():
    tags = sample_product_tags_b()
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    assert 'allergen' in final
    assert 'mood' in removed


def test_product_c_complex_priority_resolution():
    tags = sample_product_tags_c()
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    # bloodSugarFriendly should survive and at least one high-fat indicator should be removed
    assert 'bloodSugarFriendly' in final
    assert ('highFat' in removed) or ('highSaturatedFat' in removed)
