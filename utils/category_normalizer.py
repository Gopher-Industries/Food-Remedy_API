import re
from typing import List, Optional, Union

# Language prefix pattern: matches prefixes like "en:", "en-US:", "fr:", etc.
LANG_PREFIX_PATTERN = re.compile(r'^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,6})?:')


def normalize_category_value(value: str) -> Optional[str]:

    if not isinstance(value, str):
        return None
    
    # Trim whitespace first
    cleaned = value.strip()
    
    # Remove language prefix
    cleaned = LANG_PREFIX_PATTERN.sub('', cleaned)
    
    # Trim again in case there was whitespace after the prefix
    cleaned = cleaned.strip()
    
    # Return None for empty strings
    return cleaned if cleaned else None


def normalize_categories(categories: Union[List[str], str, None]) -> List[str]:
    
    if categories is None:
        return []
    
    # Convert single string to list
    if isinstance(categories, str):
        categories = [categories]
    
    # Ensure we have a list
    if not isinstance(categories, list):
        return []
    
    # Normalize each category and filter out None values
    normalized = []
    seen = set()
    
    for cat in categories:
        normalized_cat = normalize_category_value(cat)
        if normalized_cat and normalized_cat not in seen:
            normalized.append(normalized_cat)
            seen.add(normalized_cat)
    
    # Return sorted list for deterministic output
    return sorted(normalized)


def get_primary_category(categories: Union[List[str], str, None]) -> Optional[str]:
    
    normalized = normalize_categories(categories)
    return normalized[0] if normalized else None


def normalize_category_fields(categories: Union[List[str], str, None]) -> dict:
    
    normalized_list = normalize_categories(categories)
    primary = normalized_list[0] if normalized_list else None
    
    return {
        "category": primary,
        "categories": normalized_list
    }
