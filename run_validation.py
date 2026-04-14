import json
from database.Validation.db021_validator import DB021Validator

#  Change file if needed
DATA_PATH = "database/seeding/products_5k_test.json"

with open(DATA_PATH, "r") as f:
    products = json.load(f)

validator = DB021Validator()
result = validator.run_all_validations(products)

print("\nFINAL RESULT:\n")
print(result)