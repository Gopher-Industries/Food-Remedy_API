"""
Clean OpenFoodFacts Australia dataset for database ingestion.
"""

import json
import pandas as pd
import re

from utils.missing_value_utils import (
    normalize_string,
    normalize_list,
    normalize_dict,
    clean_numeric
)

from utils.detect_allergens import detect_allergens  

# === Configuration constants ===
# Edit these paths as needed
# - Find Examples of Input and Output in IOExamples Folder
INPUT_FILE = "database/clean_data/IOExamples/rawSample.jsonl"
OUTPUT_FILE = "database/clean_data/cleanSample.json"

NUTRIENTS_TO_KEEP = {
    # Energy
    "energy_100g", "energy_serving", "energy_unit",
    "energy-kcal_100g", "energy-kcal_serving", "energy-kcal_unit",

    # Fats
    "fat_100g", "fat_serving", "fat_unit",
    "saturated-fat_100g", "saturated-fat_serving", "saturated-fat_unit",
    "trans-fat_100g", "trans-fat_serving", "trans-fat_unit",
    "monounsaturated-fat_100g", "monounsaturated-fat_serving", "monounsaturated-fat_unit",

    # Carbohydrates
    "carbohydrates_100g", "carbohydrates_serving", "carbohydrates_unit",
    "sugars_100g", "sugars_serving", "sugars_unit",
    "fiber_100g", "fiber_serving", "fiber_unit",

    # Proteins
    "proteins_100g", "proteins_serving", "proteins_unit",

    # Salt/Sodium
    "salt_100g", "salt_serving", "salt_unit",
    "sodium_100g", "sodium_serving", "sodium_unit",

    # Other
    "nova-group"
}


def load_data(file_path: str) -> pd.DataFrame:
    """Load a JSONL file into a pandas DataFrame."""
    try:
        df = pd.read_json(file_path, lines=True, dtype=False)
    except ValueError as e:
        raise RuntimeError(f"Failed to read JSONL file: {e}")
    return df

def _is_missing_value(value) -> bool:
    """Return True when a value is effectively empty for merge/completeness logic."""
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    if pd.isna(value) if not isinstance(value, (list, dict, tuple, set)) else False:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, tuple, set, dict)) and len(value) == 0:
        return True
    return False


def _normalize_text_key(value) -> str:
    """Create a comparable key from free text (name/brand)."""
    if _is_missing_value(value):
        return ""
    text = str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _merge_records(primary: pd.Series, candidate: pd.Series) -> pd.Series:
    """Fill missing fields in primary record using values from candidate."""
    for col in primary.index:
        p_val = primary.get(col)
        c_val = candidate.get(col)

        if _is_missing_value(c_val):
            continue

        # Fill scalar missing values directly.
        if _is_missing_value(p_val):
            primary[col] = c_val
            continue

        # Merge lists while preserving order and uniqueness.
        if isinstance(p_val, list) and isinstance(c_val, list):
            merged = []
            seen = set()
            for item in p_val + c_val:
                key = json.dumps(item, sort_keys=True) if isinstance(item, (dict, list)) else str(item)
                if key not in seen:
                    seen.add(key)
                    merged.append(item)
            primary[col] = merged
            continue

        # Merge dicts by keeping primary keys and filling missing keys from candidate.
        if isinstance(p_val, dict) and isinstance(c_val, dict):
            merged = dict(c_val)
            merged.update(p_val)
            primary[col] = merged

    return primary


def deduplicate_products(df: pd.DataFrame) -> pd.DataFrame:
    """
    Detect duplicate products and keep one best record per product.

    Duplicate rules:
    - Primary key: same barcode ('code').
    - Secondary key (fallback): same normalized product_name + brands.

    Keep strategy:
    - Choose the most complete record using the source 'completeness' column.
    - If completeness is missing/invalid, treat it as -1.
    - Merge missing fields from other duplicates when possible.
    """
    if 'code' not in df.columns:
        raise KeyError("Missing required 'code' column for deduplication.")

    working = df.copy()
    working['__barcode_key'] = working['code'].astype(str).str.replace(r'\D', '', regex=True).str.strip()
    working['__name_key'] = working.get('product_name', pd.Series(index=working.index, dtype=object)).apply(_normalize_text_key)
    working['__brand_key'] = working.get('brands', pd.Series(index=working.index, dtype=object)).apply(_normalize_text_key)

    grouped_records = []
    consumed_idx = set()

    # Group by barcode first (most reliable).
    for barcode, group in working[working['__barcode_key'] != ""].groupby('__barcode_key', sort=False):
        if len(group) == 1:
            idx = group.index[0]
            grouped_records.append(working.loc[idx])
            consumed_idx.add(idx)
            continue

        if 'completeness' in group.columns:
            completeness_series = pd.to_numeric(group['completeness'], errors='coerce').fillna(-1.0)
        else:
            completeness_series = pd.Series(-1.0, index=group.index)

        ranked_indices = completeness_series.sort_values(ascending=False).index.tolist()
        ranked = [working.loc[idx] for idx in ranked_indices]
        merged = ranked[0].copy()
        for candidate in ranked[1:]:
            print(
                f"Dropped record: code={candidate.get('code', '')}, product_name={candidate.get('product_name', '')}, "
                f"brands={candidate.get('brands', '')}, reason=duplicate barcode ({barcode}), "
                f"dropped_completeness={candidate.get('completeness', None)}, kept_completeness={merged.get('completeness', None)}"
            )
            merged = _merge_records(merged, candidate)
        grouped_records.append(merged)
        consumed_idx.update(group.index)

    # For rows without barcode, apply fallback dedup by name+brand.
    no_barcode = working[(working['__barcode_key'] == "") & (~working.index.isin(consumed_idx))]
    fallback_groups = no_barcode.groupby(['__name_key', '__brand_key'], sort=False)

    for (name_key, brand_key), group in fallback_groups:
        # Only treat as duplicates if both keys are present.
        if name_key and brand_key and len(group) > 1:
            if 'completeness' in group.columns:
                completeness_series = pd.to_numeric(group['completeness'], errors='coerce').fillna(-1.0)
            else:
                completeness_series = pd.Series(-1.0, index=group.index)

            ranked_indices = completeness_series.sort_values(ascending=False).index.tolist()
            ranked = [working.loc[idx] for idx in ranked_indices]
            merged = ranked[0].copy()
            for candidate in ranked[1:]:
                print(
                    f"Dropped record: code={candidate.get('code', '')}, product_name={candidate.get('product_name', '')}, "
                    f"brands={candidate.get('brands', '')}, reason=duplicate name+brand ({name_key} | {brand_key}), "
                    f"dropped_completeness={candidate.get('completeness', None)}, kept_completeness={merged.get('completeness', None)}"
                )
                merged = _merge_records(merged, candidate)
            grouped_records.append(merged)
        else:
            for idx in group.index:
                grouped_records.append(working.loc[idx])

    result = pd.DataFrame(grouped_records).drop(columns=['__barcode_key', '__name_key', '__brand_key'], errors='ignore')
    dropped = len(df) - len(result)
    print(f"Dropped or merged {dropped} duplicate rows using barcode/name-brand rules.")
    return result.reset_index(drop=True)

# def drop_exact_duplicates(df: pd.DataFrame) -> pd.DataFrame:
#     """
#     Deduplicate by 'code' field, keeping the first occurrence.
#     Reports how many duplicates were removed.
#     """
#     if 'code' not in df.columns:
#         raise KeyError("Missing required 'code' column for deduplication.")
#     initial_count = len(df)
#     # Keep only the first row for each code
#     df = df.drop_duplicates(subset=['code'], keep='first')
#     dropped = initial_count - len(df)
#     print(f"Dropped {dropped} duplicate rows based on 'code'.")
#     return df


def ensure_code_field(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure the 'code' column exists and contains only non-empty strings.
    Rows with missing or empty 'code' are removed.
    """
    if 'code' not in df.columns:
        raise KeyError("Missing required 'code' column in dataset.")
    # Strip whitespace and drop empty values
    df['code'] = df['code'].astype(str).str.strip()
    df = df[df['code'] != ""]
    return df


def clean_text_fields(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardize text fields:
      - 'product_name': trim whitespace, convert empty to NA
      - 'brands': ensure column exists, fill missing, title-case
    """
    # Clean product_name if present
    if 'product_name' in df.columns:
        df['product_name'] = (
            df['product_name']
            .astype(str)
            .str.strip()
                .replace({'': pd.NA})
        )
    else:
        # If missing entirely, add column with NA
        df['product_name'] = pd.NA

    # Clean or create brands column
    if 'brands' in df.columns:
        df['brands'] = (
            df['brands']
            .fillna("")           # replace nulls
            .astype(str)
            .str.strip()
                .str.title()
        )
    else:
        # Add a brands column of empty strings
        df['brands'] = ""

    return df


def to_numeric(series: pd.Series, default=0) -> pd.Series:
    """Convert a Series to numeric, coercing errors and filling NAs with a default value."""
    return pd.to_numeric(series, errors='coerce').fillna(default)


def clean_quantity_fields(df: pd.DataFrame) -> pd.DataFrame:
    """
    Parse numeric and unit fields for product and serving quantities.
    Missing unit columns are created with sensible defaults.
    """
    # Product quantity and unit
    df['product_quantity'] = to_numeric(
        df['product_quantity']) if 'product_quantity' in df.columns else 0
    df['product_quantity_unit'] = (
        df['product_quantity_unit']
        .fillna('g') if 'product_quantity_unit' in df.columns else 'g'
    )
    df['product_quantity_unit'] = df['product_quantity_unit'].astype(
        str).str.lower()

    # Serving quantity and unit
    df['serving_quantity'] = to_numeric(
        df['serving_quantity']) if 'serving_quantity' in df.columns else 0
    df['serving_quantity_unit'] = (
        df['serving_quantity_unit']
        .fillna('g') if 'serving_quantity_unit' in df.columns else 'g'
    )
    df['serving_quantity_unit'] = df['serving_quantity_unit'].astype(
        str).str.lower()

    # Serving size text
    # df['serving_size'] = (
    #     df['serving_size']
    #     .fillna('Not Specified') if 'serving_size' in df.columns else 'Not Specified'
    # )
    # df['serving_size'] = df['serving_size'].astype(str)

    return df


def clean_nutriments(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure the 'nutriments' column contains dicts; replace invalid entries with empty dicts.
    """
    df['nutriments'] = df['nutriments'].apply(
        lambda x: x if isinstance(x, dict) else {}
    )
    return df


def reduce_nutriments(df: pd.DataFrame) -> pd.DataFrame:
    """
    Filter 'nutriments' field to keep only relevant macros
    and associated units/serving values. Removes all extra info.
    """
    def filter_nutriments(n: dict) -> dict:
        if not isinstance(n, dict):
            return {}
        return {k: v for k, v in n.items() if k in NUTRIENTS_TO_KEEP}

    df["nutriments"] = df["nutriments"].apply(filter_nutriments)
    return df


def strip_lang_prefix(token: str) -> str:
    """
    Remove any '<lang>:' prefix from a single token.
    """
    if not isinstance(token, str):
        return ""
    token = token.strip()
    if not token:
        return ""
    if ':' in token:
        # drop everything up to first colon
        return token.split(':', 1)[1]
    return token


def strip_en_prefix_listlike(items) -> list[str]:
    """
    Given either a list of strings or a comma-separated string,
    return a clean list with any '<lang>:' prefixes removed.
    """
    if isinstance(items, str):
        parts = [p.strip() for p in items.split(',') if p.strip()]
    elif isinstance(items, list):
        parts = items
    else:
        return []

    cleaned = []
    for tag in parts:
        cleaned_tag = strip_lang_prefix(tag)
        if cleaned_tag:
            cleaned.append(cleaned_tag)
    return cleaned


def clean_traces_fields(df: pd.DataFrame) -> pd.DataFrame:
    """
    Keep 'traces' and 'traces_from_ingredients' as strings.
    Remove any '<lang>:' prefixes. Join multiple entries with ', '.
    """
    def as_clean_string(value) -> str:
        if isinstance(value, list):
            cleaned = strip_en_prefix_listlike(value)
            return ", ".join(cleaned)
        if isinstance(value, str):
            cleaned = strip_en_prefix_listlike(value)
            return ", ".join(cleaned)
        return ""

    for col in ['traces', 'traces_from_ingredients']:
        if col in df.columns:
            df[col] = df[col].apply(as_clean_string)
        else:
            df[col] = ""
    return df


def clean_all_tag_fields(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply list cleaning to tag columns that are list-like.
    Important: 'traces' and 'traces_from_ingredients' are handled separately as strings.
    """
    tag_cols = [
        'additives_tags', 'allergens_tags', 'ingredients_tags',
        'labels_tags', 'categories_tags', 'ingredients_analysis_tags'
    ]
    for col in tag_cols:
        if col in df.columns:
            df[col] = df[col].apply(strip_en_prefix_listlike)
        else:
            df[col] = []
    return df


IMAGE_BASE = "https://images.openfoodfacts.org/images/products"
# will only emit sizes that exist in the JSON
IMAGE_SIZES_ORDER = ["full", "400", "200", "100"]


def split_code_path(code: str) -> str:
    """
    Turn a numeric code string into 3-digit path segments as used by OFF.
    Pads to 13 digits if shorter.
    e.g. '26317007' -> '000/002/631/7007'
         '0062020000248' -> '006/202/000/0248'
    """
    digits = re.sub(r"\D", "", str(code).strip())
    if len(digits) < 13:
        digits = digits.zfill(13)
    elif len(digits) > 13:
        digits = digits[-13:]

    return f"{digits[:3]}/{digits[3:6]}/{digits[6:9]}/{digits[9:]}"


def build_image_urls(code: str, images_obj: dict) -> dict:
    """
    Return a compact image spec:
      {
        "root": "<BASE>/<split_code>",
        "variants": { "front_en": 25, "nutrition_en": 33, ... },
        "primary": "front_en"
      }
    """
    if not code or not isinstance(images_obj, dict) or not images_obj:
        return {"root": f"{IMAGE_BASE}/{split_code_path(code)}", "variants": {}, "primary": None}

    root = f"{IMAGE_BASE}/{split_code_path(code)}"
    variants = {}

    for image_type, info in images_obj.items():
        if not isinstance(info, dict):
            continue
        rev = str(info.get("rev") or info.get("rev_en") or "").strip()
        if not rev:
            continue
        # keep revision as int if possible, else keep string
        try:
            variants[image_type] = int(rev)
        except ValueError:
            variants[image_type] = rev

    # choose primary
    primary = None
    for key in ("front_en", "front", "front_au", "front_en_GB"):
        if key in variants:
            primary = key
            break

    return {"root": root, "variants": variants, "primary": primary}


def add_image_urls(df: pd.DataFrame) -> pd.DataFrame:
    """
    Replace 'images' with a compact spec and keep a convenience URL for 400px.
    """
    def per_row(row):
        code = row.get("code", "")
        images_obj = row.get("images", {})
        spec = build_image_urls(code, images_obj)

        # optional convenience: precompute a 400px primary URL for quick listing views
        primary_url_400 = None
        if spec["primary"]:
            rev = spec["variants"].get(spec["primary"])
            if rev is not None:
                primary_url_400 = f'{spec["root"]}/{spec["primary"]}.{rev}.400.jpg'

        return spec, primary_url_400

    spec_and_primary = df.apply(per_row, axis=1, result_type="expand")
    # replace with compact spec
    df["images"] = spec_and_primary[0]
    return df


def reconvert_json_strings(df: pd.DataFrame) -> pd.DataFrame:
    def safe_load(x):
        if not isinstance(x, str):
            return x
        s = x.strip()
        if not s:   # skip empty strings
            return x
        if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                return x  # leave as-is if broken
        return x

    for col in df.columns:
        df[col] = df[col].apply(safe_load)
    return df


def drop_unwanted_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Drop columns that should not be emitted.
    Currently drops 'id' if present.
    """
    if 'id' in df.columns:
        df = df.drop(columns=['id'])
    if 'ingredients_from_palm_oil_n' in df.columns:
        df = df.drop(columns=['ingredients_from_palm_oil_n'])
    if 'serving_size' in df.columns:
        df = df.drop(columns=['serving_size'])

    return df


def rename_specific_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply specific renames prior to camelCase conversion.
    - 'code' -> 'barcode'
    - 'brands' -> 'branch'
    """
    rename_map = {}
    if 'code' in df.columns:
        rename_map['code'] = 'barcode'
    if 'brands' in df.columns:
        rename_map['brands'] = 'brand'
    if 'additives_tags' in df.columns:
        rename_map['additives_tags'] = 'additives'
    if 'allergens_tags' in df.columns:
        rename_map['allergens_tags'] = 'allergens'
    if 'ingredients_tags' in df.columns:
        rename_map['ingredients_tags'] = 'ingredients'
    if 'ingredients_analysis_tags' in df.columns:
        rename_map['ingredients_analysis_tags'] = 'ingredientsAnalysis'
    if 'categories_tags' in df.columns:
        rename_map['categories_tags'] = 'categories'
    if 'labels_tags' in df.columns:
        rename_map['labels_tags'] = 'labels'

    return df.rename(columns=rename_map)


def to_camel_case(name: str) -> str:
    """
    Convert snake_case column names to lower camelCase.
    Leaves already camel, single words, or names with hyphens as-is.
    """
    if not isinstance(name, str):
        return name
    if '_' not in name:
        return name
    parts = name.split('_')
    head = parts[0]
    tail = ''.join(p.capitalize() if p else '' for p in parts[1:])
    return head + tail


def camelise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert all top-level column names to camelCase,
    except nested dict keys inside fields like 'nutriments'.
    """
    # Build mapping
    mapping = {col: to_camel_case(col) for col in df.columns}
    return df.rename(columns=mapping)


def save_cleaned_data(df: pd.DataFrame, output_path: str):
    """
    Write the cleaned DataFrame to a JSONL file and log a summary.
    """
    df.to_json(output_path, orient='records', lines=False, force_ascii=False)
    print(f"Cleaned data saved to: {output_path}")
    print(f"Total valid products: {len(df)}")


TYPO_FIX = {
    "citiric-acid": "citric-acid",
    # DB002: open to adding new fix(es)
}


def fix_common_typos(tag: str) -> str:
    """DB002: Fix known ingredient tag spelling mistakes."""
    if not tag or not isinstance(tag, str):
        return ""
    return TYPO_FIX.get(tag.lower().strip(), tag.lower().strip())


def clean_ingredients_text(text) -> str | None:
    """DB002: Convert empty/whitespace ingredientsText → None, otherwise clean."""
    if not text or str(text).strip() == "":
        return None
    return str(text).strip()


def clean_ingredients_list(tags) -> list | None: 
    """
    DB002: Full ingredient tag cleaning:
    - Remove lang: prefixes
    - Lowercase + strip
    - Fix known typos
    - Deduplicate
    - Return None if result is empty
    """
    if not tags:
        return None

    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    cleaned = set()
    for tag in tags:
        if not tag or not isinstance(tag, str):
            continue
        # removing lang: prefix
        if ":" in tag:
            tag = tag.split(":", 1)[1]
        tag = fix_common_typos(tag)
        if tag:
            cleaned.add(tag)
    
    return list(cleaned) if cleaned else None


def validate_record(record: dict) -> list[str]:
    warnings = []
    if not len(record['barcode']) == 13 and record['barcode'].isdigit(): warnings.append("Barcode must be 13 digits")
    if not isinstance(record['nutriments'], dict): warnings.append("Nutriments must be a dictionary")
    if not record['productQuantity'] >= 0: warnings.append("Product quantity cannot be negative")
    if not record['servingQuantity'] >= 0: warnings.append("Serving quantity cannot be negative")
    if not record['productQuantityUnit'] in ["g", "ml", "l", "kg"]: warnings.append("Invalid product quantity unit")
    if not record['servingQuantityUnit'] in ["g", "ml", "l", "kg"]: warnings.append("Invalid serving quantity unit")
    if not 0 <= record['completeness'] <= 1: warnings.append("Completeness must be between 0 and 1")
    return warnings


def main(input_path: str, output_path: str):
    """
    Execute the full cleaning pipeline from raw JSONL to cleaned JSONL.
    """
    df = load_data(input_path)
    df = deduplicate_products(df)
    df = ensure_code_field(df)
    df = clean_text_fields(df)
    df = clean_quantity_fields(df)
    df = clean_nutriments(df)
    df = reduce_nutriments(df)
    df = clean_traces_fields(df)
    df = clean_all_tag_fields(df)

    # DB002: Enhanced ingredient cleaning
    if 'ingredientsText' in df.columns:
        df['ingredientsText'] = df['ingredientsText'].apply(clean_ingredients_text)
    if 'ingredients_tags' in df.columns:
        df['ingredients_tags'] = df['ingredients_tags'].apply(clean_ingredients_list)    

    for idx, record in df.iterrows():
        # String fields
        record["ingredientsText"] = normalize_string(record.get("ingredientsText"))
        record["traces"] = normalize_string(record.get("traces"))
        
        # List fields
        record["ingredients"] = normalize_list(record.get("ingredients"))
        record["categories"] = normalize_list(record.get("categories"))
        
        # Dict fields (nutriments with recursive + default 0)
        record["nutriments"] = normalize_dict(record.get("nutriments", {}), default=0, recurse=True)
        
        # Numeric fields
        record["productQuantity"] = clean_numeric(record.get("productQuantity"))
        record["servingQuantity"] = clean_numeric(record.get("servingQuantity"))
        
        record["allergensDetected"] = detect_allergens(record) # new allergen detection field for DB009
        df.at[idx, "allergensDetected"] = record["allergensDetected"]
        
        df.loc[idx] = record  # write back
        
    df = add_image_urls(df)
    df = reconvert_json_strings(df)

    df = rename_specific_columns(df)
    df = drop_unwanted_columns(df)
    df = camelise_columns(df)

    for _, record in df.iterrows():
        record_warnings = validate_record(record.to_dict())
        if record_warnings:
            print(f"WARNING [{record['barcode']}]: {'; '.join(record_warnings)}")

    save_cleaned_data(df, output_path)


if __name__ == "__main__":
    # Run the cleaning process
    main(INPUT_FILE, OUTPUT_FILE)
