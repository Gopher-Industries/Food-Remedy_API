#!/usr/bin/env python3
"""Offline scan; publish only selected metadata, never scanner diagnostics or matches."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ref', default='origin/main')
    parser.add_argument('--output', default='security-evidence/scan.json')
    parser.add_argument('--probe', action='store_true')
    args = parser.parse_args()
    exe = os.environ.get('GITLEAKS_BIN', 'gitleaks')
    version = subprocess.check_output([exe, 'version'], text=True).strip()
    if version.lstrip('v') != '8.30.1':
        raise SystemExit('Expected Gitleaks 8.30.1')
    report = {'scanner': version, 'findings': [], 'coverage_gaps': []}
    with tempfile.TemporaryDirectory(prefix='be024-') as tmp:
        tmp = Path(tmp)
        empty_ignore = tmp / '.gitleaksignore'
        empty_ignore.touch()
        def scan(mode, target, label, extra=(), mapping=None):
            raw = tmp / 'raw.json'
            raw.unlink(missing_ok=True)
            command = [exe, mode, str(target), '--config', str(ROOT / '.gitleaks.toml'),
                       '--redact=100', '--no-banner', '--exit-code=10',
                       '--ignore-gitleaks-allow', '--gitleaks-ignore-path', str(empty_ignore),
                       '--max-archive-depth=10', '--max-decode-depth=5',
                       '--report-format=json', '--report-path', str(raw), *extra]
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            # Diagnostic text can contain source material: never print or retain it.
            if result.returncode not in (0, 10):
                report['coverage_gaps'].append({'scope': label, 'status': 'scanner-error', 'exit_code': result.returncode})
            elif b'WRN' in result.stderr or b'ERR' in result.stderr:
                report['coverage_gaps'].append({'scope': label, 'status': 'scanner-diagnostic-needs-private-review'})
            rows = json.loads(raw.read_text()) if raw.exists() else []
            if not raw.exists():
                report['coverage_gaps'].append({'scope': label, 'status': 'missing-report'})
            for row in rows:
                filename = row.get('File', '')
                obj = next((key for key in (mapping or {}) if key in filename), None)
                item = {'scope': label, 'rule': row['RuleID'],
                        'path': mapping[obj] if obj else filename,
                        'commit': row.get('Commit', ''), 'blob': obj,
                        'line': row.get('StartLine'), 'status': 'pending-owner-triage'}
                item['id'] = hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()[:20]
                report['findings'].append(item)
            raw.unlink(missing_ok=True)
            return result.returncode, rows

        if args.probe:
            target = tmp / 'probe'
            target.mkdir()
            # Construct a synthetic token, never a provider-issued credential.
            (target / 'fake.txt').write_text('github_token = "' + 'ghp_' + 'Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7aB0cD3eF6' + '"\n')
            code, rows = scan('dir', target, 'probe')
            passed = code == 10 and any(r['RuleID'] == 'github-pat' for r in rows)
            print(json.dumps({'synthetic_probe': 'PASS' if passed else 'FAIL', 'scanner_exit_code': code, 'expected_rule': 'github-pat'}))
            return 0 if passed else 1

        if git('rev-parse', '--is-shallow-repository').strip() != b'false':
            raise SystemExit('Full history required; fetch --unshallow first')
        report['main_commit'] = git('rev-parse', args.ref).decode().strip()
        report['refs'] = git('for-each-ref', '--format=%(refname) %(objectname)').decode().splitlines()
        scan('git', ROOT, 'history-patches', ['--log-opts=--all --full-history'])
        # Scan every reachable blob, including binary files omitted from Git patches.
        objects = git('rev-list', '--objects', '--all').splitlines()
        types = subprocess.check_output(['git', '-C', str(ROOT), 'cat-file', '--batch-check=%(objectname) %(objecttype)'], input=b'\n'.join(x.split(b' ', 1)[0] for x in objects))
        blobs = {x.split()[0].decode() for x in types.splitlines() if x.endswith(b' blob')}
        mapping = {}
        target = tmp / 'blobs'
        target.mkdir()
        for entry in objects:
            oid, _, path = entry.partition(b' ')
            oid = oid.decode()
            if oid not in blobs:
                continue
            name = path.decode('utf-8', errors='replace')
            mapping[oid] = name
            (target / (oid + ''.join(Path(name).suffixes))).write_bytes(git('cat-file', 'blob', oid))
            if Path(name).suffix.lower() in {'.zip', '.xlsx', '.xls', '.7z', '.rar', '.pdf', '.docx', '.p12', '.pfx'}:
                report['coverage_gaps'].append({'path': name, 'blob': oid, 'status': 'container-or-binary-requires-owner-review; encrypted/unsupported content and arbitrary passwords cannot be cleared by regex'})
        scan('dir', target, 'reachable-blobs', mapping=mapping)
        # Recreate the selected committed tree without checking out or executing files.
        for file in target.iterdir():
            file.unlink()
        mapping = {}
        for entry in git('ls-tree', '-rz', args.ref).split(b'\0'):
            if not entry:
                continue
            metadata, path = entry.split(b'\t', 1)
            _, kind, oid = metadata.split()
            if kind != b'blob':
                report['coverage_gaps'].append({'path': path.decode(errors='replace'), 'status': 'external-submodule-not-scanned'})
                continue
            oid = oid.decode()
            name = path.decode(errors='replace')
            mapping[oid] = name
            (target / (oid + ''.join(Path(name).suffixes))).write_bytes(git('cat-file', 'blob', oid))
        scan('dir', target, 'selected-tree', mapping=mapping)
    report['status'] = 'BLOCKED' if report['findings'] or report['coverage_gaps'] else 'SCAN-CLEAR; owner attestation still required'
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'findings': len(report['findings']), 'coverage_gaps': len(report['coverage_gaps'])}))
    return 1 if report['findings'] or report['coverage_gaps'] else 0

if __name__ == '__main__':
    raise SystemExit(main())
