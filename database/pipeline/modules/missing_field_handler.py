import logging

# -----------------------------
# FIELD DEFINITIONS
# -----------------------------
CRITICAL_FIELDS = [
    "code",
    "product_name",
    "ingredients_text",
    "categories_tags"
]

OPTIONAL_FIELDS = [
    "nutriments",
    "labels_tags",
    "brands",
    "quantity",
    "serving_size"
]

# -----------------------------
# MAIN HANDLER
# -----------------------------
def handle_missing_fields(product: dict) -> dict:
    missing_critical = []
    missing_optional = []

    # Check critical fields
    for field in CRITICAL_FIELDS:
        if not product.get(field):
            missing_critical.append(field)

    # Check optional fields
    for field in OPTIONAL_FIELDS:
        if not product.get(field):
            missing_optional.append(field)
            product[field] = None  # standardise missing

    # Add metadata
    product["_missing"] = {
    "critical": missing_critical,
    "optional": missing_optional,
    "reason": (
        "Missing critical fields: " + ", ".join(missing_critical)
        if missing_critical
        else "Only optional fields missing"
    )
}

    # Add status
    if missing_critical:
        product["_status"] = "incomplete"
    else:
        product["_status"] = "valid"

    return product


# -----------------------------
# VALIDATION CHECK
# -----------------------------
def is_product_usable(product: dict) -> bool:
    return len(product.get("_missing", {}).get("critical", [])) == 0


# -----------------------------
# LOGGING
# -----------------------------
def log_missing_fields(product: dict):
    if product["_missing"]["critical"]:
        logging.warning(
            f"[CRITICAL MISSING] {product.get('code')} -> {product['_missing']['critical']}"
        )

    if product["_missing"]["optional"]:
        logging.info(
            f"[OPTIONAL MISSING] {product.get('code')} -> {product['_missing']['optional']}"
        )