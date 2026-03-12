import unittest
from load_allergens import load_allergens

class TestAllergens(unittest.TestCase):

    def setUp(self):
        self.allergens = load_allergens()

    def test_exact_allergen_count(self):
        self.assertEqual(len(self.allergens), 14)

    def test_unique_names(self):
        names = [a["name"] for a in self.allergens]
        self.assertEqual(len(names), len(set(names)))

    def test_keywords_exist(self):
        for a in self.allergens:
            self.assertGreater(len(a["keywords"]), 0)

if __name__ == "__main__":
    unittest.main()
