"""Paths for ProductDetail contract artifacts (DB037 single source of truth)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

CONTRACT_VERSION = "1.0.0"

CANONICAL_CONTRACT_PATH = REPO_ROOT / "contracts" / "product_detail_v1.schema.json"
LEGACY_CONTRACT_PATH = REPO_ROOT / "api" / "contracts" / "product_v1.json"
CONTRACT_EXAMPLES_DIR = REPO_ROOT / "api" / "contracts" / "examples"
