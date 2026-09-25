# BE024 preliminary scan evidence

Acceptance: **BLOCKED**. Scanner approval and all provider attestations are pending.

- Scanner: Gitleaks 8.30.1, official release checksum verified.
- Selected main: `2087a8126632e4fc18f0b60ad00c4da94046dd35`.
- Remote branches and tags fetched before scanning; checkout is not shallow.
- Command: `GITLEAKS_BIN=/private/tmp/be024-gitleaks/gitleaks python3 scripts/security/scan.py`.
- Scan exit: `1` (findings/coverage review remain).
- 49 detection records: 17 history-patch, 19 reachable-blob, 13 selected-tree.
- These include repeated detections; counts do not represent distinct credentials.
- Rules: `generic-api-key` and `gcp-api-key`.
- 139 binary/container blob versions require coverage review. Three scanner
  diagnostic flags also require private review; these may include finding warnings.
- Sanitised local evidence: `security-evidence/scan.json`, `triage.json`, `probe.json`.
  These files are intentionally ignored by Git; preserve in the approved evidence store.

Each detection has an initial triage entry. Firebase/Google API-key findings need
owner classification and restrictions/service-usage verification. Dataset/code
and test-fixture findings are possible false positives, not cleared findings.
Application configuration findings need service-owner review. No secret values
were reproduced, no provider credentials were replayed, and none were rotated.

Local failure-probe command:

```bash
GITLEAKS_BIN=/private/tmp/be024-gitleaks/gitleaks python3 scripts/security/scan.py --probe
```

Output:

```json
{"synthetic_probe": "PASS", "scanner_exit_code": 10, "expected_rule": "github-pat"}
```

The local probe wrapper returned zero because rejection was observed. Hosted CI
execution and branch-protection enforcement have not been performed.

Python compilation, shell syntax and `git diff --check` passed. See the
[runbook](BE024-Secret-Scan-Runbook.md) for commands, limitations and the owner
attestation table. This evidence does not establish that any old credential is
unusable or that replacement administrative access works.
