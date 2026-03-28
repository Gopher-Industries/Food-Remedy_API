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
    """
    Map an enriched product record to ProductDetail V1 contract.
    
    DESIGN NOTES (DB011-aligned, three-layer architecture):
    
    MAP: barcode, productName, brand, categories, allergens, nutriments, nutriscoreGrade, etc.
    → From DB to API wire, with normalization for consistent format
    
    DO NOT MAP (intentionally omitted on wire):
    1. enrichmentMetadata, dateAdded, lastUpdated: Hydrated by backend enrichment service after mapping
       (not available at mapping time; added by enrichment middleware before sending to mobile)
    2. tags (final/removed): DB-only product lifecycle tracking; not needed on mobile
    3. productJson: Full snapshot stored in DB only for cart; mobile reconstructs from wire fields
    4. enrichment object: Server-side enrichment data (nutrition scoring); not exposed to wire
    
    SENT ON WIRE:
    - metadata with source="local-enriched": Tracks enrichment source as products flow through pipeline
    - Core product fields: nutrition, allergens, categories, images, etc.
    
    WHY SPLIT?
    - Smaller API payloads for performance (enrichment/productJson too large for every request)
    - Clean separation: product core (always sent) vs enrichment (backend-only)
    - Allows backend to add enrichmentMetadata via middleware without mapper knowing about it
    """
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
