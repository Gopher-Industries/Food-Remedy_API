from database.logging_system.logger import PipelineLogger

logger = PipelineLogger("seed_products")


def seed_products():
    logger.info("Seeding products started.")

    try:
        products = [
            {
                "productName": "Apple",
                "barcode": "100001",
                "ingredientsText": "apple",
                "additivesText": "",
                "allergensText": "",
                "nutrition": {
                    "sugarG": 10
                }
            },
            {
                "productName": "Banana",
                "barcode": "100002",
                "ingredientsText": "banana",
                "additivesText": "",
                "allergensText": "",
                "nutrition": {
                    "sugarG": 12
                }
            }
        ]

        logger.info(f"Seeding {len(products)} products...")

        for product in products:
            logger.info(
                f"Inserted product: {product['productName']} ({product['barcode']})"
            )

        logger.info("Seeding products completed successfully.")

    except Exception as e:
        logger.error(f"Error while seeding products: {e}")


if __name__ == "__main__":
    seed_products()