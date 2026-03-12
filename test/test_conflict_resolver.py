import pytest
from utils.conflict_resolver import resolve_conflicts


def test_highSugar_vs_weightLoss():
    tags = [{'tag': 'highSugar'}, {'tag': 'weightLoss', 'confidence': 0.7}]
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    # weightLoss has higher priority than highSugar so highSugar should be removed
    assert 'weightLoss' in final
    assert 'highSugar' in removed


def test_lowSugar_vs_highSugar_confidence():
    tags = [{'tag': 'lowSugar', 'confidence': 0.6}, {'tag': 'highSugar', 'confidence': 0.9}]
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    assert 'highSugar' in final
    assert 'lowSugar' in removed


def test_allergen_priority_over_weightLoss():
    tags = [{'tag': 'allergen'}, {'tag': 'weightLoss'}]
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    # allergen is explicitly set to override weightLoss in the conflict map
    assert 'allergen' in final
    assert 'weightLoss' in removed


def test_highSugar_cannot_coexist_with_healthy_and_weightLoss():
    tags = [
        {'tag': 'highSugar', 'confidence': 0.8},
        {'tag': 'healthy', 'confidence': 0.6},
        {'tag': 'weightLoss', 'confidence': 0.7},
    ]
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    # health group should override highSugar; weightLoss should also override highSugar
    assert 'highSugar' in removed
    assert 'healthy' in final or 'weightLoss' in final


def test_allergen_overrides_mood_and_low_priority():
    tags = [{'tag': 'mood', 'confidence': 0.9}, {'tag': 'allergen', 'confidence': 0.4}]
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    assert 'allergen' in final
    assert 'mood' in removed


def test_malformed_and_duplicate_inputs():
    tags = ['highSugar', {'tag': 'highSugar', 'confidence': 0.4}, None, {'foo': 'bar'}, {'tag': 'lowSugar', 'confidence': 0.9}]
    r = resolve_conflicts(tags)
    final = {t['tag'] for t in r['final_tags']}
    removed = {t['tag'] for t in r['removed']}
    # duplicate highSugar entries should collapse, and lowSugar vs highSugar should respect confidence
    assert ('highSugar' in final) or ('lowSugar' in final)
