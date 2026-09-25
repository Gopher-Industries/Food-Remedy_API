# Validation Batch Testing

import os
import json
from database.logging_system.logger import PipelineLogger
from database.Validation.db021_validator import DB021Validator

logger = PipelineLogger("BATCH_VALIDATOR")

class BatchValidator:
    """
    The BatchValidator incorporates existing validators 
    to validate in batches before seeding.
    It validates: schema, barcodes, and required fields (nutrient, allergen, access).

    Methods:
    - validate(self, products) -> bool:
        Validate products in batches.
    """

    def __init__(self):
        self.validator = DB021Validator()

    def validate_data(self, products: list) -> bool:
        """
        Validate an in-memory product list (e.g. the exact slice about to be seeded).
        Returns True only if schema and barcode checks pass.
        """
        logger.info("Starting batch validation (in-memory dataset)...")
        try:
            validate_results = self.validator.run_all_validations(products)
            ok = bool(
                validate_results["schema_validation"]["valid"]
                and validate_results["barcode"]["ok"]
            )
            if not ok:
                logger.error("Validation failed: schema or barcode checks did not pass.")
                logger.error(f"schema_valid={validate_results['schema_validation']['valid']}")
                logger.error(f"barcode_ok={validate_results['barcode']['ok']}")
            else:
                logger.info("In-memory dataset passed all critical checks.")
            return ok
        except Exception as e:
            logger.error(f"Validation error: {str(e)}", exc_info=True)
            return False

    def validate(self, file_path='database/seeding/products_enriched.json'):
        """
        Load JSON from disk and validate. Returns True if critical checks pass.
        """
        logger.info(f"Starting batch validation from file: {file_path}...")

        try:
            with open(file_path, "r", encoding="utf-8") as file:
                products = json.load(file)
        except Exception as e:
            logger.error(f"Failed to read {file_path}: {str(e)}", exc_info=True)
            return False

        return self.validate_data(products)
    
# To run the validation test
def _test_validation_batch():
    validator = BatchValidator()

    validator.validate()

if __name__ == '__main__':
    _test_validation_batch()