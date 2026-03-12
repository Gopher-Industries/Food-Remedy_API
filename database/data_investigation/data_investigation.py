"""
DB005 – Data Investigation Script for FoodRemedy
- Loads full product dataset
- Logs all steps
- Lists unique fields
- Checks missing values per field
"""

import os
import json
from database.logging_system.logger import PipelineLogger

# -----------------------
# Initialize Logger
# -----------------------
logger = PipelineLogger("data_investigation")

# -----------------------
# Dataset Path
# -----------------------
DATA_DIR = "../products_with_all_fields_filled"
DATA_FILE = "openfoodfacts_all_fields_filled.json"

# -----------------------
# Load Dataset
# -----------------------
def load_data():
    file_path = os.path.join(DATA_DIR, DATA_FILE)
    if not os.path.exists(file_path):
        logger.error(f"Data file not found: {file_path}")
        return []

    logger.info(f"Loading data from {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    logger.info(f"Loaded {len(data)} records")
    return data

# -----------------------
# Explore Data
# -----------------------
def explore_data(data):
    if not data:
        logger.warning("No data to explore.")
        return

    all_fields = set()
    for product in data:
        all_fields.update(product.keys())
    
    logger.info(f"Total unique fields found: {len(all_fields)}")
    logger.info(f"Fields: {all_fields}")

    # Count missing values for each field
    logger.info("Checking missing values per field...")
    for field in all_fields:
        missing_count = sum(1 for p in data if field not in p or p[field] is None)
        logger.info(f"Field '{field}': {missing_count} missing values")

# -----------------------
# Main Function
# -----------------------
def main():
    logger.info("=== Data Investigation Started ===")
    data = load_data()
    explore_data(data)
    logger.info("=== Data Investigation Completed ===")

# -----------------------
# Run Script
# -----------------------
if __name__ == "__main__":
    main()
