"""DB072 regression tests for platform-independent release hashes."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
from pathlib import Path

import pytest

from database.pipeline.release_artifact import utf8_lf_bytes, write_utf8_lf


ROOT = Path(__file__).resolve().parents[1]


def run_git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )


def test_write_utf8_lf_normalises_platform_newlines(tmp_path):
    output = tmp_path / "artifact.txt"
    write_utf8_lf(output, "one\r\ntwo\rthree\n")

    assert output.read_bytes() == b"one\ntwo\nthree\n"
    assert utf8_lf_bytes("one\r\ntwo\rthree\n") == output.read_bytes()


def test_release_gitattributes_prevent_autocrlf_hash_drift(tmp_path):
    if shutil.which("git") is None:
        pytest.skip("git is required for the checkout regression test")

    repo = tmp_path / "repo"
    repo.mkdir()
    run_git(repo, "init", "-q")
    run_git(repo, "config", "user.email", "db072@example.invalid")
    run_git(repo, "config", "user.name", "DB072 regression")
    run_git(repo, "config", "core.autocrlf", "true")

    shutil.copy2(ROOT / ".gitattributes", repo / ".gitattributes")
    release = repo / "database/Release/v1.1"
    release.mkdir(parents=True)
    samples = {
        "sample.json": b'{"record": 1}\n',
        "sample.jsonl": b'{"record": 1}\n{"record": 2}\n',
        "README.md": b"# Release\n\nEvidence\n",
        "SHA256SUMS": b"abc123  sample.json\n",
    }
    before = {}
    for name, content in samples.items():
        path = release / name
        path.write_bytes(content)
        before[name] = hashlib.sha256(content).hexdigest()

    run_git(repo, "add", ".gitattributes", "database/Release/v1.1")
    run_git(repo, "commit", "-qm", "test release artifacts")

    shutil.rmtree(release)
    run_git(repo, "checkout", "HEAD", "--", "database/Release/v1.1")

    for name, expected_hash in before.items():
        checked_out = (release / name).read_bytes()
        assert b"\r\n" not in checked_out
        assert hashlib.sha256(checked_out).hexdigest() == expected_hash


def test_committed_release_checksums_are_lf_and_valid():
    for version in ("v1.0", "v1.1"):
        release_dir = ROOT / "database/Release" / version
        checksum_path = release_dir / "SHA256SUMS"
        raw = checksum_path.read_bytes()
        assert b"\r\n" not in raw

        for line in raw.decode("utf-8").splitlines():
            expected, name = line.split("  ", 1)
            actual = hashlib.sha256((release_dir / name).read_bytes()).hexdigest()
            assert actual == expected, f"{version}/{name} checksum drifted"
