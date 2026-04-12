"""
DB021 / DB014 - dataset structure validation.

- Basic checks: required columns for pipeline use (legacy + stricter optional mode).
- Full checks: walk ``schema_definition.json`` for types, enums, arrays, nested objects.

``database/pipeline/modules/db021_runner.py`` expects ``validate_schema``, ``validate_access``,
``validate_nutrients``, ``validate_allergens``, ``validate_barcodes``, ``clean_barcodes``.
"""

import json
import os
from database.logging_system.logger import PipelineLogger
from database.Validation.schema_loader import load_schema

logger = PipelineLogger("DB021_VALIDATOR")

TYPE_MAP = {
    "string": str,
    "number": (int, float),
    "array": list,
    "object": dict,
}


class DB021Validator:
    """Validate product dicts before seeding / after enrichment."""

    REQUIRED_FIELDS = [
        "barcode",
        "productName",
        "nutriments",
        "allergens",
    ]

    def __init__(self, schema_path=None):
        self._schema_path = schema_path
        self._schema = None

    @property
    def schema(self):
        if self._schema is None:
            self._schema = load_schema(self._schema_path)
        return self._schema

    def load_schema(self):
        """Reload schema from disk (tests or alternate path)."""
        self._schema = load_schema(self._schema_path)
        return self._schema

    # --- legacy API (presence of keys only) ---------------------------------
    def validate_schema(self, products):
        invalid = 0
        for p in products:
            for field in self.REQUIRED_FIELDS:
                if field not in p:
                    invalid += 1
        logger.info(f"Schema issues (keys only): {invalid}")
        return invalid == 0

    # --- DB014: stricter “basic” schema --------------------------------------
    def validate_schema_basic(self, products):
        """Required fields present and non-empty (allergens may be [])."""
        invalid = 0
        for p in products:
            for field in self.REQUIRED_FIELDS:
                if field not in p:
                    invalid += 1
                    continue
                v = p.get(field)
                if field == "allergens":
                    if not isinstance(v, list):
                        invalid += 1
                elif field == "nutriments":
                    if not isinstance(v, dict):
                        invalid += 1
                elif v in (None, "", []):
                    invalid += 1
        logger.info(f"Basic schema issues: {invalid}")
        return invalid == 0

    def validate_nutrients(self, products):
        errors = 0
        for p in products:
            n = p.get("nutriments", {})
            if not isinstance(n, dict):
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

    def validate_access(self, products):
        try:
            sample = products[:10]
            for p in sample:
                _ = p["barcode"]
                _ = p["productName"]
            return True
        except Exception as e:
            logger.error(str(e))
            return False

    @staticmethod
    def _barcode_digits(barcode_raw):
        return str(barcode_raw or "").strip()

    @staticmethod
    def _is_valid_barcode_format(barcode):
        """GTIN-style: digits only, length 8 / 12 / 13 (common AU OFF exports)."""
        if not barcode or not barcode.isdigit():
            return False
        return len(barcode) in (8, 12, 13)

    def validate_barcodes(self, products):
        empty = 0
        invalid_format = 0
        duplicates = 0
        seen = set()

        for p in products:
            barcode = self._barcode_digits(p.get("barcode", ""))
            if not barcode:
                empty += 1
                continue
            if not self._is_valid_barcode_format(barcode):
                invalid_format += 1
                continue
            if barcode in seen:
                duplicates += 1
            else:
                seen.add(barcode)

        total_issues = empty + invalid_format + duplicates
        logger.info(
            f"Barcode issues: empty={empty}, invalid_format={invalid_format}, "
            f"duplicates={duplicates}, total={total_issues}"
        )
        return {
            "ok": total_issues == 0,
            "empty": empty,
            "invalid_format": invalid_format,
            "duplicates": duplicates,
            "total_issues": total_issues,
        }

    def clean_barcodes(self, products):
        cleaned = []
        removed_empty = 0
        removed_invalid_format = 0
        removed_duplicates = 0
        seen = set()

        for p in products:
            barcode = self._barcode_digits(p.get("barcode", ""))
            if not barcode:
                removed_empty += 1
                continue
            if not self._is_valid_barcode_format(barcode):
                removed_invalid_format += 1
                continue
            if barcode in seen:
                removed_duplicates += 1
                continue
            seen.add(barcode)
            cleaned.append(p)

        removed_total = removed_empty + removed_invalid_format + removed_duplicates
        logger.info(
            "Barcode cleaning removed: "
            f"empty={removed_empty}, invalid_format={removed_invalid_format}, "
            f"duplicates={removed_duplicates}, total={removed_total}"
        )
        details = {
            "removed_empty": removed_empty,
            "removed_invalid_format": removed_invalid_format,
            "removed_duplicates": removed_duplicates,
            "removed_barcodes": removed_total,
        }
        return cleaned, removed_total, details

    # --- type / schema walk ---------------------------------------------------
    @staticmethod
    def validate_type(value, expected_type):
        if not expected_type:
            return True
        py = TYPE_MAP.get(expected_type)
        if py is None:
            return True
        return isinstance(value, py)

    @staticmethod
    def _normalize_string_enum(value):
        if not isinstance(value, str):
            return None
        s = value.strip()
        return s.lower() if s else None

    def validate_record_schema(self, record):
        """Return human-readable errors for one record (schema-driven)."""
        errors = []
        fields = self.schema.get("fields") or {}

        for field_name, rules in fields.items():
            if not isinstance(rules, dict):
                continue
            value = record.get(field_name)

            if rules.get("required") and (
                value is None or value == "" or value == []
            ):
                errors.append(f"{field_name} missing")
                continue
            if value is None or value == "":
                continue
            if value == [] and rules.get("type") == "array":
                continue

            expected = rules.get("type")
            if expected and not self.validate_type(value, expected):
                errors.append(f"{field_name} wrong type")
                continue

            if expected == "string" and "enum" in rules:
                vn = self._normalize_string_enum(value)
                if vn is not None:
                    allowed = [str(e).lower() for e in rules["enum"]]
                    if vn not in allowed:
                        errors.append(f"{field_name} invalid enum")

            if expected == "array" and isinstance(value, list):
                item_t = rules.get("items", "string")
                py_item = TYPE_MAP.get(item_t, str)
                for i, item in enumerate(value):
                    if not isinstance(item, py_item):
                        errors.append(f"{field_name}[{i}] invalid item type")
                        break

            if expected == "object" and isinstance(value, dict):
                if len(value) == 0:
                    continue
                for sub in rules.get("required_subfields", []):
                    sv = value.get(sub)
                    if sv in (None, "", []):
                        errors.append(f"{field_name}.{sub} missing")

                for subfield, subrules in rules.get("subfields", {}).items():
                    if not isinstance(subrules, dict):
                        continue
                    if subfield not in value:
                        continue
                    sv = value[subfield]
                    if sv in (None, ""):
                        continue
                    st = subrules.get("type")
                    if st and not self.validate_type(sv, st):
                        errors.append(f"{field_name}.{subfield} wrong type")
                        continue
                    if isinstance(sv, dict):
                        for rs in subrules.get("required_subfields", []):
                            inner = sv.get(rs)
                            if inner in (None, "", []):
                                errors.append(f"{field_name}.{subfield}.{rs} missing")

        return errors

    def validate_full_schema(self, products):
        invalid = 0
        all_errors = []
        for idx, p in enumerate(products):
            errs = self.validate_record_schema(p)
            if errs:
                invalid += 1
                all_errors.append(
                    {
                        "index": idx,
                        "barcode": p.get("barcode", "N/A"),
                        "errors": errs,
                    }
                )
        logger.info(f"Advanced schema invalid records: {invalid}")
        return {
            "valid": invalid == 0,
            "invalid_count": invalid,
            "errors": all_errors,
        }

    def generate_report(self, results, output_path=None):
        if output_path is None:
            output_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "schema_validation_report.json",
            )
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        logger.info(f"Validation report saved: {output_path}")
        return output_path

    def run_all_validations(self, products, write_report=True, report_path=None):
        """
        Run basic + nutrient + allergen + barcode + full schema checks.

        Does not mutate ``products``. Call ``clean_barcodes`` first if you need deduped data.
        """
        logger.info("Starting DB014 / DB021 validation bundle")
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
            "schema_validation": schema_result,
        }
        if write_report:
            self.generate_report(final_result, report_path)
        logger.info("Validation bundle completed")
        return final_result
