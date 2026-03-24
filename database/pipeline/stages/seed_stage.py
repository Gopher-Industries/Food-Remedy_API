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
    with open("database/QA/errors.json", "w", encoding="utf-8") as f:
        json.dump(rejected_products, f, indent=2)

def run_seed_stage(input_path: str, config: dict) -> dict:
    """
    Run the seeding module/script.
    Filters incomplete products using DB007.
    """
    with open(input_path, "r", encoding="utf-8") as f:
        products = json.load(f)

    valid_products = []
    rejected_products = []

    for product in products:
        if is_product_usable(product):
            valid_products.append(product)
        else:
            rejected_products.append(product)

    save_rejected_products(rejected_products)

    print(f"[DB007] Valid products: {len(valid_products)}")
    print(f"[DB007] Rejected products: {len(rejected_products)}")

    # Run the original seed script
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    seed_script = config.get("script_path") or os.path.join(repo_root, "database", "seeding", "seed_products.py")

    if not os.path.exists(seed_script):
        raise FileNotFoundError(f"Seed script not found: {seed_script}")

    module = import_module_from_path(seed_script)

    if hasattr(module, "seed_products"):
        module.seed_products()
    elif hasattr(module, "main"):
        try:
            module.main(input_path)
        except TypeError:
            module.main()
    else:
        raise RuntimeError("Seed script exposes neither seed_products() nor main()")

    return {
        "processed": len(valid_products),
        "failures": len(rejected_products),
        "output": input_path
    }