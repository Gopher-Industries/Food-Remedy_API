import os
import json
from datetime import datetime
from tqdm import tqdm  # pip install tqdm
import time
import argparse

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# SEED_DIR was previously incorrect (duplicated). It should be the folder this file lives in.
SEED_DIR = BASE_DIR


def init_firestore(cred_filename="serviceAccountKey.json"):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except Exception:
        raise

    cred_path = os.path.join(BASE_DIR, cred_filename)
    cred = credentials.Certificate(cred_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    return firestore.client()


enriched_path = os.path.join(SEED_DIR, "products_40k_50k_enriched.json")
raw_path = os.path.join(SEED_DIR, "products_40k_50k.json")

if os.path.exists(enriched_path):
    print(f"Using enriched products file: {enriched_path}")
    with open(enriched_path, "r", encoding="utf-8") as f:
        products = json.load(f)
else:
    print(
        f"Enriched file not found. Falling back to raw file: {raw_path}\n"
        "It's recommended to run the enrichment step first:\n"
        f"  cd mobile-app/services/nutrition && "
        f"npx ts-node enrichProducts.ts ../../database/seeding/products_40k_50k.json {enriched_path}"
    )
    with open(raw_path, "r", encoding="utf-8") as f:
        products = json.load(f)


def commit_with_retry(batch, retries=3):
    for attempt in range(retries):
        try:
            batch.commit()
            return True
        except Exception as e:
            print(f"⚠️ Commit failed (attempt {attempt + 1}): {e}")
            time.sleep(2 ** attempt)  # exponential backoff
    return False


def seed_products(products, db=None, dry_run=False, output_path=None):
    batch_size = 500  # Firestore max is 500
    total = len(products)
    count = 0

    if dry_run and output_path:
        out_f = open(output_path, "w", encoding="utf-8")
    else:
        out_f = None

    # If not dry-run, require a firestore client `db`
    if not dry_run and db is None:
        raise ValueError("No Firestore client provided for non-dry-run seeding")

    for i in tqdm(range(0, total, batch_size), desc="Uploading"):
        subset = products[i : i + batch_size]

        if dry_run:
            # Write each document to a local JSONL file instead of committing to Firestore
            for product in subset:
                now = datetime.utcnow().isoformat()
                doc = {**product, "dateAdded": now, "lastUpdated": now}
                out_f.write(json.dumps(doc, ensure_ascii=False) + "\n")
        else:
            batch = db.batch()
            for product in subset:
                ref = db.collection("PRODUCTS").document(product["barcode"])
                now = datetime.utcnow().isoformat()
                batch.set(ref, {**product, "dateAdded": now, "lastUpdated": now})

            success = commit_with_retry(batch)
            if not success:
                print(f"❌ Batch {i // batch_size + 1} failed permanently. Stopping.")
                break

        count += len(subset)

    if out_f:
        out_f.close()

    print(f"✅ Done seeding {count}/{total} products! (dry_run={dry_run})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-file", "-i", default=None, help="Path to enriched products JSON file")
    parser.add_argument("--dry-run", action="store_true", help="Write output locally instead of Firestore")
    parser.add_argument("--output", "-o", default="seed_output_sample.jsonl", help="Dry-run output file path")
    parser.add_argument("--cred", default="serviceAccountKey.json", help="Service account JSON filename in seeding dir")
    args = parser.parse_args()

    input_path = args.input_file
    if input_path is None:
        if os.path.exists(enriched_path):
            input_path = enriched_path
        else:
            input_path = raw_path

    print(f"Using input file: {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        products_local = json.load(f)

    if args.dry_run:
        seed_products(products_local, db=None, dry_run=True, output_path=os.path.join(SEED_DIR, args.output))
    else:
        db_client = init_firestore(args.cred)
        seed_products(products_local, db=db_client, dry_run=False)


if __name__ == "__main__":
    main()
