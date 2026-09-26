"""
DB036 - Database Pipeline Reliability Investigation
=====================================================

Investigation-only evidence script. Does NOT modify any pipeline source
file - it imports and calls the real, unmodified stage/orchestrator
functions from database.pipeline.* and exercises them against constructed
failure scenarios (fixture "modules"/"seed scripts" written to a temp
directory at runtime).

Run directly:  python database/test_db036_pipeline_reliability.py

Each test prints what it found. Nothing here asserts/fails the process -
this is a reliability investigation, not a regression suite - so a human
reads the printed evidence alongside DB036's investigation report.
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.pipeline.stages.clean_stage import run_clean_stage
from database.pipeline.stages.enrich_stage import run_enrich_stage
from database.pipeline.stages.seed_stage import run_seed_stage


def _write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def section(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def test_1_enrich_module_failure_does_not_fail_stage():
    section("TEST 1: does a failing enrich module fail the enrich STAGE?")
    tmp = tempfile.mkdtemp(prefix="db036_t1_")

    _write(os.path.join(tmp, "good_module.py"), """
def run(input_path, output_path, config):
    import json
    with open(input_path) as f:
        data = json.load(f)
    with open(output_path, "w") as f:
        json.dump(data, f)
    return {"processed": len(data), "failures": 0, "output": output_path}
""")
    _write(os.path.join(tmp, "broken_module.py"), """
def run(input_path, output_path, config):
    raise KeyError("expected_field_missing_on_record_2")
""")

    input_path = os.path.join(tmp, "input.json")
    _write(input_path, json.dumps([{"id": 1}, {"id": 2}]))
    output_path = os.path.join(tmp, "output.json")

    config = {"modules": [
        {"name": "good_module", "path": os.path.join(tmp, "good_module.py"), "enabled": True, "config": {}},
        {"name": "broken_module", "path": os.path.join(tmp, "broken_module.py"), "enabled": True, "config": {}},
    ]}

    escaped = False
    try:
        result = run_enrich_stage(input_path=input_path, output_path=output_path, config=config)
    except Exception as e:
        escaped = True
        print(f"Exception escaped run_enrich_stage(): {e!r}")

    if not escaped:
        statuses = [(m["module"], m["status"]) for m in result["modules_run"]]
        print(f"No exception escaped run_enrich_stage(). Module statuses: {statuses}")
        print(f"Returned failures count: {result['failures']} (buried in the result dict)")
        print(">>> FINDING: run_pipeline.py's fail_on_error is never consulted for this")
        print(">>> case, because the exception never leaves run_enrich_stage(). The")
        print(">>> checkpoint will show status='completed' for the enrich stage.")

    shutil.rmtree(tmp)


def test_2_stale_checkpoint_causes_silent_skip():
    section("TEST 2: does a stale checkpoint silently skip a stage after input changes?")
    tmp = tempfile.mkdtemp(prefix="db036_t2_")
    sys.path.insert(0, tmp)  # so run_pipeline (imported below) can be found if needed
    from database.pipeline.run_pipeline import runPipeline

    input_path = os.path.join(tmp, "input.json")
    output_path = os.path.join(tmp, "cleaned.json")
    checkpoint_path = os.path.join(tmp, "pipeline_checkpoints.json")
    metadata_path = os.path.join(tmp, "pipeline_run_metadata.json")

    config = {
        "pipeline": {
            "fail_on_error": True,
            "outputs": {"metadata": metadata_path, "checkpoints": checkpoint_path},
            "clean": {"enabled": True, "input": input_path, "output": output_path},
            "enrich": {"enabled": False},
            "seed": {"enabled": False},
        }
    }

    _write(input_path, json.dumps([{"id": 1}, {"id": 2}]))
    runPipeline(config=json.loads(json.dumps(config)))
    with open(output_path) as f:
        after_run1 = json.load(f)

    # Input changes on disk - a realistic "new data landed" scenario
    _write(input_path, json.dumps([{"id": 1}, {"id": 2}, {"id": 3}, {"id": 4}, {"id": 5}]))
    runPipeline(config=json.loads(json.dumps(config)))  # force=False, the default
    with open(output_path) as f:
        after_run2 = json.load(f)

    print(f"Records after run 1 (input had 2): {len(after_run1)}")
    print(f"Input changed to 5 records on disk before run 2.")
    print(f"Records after run 2 (force=False):  {len(after_run2)}")
    if len(after_run2) == len(after_run1):
        print(">>> FINDING: the clean stage was silently skipped on run 2. Output")
        print(">>> still reflects run 1's stale input, with no warning or non-zero exit.")

    shutil.rmtree(tmp)


def test_3_clean_stage_hardcoded_failures():
    section("TEST 3: does clean_stage's 'failures' count reflect dropped records?")
    tmp = tempfile.mkdtemp(prefix="db036_t3_")
    input_path = os.path.join(tmp, "input.json")
    output_path = os.path.join(tmp, "output.json")

    data = [{"id": 1}, None, {"id": 2}, "not a product", {"id": 3}, ["bad"], {"id": 4}, {"id": 5}]
    _write(input_path, json.dumps(data))

    result = run_clean_stage(input_path=input_path, output_path=output_path, config={})
    dropped = len(data) - result["processed"]
    print(f"Input records: {len(data)}, kept: {result['processed']}, silently dropped: {dropped}")
    print(f"Reported 'failures' field: {result['failures']}")
    if result["failures"] == 0 and dropped > 0:
        print(">>> FINDING: 'failures' is hardcoded to 0 in clean_stage.py - it does not")
        print(">>> count records skipped by the `if not isinstance(record, dict): continue` check.")

    shutil.rmtree(tmp)


def test_4_seed_stage_result_handling():
    section("TEST 4: seed_stage result handling - falsy results and TypeError retries")
    tmp = tempfile.mkdtemp(prefix="db036_t4_")

    _write(os.path.join(tmp, "seed_empty_result.py"), """
def seed_products():
    # Ran for real (imagine a side effect here), but returns {} because the
    # author felt no return value was needed for a "nothing to report" run.
    return {}
""")
    result = run_seed_stage(input_path="unused.json", config={"script_path": os.path.join(tmp, "seed_empty_result.py")})
    print(f"Seed script returned {{}}. run_seed_stage() returned: {result}")
    if result == {"processed": None, "failures": None, "output": "unused.json"}:
        print(">>> FINDING: `return result or {...}` in seed_stage.py treats a real,")
        print(">>> valid-but-empty {} result as if the script produced nothing at all.")

    _write(os.path.join(tmp, "seed_buggy.py"), """
CALLS = {"n": 0}
def main(input_path):
    CALLS["n"] += 1
    print(f"  [fixture] main() invoked, call #{CALLS['n']}, input_path={input_path!r}")
    return "seeded: " + 42  # unrelated bug - not an arity problem
""")
    print()
    try:
        run_seed_stage(input_path="real_input.json", config={"script_path": os.path.join(tmp, "seed_buggy.py")})
    except TypeError as e:
        print(f"Final exception surfaced to the caller: {e!r}")
        print(">>> FINDING: the ORIGINAL error (str + int concatenation) is discarded.")
        print(">>> seed_stage.py's `except TypeError: retry with no args` assumed the")
        print(">>> first TypeError meant 'wrong arity', masking the real bug behind a")
        print(">>> misleading 'missing required positional argument' message.")

    shutil.rmtree(tmp)


def test_5_cascading_shared_output_corruption():
    section("TEST 5: shared enrich output path + hardcoded seed.input -> cascading failure")
    tmp = tempfile.mkdtemp(prefix="db036_t5_")

    _write(os.path.join(tmp, "allergens.py"), """
def run(input_path, output_path, config):
    import json
    with open(input_path) as f:
        data = json.load(f)
    with open(output_path, "w") as f:
        json.dump(data, f)
    return {"processed": len(data), "failures": 0, "output": output_path}
""")
    _write(os.path.join(tmp, "db009_personalisation_tags.py"), """
def run(input_path, output_path, config):
    with open(output_path, "w") as f:
        f.write('[{"id": 1}, {"id": 2, "na')  # dies mid-write
    raise RuntimeError("simulated crash mid-write on record 2")
""")
    _write(os.path.join(tmp, "reader.py"), """
def run(input_path, output_path, config):
    import json, shutil
    with open(input_path) as f:
        data = json.load(f)
    shutil.copyfile(input_path, output_path)
    return {"processed": len(data), "failures": 0, "output": output_path}
""")
    _write(os.path.join(tmp, "seed_reader.py"), """
def main(input_path):
    import json
    with open(input_path) as f:
        data = json.load(f)
    return {"processed": len(data), "failures": 0, "output": input_path}
""")

    enrich_input = os.path.join(tmp, "products_5k_enriched.json")
    _write(enrich_input, json.dumps([{"id": 1}, {"id": 2}]))
    shared_output = os.path.join(tmp, "products_enriched.json")  # ONE path for every module, as in the real config

    enrich_config = {"modules": [
        {"name": "allergens", "path": os.path.join(tmp, "allergens.py"), "enabled": True, "config": {}},
        {"name": "db009_personalisation_tags", "path": os.path.join(tmp, "db009_personalisation_tags.py"), "enabled": True, "config": {}},
        {"name": "db021_mood_tags", "path": os.path.join(tmp, "reader.py"), "enabled": True, "config": {}},
        {"name": "db019_alternative_product_mapping", "path": os.path.join(tmp, "reader.py"), "enabled": True, "config": {}},
    ]}

    enrich_result = run_enrich_stage(input_path=enrich_input, output_path=shared_output, config=enrich_config)
    statuses = [(m["module"], m["status"]) for m in enrich_result["modules_run"]]
    print(f"Module statuses: {statuses}")
    print(f"Enrich stage 'failures' count: {enrich_result['failures']} (stage itself did NOT raise)")

    try:
        with open(shared_output) as f:
            json.load(f)
        print("Shared output file is valid JSON.")
    except json.JSONDecodeError as e:
        print(f"Shared output file on disk is CORRUPT: {e}")

    # Real pipeline.config.json sets seed.input as a fixed path equal to
    # enrich.output - NOT dynamically taken from enrich_result["output"].
    try:
        run_seed_stage(input_path=shared_output, config={"script_path": os.path.join(tmp, "seed_reader.py")})
        print("Seed stage read the file fine.")
    except json.JSONDecodeError as e:
        print(f">>> FINDING: seed stage crashes parsing the corrupted file: {e}")
        print(">>> Under fail_on_error=true the pipeline halts HERE, at the seed stage,")
        print(">>> even though the real root cause was an enrich-stage module two steps")
        print(">>> earlier - one the checkpoint already filed under a 'completed' enrich stage.")

    shutil.rmtree(tmp)


if __name__ == "__main__":
    test_1_enrich_module_failure_does_not_fail_stage()
    test_2_stale_checkpoint_causes_silent_skip()
    test_3_clean_stage_hardcoded_failures()
    test_4_seed_stage_result_handling()
    test_5_cascading_shared_output_corruption()
    print("\n" + "=" * 78)
    print("All DB036 evidence scenarios completed.")
    print("=" * 78)
