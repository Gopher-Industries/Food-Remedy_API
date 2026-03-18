from database.logging_system.logger import PipelineLogger

logger = PipelineLogger("DB021_VALIDATOR")

class DB021Validator:

    REQUIRED_FIELDS = [
        "barcode",
        "productName",
        "nutriments",
        "allergens"
    ]

    def validate_schema(self, products):
        invalid = 0

        for p in products:
            for field in self.REQUIRED_FIELDS:
                if field not in p:
                    invalid += 1

        logger.info(f"Schema issues: {invalid}")
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

    def validate_barcodes(self, products):
        empty = 0
        invalid_format = 0
        duplicates = 0
        seen = set()
    
        for p in products:
            barcode_raw = p.get("barcode", "")
            barcode = str(barcode_raw).strip()
    
            if not barcode:
                empty += 1
                continue
    
            if (len(barcode) != 13) or (not barcode.isdigit()):
                invalid_format += 1
                continue
    
            if barcode in seen:
                duplicates += 1
            else:
                seen.add(barcode)
    
        total_issues = empty + invalid_format + duplicates
        logger.info(
            f"Barcode issues: empty={empty}, invalid_format={invalid_format}, duplicates={duplicates}, total={total_issues}"
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
            barcode_raw = p.get("barcode", "")
            barcode = str(barcode_raw).strip()
    
            if not barcode:
                removed_empty += 1
                continue
    
            if (len(barcode) != 13) or (not barcode.isdigit()):
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
            f"empty={removed_empty}, invalid_format={removed_invalid_format}, duplicates={removed_duplicates}, total={removed_total}"
        )
    
        return cleaned, removed_total, {
            "removed_empty": removed_empty,
            "removed_invalid_format": removed_invalid_format,
            "removed_duplicates": removed_duplicates,
            "removed_barcodes": removed_total,
        }
    
