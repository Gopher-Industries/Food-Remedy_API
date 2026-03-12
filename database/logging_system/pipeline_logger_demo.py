"""
Demonstration of DB005 Basic Logging System.
Logs each stage of the example database pipeline.
"""

from logger import get_logger
import time

logger = get_logger("DatabasePipeline")

def load_data_stage():
    logger.info("Starting data loading stage...")
    time.sleep(0.3)
    logger.info("Data loaded successfully.")

def validate_data_stage():
    logger.info("Validating dataset structure...")
    time.sleep(0.2)
    logger.warning("Some rows contain missing fields but continue processing.")

def clean_data_stage():
    logger.info("Cleaning data fields...")
    time.sleep(0.3)
    logger.info("Data cleaning completed.")

def transform_data_stage():
    logger.info("Transforming data for database ingestion...")
    time.sleep(0.25)
    logger.info("Transformation completed.")

def save_data_stage():
    logger.info("Saving cleaned dataset to database...")
    time.sleep(0.2)

    try:
        # simulate failure
        raise ValueError("Database connection failed.")
    except Exception as e:
        logger.error(f"Failed to save data: {e}")

def main():
    logger.info("=== Pipeline started ===")

    load_data_stage()
    validate_data_stage()
    clean_data_stage()
    transform_data_stage()
    save_data_stage()

    logger.info("=== Pipeline finished ===")

if __name__ == "__main__":
    main()
