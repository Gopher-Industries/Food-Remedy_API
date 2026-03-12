#!/usr/bin/env python3
"""Minimal schema validation harness.

Samples up to N records from database/seeding/*.json, maps each product to the
ProductDetail v1 contract using the existing mapping, and performs lightweight
validation (required fields + key type checks). Writes a JSON report to
`scripts/reports/validation_report.json`.

This script avoids heavy external deps by performing best-effort checks.
"""
import sys
import types
import time
import json
import os
import glob
from typing import Dict, Any, List

# Ensure repo root is on sys.path so package imports resolve when script is run
repo_root = os.path.dirname(os.path.dirname(__file__))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

# Provide a lightweight fake pandas to satisfy imports in normalization module
fake_pd = types.SimpleNamespace()
fake_pd.DataFrame = lambda *a, **k: None
sys.modules.setdefault('pandas', fake_pd)

from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail


repo_root = os.path.dirname(os.path.dirname(__file__))
CONTRACT_PATH = os.path.join(repo_root, 'contracts', 'product_detail_v1.schema.json')
if not os.path.exists(CONTRACT_PATH):
    # fallback to api/contracts/product_v1.json if canonical contracts/ missing
    CONTRACT_PATH = os.path.join(repo_root, 'api', 'contracts', 'product_v1.json')


def _load_contract() -> Dict[str, Any]:
    with open(CONTRACT_PATH, 'r', encoding='utf-8') as fh:
        return json.load(fh)


def _gather_samples(n: int) -> List[Dict[str, Any]]:
    repo_root = os.path.dirname(os.path.dirname(__file__))
    seed_dir = os.path.join(repo_root, 'database', 'seeding')
    files = sorted(glob.glob(os.path.join(seed_dir, '*.json')))
    samples: List[Dict[str, Any]] = []
    for p in files:
        try:
            with open(p, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
        except Exception:
            continue
        if isinstance(data, list):
            for item in data:
                samples.append(item)
                if len(samples) >= n:
                    return samples
        elif isinstance(data, dict):
            samples.append(data)
            if len(samples) >= n:
                return samples
    return samples


def _validate_minimal(contract: Dict[str, Any], obj: Dict[str, Any]) -> List[str]:
    """Perform a small set of validations against the contract for the mapped object.
    Returns a list of error messages (empty if valid).
    """
    errs: List[str] = []
    required = contract.get('required', [])
    props = contract.get('properties', {})

    # required presence
    for r in required:
        if r not in obj:
            errs.append(f"missing required field: {r}")

    # basic type checks for a subset of fields
    def is_str(v):
        return isinstance(v, str)

    if 'barcode' in obj and not is_str(obj.get('barcode')):
        errs.append('barcode must be string')

    if 'productName' in obj and not is_str(obj.get('productName')):
        errs.append('productName must be string')

    images = obj.get('images')
    if images is None or not isinstance(images, dict):
        errs.append('images must be object')
    else:
        root = images.get('root', '')
        if root is None or (not isinstance(root, str)):
            errs.append('images.root must be string')

    # nutriments_normalized numeric checks (if present)
    nn = obj.get('nutriments_normalized') or {}
    for k in ('energy_kj', 'energy_kcal'):
        if k in nn and nn.get(k) is not None and not isinstance(nn.get(k), (int, float)):
            errs.append(f'{k} must be numeric or null')

    # tags shape
    tags = obj.get('tags')
    if tags is None:
        errs.append('tags missing')
    else:
        if not isinstance(tags.get('final', []), list):
            errs.append('tags.final must be list')
        if not isinstance(tags.get('removed', []), list):
            errs.append('tags.removed must be list')

    return errs


def run(sample_size: int = 50):
    contract = _load_contract()
    samples = _gather_samples(sample_size)
    out_report = {
        'sample_size_requested': sample_size,
        'sample_size_used': len(samples),
        'items': [],
        'summary': {},
    }

    total_time = 0.0
    errors = 0
    for idx, p in enumerate(samples, 1):
        start = time.time()
        try:
            mapped = map_enriched_to_product_detail(p)
            duration = time.time() - start
            total_time += duration
            errs = _validate_minimal(contract, mapped)
            item_result = {
                'barcode': mapped.get('barcode'),
                'ok': len(errs) == 0,
                'errors': errs,
                'time_s': round(duration, 4),
            }
            if errs:
                errors += 1
        except Exception as e:
            duration = time.time() - start
            total_time += duration
            item_result = {'barcode': p.get('barcode'), 'ok': False, 'errors': [f'exception: {e}'], 'time_s': round(duration, 4)}
            errors += 1

        out_report['items'].append(item_result)

    avg = total_time / max(1, len(samples))
    out_report['summary'] = {
        'total_items': len(samples),
        'errors': errors,
        'error_rate': errors / max(1, len(samples)),
        'total_time_s': round(total_time, 4),
        'avg_time_s': round(avg, 6),
    }

    # ensure reports dir
    repo_root = os.path.dirname(os.path.dirname(__file__))
    reports_dir = os.path.join(repo_root, 'scripts', 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    out_path = os.path.join(reports_dir, 'validation_report.json')
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(out_report, fh, indent=2)

    print('Samples:', out_report['summary']['total_items'])
    print('Errors:', out_report['summary']['errors'])
    print('Error rate:', out_report['summary']['error_rate'])
    print('Avg map time (s):', out_report['summary']['avg_time_s'])
    print('Report written to', out_path)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--sample-size', type=int, default=50)
    args = parser.parse_args()
    run(args.sample_size)
