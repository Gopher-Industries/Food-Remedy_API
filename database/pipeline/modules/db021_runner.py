import sys
import os
import json
import time

# ---- FORCE PROJECT ROOT INTO PYTHON PATH ----
ROOT = os.path.abspath(os.getcwd())
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from database.logging_system.logger import PipelineLogger
from database.Validation.db021_validator import DB021Validator
from database.Reports.db021_report_generator import DB021ReportGenerator

logger = PipelineLogger("DB021")

class DB021Runner:

    def __init__(self, mode="5k"):
        self.mode = mode
        self.validator = DB021Validator()
        self.reporter = DB021ReportGenerator()

        if mode == "5k":
            self.files = [
                "database/seeding/products_5k_test.json"
            ]
        else:
            self.files = [
                "database/seeding/products_0k_10k.json",
                "database/seeding/products_10k_20k.json"
            ]

    def load_products(self):
        products = []

        for file in self.files:
            logger.info(f"Loading {file}")

            if not os.path.exists(file):
                logger.error(f"File not found: {file}")
                continue

            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
                products.extend(data)

        logger.info(f"Total products loaded: {len(products)}")
        return products


    def run(self):

        start = time.time()

        products = self.load_products()
        original_count = len(products)

        products = self.validator.clean_barcodes(products)
        removed = original_count - len(products)

        results = {
            "total_records": len(products),
            "schema_valid": self.validator.validate_schema(products),
            "nutrient_check": self.validator.validate_nutrients(products),
            "allergen_check": self.validator.validate_allergens(products),
            "accessibility": self.validator.validate_access(products),
            "barcode_check": self.validator.validate_barcodes(products)
        }

        duration = round(time.time() - start, 2)
        results["duration_seconds"] = duration

        logger.info(f"Validation completed in {duration}s")

        if self.mode == "20k":
            self.reporter.generate_pdf(results)

        logger.info("DB021 Completed")
        return results

if __name__ == "__main__":
    runner = DB021Runner(mode="20k")
    runner.run()

