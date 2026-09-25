# DB005 - Nutrient Unit Normalisation Investigation

## Overview
Investigated how nutrient units are standardised during the database cleaning process.

## File Investigated
`database/clean_data/normalization/NutrientUnitNormalisation.py`

## Main Function

This function converts OpenFoodFacts nutrient data into consistent units.

## Normalisation Process

The script:
- Parses nutrient values and units.
- Converts mass units into grams/milligrams.
- Converts energy values into kJ and kcal.
- Creates standardised nutrient fields.

## Pipeline Integration

The normalisation function is used in:

`database/pipeline/stages/clean_stage.py`

During the clean stage:


normalize_nutriments_dict(nutriments)


is called and the output is stored with the prefix:


norm_


Example fields:

- norm_energy_kj
- norm_energy_kcal
- norm_fat_g
- norm_sugars_g
- norm_proteins_g
- norm_sodium_mg
- norm_fiber_g

## Testing

Command executed:


python3 database/clean_data/normalization/NutrientUnitNormalisation.py


Result:


All tests passed


## Validation

The clean pipeline was executed:


python3 database/pipeline/run_pipeline.py -c database/pipeline/pipeline.config.json --clean --no-enrich --no-seed --force


Output generated:


database/data_investigation/exampleProductCleaned.json


The output confirmed that normalised nutrient fields were successfully added.
