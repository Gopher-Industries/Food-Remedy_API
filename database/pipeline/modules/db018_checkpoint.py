import json
import os

def load_checkpoint(path: str) -> dict:
    """
    DB023: Safe checkpoint recovery.
    If checkpoint is missing or corrupted, start from beginning.
    """
    if not os.path.exists(path):
        print("[DB023] No checkpoint found. Starting from beginning.")
        return {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    except Exception as e:
        print(f"[DB023] Checkpoint load failed: {e}")
        print("[DB023] Starting from beginning.")
        return {}
    
def save_checkpoint(path: str, data: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)



