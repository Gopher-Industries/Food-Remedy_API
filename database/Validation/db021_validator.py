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
        errors = 0
        seen = set()

        for p in products:
            barcode = str(p.get("barcode", "")).strip()
            
            if not (len(barcode) == 13 and barcode.isdigit()):
                errors += 1
                continue

            if barcode in seen:
                errors += 1
                continue

        seen.add(barcode)

        logger.info(f"Barcode errors: {errors}")
        return errors == 0

    def clean_barcodes(self, products):
        seen = set()
        cleaned = []

        for p in products:
            barcode = str(p.get("barcode", "")).strip()

            if not (len(barcode) == 13 and barcode.isdigit()):
                continue

            if barcode in seen:
                continue

            seen.add(barcode)
            cleaned.append(p)

        logger.info(f"Products after barcode cleaning: {len(cleaned)}")
        return cleaned
