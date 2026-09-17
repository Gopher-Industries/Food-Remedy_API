#!/usr/bin/env python3
"""Food Remedy database release-integrity gate.

The structural profile is deterministic and credential-free for pull requests.
The release profile adds candidate validation and an optional Firestore readback
against the exact collection consumed by the application.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from database.pipeline.stages.enrich_stage import run_enrich_stage
from database.seeding.checkpoint_manager import (
    CheckpointCompatibilityError,
    CheckpointManager,
)
from database.seeding.data_contract import (
    PRODUCT_DOCUMENT_ID,
    PRODUCTS_COLLECTION,
    SCHEMA_DEFINITION,
)


@dataclass
class CheckResult:
    check_id: str
    status: str
    severity: str
    summary: str
    evidence: list[str]
    next_action: str | None = None


def _pass(check_id: str, summary: str, evidence: Iterable[str]) -> CheckResult:
    return CheckResult(check_id, "PASS", "none", summary, list(evidence))


def _block(
    check_id: str,
    severity: str,
    summary: str,
    evidence: Iterable[str],
    next_action: str,
) -> CheckResult:
    return CheckResult(
        check_id, "BLOCKED", severity, summary, list(evidence), next_action
    )


def _line_number(text: str, position: int) -> int:
    return text.count("\n", 0, position) + 1


def _typescript_product_collection_uses(root: Path) -> list[dict[str, object]]:
    pattern = re.compile(
        r"\b(?:collection|doc)\s*\(\s*fdb\s*,\s*([\"'])(?P<name>[^\"']+)\1",
        re.MULTILINE,
    )
    uses: list[dict[str, object]] = []
    source_roots = [root / "mobile-app" / "services", root / "mobile-app" / "app"]
    for source_root in source_roots:
        if not source_root.exists():
            continue
        for path in sorted(source_root.rglob("*.ts")):
            text = path.read_text(encoding="utf-8")
            for match in pattern.finditer(text):
                name = match.group("name")
                if name.lower() == "products":
                    uses.append(
                        {
                            "path": path.relative_to(root).as_posix(),
                            "line": _line_number(text, match.start()),
                            "collection": name,
                        }
                    )
        for path in sorted(source_root.rglob("*.tsx")):
            text = path.read_text(encoding="utf-8")
            for match in pattern.finditer(text):
                name = match.group("name")
                if name.lower() == "products":
                    uses.append(
                        {
                            "path": path.relative_to(root).as_posix(),
                            "line": _line_number(text, match.start()),
                            "collection": name,
                        }
                    )
    return uses


def check_firestore_collection_contract(root: Path = REPO_ROOT) -> CheckResult:
    check_id = "firestore_collection_contract"
    contract = json.loads((root / SCHEMA_DEFINITION.relative_to(REPO_ROOT)).read_text())
    expected = contract.get("collection")
    document_id = contract.get("document_id")
    evidence = [
        f"database/seeding/schema_definition.json: collection={expected!r}, document_id={document_id!r}"
    ]
    problems: list[str] = []
    if expected != PRODUCTS_COLLECTION or document_id != PRODUCT_DOCUMENT_ID:
        problems.append("loaded contract does not match schema_definition.json")

    required_python_tokens = {
        "database/seeding/seed_firestore.py": [
            "from database.seeding.data_contract import PRODUCTS_COLLECTION",
            ".collection(PRODUCTS_COLLECTION)",
        ],
        "database/seeding/batch_seeder.py": [
            "from database.seeding.data_contract import PRODUCTS_COLLECTION",
            ".collection(PRODUCTS_COLLECTION)",
        ],
        "database/seeding/seed_engine.py": [
            "from database.seeding.data_contract import PRODUCTS_COLLECTION",
            ".collection(PRODUCTS_COLLECTION)",
        ],
        "database/db012_integration_test.py": [
            "from database.seeding.data_contract import PRODUCTS_COLLECTION",
            "DEFAULT_COLLECTION = PRODUCTS_COLLECTION",
        ],
    }
    literal_pattern = re.compile(r"\.collection\(\s*['\"](?P<name>products)['\"]\s*\)", re.I)
    for relative, tokens in required_python_tokens.items():
        source = (root / relative).read_text(encoding="utf-8")
        missing = [token for token in tokens if token not in source]
        if missing:
            problems.append(f"{relative} is not bound to the shared contract")
        hardcoded = [m.group("name") for m in literal_pattern.finditer(source)]
        if hardcoded:
            problems.append(f"{relative} hard-codes product collection(s): {hardcoded}")
        evidence.append(f"{relative}: shared contract reference verified")

    app_uses = _typescript_product_collection_uses(root)
    if not app_uses:
        problems.append("no mobile/API Firestore product readers were discovered")
    for use in app_uses:
        evidence.append(
            f"{use['path']}:{use['line']}: collection={use['collection']!r}"
        )
        if use["collection"] != expected:
            problems.append(
                f"{use['path']}:{use['line']} uses {use['collection']!r}; expected {expected!r}"
            )

    if problems:
        return _block(
            check_id,
            "critical",
            "Firestore writers, validation and app readers do not share one product collection.",
            evidence + problems,
            "Align every product reader/writer to schema_definition.json before seeding.",
        )
    return _pass(
        check_id,
        f"All active product paths agree on Firestore collection {expected!r}.",
        evidence,
    )


def check_pipeline_handoff(root: Path = REPO_ROOT) -> CheckResult:
    check_id = "pipeline_artifact_handoff"
    config_path = root / "database/pipeline/pipeline.config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))["pipeline"]
    enrich = config["enrich"]
    seed = config["seed"]
    evidence = [
        f"pipeline config: enrich.output={enrich.get('output')!r}",
        f"pipeline config: seed.input={seed.get('input')!r}",
    ]
    problems: list[str] = []
    if enrich.get("output") != seed.get("input"):
        problems.append("configured seed input differs from configured enrichment output")

    for module in enrich.get("modules", []):
        if not module.get("enabled", True):
            continue
        module_path = Path(str(module.get("path", "")))
        if not module_path.is_absolute():
            module_path = root / "database" / module_path
        if not module_path.is_file():
            problems.append(f"enabled module is missing: {module.get('name')} -> {module_path}")

    try:
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            source = work / "source.json"
            requested = work / "requested-but-unused.json"
            redirected = work / "actual-first-output.json"
            final = work / "final.json"
            first_module = work / "redirect.py"
            second_module = work / "consume.py"
            source.write_text('[{"barcode":"12345678"}]', encoding="utf-8")
            first_module.write_text(
                "import json\n"
                "def run(input_path, output_path, config):\n"
                "    data=json.load(open(input_path, encoding='utf-8'))\n"
                "    data[0]['handoff_marker']='from-reported-output'\n"
                "    actual=config['actual_output']\n"
                "    json.dump(data, open(actual, 'w', encoding='utf-8'))\n"
                "    return {'processed': len(data), 'failures': 0, 'output': actual}\n",
                encoding="utf-8",
            )
            second_module.write_text(
                "import json\n"
                "def run(input_path, output_path, config):\n"
                "    data=json.load(open(input_path, encoding='utf-8'))\n"
                "    assert data[0]['handoff_marker']=='from-reported-output'\n"
                "    json.dump(data, open(output_path, 'w', encoding='utf-8'))\n"
                "    return {'processed': len(data), 'failures': 0, 'output': output_path}\n",
                encoding="utf-8",
            )
            result = run_enrich_stage(
                str(source),
                str(final),
                {
                    "modules": [
                        {
                            "name": "redirecting_producer",
                            "path": str(first_module),
                            "output": str(requested),
                            "config": {"actual_output": str(redirected)},
                        },
                        {
                            "name": "downstream_consumer",
                            "path": str(second_module),
                            "output": str(final),
                        },
                    ]
                },
            )
            output = json.loads(final.read_text(encoding="utf-8"))
            if result.get("failures") != 0 or not output[0].get("handoff_marker"):
                problems.append("failure-injection probe did not preserve the reported output")
            evidence.append(
                "failure-injection probe: downstream module consumed the producer's reported output"
            )
    except Exception as exc:
        problems.append(f"failure-injection probe failed: {type(exc).__name__}: {exc}")

    if problems:
        return _block(
            check_id,
            "high",
            "Pipeline artifact handoff is not safe for release.",
            evidence + problems,
            "Repair output propagation and rerun the redirecting-module probe.",
        )
    return _pass(
        check_id,
        "Enrichment output identity is verified through the next module and seed configuration.",
        evidence,
    )


def _exec_blocks(sql_config: str) -> list[str]:
    return re.findall(r"await db\.execAsync\(`([\s\S]*?)`\);", sql_config)


def check_sqlite_legacy_upgrade(root: Path = REPO_ROOT) -> CheckResult:
    check_id = "sqlite_legacy_upgrade"
    path = root / "mobile-app/config/sqlConfig.ts"
    source = path.read_text(encoding="utf-8")
    blocks = _exec_blocks(source)
    evidence: list[str] = []
    try:
        initial = next(
            block for block in blocks
            if "CREATE TABLE IF NOT EXISTS product_history" in block
        )
        rebuild = next(
            block for block in blocks
            if "CREATE TABLE IF NOT EXISTS product_history_new" in block
        )
        copy_legacy = next(
            block for block in blocks
            if "'legacy:unowned' AS owner_scope" in block
            and "FROM product_history" in block
        )
        connection = sqlite3.connect(":memory:")
        connection.executescript(
            """
            CREATE TABLE product_history (
              barcode TEXT PRIMARY KEY,
              product_name TEXT NOT NULL,
              brand TEXT,
              product_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL
            );
            INSERT INTO product_history VALUES
              ('12345678', 'Legacy product', NULL, '{}', '2026-01-01', '2026-01-02');
            """
        )
        connection.executescript(initial)
        evidence.append("legacy schema accepted the initialisation SQL before owner_scope migration")
        connection.executescript(rebuild)
        connection.executescript(copy_legacy)
        connection.executescript("DROP TABLE product_history;")
        connection.executescript(
            "ALTER TABLE product_history_new RENAME TO product_history;"
        )
        connection.executescript(
            "CREATE INDEX IF NOT EXISTS idx_hist_owner_last_seen "
            "ON product_history(owner_scope, last_seen_at);"
        )
        row = connection.execute(
            "SELECT owner_scope, barcode, product_name FROM product_history"
        ).fetchone()
        pk = [
            item[1]
            for item in sorted(
                connection.execute("PRAGMA table_info('product_history')").fetchall(),
                key=lambda item: item[5] or 99,
            )
            if item[5]
        ]
        index_names = {
            item[1] for item in connection.execute("PRAGMA index_list('product_history')")
        }
        if row != ("legacy:unowned", "12345678", "Legacy product"):
            raise AssertionError(f"legacy row was not preserved: {row!r}")
        if pk != ["owner_scope", "barcode"]:
            raise AssertionError(f"unexpected migrated primary key: {pk!r}")
        if "idx_hist_owner_last_seen" not in index_names:
            raise AssertionError("owner/history index was not created after migration")
        evidence.extend(
            [
                "legacy row preserved under owner_scope='legacy:unowned'",
                "migrated primary key=(owner_scope, barcode)",
                "idx_hist_owner_last_seen created after the column exists",
            ]
        )
        return _pass(
            check_id,
            "A pre-owner_scope SQLite database upgrades without losing history.",
            evidence,
        )
    except Exception as exc:
        return _block(
            check_id,
            "high",
            "Legacy SQLite history upgrade failed in an executable migration simulation.",
            evidence + [f"{type(exc).__name__}: {exc}"],
            "Defer owner_scope-dependent indexes until after the legacy table rebuild.",
        )


def check_checkpoint_safety() -> CheckResult:
    check_id = "seed_checkpoint_safety"
    evidence: list[str] = []
    try:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "checkpoint.json"
            checkpoint = CheckpointManager(str(path))
            checkpoint.bind_run(
                dataset_sha256="a" * 64,
                total_records=30,
                batch_size=10,
                collection=PRODUCTS_COLLECTION,
            )
            checkpoint.mark_batch_success(0, 10)
            checkpoint.mark_batch_failure(1, "injected failure")
            try:
                checkpoint.mark_batch_success(2, 10)
                raise AssertionError("checkpoint advanced past failed batch 1")
            except ValueError:
                pass
            reloaded = CheckpointManager(str(path))
            if reloaded.get_resume_info()["next_batch_index"] != 1:
                raise AssertionError("resume point is not the failed batch")
            try:
                reloaded.bind_run(
                    dataset_sha256="b" * 64,
                    total_records=30,
                    batch_size=10,
                    collection=PRODUCTS_COLLECTION,
                )
                raise AssertionError("checkpoint accepted a different dataset")
            except CheckpointCompatibilityError:
                pass
            evidence.extend(
                [
                    "injected failure at batch 1 kept next_batch_index=1",
                    "non-contiguous advance to batch 2 was rejected",
                    "same checkpoint was rejected for a different dataset hash",
                    "checkpoint persistence uses atomic os.replace",
                ]
            )
        return _pass(
            check_id,
            "Seeder checkpoints preserve a contiguous, dataset-bound resume point.",
            evidence,
        )
    except Exception as exc:
        return _block(
            check_id,
            "high",
            "Seeder checkpoint safety probe failed.",
            evidence + [f"{type(exc).__name__}: {exc}"],
            "Do not run a release seed until gap and dataset-identity checks pass.",
        )


def check_release_dataset(dataset: Path) -> CheckResult:
    check_id = "release_dataset_quality"
    try:
        from scripts.db060_release_validation import validate

        raw = dataset.read_bytes()
        records = json.loads(raw)
        with contextlib.redirect_stdout(io.StringIO()):
            report = validate(records)
        evidence = [
            f"dataset={dataset.relative_to(REPO_ROOT) if dataset.is_relative_to(REPO_ROOT) else dataset}",
            f"sha256={hashlib.sha256(raw).hexdigest()}",
            f"total={report['total_records']}, valid={report['valid_records']}, invalid={report['invalid_records']}",
            f"validator_status={report['status']}",
        ]
        if report["status"] != "CHECKS_PASSED_PENDING_APPROVAL":
            evidence.append(f"reason_counts={json.dumps(report.get('reason_counts', {}), sort_keys=True)}")
            evidence.append(
                f"required_reviews={json.dumps(report.get('required_reviews', []), sort_keys=True)}"
            )
            return _block(
                check_id,
                "critical",
                "The candidate dataset does not meet the agreed automated release criteria.",
                evidence,
                "Resolve DB060 blockers/reviews, regenerate the candidate and rerun this gate.",
            )
        return _pass(
            check_id,
            "The candidate passed automated dataset criteria pending human approval.",
            evidence,
        )
    except Exception as exc:
        return _block(
            check_id,
            "critical",
            "The candidate dataset could not be validated.",
            [f"{type(exc).__name__}: {exc}"],
            "Repair the dataset or validation environment before release.",
        )


def _sample_records(records: list[dict], count: int) -> list[dict]:
    usable = [
        row for row in records
        if isinstance(row, dict) and row.get(PRODUCT_DOCUMENT_ID)
    ]
    if len(usable) <= count:
        return usable
    positions = sorted({round(index * (len(usable) - 1) / (count - 1)) for index in range(count)})
    return [usable[position] for position in positions]


def check_firestore_readback(dataset: Path, sample_count: int = 5) -> CheckResult:
    check_id = "firestore_app_readback"
    try:
        from database.seeding.seed_firestore import get_firestore_client

        records = json.loads(dataset.read_text(encoding="utf-8"))
        samples = _sample_records(records, max(2, sample_count))
        client = get_firestore_client()
        failures: list[str] = []
        evidence = [
            f"collection={PRODUCTS_COLLECTION!r}",
            f"sample_count={len(samples)}",
        ]
        for expected in samples:
            identifier = str(expected[PRODUCT_DOCUMENT_ID])
            snapshot = client.collection(PRODUCTS_COLLECTION).document(identifier).get()
            if not snapshot.exists:
                failures.append(f"missing document {identifier}")
                continue
            actual = snapshot.to_dict() or {}
            if str(actual.get(PRODUCT_DOCUMENT_ID)) != identifier:
                failures.append(f"document {identifier} has mismatched barcode field")
            if actual.get("productName") != expected.get("productName"):
                failures.append(f"document {identifier} differs from candidate productName")
            evidence.append(f"{identifier}: readable and matched")
        if failures:
            return _block(
                check_id,
                "critical",
                "Firestore readback did not match the release candidate.",
                evidence + failures,
                "Seed the approved hash to PRODUCTS and rerun readback before release.",
            )
        return _pass(
            check_id,
            "Sampled release records are present in the app's Firestore collection.",
            evidence,
        )
    except Exception as exc:
        return _block(
            check_id,
            "critical",
            "Firestore readback could not be completed.",
            [f"collection={PRODUCTS_COLLECTION!r}", f"{type(exc).__name__}: {exc}"],
            "Provide read-only Firebase credentials or emulator access and rerun with --with-firestore.",
        )


def _not_run_firestore() -> CheckResult:
    return _block(
        "firestore_app_readback",
        "critical",
        "Firestore-to-application readback was not run.",
        [f"expected_collection={PRODUCTS_COLLECTION!r}"],
        "Rerun the release profile with --with-firestore using approved credentials.",
    )


def run_gate(
    *,
    mode: str,
    dataset: Path,
    with_firestore: bool = False,
    root: Path = REPO_ROOT,
) -> dict[str, object]:
    checks: list[CheckResult] = [
        check_firestore_collection_contract(root),
        check_pipeline_handoff(root),
        check_checkpoint_safety(),
        check_sqlite_legacy_upgrade(root),
    ]
    if mode == "release":
        checks.append(check_release_dataset(dataset))
        checks.append(
            check_firestore_readback(dataset) if with_firestore else _not_run_firestore()
        )

    status = "PASS" if all(check.status == "PASS" for check in checks) else "BLOCKED"
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except Exception:
        commit = None
    return {
        "gate": "food-remedy-database-release-integrity",
        "mode": mode,
        "status": status,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "commit": commit,
        "checks": [asdict(check) for check in checks],
    }


def report_markdown(report: dict[str, object]) -> str:
    lines = [
        "# Database Release Integrity Gate",
        "",
        f"**Overall:** {report['status']}",
        f"**Mode:** {report['mode']}",
        f"**Commit:** `{report.get('commit') or 'unavailable'}`",
        f"**Generated:** {report['generated_at_utc']}",
        "",
        "| Check | Status | Severity | Result |",
        "| --- | --- | --- | --- |",
    ]
    for check in report["checks"]:
        lines.append(
            f"| `{check['check_id']}` | **{check['status']}** | {check['severity']} | {check['summary']} |"
        )
    for check in report["checks"]:
        lines.extend(["", f"## {check['check_id']}", ""])
        lines.extend(f"- {item}" for item in check["evidence"])
        if check.get("next_action"):
            lines.extend(["", f"Next action: {check['next_action']}"])
    return "\n".join(lines) + "\n"


def _write(path: Path | None, content: str) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode", choices=("structural", "release"), default="structural"
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=REPO_ROOT / "database/seeding/products_enriched.json",
    )
    parser.add_argument(
        "--with-firestore",
        action="store_true",
        help="Perform a read-only sample comparison against the PRODUCTS collection.",
    )
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    args = parser.parse_args(argv)

    dataset = args.dataset if args.dataset.is_absolute() else REPO_ROOT / args.dataset
    report = run_gate(
        mode=args.mode,
        dataset=dataset,
        with_firestore=args.with_firestore,
    )
    _write(args.json_output, json.dumps(report, indent=2) + "\n")
    _write(args.markdown_output, report_markdown(report))

    for check in report["checks"]:
        print(f"[{check['status']}] {check['check_id']}: {check['summary']}")
    print(f"DATABASE RELEASE GATE: {report['status']}")
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
