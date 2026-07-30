import json
import os
from database.logging_system.logger import PipelineLogger
from database.Validation.schema_loader import load_schema
from database.Validation.report_generator import generate_report

logger = PipelineLogger("DB021_VALIDATOR")


class DB021Validator:

    def __init__(self):
        self.schema = load_schema()

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

    REQUIRED_FIELDS = ["barcode", "productName"]

    def preprocess_record(self, record):
        normalized = dict(record)

        barcode = normalized.get("barcode")
        if barcode is not None:
            normalized["barcode"] = str(barcode).strip()

        product_name = normalized.get("productName")
        if product_name in [None, ""]:
            fallback = (
                normalized.get("genericName")
                or normalized.get("brand")
                or normalized.get("barcode")
            )
            if fallback not in [None, ""]:
                normalized["productName"] = str(fallback).strip()

        nutriscore = normalized.get("nutriscoreGrade")
        if isinstance(nutriscore, str):
            normalized_grade = nutriscore.strip().lower()
            if normalized_grade == "not-applicable":
                normalized_grade = "unknown"
            normalized["nutriscoreGrade"] = normalized_grade

        return normalized

    def validate_schema_basic(self, products):
        invalid = 0

        for p in products:
            p = self.preprocess_record(p)
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
                                continue

                            if (
                                subrules.get("type") == "array"
                                and "items" in subrules
                                and isinstance(sub_value, list)
                                and not all(
                                    isinstance(i, self.TYPE_MAP[subrules["items"]])
                                    for i in sub_value
                                )
                            ):
                                errors.append(f"{field_name}.{subfield} invalid array items")

        return errors

    def validate_full_schema(self, products):
        invalid = 0
        all_errors = []

        for idx, p in enumerate(products):
            p = self.preprocess_record(p)
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

    @staticmethod
    def _is_valid_barcode_format(barcode: str) -> bool:
        """
        Accepts numeric-only barcodes at standard retail lengths:
        EAN-8 (8), UPC-A (12), EAN-13 (13), GTIN-14 (14).

        Note: schema_definition.json's `description` field claims barcodes
        are "13 digits, no leading zeros" - real sample data
        (products_5k_test.json, 5000 records) contradicts this: 111 records
        use 8-digit EAN-8, 4 use 14-digit GTIN-14, and 579 (~11.6%) have a
        legitimate leading zero. This implementation follows real production
        data and standard retail barcode formats instead. Flagged as a
        schema documentation issue in the PR rather than enforced here.
        """
        return barcode.isdigit() and len(barcode) in (8, 12, 13, 14)

    def validate_barcodes(self, products):
        empty = 0
        invalid_type = 0
        duplicates = 0
        seen = set()

        for p in products:
            raw_barcode = p.get("barcode", "")

            if raw_barcode in [None, ""]:
                empty += 1
                continue

            barcode = str(raw_barcode).strip()
            if not barcode:
                empty += 1
                continue

            # DB012: reject malformed barcodes (non-numeric or non-standard length)
            if not self._is_valid_barcode_format(barcode):
                invalid_type += 1
                continue

            if barcode in seen:
                duplicates += 1
            else:
                seen.add(barcode)

        total = empty + invalid_type + duplicates

        logger.info(
            f"Barcode issues: empty={empty}, invalid={invalid_type}, duplicates={duplicates}"
        )

        return {
            "ok": total == 0,
            "empty": empty,
            "invalid_format": invalid_type,
            "duplicates": duplicates,
            "total_issues": total
        }

    # -----------------------------
    #  REPORT GENERATION
    # -----------------------------

    def generate_report(self, results):
        generate_report(results)

    # -----------------------------
    #  MASTER FUNCTION
    # -----------------------------

    def run_all_validations(self, products):

        logger.info("Starting DB014 Validation...")

        preprocessed = [self.preprocess_record(p) for p in products]

        basic_ok = self.validate_schema_basic(preprocessed)
        nutrient_ok = self.validate_nutrients(preprocessed)
        allergen_ok = self.validate_allergens(preprocessed)
        barcode_result = self.validate_barcodes(preprocessed)
        schema_result = self.validate_full_schema(preprocessed)

        final_result = {
            "total_records": len(preprocessed),
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

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)

    validator = DB021Validator()
    result = validator.run_all_validations(products)

    print("\n FINAL RESULT:\n")
    print(result)
