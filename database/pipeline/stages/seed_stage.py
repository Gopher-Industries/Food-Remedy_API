import importlib.util
import os
import types
import json

from database.pipeline.modules.missing_field_handler import is_product_usable


def import_module_from_path(path: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("_seed_module", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def save_rejected_products(rejected_products):
    os.makedirs("database/QA", exist_ok=True)

    # Structured QA output (clear reasons)
    qa_output = []
    for p in rejected_products:
        qa_output.append({
            "code": p.get("code"),
            "status": p.get("_status"),
            "missing": p.get("_missing")
        })

    with open("database/QA/errors.json", "w", encoding="utf-8") as f:
        json.dump(qa_output, f, indent=2)


def run_seed_stage(input_path: str, config: dict) -> dict:
    """
    Run the seeding module/script.
    Filters incomplete products using DB007.
    """

    # -----------------------------
    # Load enriched products
    # -----------------------------
    with open(input_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    valid_products = []
    rejected_products = []

    # -----------------------------
    # Apply DB007 filtering
    # -----------------------------
    for product in products:
        if is_product_usable(product):
            valid_products.append(product)
        else:
            rejected_products.append(product)

    # -----------------------------
    # Save rejected products for QA
    # -----------------------------
    save_rejected_products(rejected_products)

    print(f"[DB007] Valid products: {len(valid_products)}")
    print(f"[DB007] Rejected products: {len(rejected_products)}")

    # -----------------------------
    # Save ONLY valid products (important for seeding)
    # -----------------------------
    filtered_input_path = "database/seeding/filtered_products.json"
    os.makedirs("database/seeding", exist_ok=True)

    with open(filtered_input_path, "w", encoding="utf-8") as f:
        json.dump(valid_products, f, indent=2)

    # -----------------------------
    # Run original seed script
    # -----------------------------
    repo_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..")
    )

    seed_script = config.get("script_path") or os.path.join(
        repo_root, "database", "seeding", "seed_products.py"
    )

    if not os.path.exists(seed_script):
        raise FileNotFoundError(f"Seed script not found: {seed_script}")

    module = import_module_from_path(seed_script)

    # -----------------------------
    # SAFE FUNCTION CALL (FINAL FIX)
    # -----------------------------
    if hasattr(module, "seed_products"):
        try:
            module.seed_products(filtered_input_path)  # try with input
        except TypeError:
            module.seed_products()  # fallback if no args

    elif hasattr(module, "main"):
        try:
            module.main(filtered_input_path)
        except TypeError:
            module.main()

    else:
        raise RuntimeError(
            "Seed script exposes neither seed_products() nor main()"
        )

    # -----------------------------
    # Return pipeline result
    # -----------------------------
    return {
        "processed": len(valid_products),
        "failures": len(rejected_products),
        "output": filtered_input_path
    }