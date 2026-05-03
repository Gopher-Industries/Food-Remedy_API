import firebase_admin
from firebase_admin import credentials, firestore
from database.logging_system.logger import PipelineLogger
import time

# Add integration tests for: product lookup by barcode, 
# category queries, recommendation candidate queries.

class DB012IntegrationTest:
    """
    Integration....

    Methods:
    - test_product_lookup(self, barcode) -> bool:
        Test product lookup by barcode.
    
    """
    def __init__(self, key_path="serviceAccountKey.json"):
        self.logger = PipelineLogger("INTEGRATION_TEST")

        try:
            self.cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(self.cred)
            self.logger.info("Firebase initialized successfully.")
        except Exception as e:
            self.logger.error(f"Failed to connect to Firebase: {e}")
            self.db = None

    # Test product lookup by barcode
    def test_product_lookup(self, barcode):
        self.logger.info(f"Test: Looking up barcode {barcode}...")
        doc = self.db.collection("PRODUCTS").document(barcode).get()

        if doc.exists:
            data = doc.to_dict()
            self.logger.info(f"Test passed! Product found: {data.get('productName', 'Unknown')}")
            return True
        else:
            self.logger.error(f"Test failed! Product {barcode} not found.")
            return False
    
    # Test category query
    def test_category_query(self, category):
        self.logger.info(f"Test querying category: {category}...")
        # Filters the PRODUCTS collection for a specific category tag
        docs = self.db.collection("PRODUCTS").where("categories", "array_contains", category).limit(5).stream()
        
        results = [d.id for d in docs]
        if results:
            self.logger.info(f"Test passed! Found {len(results)} items in '{category}': {results}")
        else:
            self.logger.error(f"Test failed! No items found for category: {category}")

    # Test recommendation candidates
    def test_recommendation_candidates(self, grade="a"):
        self.logger.info(f"Test querying recommendation candidates (Grade: {grade})...")
        # find high-quality products to suggest to users
        docs = self.db.collection("PRODUCTS").where("nutriscoreGrade", "==", grade).limit(5).stream()
        
        results = [d.to_dict().get("productName") for d in docs]
        if results:
            self.logger.info(f"Test passed! Recommendation candidates found: {results}")
        else:
            self.logger.error(f"Test failed! No candidates found with grade '{grade}'.")
    
    # Test to verify if all mandatory fields for the mobile UI are present
    def test_schema_fields(self, barcode):
        self.logger.info(f"Test if schema fields are valid...")

        if not self.db: return
        doc = self.db.collection("PRODUCTS").document(barcode).get()
        data = doc.to_dict()
        required = ["productName", "nutriments", "nutriscoreGrade"]
        
        missing = [field for field in required if field not in data]
        if not missing:
            self.logger.info(f"Test passed! All mandatory fields present.")
        else:
            self.logger.error(f"Test failed! Missing fields: {missing}")
        
    # Run all integration tests
    def run_all(self, sample_barcode, sample_category):
        if not self.db: return

        self.logger.info("==Starting DB012 Integration Testing==")
        self.test_product_lookup(sample_barcode)
        self.test_category_query(sample_category)
        self.test_recommendation_candidates()
        self.test_schema_fields(sample_barcode)
        self.logger.info("==Integration Testing Complete==")

if __name__ == "__main__":
    # Ensure you use a barcode actually present in your products_enriched.json
    tester = DB012IntegrationTest()
    tester.run_all("9337951006005", "Snacks")