import unittest
import os
import tempfile
from database.pipeline.run_pipeline import ensure_dir


class TestEnsureDir(unittest.TestCase):
    def test_ensure_dir_with_no_directory(self):
        # 1. Proves ensure_dir("pipeline_checkpoints.json") completes without raising an exception.
        try:
            ensure_dir("pipeline_checkpoints.json")
        except Exception as e:
            self.fail(f"ensure_dir raised an exception with no directory path: {e}")

    def test_ensure_dir_creates_directory_correctly(self):
        # 2. Proves a path containing a directory still creates that directory correctly.
        # 3. Uses tempfile.TemporaryDirectory() so no permanent test folders remain.
        with tempfile.TemporaryDirectory() as tmpdir:
            test_path = os.path.join(tmpdir, "nested_dir", "test_file.json")
            target_dir = os.path.dirname(test_path)
            
            self.assertFalse(os.path.exists(target_dir))
            ensure_dir(test_path)
            self.assertTrue(os.path.exists(target_dir))
            self.assertTrue(os.path.isdir(target_dir))


if __name__ == "__main__":
    unittest.main()
