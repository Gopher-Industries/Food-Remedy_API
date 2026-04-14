import json
import os
from database.logging_system.logger import PipelineLogger

logger = PipelineLogger("DB021_VALIDATOR")


class DB021Validator:

    def __init__(self):
        self.schema = self.load_schema()

    #  LOAD SCHEMA
    def load_schema(self):
        schema_path = os.path.join(
            "database", "seeding", "schema_definition.json"
        )
        with open(schema_path, "r") as f:
            return json.load(f)

    #  TYPE MAP
    TYPE_MAP = {
        "string": str,
        "number": (int, float),
        "array": list,
        "object": dict
    }

    # -----------------------------
    # 🔹 BASIC VALIDATIONS
    # -----------------------------

    REQUIRED_FIELDS = [
        "barcode",
        "productName",
        "nutriments",
        "allergens"
    ]

    def validate_schema_basic(self, products):
        invalid = 0

        for p in products:
            for field in self.REQUIRED_FIELDS:
                if field not in p or p.get(field) in [None, "", []]:
                    invalid += 1

        logger.info(f"Basic schema issues: {invalid}")
        return invalid == 0

    def validate_nutrients(self, products):
        errors = 0

        for p in products:
            if not isinstance(p.get("nutriments", {}), dict):
                errors += 1

        logger.info(f"Nutrient structure errors: {errors}")
        return errors == 0

    def validate_allergens(self, products):
        errors = 0

        for p in products:
            if not isinstance(p.get("allergens", []), list):
                errors += 1

        logger.info(f"Allergen errors: {errors}")
        return errors == 0

    # -----------------------------
    # 🔹 ADVANCED SCHEMA VALIDATION
    # -----------------------------

    def validate_type(self, value, expected_type):
        return isinstance(value, self.TYPE_MAP.get(expected_type, object))

    def validate_record_schema(self, record):
        errors = []
        fields = self.schema["fields"]

        for field_name, rules in fields.items():

            value = record.get(field_name)

            #  REQUIRED CHECK
            if rules.get("required", False):
                if value in [None, "", []]:
                    errors.append(f"{field_name} missing")
                    continue

            if value is None:
                continue

            #  TYPE CHECK
            if not self.validate_type(value, rules["type"]):
                errors.append(f"{field_name} wrong type")
                continue

            #  ENUM CHECK (FIXED)
            if "enum" in rules:
                if value not in rules["enum"] and value not in [None, ""]:
                    errors.append(f"{field_name} invalid enum")

            # ARRAY ITEM CHECK
            if rules["type"] == "array" and "items" in rules:
                if not all(isinstance(i, self.TYPE_MAP[rules["items"]]) for i in value):
                    errors.append(f"{field_name} invalid array items")

            #  OBJECT VALIDATION (FIXED)
            if rules["type"] == "object":

                # Required subfields
                if "required_subfields" in rules:
                    for sub in rules["required_subfields"]:
                        if sub not in value:
                            errors.append(f"{field_name}.{sub} missing")

                # Subfield type validation (NULL SAFE)
                if "subfields" in rules:
                    for subfield, subrules in rules["subfields"].items():
                        if subfield in value:

                            sub_value = value[subfield]

                            # Allow null/empty values
                            if sub_value in [None, ""]:
                                continue

                            if not isinstance(sub_value, self.TYPE_MAP[subrules["type"]]):
                                errors.append(f"{field_name}.{subfield} wrong type")

        return errors

    def validate_full_schema(self, products):
        invalid = 0
        all_errors = []

        for idx, p in enumerate(products):
            errs = self.validate_record_schema(p)

            if errs:
                invalid += 1
                all_errors.append({
                    "index": idx,
                    "barcode": p.get("barcode", "N/A"),
                    "errors": errs
                })

        logger.info(f"Advanced schema invalid records: {invalid}")

        return {
            "valid": invalid == 0,
            "invalid_count": invalid,
            "errors": all_errors
        }

    # -----------------------------
    #  BARCODE VALIDATION
    # -----------------------------

    def validate_barcodes(self, products):
        empty = 0
        invalid_format = 0
        duplicates = 0
        seen = set()

        for p in products:
            barcode = str(p.get("barcode", "")).strip()

            if not barcode:
                empty += 1
                continue

            if len(barcode) != 13 or not barcode.isdigit():
                invalid_format += 1
                continue

            if barcode in seen:
                duplicates += 1
            else:
                seen.add(barcode)

        total = empty + invalid_format + duplicates

        logger.info(
            f"Barcode issues: empty={empty}, invalid={invalid_format}, duplicates={duplicates}"
        )

        return {
            "ok": total == 0,
            "empty": empty,
            "invalid_format": invalid_format,
            "duplicates": duplicates,
            "total_issues": total
        }

    # -----------------------------
    #  REPORT GENERATION
    # -----------------------------

    def generate_report(self, results):
        output_path = os.path.join(
            "database", "Validation", "schema_validation_report.json"
        )

        with open(output_path, "w") as f:
            json.dump(results, f, indent=4)

        logger.info(f"Validation report saved: {output_path}")

    # -----------------------------
    #  MASTER FUNCTION
    # -----------------------------

    def run_all_validations(self, products):

        logger.info("Starting DB014 Validation...")

        basic_ok = self.validate_schema_basic(products)
        nutrient_ok = self.validate_nutrients(products)
        allergen_ok = self.validate_allergens(products)
        barcode_result = self.validate_barcodes(products)
        schema_result = self.validate_full_schema(products)

        final_result = {
            "basic_schema": basic_ok,
            "nutrients": nutrient_ok,
            "allergens": allergen_ok,
            "barcode": barcode_result,
            "schema_validation": schema_result
        }

        self.generate_report(final_result)

        logger.info("Validation Completed")

        return final_result


# -----------------------------
# 🔹 MAIN RUNNER 
# -----------------------------
if __name__ == "__main__":

    DATA_PATH = os.path.join(
        "database", "seeding", "products_5k_test.json"
    )

    print("Running DB014 validation...\n")

    with open(DATA_PATH, "r") as f:
        products = json.load(f)

    validator = DB021Validator()
    result = validator.run_all_validations(products)

    print("\n FINAL RESULT:\n")
    print(result)