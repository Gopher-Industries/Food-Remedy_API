import json


def flatten_keys(obj, prefix=''):
    """Recursively flatten nested keys using dot notation."""
    keys = set()
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        keys.add(full_key)
        if isinstance(v, dict):
            keys.update(flatten_keys(v, full_key))
    return keys


def extract_fields_from_jsonl(path):
    seen_fields = set()
    count = 0

    with open(path, 'r', encoding='utf-8') as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                seen_fields.update(flatten_keys(data))
                count += 1
            except json.JSONDecodeError:
                continue

    return sorted(seen_fields)


if __name__ == "__main__":
    file_path = "data/data fields/openfoodfacts-australia.jsonl"
    output_file = "data/data fields/extracted_fields.txt"
    fields = extract_fields_from_jsonl(file_path)

    with open(output_file, 'w', encoding='utf-8') as out:
        for field in fields:
            out.write(field + '\n')

    print(f"Extracted {len(fields)} field names written to '{output_file}'.")
