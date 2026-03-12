import json

# File paths
main_dataset_path = r"C:data/demo data/openfoodfacts-australia.jsonl"
output_path = r"C:data/demo data/openfoodfacts_all_fields_filled.jsonl"

def has_all_fields_filled(product):
    """Return True if all fields in product are non-empty and non-null."""
    for key, value in product.items():
        if value is None:  # null check
            return False
        if isinstance(value, str) and not value.strip():  # empty string check
            return False
        if isinstance(value, (list, dict)) and not value:  # empty list/dict check
            return False
    return True

# Process dataset
count_total = 0
count_kept = 0

with open(main_dataset_path, 'r', encoding='utf-8') as infile, \
     open(output_path, 'w', encoding='utf-8') as outfile:
    
    for line in infile:
        count_total += 1
        product = json.loads(line)
        
        if has_all_fields_filled(product):
            outfile.write(json.dumps(product) + '\n')
            count_kept += 1

print(f" Done! Checked {count_total} products.")
print(f" Saved {count_kept} products with all fields filled to {output_path}")
