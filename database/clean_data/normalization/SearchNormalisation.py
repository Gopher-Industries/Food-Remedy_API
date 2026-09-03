"""
Search Text Normalization Module for Food Remedy Catalogue.

Defines deterministic normalization rules for searchable text fields
(productNameSearch, brandSearch) to support case-insensitive prefix queries in Firestore.
"""

import re
import unicodedata
from typing import Any, Dict, Optional


def normalize_search_text(text: Any) -> str:
    """
    Normalize text for deterministic search matching.

    Rules applied:
    1. Handle missing, None, or non-string values safely (return empty string "").
    2. Convert to string and normalize Unicode to NFC form.
    3. Standardize smart/curly apostrophes and quotes to standard ASCII single quote ('').
    4. Convert text to lowercase.
    5. Strip leading and trailing whitespace.
    6. Collapse repeated internal whitespace sequences into a single space.

    Original text retains punctuation and hyphens in normalized form.
    """
    if text is None:
        return ""

    if not isinstance(text, str):
        # Handle non-string types gracefully
        text = str(text)

    # Unicode NFC normalization
    normalized = unicodedata.normalize("NFC", text)

    # Standardize curly quotes and apostrophes to standard single quote
    normalized = re.sub(r"[’‘`]", "'", normalized)

    # Lowercase
    normalized = normalized.lower()

    # Collapse repeated internal whitespace and strip leading/trailing whitespace
    normalized = re.sub(r"\s+", " ", normalized).strip()

    return normalized


def add_search_fields_to_product(product: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enrich a product dictionary with productNameSearch and brandSearch fields.

    Preserves original productName and brand/brands values untouched.
    Modifies dictionary in-place and returns it.
    """
    if not isinstance(product, dict):
        return product

    # Retrieve source values
    name_val = product.get("productName") or product.get("product_name") or ""
    brand_val = product.get("brand") or product.get("brands") or ""

    # Generate normalized search fields
    product["productNameSearch"] = normalize_search_text(name_val)
    product["brandSearch"] = normalize_search_text(brand_val)

    return product
