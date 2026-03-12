# Schema Definition

| Field name                | Type               | Required | Remarks                                                 |
|---------------------------|--------------------|----------|---------------------------------------------------------|
| barcode                   | str                | Yes      | Always 13-digit string                                  |
| brand                     | str                | No       | Can contain multiple brands, comma-separated            |
| productName               | str or null        | No       | Rarely null                                             |
| genericName               | str or null        | No       | Usually null or empty                                   |
| additives                 | list[str]          | No       | Lowercase E-numbers like ["e322"]                       |
| allergens                 | list[str]          | No       | Lowercase like ["milk", "nuts"]                         |
| ingredients               | list[str]          | No       | Cleaned tag list                                        |
| ingredientsText           | str or null        | No       | Raw text, can be null                                   |
| ingredientsAnalysis       | list[str]          | No       | e.g. ["palm-oil", "non-vegan"]                          |
| categories                | list[str]          | No       | Hierarchical lowercase tags                             |
| labels                    | list[str]          | No       | e.g. ["halal", "australian-made"]                       |
| nutrientLevels            | dict               | No       | Can be empty                                            |
| nutriments                | dict               | No       | Variable keys, always present (can be empty)            |
| nutriscoreGrade           | str or null        | No       | "a"-"e" or "unknown"                                    |
| productQuantity           | float              | No       | Number like 750.0                                       |
| productQuantityUnit       | str                | No       | "g", "ml"                                               |
| servingQuantity           | float              | No       | Portion size                                            |
| servingQuantityUnit       | str                | No       | "g", "ml"                                               |
| traces                    | str                | No       | Comma-separated or empty                                |
| tracesFromIngredients     | str                | No       | Usually empty                                           |
| completeness              | float              | Yes      | OFF completeness score                                  |
| images                    | dict               | No       | Contains root, variants, primary                        |

## Validation Rules

```python
assert len(barcode) == 13 and barcode.isdigit(), "Barcode must be 13 digits"
assert isinstance(nutriments, dict), "Nutriments must be a dictionary"
assert productQuantity >= 0, "Product quantity cannot be negative"
assert servingQuantity >= 0, "Serving quantity cannot be negative"
assert productQuantityUnit in ["g", "ml", "l", "kg"], "Invalid product quantity unit"
assert servingQuantityUnit in ["g", "ml", "l", "kg"], "Invalid serving quantity unit"
assert 0 <= completeness <= 1, "Completeness must be between 0 and 1"
```
