import firebase_admin
from firebase_admin import credentials, firestore
import json
import time
import os
import argparse
from google.api_core import retry
from typing import Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT_FILE = os.path.join(BASE_DIR, "checkpoint.json")

# Initialise Firebase (once per process)
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


@retry.Retry(predicate=retry.if_exception_type(Exception), initial=1, maximum=16, multiplier=2, deadline=60)
def commit_batch(batch):
    """Commit a Firestore batch with retry."""
    batch.commit()

def load_checkpoint():
    """Load last successful batch index from checkpoint file."""
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f).get("last_batch_index", 0)
        except Exception:
            pass
    return 0

def save_checkpoint(batch_index):
    """Save current batch index to checkpoint."""
    try:
        with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
            json.dump({"last_batch_index": batch_index}, f, indent=2)
    except Exception:
        pass

def run(input_path: str, output_path: str, config: dict[str, Any]) -> dict[str, Any]:
    """
    Pipeline seed stage: Writes enriched products to Firestore with batching,
    rate limiting, retry, and checkpoint support.
    """
    start_time = time.time()
    failures = 0
    total_written = 0

    batch_size = config.get("batch_size", 500)
    writes_per_second_limit = config.get("writes_per_second_limit", 400)
    dry_run = config.get("dry_run", False)

    # Load enriched data
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return {"error": f"Failed to load input: {e}", "processed": 0, "failures": 1}

    if not data:
        print("Input JSON is empty — nothing to seed.")
        return {"processed": 0, "failures": 0, "output": output_path}

    total_records = len(data)
    start_index = load_checkpoint()

    print(f"Starting seeding from batch {start_index + 1}")
    print(f"Dry-run mode: {dry_run}")
    print(f"Total documents: {total_records}")

    writes_this_second = 0
    last_second = time.time()

    for i in range(start_index * batch_size, total_records, batch_size):
        batch = db.batch()
        chunk = data[i:i + batch_size]

        for product in chunk:
            barcode = product.get("barcode")
            if not barcode:
                continue

            # Rate limiting
            current_second = time.time()
            if current_second - last_second >= 1:
                writes_this_second = 0
                last_second = current_second

            if writes_this_second >= writes_per_second_limit:
                sleep_time = max(0, 1 - (current_second - last_second))
                time.sleep(sleep_time)
                writes_this_second = 0
                last_second = time.time()

            doc_ref = db.collection("products").document(barcode)
            batch.set(doc_ref, product)
            writes_this_second += 1
            total_written += 1

        batch_number = i // batch_size + 1

        if dry_run:
            print(f"DRY-RUN: Would write batch {batch_number} ({len(chunk)} docs)")
            continue

        try:
            commit_batch(batch)
            print(f"Wrote batch {batch_number} ({len(chunk)} docs)")
            save_checkpoint(batch_number)
        except Exception as e:
            print(f"Batch {batch_number} failed: {e}")
            failures += 1

        if total_written > 20000:
            print("Warning: Approaching daily write quota (20k) — stopping")
            break

    elapsed = time.time() - start_time
    print("\nSeeding Summary:")
    print(f"Total time: {elapsed:.2f} seconds")
    print(f"Processed records: {total_records}")
    print(f"Total batches: {(total_records + batch_size - 1) // batch_size if total_records > 0 else 0}")
    print(f"Failed batches: {failures if not dry_run else 'N/A'}")

    print("Seeding complete!")

    return {
        "processed": total_records,
        "failures": failures,
        "output": output_path
    }


# ==================== For seed_stage.py compatibility ====================
def seed_products():
    """Entry point expected by run_seed_stage.py"""
    # Call the pipeline-compatible run function with default settings
    default_input = os.path.join(BASE_DIR, "products_enriched.json")
    default_output = os.path.join(BASE_DIR, "seeded_products.json")
    
    config = {
        "dry_run": False,
        "batch_size": 500
    }
    
    return run(default_input, default_output, config)


# Keep the standalone main for direct testing
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Firestore Seeding Engine")
    parser.add_argument("--input", default=os.path.join(BASE_DIR, "products_enriched.json"),
                        help="Path to enriched JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Simulate run")
    parser.add_argument("--subset", type=int, default=None, help="Limit to N records")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size")
    args = parser.parse_args()

    config = {
        "dry_run": args.dry_run,
        "batch_size": args.batch_size
    }
    if args.subset:
        config["subset"] = args.subset

    run(args.input, "database/seeding/seeded_products.json", config)