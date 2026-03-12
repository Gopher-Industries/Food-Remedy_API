"""
DB006 Step 1: Create 0-2k QA Sample
This script creates a 0-2k product sample from the full dataset for initial QA checks.
"""

import json
import random

# Step 1: Load the full dataset
input_file = "database/seeding/products_0k_10k.json"
with open(input_file, "r") as f:
    full_data = json.load(f)

# Step 2: Sample 2000 products
sample_size = 2000
qa_sample = random.sample(full_data, min(sample_size, len(full_data)))

# Step 3: Save the sampled dataset
output_file = "database/seeding/qa_sample_0k_2k.json"
with open(output_file, "w") as f:
    json.dump(qa_sample, f, indent=4)

print(f"QA sample created successfully with {len(qa_sample)} products!")
