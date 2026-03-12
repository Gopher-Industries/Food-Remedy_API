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
