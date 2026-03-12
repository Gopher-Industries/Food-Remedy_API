import os

# ===============================
# STAGE IMPORTS
# ===============================
from database.pipeline.stages.clean_stage import run_clean_stage
from database.pipeline.stages.enrich_stage import run_enrich_stage
from database.pipeline.stages.seed_stage import run_seed_stage

# ===============================
# DB018 HELPERS
# ===============================
from database.pipeline.modules.db018_batching import (
    load_json_records,
    write_json_records,
    chunk_records
)

from database.pipeline.modules.db018_checkpoint import (
    load_checkpoint,
    save_checkpoint
)

# ===============================
# CONFIG
# ===============================
CHUNK_SIZE = 1000

REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)

RAW_INPUT = os.path.join(
    REPO_ROOT, "database", "data_investigation", "exampleProductRaw.json"
)

CHECKPOINT_FILE = os.path.join(
    REPO_ROOT, "database", "seeding", "pipeline_checkpoints.json"
)

OUTPUT_DIR = os.path.join(REPO_ROOT, "database", "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ===============================
# MAIN
# ===============================
def main():
    print("\n[DB018] Starting Performance & Scalability Pipeline")

    records = load_json_records(RAW_INPUT)
    print(f"[DB018] Total records loaded: {len(records)}")

    chunks = list(chunk_records(records, CHUNK_SIZE))
    print(f"[DB018] Chunk size: {CHUNK_SIZE}")
    print(f"[DB018] Total chunks: {len(chunks)}")

    checkpoint = load_checkpoint(CHECKPOINT_FILE)
    start_chunk = checkpoint.get("last_completed_chunk", -1) + 1
    print(f"[DB018] Resuming from chunk index: {start_chunk}")

    for idx in range(start_chunk, len(chunks)):
        print(f"\n[DB018] Processing chunk {idx + 1}/{len(chunks)}")

        raw_path = os.path.join(OUTPUT_DIR, f"chunk_{idx}_raw.json")
        clean_path = os.path.join(OUTPUT_DIR, f"chunk_{idx}_clean.json")
        enrich_path = os.path.join(OUTPUT_DIR, f"chunk_{idx}_enriched.json")

        # Write raw chunk
        write_json_records(raw_path, chunks[idx])

        # -------------------------------
        # CLEAN STAGE (NO CONFIG)
        # -------------------------------
        run_clean_stage(raw_path, clean_path)

        # -------------------------------
        # ENRICH STAGE (WITH CONFIG)
        # -------------------------------
        run_enrich_stage(
            input_path=clean_path,
            output_path=enrich_path,
            config={}
        )

        # -------------------------------
        # SEED STAGE (WITH CONFIG)
        # -------------------------------
        run_seed_stage(
            input_path=enrich_path,
            config={}
        )

        save_checkpoint(CHECKPOINT_FILE, {"last_completed_chunk": idx})
        print(f"[DB018] Chunk {idx + 1} completed successfully")

    print("\n[DB018] Pipeline completed successfully 🎉")


if __name__ == "__main__":
    main()
