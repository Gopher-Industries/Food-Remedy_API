"""
Clean OpenFoodFacts Australia dataset for database ingestion.
"""

import json
import pandas as pd
import re

# === Configuration constants ===
# Edit these paths as needed
# - Find Examples of Input and Output in IOExamples Folder
INPUT_FILE = "data/demo data/rawSample.jsonl"
OUTPUT_FILE = "data/demo data/cleanSample.json"

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


def drop_exact_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicate by 'code' field, keeping the first occurrence.
    Reports how many duplicates were removed.
    """
    if 'code' not in df.columns:
        raise KeyError("Missing required 'code' column for deduplication.")
    initial_count = len(df)
    # Keep only the first row for each code
    df = df.drop_duplicates(subset=['code'], keep='first')
    dropped = initial_count - len(df)
    print(f"Dropped {dropped} duplicate rows based on 'code'.")
    return df


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
        try:
            variants[image_type] = int(rev)
        except ValueError:
            variants[image_type] = rev

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

        primary_url_400 = None
        if spec["primary"]:
            rev = spec["variants"].get(spec["primary"])
            if rev is not None:
                primary_url_400 = f'{spec["root"]}/{spec["primary"]}.{rev}.400.jpg'

        return spec, primary_url_400

    spec_and_primary = df.apply(per_row, axis=1, result_type="expand")
    df["images"] = spec_and_primary[0]
    return df


def reconvert_json_strings(df: pd.DataFrame) -> pd.DataFrame:
    def safe_load(x):
        if not isinstance(x, str):
            return x
        s = x.strip()
        if not s:
            return x
        if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                return x
        return x

    for col in df.columns:
        df[col] = df[col].apply(safe_load)
    return df


def drop_unwanted_columns(df: pd.DataFrame) -> pd.DataFrame:
    if 'id' in df.columns:
        df = df.drop(columns=['id'])
    if 'ingredients_from_palm_oil_n' in df.columns:
        df = df.drop(columns=['ingredients_from_palm_oil_n'])
    if 'serving_size' in df.columns:
        df = df.drop(columns=['serving_size'])

    return df


def rename_specific_columns(df: pd.DataFrame) -> pd.DataFrame:
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
    if not isinstance(name, str):
        return name
    if '_' not in name:
        return name
    parts = name.split('_')
    head = parts[0]
    tail = ''.join(p.capitalize() if p else '' for p in parts[1:])
    return head + tail


def camelise_columns(df: pd.DataFrame) -> pd.DataFrame:
    mapping = {col: to_camel_case(col) for col in df.columns}
    return df.rename(columns=mapping)


def ensure_output_fields(df: pd.DataFrame) -> pd.DataFrame:
    n = len(df)
    defaults = {
        "barcode": "",
        "brand": "",
        "productName": "",
        "genericName": "",
        "additives": [],
        "allergens": [],
        "ingredients": [],
        "ingredientsText": "",
        "ingredientsAnalysis": [],
        "categories": [],
        "labels": [],
        "nutrientLevels": None,
        "nutriments": {},
        "nutriscoreGrade": "",
        "productQuantity": 0,
        "productQuantityUnit": "",
        "servingQuantity": 0,
        "servingQuantityUnit": "",
        "traces": "",
        "tracesFromIngredients": "",
        "completeness": 0,
        "images": {},
    }

    for col, default in defaults.items():
        if col not in df.columns:
            if isinstance(default, list):
                df[col] = [list(default) for _ in range(n)]
            elif isinstance(default, dict):
                df[col] = [dict(default) for _ in range(n)]
            else:
                df[col] = [default for _ in range(n)]

    return df


def save_cleaned_data(df: pd.DataFrame, output_path: str):
    df.to_json(output_path, orient='records', lines=False, force_ascii=False)
    print(f"Cleaned data saved to: {output_path}")
    print(f"Total valid products: {len(df)}")


def main(input_path: str, output_path: str):
    df = load_data(input_path)
    df = drop_exact_duplicates(df)
    df = ensure_code_field(df)
    df = clean_text_fields(df)
    df = clean_quantity_fields(df)
    df = clean_nutriments(df)
    df = reduce_nutriments(df)
    df = clean_traces_fields(df)
    df = clean_all_tag_fields(df)

    df = add_image_urls(df)
    df = reconvert_json_strings(df)

    df = rename_specific_columns(df)
    df = drop_unwanted_columns(df)
    df = camelise_columns(df)
    df = ensure_output_fields(df)

    save_cleaned_data(df, output_path)


if __name__ == "__main__":
    main(INPUT_FILE, OUTPUT_FILE)
