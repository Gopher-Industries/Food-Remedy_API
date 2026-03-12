import firebase_admin
from firebase_admin import credentials, firestore
import json
import time
import os
from google.api_core import retry
import argparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT_FILE = os.path.join(BASE_DIR, "checkpoint.json")

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

@retry.Retry(predicate=retry.if_exception_type(Exception), initial=1, maximum=16, multiplier=2, deadline=60)
def commit_batch(batch):
    batch.commit()

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            return json.load(f).get("last_batch_index", 0)
    return 0

def save_checkpoint(batch_index):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump({"last_batch_index": batch_index}, f)

def seed_batch(input_path: str, dry_run: bool = False, subset: int = None, batch_size: int = 500):
    with open(input_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
            return

    start_time = time.time()
    failures = 0
    total_written = 0
    writes_per_second_limit = 400  # conservative, adjust based on testing
    writes_this_second = 0
    last_second = time.time()

    if subset:
        data = data[:subset]

    if not data:
        print("Input JSON is empty — nothing to seed.")
        return

    total_records = len(data)
    start_index = load_checkpoint()

    print(f"Starting from batch {start_index + 1}")
    print(f"Dry-run mode: {dry_run}")
    print(f"Total documents: {total_records}")

    for i in range(start_index * batch_size, total_records, batch_size):
        batch = db.batch()
        chunk = data[i:i + batch_size]

        for product in chunk:
            barcode = product.get("barcode")
            if not barcode:
                print(f"Skipping product with missing barcode at index {i}")
                continue

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

        batch_number = i // batch_size + 1

        if dry_run:
            print(f"DRY-RUN: Would write batch {batch_number} ({len(chunk)} docs)")
            continue

        try:
            commit_batch(batch)
            print(f"Wrote batch {batch_number} ({len(chunk)} docs)")
            save_checkpoint(batch_number)
        except Exception as e:
            print(f"Batch {batch_number} failed after retries: {e}")
            print(f"Failed chunk: {chunk}")
            failures += 1
            raise  # or continue, depending on tolerance

        total_written += len(chunk)
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

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Firestore Seeding Engine (DB020)")
    parser.add_argument("--input", default=os.path.join(BASE_DIR, "products_5k_enriched.json"),
                        help="Path to enriched JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Simulate run without writing to Firestore")
    parser.add_argument("--subset", type=int, default=None, help="Limit to first N records for testing")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size for writes")
    args = parser.parse_args()

    print(f"Starting seeding from: {args.input}")
    if args.dry_run:
        print("DRY-RUN MODE: No writes to Firestore")
    if args.subset:
        print(f"Limited to first {args.subset} records")

    try:
        seed_batch(args.input, dry_run=args.dry_run, subset=args.subset, batch_size=args.batch_size)
    except Exception as e:
        print(f"Seeding failed: {e}")

    print("Done!")