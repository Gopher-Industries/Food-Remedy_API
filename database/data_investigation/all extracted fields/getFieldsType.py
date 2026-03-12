import json
from collections import defaultdict


def flatten_keys_with_types(obj, prefix=''):
    """Recursively flatten keys and record their types."""
    types = {}
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        types.setdefault(full_key, set()).add(type(v).__name__)
        if isinstance(v, dict):
            nested = flatten_keys_with_types(v, full_key)
            for nk, nv in nested.items():
                types.setdefault(nk, set()).update(nv)
    return types


def extract_fields_with_types(path):
    field_types = defaultdict(set)
    count = 0

    with open(path, 'r', encoding='utf-8') as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                field_map = flatten_keys_with_types(data)
                for key, types in field_map.items():
                    field_types[key].update(types)
                count += 1
            except json.JSONDecodeError:
                continue

    return dict(sorted(field_types.items()))


if __name__ == "__main__":
    file_path = "data/data fields/openfoodfacts-australia.jsonl"
    output_file = "data/data fields/extracted_fields_with_types.txt"
    fields = extract_fields_with_types(file_path)

    with open(output_file, 'w', encoding='utf-8') as out:
        for field, types in fields.items():
            type_list = ", ".join(sorted(types))
            out.write(f"{field}: {type_list}\n")

    print(
        f"Inferred types for {len(fields)} fields written to '{output_file}'.")
