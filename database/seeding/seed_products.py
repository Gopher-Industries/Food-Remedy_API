# database/seeding/seed_products.py
"""
Pipeline entry point for batch Firestore seeding (DB024).

Delegates to ``seed_firestore.seed_products`` so ``run_seed_stage`` works when
``script_path`` defaults to this file. Prefer configuring the pipeline with
``database/seeding/seed_firestore.py`` if you need to point at a different module.
"""

from __future__ import annotations

import os
import sys

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from database.seeding.seed_firestore import seed_products as _seed_products_core


def seed_products():
    """Expected by ``database.pipeline.stages.seed_stage.run_seed_stage``."""
    cfg = getattr(seed_products, "config", None)
    if isinstance(cfg, dict):
        _seed_products_core.config = cfg
    return _seed_products_core()


if __name__ == "__main__":
    import runpy

    _sf = os.path.join(os.path.dirname(__file__), "seed_firestore.py")
    runpy.run_path(_sf, run_name="__main__")
