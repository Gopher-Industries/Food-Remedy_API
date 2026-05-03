import json
from firebase_admin import credentials, firestore, initialize_app

class BatchSeeder:
    def __init__(self, key_path="serviceAccountKey.json"):
        cred = credentials.Certificate(key_path)
        initialize_app(cred)
        self.db = firestore.client()
        self.collection_name = "PRODUCTS" 

    def seed_data(self, json_file_path):
        with open(json_file_path, 'r', encoding='utf-8') as f:
            products = json.load(f)

        total_records = len(products)
        batch_size = 500
        print(f"Starting batch seed: {total_records} records.")

        for i in range(0, total_records, batch_size):
            # Create a new batch for every chunk
            batch = self.db.batch()
            chunk = products[i : i + batch_size]

            for product in chunk:
                barcode = product.get("barcode")
                if not barcode:
                    continue
                
                # document reference
                doc_ref = self.db.collection(self.collection_name).document(str(barcode))
                batch.set(doc_ref, product)

            # commit the batch to the database
            try:
                batch.commit()
                progress = min(i + batch_size, total_records)
                print(f"Seeding done! Committed: {progress}/{total_records} records.")
            except Exception as e:
                print(f"Error found! Batch starting at index {i} failed: {e}")

        print("Seeding completed successfully.")

if __name__ == "__main__":
    seeder = BatchSeeder()
    seeder.seed_data("database/seeding/products_enriched.json")