import importlib.util
import os
import types


def import_module_from_path(path: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("_seed_module", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_seed_stage(input_path: str, config: dict) -> dict:
    """
    Run the seeding module/script.

    If `script_path` is provided in config, it will be used.
    Otherwise defaults to: database/seeding/seed_products.py
    """

    # FIXED: correct repo root (FoodRemedy)
    repo_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..")
    )

    seed_script = config.get("script_path") or os.path.join(
        repo_root, "database", "seeding", "seed_products.py"
    )

    if not os.path.exists(seed_script):
        raise FileNotFoundError(f"Seed script not found: {seed_script}")

    module = import_module_from_path(seed_script)

    # Prefer seed_products()
    if hasattr(module, "seed_products"):
        module.seed_products()

    # Fallback to main()
    elif hasattr(module, "main"):
        try:
            module.main(input_path)
        except TypeError:
            module.main()

    else:
        raise RuntimeError(
            "Seed script exposes neither seed_products() nor main()"
        )

    return {
        "processed": None,
        "failures": None,
        "output": input_path
    }
