# DB007 – Handle Missing & Unknown Values

**Status: 100%**

**Goal**  
Standardise handling of missing/unknown values across all fields to prevent enrichment logic from failing or producing incorrect tags due to unexpected empty fields or irregular representations of missing data.

**Completed**
- Defined canonical missing markers in `constants.py` (based on real sample data)
- Built reusable normalisation utilities in `utils/missing_value_utils.py`:
  • `normalize_string`, `normalize_list`, `normalize_dict` (recursive)
  • `clean_numeric`, `normalize_quantity_with_unit`, `normalize_palm_oil_indicator`
- Applied utilities to all key fields in pipeline (ingredients, nutriments, categories, quantity, traces, palm-oil)
- Added post-cleaning schema validation with warning logging
- Added comprehensive unit tests in `test/test_missing_values.py` (8 tests, all passing)

**Evidence**
- Full pipeline runs successfully on sample data
- All unit tests pass (`pytest` green)
- Validation warnings correctly logged for edge cases