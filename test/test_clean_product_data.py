import unittest

from utils.missing_value_utils import clean_completeness


class TestCleanCompleteness(unittest.TestCase):
    def test_clean_completeness_clamps_values_to_valid_range(self):
        self.assertEqual(clean_completeness(1.0875), 1.0)
        self.assertEqual(clean_completeness(-0.2), 0.0)
        self.assertEqual(clean_completeness(0.75), 0.75)

    def test_clean_completeness_handles_missing_values(self):
        self.assertEqual(clean_completeness(None), 0.0)
        self.assertEqual(clean_completeness(""), 0.0)


if __name__ == "__main__":
    unittest.main()
