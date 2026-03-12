import pandas as pd
import numpy as np
import json
import os

# === 1. File paths ===
base_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(base_dir, "../clean data/cleanSample.json")  # cleaned dataset
errors_file = os.path.join(base_dir, "errors.json")
summary_file = os.path.join(base_dir, "summary_report.txt")

# === 2. Load cleaned dataset ===
df = pd.read_json(input_file)

# === 3. Sampling ===
sample_size = min(150, len(df))
qa_sample = df.sample(n=sample_size, random_state=42)

# === 4. Initialize errors dictionary ===
errors = {col: [] for col in df.columns}

# === 5. Detect fields ===
string_fields = [col for col in df.columns if df[col].dtype == "object"]
numeric_fields = [col for col in df.columns if col.endswith("_100g")]

# === 6. Safe completeness check function ===
def is_empty(value):
    """
    Returns True if value is empty:
    - None/NaN
    - Empty string
    - Empty list/dict/array/Series
    """
    if value is None:
        return True
    if isinstance(value, float) and np.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, dict, np.ndarray, pd.Series)) and len(value) == 0:
        return True
    return False

# === 7. QA Checks ===
for idx, row in qa_sample.iterrows():
    for col in df.columns:
        value = row[col]

        # --- Completeness Checks ---
        if is_empty(value):
            errors[col].append({"row": idx, "error": "missing/empty"})

        # --- Correctness Checks ---
        if col in string_fields and isinstance(value, (int, float, np.ndarray, pd.Series)):
            errors[col].append({"row": idx, "error": "should be string"})
        if col in numeric_fields:
            if not isinstance(value, (int, float)):
                errors[col].append({"row": idx, "error": "not numeric"})
            elif value < 0:
                errors[col].append({"row": idx, "error": "negative value"})

# === 8. Save errors to JSON ===
with open(errors_file, "w") as f:
    json.dump(errors, f, indent=4)

# === 9. Generate Summary Report ===
summary = {"Total products checked": len(qa_sample)}
for col, err_list in errors.items():
    summary[f'Missing/Invalid {col}'] = len(err_list)

with open(summary_file, "w") as f:
    for key, value in summary.items():
        f.write(f"{key}: {value}\n")

print("QA completed successfully!")
print(f"Errors saved in: {errors_file}")
print(f"Summary report saved in: {summary_file}")
