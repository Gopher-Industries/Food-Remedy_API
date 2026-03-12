# database/seeding/seed_products.py

from database.logging_system.logger import PipelineLogger

# Initialize logger
logger = PipelineLogger("seed_products")

def seed_products():
    logger.info("Seeding products started.")
    
    # Your seeding logic here
    try:
        # Example: seed product data
        products = [
            {"name": "Apple", "price": 1.0},
            {"name": "Banana", "price": 0.5},
        ]
        logger.info(f"Seeding {len(products)} products...")
        # Simulate seeding
        for product in products:
            logger.info(f"Inserted product: {product['name']} at ${product['price']}")
        
        logger.info("Seeding products completed successfully.")

    except Exception as e:
        logger.error(f"Error while seeding products: {e}")

if __name__ == "__main__":
    seed_products()

