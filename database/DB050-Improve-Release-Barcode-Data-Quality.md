# DB050 - Improve Release Barcode Data Quality

This document measures current barcode data quality for the release candidate
dataset, reviews and re-verifies the prior DB032 findings, addresses the one
confirmed release-relevant issue found during that review, and documents
remaining barcode limitations per `RELEASE_DATASET_CRITERIA.md`.

## Scope

Files inspected/touched:

- `database/clean_data/cleanProductData.py` - raw-to-cleaned ingestion pipeline (`deduplicate_products()` fixed on this ticket)
- `database/Validation/db021_validator.py` - pre-seed batch validator (inspected, not modified)
- `database/seeding/products_enriched.json` - release candidate dataset (5,000 records) - re-measured
- `database/test_db032_barcode.py` - one test corrected on this ticket
- `database/test_db050_barcode_dedup_fix.py` - new regression tests added on this ticket
- `requirements.txt` - pandas version ceiling added

---

## 1. Measured barcode quality (release candidate)

Measured directly against `database/seeding/products_enriched.json` (the
actual release candidate per `RELEASE_DATASET_CRITERIA.md` Section 2, not the
pre-enrichment `products_5k_enriched.json`):

| Metric | Count |
|---|---|
| Total records | 5,000 |
| Missing/empty barcode | 0 |
| Invalid format | 3 |
| Duplicates | 0 |
| Valid | 4,997 |

Missing/empty and duplicate counts confirmed independently via a standalone
script reading the live file; invalid-format count and the specific records
carry over from DB032 (see below - not re-triaged on this ticket, see Known
Limitations). Numbers are identical whether measured against
`products_5k_enriched.json` or `products_enriched.json`, confirming the
enrichment stage does not alter or lose barcode data.

---

## 2. Review of prior findings (DB032)

DB032 identified six barcode issues. Status of each, re-verified on this ticket:

| DB032 finding | Status |
|---|---|
| Unexpected barcode lengths (115 false-positive warnings) | Fixed on DB032, confirmed still in place |
| Invalid formats (3 records) | Unresolved, documented below (Known Limitations) |
| Duplicates (exact-string) | Working as intended, confirmed via regression tests |
| Normalisation gaps (leading-zero loss, punctuation survival) | Unresolved, out of scope, documented below |
| Lookup relationship risk | Unresolved, out of scope (no lookup endpoint available), documented below |
| **Missing barcodes silently dropped during dedup** | **Re-investigated on this ticket - see Section 3** |

### Correction to the "missing barcodes silently dropped" finding

DB032 reported that a `None` barcode is silently dropped during
`deduplicate_products()` before it ever reaches validation. During DB050
code review, a co-lead ([[anjum]]) found that running the existing
characterisation test against the current codebase actually returns
`len(result) == 1` (the row survives), not `0` as DB032's test asserted.

Both results turned out to be correct, for different pandas versions:

- **pandas < 3.0** (object dtype): `.astype(str)` on a null `code`
  stringifies it to `'None'`/`'nan'`, which strips to `""` under the
  digit-only regex - identical to an already-empty-string barcode, which
  correctly falls into the existing name+brand fallback path. **No drop.**
- **pandas >= 3.0** (new default string dtype): `.astype(str)` preserves
  NA-ness instead of stringifying it, so the digit-strip key stays `NaN` -
  and `pandas.groupby()` silently excludes NaN-keyed groups by default.
  **Row is dropped.**

Confirmed empirically both ways, using the real, unmodified function against
the real production JSONL-load path (`pd.read_json(..., lines=True,
dtype=False)`):

```
pandas 2.1.4  -> 3 rows in, 3 rows out (no drop)
pandas 3.0.2  -> 3 rows in, 2 rows out (dropped)
```

`requirements.txt` pinned `pandas>=2.0.0` with **no upper bound**. Pandas 3.0
is a current, real, installable release on PyPI (latest at time of writing:
3.0.5) that satisfies that constraint. So the finding was correct as a
**latent, dependency-version-dependent risk** rather than an actively
occurring issue in the current release candidate - the existing measured "0
missing" figure (Section 1) is genuinely accurate, not masking a blind spot.
DB032's original report and the reviewer's PR comment were each right about
a different part of the same picture.

---

## 3. Fix implemented

**`deduplicate_products()`'s barcode key is now computed with an explicit
`.fillna("")` before stringifying**, making the null-handling deterministic
regardless of pandas version, instead of relying on pandas' object-dtype
`.astype(str)` behaviour as an accident of the current dependency pin.

### Diff

```python
# Before:
working['__barcode_key'] = working['code'].astype(str).str.replace(r'\D', '', regex=True).str.strip()

# After:
working['__barcode_key'] = working['code'].fillna("").astype(str).str.replace(r'\D', '', regex=True).str.strip()
```

This was chosen as the safe, in-scope fix for this ticket because:

- It changes how a null value is *keyed* for dedup grouping only - it does
  not change how any barcode *value* is stored or displayed.
- It is a single line inside one function, verified with a 5-case regression
  suite covering both the new behaviour and every existing merge guarantee
  the function was already relying on.
- It closes a real reproducibility gap (the same input file and code could
  produce different record counts depending solely on which pandas version
  happened to be installed) without touching the broader normalisation work
  DB032 correctly scoped to its own separate ticket.

`requirements.txt` was additionally updated to `pandas>=2.0.0,<3.0.0` as a
defensive stopgap against the same class of risk resurfacing via an
unrelated dependency, in addition to (not instead of) the code fix.

---

## 4. Testing

`database/test_db032_barcode.py::test_none_barcode_is_silently_dropped_during_dedup`
was renamed to `test_none_barcode_falls_back_to_name_brand_dedup` and its
assertion corrected from `len(result) == 0` to `len(result) == 1`, now
deterministically true post-fix rather than dependent on the local pandas
version.

Five new tests were added in `database/test_db050_barcode_dedup_fix.py`,
covering the fix plus the existing merge guarantees it must not disturb:
exact-duplicate merge, punctuation-variant merge, two None-barcode rows with
matching name+brand (should still merge), two unrelated None-barcode rows
(should NOT merge into each other), and a mixed batch of real barcodes plus
one None-barcode row (production-shaped case).

```bash
pytest database/test_db032_barcode.py database/test_db050_barcode_dedup_fix.py -v
```

Result: **23 passed, 0 failed** (18 from DB032's suite including the
corrected test, 5 new). Confirms the fix works and no existing barcode
behaviour - valid-length acceptance, malformed-barcode flagging, exact and
punctuation-variant duplicate merging - regressed.

---

## 5. Known limitations (documented, not fixed on this ticket)

Per `RELEASE_DATASET_CRITERIA.md` Section 9, these do not block release but
are recorded here for the validation manifest:

1. **3 confirmed-invalid barcode records** remain in the release candidate
   (1x 15-digit placeholder-like value, 2x 21-digit values - see DB032
   Section 2 for the specific records). No confident automated correction
   exists; needs review by whoever owns product data sourcing.
2. **No GTIN/EAN mod-10 check-digit validation.** Barcode checks are
   structural (digit-only, standard length) only, per `db021_validator.py`'s
   own documented note. A structurally valid-looking barcode could still
   fail a real checksum.
3. **No canonical normalisation of the stored barcode value.** A barcode
   passing through a numeric type anywhere upstream would lose a leading
   zero permanently (~11.6% of the current EAN-13 catalogue relies on one);
   punctuation can survive into the stored value after a dedup merge. DB032
   scoped this to its own cross-cutting ticket given it touches ingestion,
   validation, and client-side scan code together.
4. **Barcode-to-lookup matching risk** (leading-zero loss, punctuation,
   whitespace causing a scanned barcode to miss an exact-string match against
   a stored one) - out of scope; no lookup endpoint was available to inspect
   or fix directly.
5. **`schema_validation_report.json` was stale** relative to the live seed
   file at the time of DB032's investigation. Recommend regenerating it from
   a live validator run rather than relying on a checked-in copy going
   forward.

---

## 6. Validation manifest contribution (barcode section only)

Per `RELEASE_DATASET_CRITERIA.md` Section 11. This ticket contributes the
barcode-specific fields only; ingredient, allergen, and category fields are
owned by other DB0XX tickets and are not covered here.

- **Source/input dataset:** `database/seeding/products_enriched.json`
- **Generation/validation date:** 2026-09-09
- **Pipeline/configuration used:** clean stage (`cleanProductData.py`,
  dedup fix applied) -> enrich stage -> seed stage
- **Total product count:** 5,000
- **Barcode validation status:** empty/missing = 0, invalid format = 3,
  duplicates = 0, valid = 4,997
- **Barcode-relevant test status:** 23/23 passed
  (`database/test_db032_barcode.py`, `database/test_db050_barcode_dedup_fix.py`)
- **Known barcode limitations:** see Section 5 above
- **Dataset version identifier:** not yet assigned - to be set per Section
  10's naming convention when the full manifest (all DB0XX validations) is
  combined for final release approval
- **Final release approval/status:** pending full-manifest review

---

## 7. Recommended follow-up tickets

Carried forward from DB032, still valid and unaffected by this ticket's fix:

1. Normalise the stored barcode value (not just the dedup matching key) to a
   single canonical format - decide on digits-only-with-leading-zeros and
   apply consistently at ingestion, pre-seed validation, and client-side
   scan time.
2. Investigate the 3 confirmed-invalid records with whoever owns product
   data sourcing.
3. Get access to the actual barcode lookup query (API-side) to directly
   reproduce "No record" cases rather than inferring them from upstream
   normalisation behaviour.
4. Consider adding GTIN/EAN mod-10 check-digit validation as a follow-up
   strictness improvement.

---

## Expected result

DB050 is considered successful when:

- Current barcode quality is measured against the real release candidate -
  **done, Section 1.**
- Invalid and missing barcode records are identified - **done, Section 1.**
- Confirmed release-critical issues are addressed where safely possible -
  **done, Section 3** (the version-dependent dedup risk).
- Legitimate supported barcode formats remain accepted - **confirmed,
  unchanged, verified via passing valid-length tests.**
- Relevant barcode tests pass - **confirmed: 23/23, Section 4.**
- Existing correct barcode behaviour remains stable - **confirmed via
  regression suite, Section 4.**
- Unresolved barcode issues are documented - **done, Section 5.**
- Clear validation evidence is provided - **done, Sections 1 and 4.**
