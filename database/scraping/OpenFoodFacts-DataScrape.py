import urllib.request
import gzip
import json
import logging
import os
from datetime import datetime

# ============================================================
# LOGGING CONFIG (DB005 REQUIREMENT)
# ============================================================

LOG_FOLDER = "logs"
os.makedirs(LOG_FOLDER, exist_ok=True)

log_file = os.path.join(LOG_FOLDER, f"scrape_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | scrape | %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("scraper")

# ============================================================
# CONFIG / CONSTANTS
# ============================================================

URL = "https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz"
OUTPUT = "openfoodfacts-australia.jsonl"

FIELDS = [
    "id", "code", "brands", "product_name", "generic_name",
    "additives_tags", "allergens", "allergens_tags", "categories_tags",
    "ingredients_tags", "ingredients_text", "ingredients_from_palm_oil_n",
    "ingredients_analysis_tags", "labels_tags", "nutrient_levels", "nutriments",
    "nutriscore_grade", "product_quantity", "product_quantity_unit", "quantity",
    "serving_quantity", "serving_quantity_unit", "serving_size", "traces",
    "traces_from_ingredients", "completeness"
]

# ============================================================
# MAIN SCRAPER FUNCTION
# ============================================================

def stream_australia_products(url, output_file):
    """
    Stream large OFF dataset line by line, extract only AU products,
    write to JSONL, and log each stage.
    """

    logger.info("START: OpenFoodFacts scraping pipeline")
    logger.info(f"Source URL: {url}")
    logger.info(f"Output file: {output_file}")

    try:
        with urllib.request.urlopen(url) as resp:
            logger.info("Connected to OpenFoodFacts URL successfully")
            with gzip.GzipFile(fileobj=resp) as gz:
                logger.info("Streaming + decompressing dataset...")

                with open(output_file, 'w', encoding='utf-8') as out:
                    logger.info("Output file opened for writing")

                    count = 0
                    skipped = 0
                    processed = 0

                    for raw in gz:
                        processed += 1
                        try:
                            product = json.loads(raw.decode('utf-8'))
                        except json.JSONDecodeError:
                            logger.warning("Skipped malformed JSON line")
                            skipped += 1
                            continue

                        countries = product.get("countries_tags", [])
                        if any("australia" in c for c in countries):
                            filtered = {field: product.get(field, None) for field in FIELDS}
                            out.write(json.dumps(filtered, ensure_ascii=False) + "\n")
                            count += 1

                        # Log progress every 100k records (not spammy)
                        if processed % 100000 == 0:
                            logger.info(f"Processed {processed:,} lines... AU products: {count:,}")

        logger.info(f"FINISHED: Processed {processed:,} total products")
        logger.info(f"Australian products saved: {count:,}")
        logger.info(f"Skipped malformed lines: {skipped:,}")
        logger.info(f"Scraped file saved to: {output_file}")

    except Exception as e:
        logger.error(f"FATAL ERROR during scraping: {e}", exc_info=True)
        raise e


# ============================================================
# SCRIPT ENTRY POINT
# ============================================================

if __name__ == "__main__":
    stream_australia_products(URL, OUTPUT)

