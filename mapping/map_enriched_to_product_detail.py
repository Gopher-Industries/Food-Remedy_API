from typing import Any, Dict, List
import logging

from database.clean_data.normalization.NutrientUnitNormalisation import normalize_nutriments_dict
from utils.category_normalizer import normalize_category_fields
from database.clean_data.normalization.BarcodeNormalisation import BarcodeNormalisation

from utils.conflict_resolver import resolve_conflicts

logger = logging.getLogger(__name__)


def _safe_list(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def _normalize_tag_name_list(items: Any) -> List[str]:
    """Coerce tag entries to string names (strings or {'tag': ...} dicts)."""
    if not items:
        return []
    if not isinstance(items, list):
        items = _safe_list(items)
    out: List[str] = []
    for x in items:
        if isinstance(x, str) and x:
            out.append(x)
        elif isinstance(x, dict):
            t = x.get("tag")
            if t:
                out.append(str(t))
    return out


def _tags_to_wire(product: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build ProductDetail tags {final, removed}.
    Accepts DB shape {final, removed} (strings or tag dicts) or a raw list for resolve_conflicts.
    """
    raw = product.get("tags")
    if raw is None:
        return {"final": [], "removed": []}
    if isinstance(raw, dict) and set(raw.keys()) & {"final", "removed"}:
        return {
            "final": _normalize_tag_name_list(raw.get("final")),
            "removed": _normalize_tag_name_list(raw.get("removed")),
        }
    if isinstance(raw, list):
        if not raw:
            return {"final": [], "removed": []}
        try:
            resolved = resolve_conflicts(raw)
            final = [t.get("tag") for t in resolved.get("final_tags", []) if t and t.get("tag")]
            removed = [t.get("tag") for t in resolved.get("removed", []) if t and t.get("tag")]
            return {"final": final, "removed": removed}
        except Exception:
            # Preserve source tags if resolver fails; avoids silent data loss.
            logger.exception("Tag conflict resolution failed.")
            return {"final": _normalize_tag_name_list(raw), "removed": []}
    return {"final": [], "removed": []}


def map_enriched_to_product_detail(product: Dict[str, Any]) -> Dict[str, Any]:
    """Map an enriched product record to ProductDetail V1 contract."""
    out: Dict[str, Any] = {}

    # Required fields
    out["barcode"] = BarcodeNormalisation.barcode_normalise(product.get("barcode")) if product.get("barcode") is not None else None
    out["productName"] = str(product.get("productName") or "")

    # Optional fields with correct types/defaults
    out["brand"] = product.get("brand") if product.get("brand") is not None else None
    out["genericName"] = product.get("genericName") if product.get("genericName") is not None else None
    out["additives"] = _safe_list(product.get("additives"))
    out["allergens"] = _safe_list(product.get("allergens"))
    out["ingredients"] = _safe_list(product.get("ingredients"))
    out["ingredientsText"] = product.get("ingredientsText") if product.get("ingredientsText") is not None else None

    # Categories
    category_data = normalize_category_fields(product.get("categories"))
    out["category"] = category_data.get("category") if category_data.get("category") is not None else None
    out["categories"] = category_data.get("categories") if category_data.get("categories") is not None else []

    out["labels"] = _safe_list(product.get("labels"))
    out["nutrientLevels"] = dict(product.get("nutrientLevels") or {})
    out["nutriments"] = dict(product.get("nutriments") or {})

    # Normalise numeric nutriments using existing utility
    try:
        norm = normalize_nutriments_dict(out["nutriments"] or {})
    except Exception as e:
        logger.exception("Normalization failed: %s", e)
        norm = {}

    out["nutriments_normalized"] = {
        "energy_kj": norm.get("energy_kj", None),
        "energy_kcal": norm.get("energy_kcal", None),
        "fat_g": norm.get("fat_g", None),
        "saturated_fat_g": norm.get("saturated_fat_g", None),
        "carbohydrates_g": norm.get("carbohydrates_g", None),
        "sugars_g": norm.get("sugars_g", None),
        "proteins_g": norm.get("proteins_g", None),
        "salt_g": norm.get("salt_g", None),
        "sodium_mg": norm.get("sodium_mg", None),
        "fiber_g": norm.get("fiber_g", None),
    }

    out["nutriscoreGrade"] = product.get("nutriscoreGrade") if product.get("nutriscoreGrade") is not None else None
    out["productQuantity"] = product.get("productQuantity") if product.get("productQuantity") is not None else None
    out["productQuantityUnit"] = product.get("productQuantityUnit") if product.get("productQuantityUnit") is not None else None
    out["servingQuantity"] = product.get("servingQuantity") if product.get("servingQuantity") is not None else None
    out["servingQuantityUnit"] = product.get("servingQuantityUnit") if product.get("servingQuantityUnit") is not None else None
    out["traces"] = product.get("traces") if product.get("traces") is not None else None
    out["completeness"] = product.get("completeness") if product.get("completeness") is not None else None

    # Images
    images = product.get("images") or {}
    out["images"] = {
        "root": str(images.get("root") or ""),
        "primary": images.get("primary") if images.get("primary") is not None else None,
        "variants": dict(images.get("variants") or {}),
    }

    out["tags"] = _tags_to_wire(product)

    # Metadata (always present, can be extended)
    out["metadata"] = dict(product.get("metadata") or {"source": "local-enriched"})

    em = product.get("enrichmentMetadata")
    if isinstance(em, dict) and em:
        out["enrichmentMetadata"] = em
    if product.get("dateAdded") is not None:
        out["dateAdded"] = product.get("dateAdded")
    if product.get("lastUpdated") is not None:
        out["lastUpdated"] = product.get("lastUpdated")

    return out
