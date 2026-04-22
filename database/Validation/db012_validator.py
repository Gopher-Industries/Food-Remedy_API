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

    def validate(self, file_path='database/seeding/products_enriched.json'):
        """
        Return a boolean indicates if the test is success.
        """
        logger.info(f"Starting batch validation...")
        
        logger.info(f"Validating {file_path}...")

        result = True

        try:
            with open(file_path, "r", encoding="utf-8") as file:
                products = json.load(file)

            # run DB021 validator
            validate_results = self.validator.run_all_validations(products)

            if not validate_results["schema_validation"]["valid"] or not validate_results["barcode"]["ok"]:
                logger.error(f"{file_path} failed! Critical validation check needed.")
                logger.error(validate_results["schema_validation"]["valid"])
                logger.error(validate_results["barcode"]["ok"])
                result = False
            else:
                logger.info(f"{file_path} passed all checks.")
        
        except Exception as e:
            logger.error(f"Failed to process {file_path}: {str(e)}")
            result = False
            
        return result
    
# To run the validation test
def _test_validation_batch():
    validator = BatchValidator()

    validator.validate()

if __name__ == '__main__':
    _test_validation_batch()