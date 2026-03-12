from typing import Dict, Any
import logging

from database.clean_data.normalization.NutrientUnitNormalisation import normalize_nutriments_dict
from utils.category_normalizer import normalize_category_fields

try:
    from utils.conflict_resolver import resolve_conflicts
except Exception:
    # Fallback no-op resolver if utils.conflict_resolver is not present in this environment
    def resolve_conflicts(tags):
        return {'final_tags': [], 'removed': []}

logger = logging.getLogger(__name__)


def _safe_list(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def map_enriched_to_product_detail(product: Dict[str, Any]) -> Dict[str, Any]:
    """Map an enriched product record to ProductDetail V1 contract."""
    out: Dict[str, Any] = {}

    out["barcode"] = product.get("barcode")
    out["brand"] = product.get("brand")
    out["productName"] = product.get("productName")
    out["genericName"] = product.get("genericName")
    out["additives"] = _safe_list(product.get("additives"))
    out["allergens"] = _safe_list(product.get("allergens"))
    out["ingredients"] = _safe_list(product.get("ingredients"))
    out["ingredientsText"] = product.get("ingredientsText")
    
    # Normalize category data: remove language prefixes, deduplicate, filter empty values
    category_data = normalize_category_fields(product.get("categories"))
    out["category"] = category_data["category"]
    out["categories"] = category_data["categories"]
    
    out["labels"] = _safe_list(product.get("labels"))
    out["nutrientLevels"] = product.get("nutrientLevels") or {}
    out["nutriments"] = product.get("nutriments") or {}

    # Normalise numeric nutriments using existing utility
    try:
        norm = normalize_nutriments_dict(out["nutriments"] or {})
    except Exception as e:
        logger.exception("Normalization failed: %s", e)
        norm = {}

    out["nutriments_normalized"] = {
        "energy_kj": norm.get("energy_kj"),
        "energy_kcal": norm.get("energy_kcal"),
        "fat_g": norm.get("fat_g"),
        "saturated_fat_g": norm.get("saturated_fat_g"),
        "carbohydrates_g": norm.get("carbohydrates_g"),
        "sugars_g": norm.get("sugars_g"),
        "proteins_g": norm.get("proteins_g"),
        "salt_g": norm.get("salt_g"),
        "sodium_mg": norm.get("sodium_mg"),
        "fiber_g": norm.get("fiber_g"),
    }

    out["nutriscoreGrade"] = product.get("nutriscoreGrade")
    out["productQuantity"] = product.get("productQuantity")
    out["productQuantityUnit"] = product.get("productQuantityUnit")
    out["servingQuantity"] = product.get("servingQuantity")
    out["servingQuantityUnit"] = product.get("servingQuantityUnit")
    out["traces"] = product.get("traces")
    out["completeness"] = product.get("completeness")

    images = product.get("images") or {}
    out["images"] = {
        "root": images.get("root") or "",
        "primary": images.get("primary"),
        "variants": images.get("variants") or {},
    }

    # Tags: use resolver if tags present; otherwise empty lists
    raw_tags = product.get("tags") or []
    if raw_tags:
        resolved = resolve_conflicts(raw_tags)
        final = [t.get("tag") for t in resolved.get("final_tags", [])]
        removed = [t.get("tag") for t in resolved.get("removed", [])]
    else:
        final = []
        removed = []

    out["tags"] = {"final": final, "removed": removed}

    out["metadata"] = {"source": "local-enriched"}

    return out
