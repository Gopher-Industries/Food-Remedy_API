"""
DB048: Regression tests for ingredient pipeline reliability fixes.

Covers:
- clean_ingredients_list() empty/None handling
- ingredients_text column path (DB002 cleaning block)
- IngredientStandardisation defensive None handling
- Existing valid-ingredient and typo-fix behavior (no regressions)
"""

import pandas as pd
import pytest

from database.clean_data.cleanProductData import (
    clean_ingredients_list,
    clean_ingredients_text,
    fix_common_typos,
)
from database.clean_data.normalization.IngredientStandardisation import (
    IngredientStandardisation,
)


class TestCleanIngredientsList:
    def test_empty_list_returns_empty_list(self):
        assert clean_ingredients_list([]) == []

    def test_none_returns_empty_list(self):
        assert clean_ingredients_list(None) == []

    def test_valid_tags_returns_sorted_cleaned_list(self):
        result = clean_ingredients_list(['en:sugar', 'en:salt', 'en:milk'])
        assert result == ['milk', 'salt', 'sugar']

    def test_result_is_never_none(self):
        for tags in ([], None, ['   '], ['']):
            result = clean_ingredients_list(tags)
            assert result is not None
            assert isinstance(result, list)


class TestIngredientsTextColumnPath:
    def test_ingredients_text_column_is_cleaned(self):
        df = pd.DataFrame({
            'ingredients_text': ['  Sugar, Salt  ']
        })
        if 'ingredients_text' in df.columns:
            df['ingredients_text'] = df['ingredients_text'].apply(clean_ingredients_text)
        cleaned = df.loc[0, 'ingredients_text']
        assert cleaned == 'Sugar, Salt'

    def test_camelcase_column_is_not_picked_up(self):
        df = pd.DataFrame({
            'ingredientsText': ['SUGAR, Salt']
        })
        original = df['ingredientsText'].copy()
        if 'ingredients_text' in df.columns:
            df['ingredients_text'] = df['ingredients_text'].apply(clean_ingredients_text)
        pd.testing.assert_series_equal(df['ingredientsText'], original)


class TestIngredientStandardisation:
    def test_none_ingredients_does_not_crash(self):
        std = IngredientStandardisation()
        result = std.product_standardise({'ingredients': None})
        assert result['standardisedIngredients'] == []

    def test_missing_ingredients_key_does_not_crash(self):
        std = IngredientStandardisation()
        result = std.product_standardise({})
        assert result['standardisedIngredients'] == []

    def test_valid_ingredients_pass_through(self):
        std = IngredientStandardisation()
        result = std.product_standardise({'ingredients': ['sugar', 'salt']})
        assert result['standardisedIngredients'] == ['salt', 'sugar']


class TestExistingBehaviorPreserved:
    def test_typo_fix_preserved(self):
        assert fix_common_typos('citiric-acid') == 'citric-acid'

    def test_sulpher_dioxide_typo_fix(self):
        assert fix_common_typos('sulpher-dioxide') == 'sulphur-dioxide'

    def test_tumeric_typo_fix(self):
        assert fix_common_typos('tumeric') == 'turmeric'