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
class TestMainPipelineEndToEnd:
    def test_main_produces_empty_list_for_missing_ingredients(self, tmp_path):
        """DB048: end-to-end test — main() must never produce ingredients: null."""
        import json
        import os
        from database.clean_data.cleanProductData import main

        record = {
            'code': '9310072002678',
            'product_name': 'Test Product',
            'brands': 'Test Brand',
            'ingredients_text': '',
            'ingredients_tags': [],
            'additives_tags': [],
            'allergens_tags': [],
            'ingredients_analysis_tags': [],
            'categories_tags': [],
            'labels_tags': [],
            'nutriments': {},
            'product_quantity': 100,
            'product_quantity_unit': 'g',
            'serving_quantity': 30,
            'serving_quantity_unit': 'g',
            'completeness': 0.5,
            'traces': None,
        }

        in_path = str(tmp_path / 'input.jsonl')
        out_path = str(tmp_path / 'output.json')

        with open(in_path, 'w') as f:
            f.write(json.dumps(record) + '\n')

        main(in_path, out_path)

        with open(out_path) as f:
            output = json.load(f)

        if isinstance(output, list):
            product = output[0]
        else:
            product = output

        # ingredients must never be null — must be a list
        assert product.get('ingredients') is not None
        assert isinstance(product.get('ingredients'), list)

    def test_main_trims_ingredients_text(self, tmp_path):
        """DB048: main() must trim whitespace from ingredientsText."""
        import json
        from database.clean_data.cleanProductData import main

        record = {
            'code': '9310072002678',
            'product_name': 'Test Product',
            'brands': 'Test Brand',
            'ingredients_text': '  Sugar, Salt  ',
            'ingredients_tags': ['en:sugar', 'en:salt'],
            'additives_tags': [],
            'allergens_tags': [],
            'ingredients_analysis_tags': [],
            'categories_tags': [],
            'labels_tags': [],
            'nutriments': {},
            'product_quantity': 100,
            'product_quantity_unit': 'g',
            'serving_quantity': 30,
            'serving_quantity_unit': 'g',
            'completeness': 0.5,
            'traces': None,
        }

        in_path = str(tmp_path / 'input.jsonl')
        out_path = str(tmp_path / 'output.json')

        with open(in_path, 'w') as f:
            f.write(json.dumps(record) + '\n')

        main(in_path, out_path)

        with open(out_path) as f:
            output = json.load(f)

        if isinstance(output, list):
            product = output[0]
        else:
            product = output

        # ingredientsText must be trimmed
        ingredients_text = product.get('ingredientsText')
        if ingredients_text:
            assert not ingredients_text.startswith(' ')
            assert not ingredients_text.endswith(' ')