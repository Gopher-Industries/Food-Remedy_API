# BE024 scan and owner verification

Status: **in progress; release acceptance is blocked**. Gitleaks 8.30.1 is the
candidate scanner; organisational approval is not yet recorded. A local run is
preliminary evidence, not an approved security sign-off. No provider credentials
are tested or changed by these scripts.

## Terminal steps (macOS or Linux)

Run from the repository root. These commands do not switch branches, commit files,
or rewrite history. Fetch requires repository access.

```bash
cd /Users/harjinderkahlon/Desktop/sit374/git/Food-Remedy_API
git status --short
bash scripts/security/install-gitleaks.sh "$PWD/.security-tools"
export GITLEAKS_BIN="$PWD/.security-tools/gitleaks"
"$GITLEAKS_BIN" version
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --tags
# Only for a shallow checkout:
# git fetch --unshallow origin
python3 scripts/security/scan.py --probe
python3 scripts/security/scan.py --ref origin/main
```

The probe must report `PASS`, scanner exit `10`, rule `github-pat`. The probe
wrapper returns zero only when the scanner rejects the synthetic token; the token
exists only in a temporary directory. It never calls a provider.

The real scan returns **1** if findings or coverage gaps remain. Do not bypass
that result. Its sanitised report is `security-evidence/scan.json` (ignored by
Git). The scanner runs with the following flags in all modes:

```text
--config .gitleaks.toml --redact=100 --no-banner --exit-code=10
--ignore-gitleaks-allow --gitleaks-ignore-path <empty temporary file>
--max-archive-depth=10 --max-decode-depth=5
--report-format=json --report-path <private temporary report>
```

Modes are `git <repo> --log-opts="--all --full-history"`, `dir <all reachable
blobs>`, and `dir <selected committed tree>`. The wrapper captures diagnostics,
discards raw reports after projecting allowed fields, and records scanner errors
as coverage gaps. Keep any private investigation of diagnostics out of CI logs.

## Coverage and triage

The report records the selected main commit and available refs. Reachability is
limited to fetched branches/tags and local refs; deleted remote branches,
unfetched PR refs, Git LFS objects, external submodules and unreachable objects
are not established as covered. Blob references can be resolved privately with
`git log --all --find-object=<blob-id> --format=%H`; do not print blob contents.
Gitleaks scans patches and the full contents of reachable blobs, including files
deleted later. Archive/decode depth is bounded. Encrypted/unsupported files and
arbitrary spreadsheet passwords require private owner review even if no pattern
matches. A zero-finding scan cannot prove that a credential is revoked.

For **each** finding ID, record one of: pending owner review, confirmed sensitive
and revoked (opaque evidence reference), or proven non-sensitive (reviewer and
reason/evidence reference). Do not copy matched text, credential values, scanner
`Secret`/`Match` fields, or provider responses into evidence. Every known credential
archive/spreadsheet remains an uncertain exposure until its complete contents
have been accounted for privately by an owner. Duplicate detections can share an
owner ticket but must retain their finding IDs. Do not blanket-allowlist history.

## Owner attestation (complete privately, publish only metadata)

| Required evidence | Status / opaque reference |
| --- | --- |
| Scanner approval, approver role, date | PENDING |
| Finding IDs and affected path/blob/commit references | PENDING report triage |
| Authorised Firebase/Google/service owner role | PENDING |
| Each exposed or uncertain credential accounted for | PENDING |
| Revocation/rotation timestamp and provider audit/ticket reference | PENDING |
| Old key/token/session/recovery mechanism unusable via provider controls | PENDING |
| Non-sensitive determination with owner rationale, where applicable | PENDING |
| Replacement administrative access successfully checked, UTC date, tester role | PENDING |
| Recovery access checked by approved Leads | PENDING |
| Owner attestation reference covering all finding IDs and archive contents | PENDING |

Owners must use their authorised provider console/control plane to revoke or
rotate affected credentials and account for related tokens, sessions and recovery
mechanisms. Verify replacement access using an approved administrative operation
and record only pass/fail plus an opaque audit reference. Never replay exposed
credentials against a service without explicit owner authorisation. Repository
maintainers cannot infer this attestation from scanner results.

## CI and completion

`.github/workflows/secret-scan.yml` runs the same failure probe and strict scan on
PRs, pushes to main and manual dispatch. Existing historical findings and coverage
gaps intentionally keep it red. There is no suppression baseline. An owner-reviewed
disposition mechanism will be needed before historical revoked findings can be
accepted while retaining detection of newly introduced copies; this has not been
implemented or implicitly approved.

A repository administrator must make `Secret scanning / secret-scan` a required
check under branch protection/rulesets, and protect changes to the workflow,
scanner script and configuration through review. Adding YAML alone does not
enforce merge protection. The local probe establishes scanner rejection; a hosted
CI run and required-check enforcement remain pending until changes are published.

Completion requires the approved scan, disposition of every finding and uncertain
historical credential, owner attestations, replacement access, and hosted CI probe
evidence. None of those pending facts should be described as complete.
