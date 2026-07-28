## Ingredient Standardisation
class IngredientStandardisation:
    """
    The IngredientStandardisation class is responsible for standarise 
    messy ingredient inputs into consistent canonical forms 
    for downstream processing.

    It applies:
    - Text normalisation (case, punctuation, spacing, separators)
    - Rule-based mapping of ingredient variants to standard names
    - Safe fallback for unknown ingredients

    The output is intended to support reliable matching for allergens, 
    dietary tags, and other enrichment logic.

    Attributes:
    - ingredient_rules (dict): Mapping of canonical ingredient names 
                               to their known variants.
    - ingredient_map (dict): Reverse lookup dictionary mapping each 
                             variant to its canonical name.

    Methods:
    - normalise_ingredient(str) -> str:
        Cleans and normalises raw ingredient text.

    - get_standard_name(str) -> str:
        Converts a single ingredient into its standard form.

    - standardise(list[str]) -> list[str]:
        Applies standardisation across a list of ingredients.

    - product_standardise(dict) -> dict:
        Adds a `standardisedIngredients` field to a product.
    """

    def __init__(self):
        # Canonical ingredient names mapped to known variants.
        # This is intended to be adjustable and readable.

        self.ingredient_rules = {
            "gluten": ["wheat", "barley", "rye", "oats"],
            "crustaceans": ["crab", "lobster", "prawn"],
            "eggs": ["chicken-egg", "egg-whites", "egg-yolk", "egg"],
            "fish": ["salmon", "tuna", "cod"],
            "peanuts": ["peanut", "groundnut"],
            "soybeans": ["soy", "soya"],
            "milk": ["cow-milk", "dairy", "lactose", "skim-milk", 
                    "whole-milk", "dairy-solids", "milk-powder",
                    "skimmed-milk-powder"],
            "tree-nuts": ["almond", "cashew", "walnut", 
                        "pecan", "hazelnut", "macademia"],
            "sesame-seeds": ["sesame", "tahini", "sesame-oil"],
            "sulphites": ["sulphur-dioxide"],
            "molluscs": ["clam", "mussel", "oyster", "squid", "scallop"],
            "mustard": ["mustard-seeds", "mustard-powder", "mustard-oil"],
            "celery": ["celeriac", "celery-seeds", "celery-stalk"],
            "lupin": ["lupin-flour", "lupin-seeds"],
            "sugar": ["sucrose", "cane-sugar", "beet-sugar", "raw-sugar", 
                    "white-sugar", "glucose-syrup", "monosaccharide",
                    "added-sugar", "disaccharide", "glucose",
                    "fructose"],
            "starch": ["modified-starch"],
            "salt": ["nacl"],
            "pepper": ["black-pepper", "white-pepper"],
            "flavouring": ["natural-flavouring", "artificial-flavouring",
                        "natural-and-artificial-flavouring"]
        }
        
        # build reverse look up mapping for efficient standardisation
        self.ingredient_map = self.reverse_mapping(self.ingredient_rules)

    def reverse_mapping(self, input_list):
        """
        Converts the grouped ingredient rules into a reverse lookup dictionary.

        Example:
            "sucrose" -> "sugar"
            "salt"    -> "salt"

        This allows fast lookup during standardisation instead of iterating 
        through all rules.

        Args:
            input_list (dict): Mapping of standard names to variant lists.

        Returns:
            dict: Reverse mapping of variant -> standard name
        """
        reverse_list = {}

        for standard, variants in input_list.items():        
            # map the standard to itself
            reverse_list[standard] = standard
            
            # map the variant to standard
            for variant in variants:
                reverse_list[variant] = standard

        return reverse_list

    @staticmethod
    def normalise_ingredient(input_ingredient):
        """
        Normalises raw ingredient text into a consistent format.

        Steps:
        - Convert to lowercase and strip surrounding whitespace
        - Treat hyphens, underscores and slashes as word separators,
          the same as spaces, so differently formatted variants of
          the same ingredient normalise to the same value
          (e.g. "egg-whites", "egg_whites" and "egg whites" all
          become "egg-whites")
        - Remove remaining punctuation (keep alphanumeric + separators)
        - Collapse repeated/irregular whitespace (double spaces, tabs,
          leading/trailing spaces) into a single hyphen between words

        Example:
            "Raw   Sugar!"  -> "raw-sugar"
            "egg_whites"    -> "egg-whites"
            "  Sesame-Oil " -> "sesame-oil"

        Args:
            input_ingredient (str): Raw ingredient string

        Returns:
            str: Normalised ingredient string. Returns an empty string
                 for falsy/empty input (e.g. None or "").
        """
        if not input_ingredient:
            return ''

        input_ingredient = str(input_ingredient).lower().strip()

        # Treat common word separators the same way as spaces so that
        # differently formatted variants of the same ingredient
        # (hyphenated, underscored, or slash-separated) normalise
        # consistently.
        for separator in ('-', '_', '/'):
            input_ingredient = input_ingredient.replace(separator, ' ')

        # Keep only alphanumeric characters and spaces.
        res = ''.join(c for c in input_ingredient if c.isalnum() or c == ' ')

        # Collapse any run of whitespace into a single hyphen between
        # words (also removes leading/trailing separators left over
        # from punctuation-only tokens).
        res = '-'.join(res.split())

        return res


    def get_standard_name(self, input_ingredient):
        """
        Converts a single ingredient into its canonical form.

        If the ingredient is not found in the mapping, the normalised 
        version is returned unchanged (safe fallback).

        Args:
            input_ingredient (str): Raw ingredient

        Returns:
            str: Standardised ingredient name
        """
        norm = self.normalise_ingredient(input_ingredient)

        return self.ingredient_map.get(norm, norm)

    def standardise(self, ingredient_list):
        """
        Applies standardisation to a list of ingredients.

        - Each ingredient is normalised and mapped
        - Duplicates are removed
        - Output is sorted for consistency

        Args:
            ingredient_list (list[str]): List of raw ingredient strings

        Returns:
            list[str]: List of unique, standardised ingredient names
        """
        results = []

        for ingredient in ingredient_list:
            results.append(self.get_standard_name(ingredient))
        
        return sorted(list(set(results))) # remove duplicates
    
    def product_standardise(self, product):
        """
        Standardises the ingredient list in a product and adds a 
        'standardisedIngredients' field.

        The function reads from the existing 'ingredients' field 
        applies normalisation and mapping, and stores the result 
        separately without modifying the original data.

        Args:
            product (dict): Product data containing an 'ingredients' field

        Returns:
            dict: Updated product with 'standardisedIngredients'
        """
        ingredients_list = product.get("ingredients", [])

        standardised = self.standardise(ingredients_list)

        product["standardisedIngredients"] = standardised

        return product

### Testing
def _test_standardisation():
    """
    Basic test to validate ingredient normalisation and mapping.

    Ensures:
    - Variants are correctly mapped to canonical names
    - Unknown ingredients remain unchanged
    """
    input_data = ["Raw Sugar!", "white pepper", "NaCl", "potato", "~~SucRoSE..."]
    expected = ["sugar", "pepper", "salt", "potato"]
    expected = sorted(expected)

    standardisation = IngredientStandardisation()

    result = standardisation.standardise(input_data)

    assert result == expected, f"Expected {expected}, but got {result}"

    # Regression test for the DB004 reverse-mapping improvement.
    custom_rules = {
        "sweetener": ["syrup"],
    }

    custom_mapping = standardisation.reverse_mapping(custom_rules)

    expected_custom_mapping = {
        "sweetener": "sweetener",
        "syrup": "sweetener",
    }

    assert custom_mapping == expected_custom_mapping, (
        f"Expected {expected_custom_mapping}, "
        f"but got {custom_mapping}"
    )

    print("Test passed.")


def _test_normalise_ingredient_formatting():
    """
    DB011 - Improve Ingredient Standardisation.

    Ensures normalise_ingredient() produces a consistent result
    regardless of formatting differences (extra whitespace, hyphens,
    underscores, slashes) in the raw input, and that this improvement
    does not break existing rule-based mapping.
    """
    standardisation = IngredientStandardisation()

    # Whitespace cleanup: repeated/irregular spacing collapses to a
    # single hyphen instead of producing "raw---sugar".
    assert standardisation.normalise_ingredient("Raw   Sugar!") == "raw-sugar"
    assert standardisation.normalise_ingredient("  Sesame-Oil  ") == "sesame-oil"

    # Formatting/special-character consistency: hyphens, underscores
    # and slashes are all treated as the same separator as a space, so
    # differently formatted variants normalise identically.
    assert standardisation.normalise_ingredient("egg-whites") == "egg-whites"
    assert standardisation.normalise_ingredient("egg_whites") == "egg-whites"
    assert standardisation.normalise_ingredient("egg whites") == "egg-whites"
    assert standardisation.normalise_ingredient("egg/whites") == "egg-whites"

    # Empty/falsy input is handled safely.
    assert standardisation.normalise_ingredient("") == ""
    assert standardisation.normalise_ingredient(None) == ""

    # These previously-inconsistent formats now correctly map through
    # to their canonical ingredient via get_standard_name().
    assert standardisation.get_standard_name("egg-whites") == "eggs"
    assert standardisation.get_standard_name("egg_whites") == "eggs"
    assert standardisation.get_standard_name("Raw   Sugar!") == "sugar"
    assert standardisation.get_standard_name("cane_sugar") == "sugar"

    # standardise() still removes duplicates once formatting is
    # consistent, even when the same ingredient arrives in different
    # raw formats.
    result = standardisation.standardise(
        ["egg-whites", "egg_whites", "egg whites", "Egg-Whites"]
    )
    assert result == ["eggs"], f"Expected ['eggs'], but got {result}"

    print("Formatting consistency test passed.")


if __name__ == '__main__':
    _test_standardisation()
    _test_normalise_ingredient_formatting()