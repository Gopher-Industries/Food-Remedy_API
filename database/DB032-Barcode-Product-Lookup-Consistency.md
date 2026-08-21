# DB032 - Investigate Barcode & Product Lookup Consistency

This document investigates whether barcode data quality contributes to
product lookup failures, documents the main issues found, and describes the
one low-risk fix implemented on this ticket.

## Scope

Files inspected:

- `database/clean_data/cleanProductData.py` - raw-to-cleaned ingestion pipeline (DB001/DB002/DB004/DB017)
- `database/Validation/db021_validator.py` - pre-seed batch validator (DB012)
- `database/Validation/db012_validator.py` - batch validator wrapper (DB012)
- `scanPipeline_BE03.js` - client-side scan enrichment (allergen/risk classification)
- `persistenceLayer_BE03.js` - client-side SQLite cache layer
- `database/seeding/products_enriched.json` - current seed dataset (5,000 records)
- `openfoodfacts-australia.jsonl` - raw OpenFoodFacts Australia sample (61 records)

All figures below were produced by running the **real, unmodified functions**
from these files against real project data in a sandbox, not by inspection
alone. Reproduction steps are in the Testing section.

**Note on scope:** no direct barcode *lookup query* (e.g. a Firestore
`where('barcode', '==', ...)` call) was available to inspect - the files
provided cover ingestion, validation, and client-side scan/cache handling,
but not the API-side lookup endpoint itself. Findings on "No record" causes
are therefore based on tracing normalisation behaviour up to the point of
lookup, not on a live reproduction against the lookup query. If the lookup
endpoint code becomes available this should be revisited.

---

## Summary of findings

| Area | Finding | Severity |
|---|---|---|
| Missing barcodes | A `None` barcode is silently dropped during deduplication before it ever reaches validation - no warning, no log line | High |
| Invalid formats | 3 real records in the current seed data have genuinely invalid barcodes (15 and 21 digits); one is an obvious placeholder value | Medium |
| Unexpected lengths | The cleaning-stage validator only accepted exactly 13 digits, silently disagreeing with the pre-seed validator's 8/12/13/14-digit rule - 115 real EAN-8/GTIN-14 products (2.3% of catalogue) were false-flagged | Medium (fixed on this ticket) |
| Duplicates | Exact-string duplicate barcodes ARE correctly merged during cleaning | Working as intended |
| Normalisation | No stage in the pipeline (ingestion, validation, or client-side scan) strips punctuation/whitespace or reconciles int-vs-string leading-zero loss | High |
| Lookup relationship | Because normalisation is inconsistent end-to-end, a barcode stored in one format will fail an exact-match lookup against a differently-formatted scan of the same physical product | High |
| Validation gate | `BatchValidator.validate()` currently returns `False` on the live seed file, contradicting the checked-in `schema_validation_report.json` which claims `barcode_ok: true` | High |

---

## 1. Missing barcodes

`database/seeding/products_enriched.json` (5,000 records, current seed data)
has **zero** records with a missing `barcode` field by the time it reaches
that stage. That looks reassuring, but tracing the pipeline backwards shows
why: **a record can lose its barcode silently before it is ever reported as
missing.**

`deduplicate_products()` builds a grouping key like this:

```python
working['__barcode_key'] = working['code'].astype(str).str.replace(r'\D', '', regex=True).str.strip()
```

When `code` is `None`, this key becomes `NaN`, not `""`. That matters because
the function later does two things with that key:

1. Rows where the key **is not** `""` are grouped with `.groupby('__barcode_key')` for barcode-based dedup.
2. Rows where the key **is** `""` fall through to a name+brand fallback dedup path, so barcode-less records still survive.

A `NaN` key satisfies condition 1 (`NaN != ""` is `True`), so it enters the
`.groupby()` call - but pandas' `groupby()` drops `NaN`-keyed groups by
default. The row never gets merged, never gets appended to the output, and
never reaches the fallback path either (since fallback requires the key to
be exactly `""`). It simply disappears, with no warning or log entry.

**Confirmed in sandbox** (`tests/test_db032_barcode.py::test_none_barcode_is_silently_dropped_during_dedup`):
a record with `code=None` produces **0** output rows; the same record with
`code=""` (empty string instead of null) correctly survives with **1**
output row.

This was NOT fixed on this ticket (see Recommended follow-up below) because
`deduplicate_products()` is central, shared logic used for every record, not
just barcode handling - a fix there needs its own dedicated ticket and
broader regression testing.

## 2. Invalid barcode formats

Running the real `db021_validator.validate_barcodes()` against the current
seed file (`database/seeding/products_enriched.json`, 5,000 records) found:

```
empty=0, invalid_format=3, duplicates=0
```

The 3 invalid records:

| Barcode | Length | Product | Notes |
|---|---|---|---|
| `123456789101112` | 15 | Bakers Delight Hot Cross Buns | Digits are literally the sequence 1-2-3...-12 concatenated - almost certainly a placeholder/test value rather than a real scanned barcode |
| `793144417118850103601` | 21 | Double Brie (Tasmanian Heritage) | No standard retail format is 21 digits |
| `793251630047590107102` | 21 | Fortescue Bay (Ashgrove) | Same as above |

21 digits is suspiciously close to 13+8 (EAN-13 + EAN-8), which raised a
concatenation hypothesis, but neither the first-13 nor last-8 substring of
either value matches another barcode elsewhere in the 5,000-record dataset,
so that couldn't be confirmed against the data available here.

## 3. Unexpected barcode lengths

Length distribution across the 5,000-record seed file:

| Length | Count | Standard |
|---|---|---|
| 8 | 111 | EAN-8 |
| 13 | 4,882 | EAN-13 |
| 14 | 4 | GTIN-14 |
| 15 | 1 | Not standard (see above) |
| 21 | 2 | Not standard (see above) |

545 of the 4,882 EAN-13 codes (~11.2%) carry a legitimate leading zero -
consistent with the ~11.6% figure already documented in
`DB012-Validation-Integration-Testing.md` for the equivalent 5k test file.

**The core issue:** `cleanProductData.py`'s `validate_record()` (added in
DB001) only ever accepted barcodes that were exactly 13 digits. It was never
updated when DB012 later established that 8/12/13/14 digits are all valid
retail formats. Run against the real seed data:

- **Before fix:** 118 records flagged `"Barcode must be 13 digits"` - 115 of
  which are legitimate EAN-8/GTIN-14 codes, i.e. **97.5% of the warnings this
  check produced were false positives.**
- **After fix:** 3 records flagged, matching exactly the 3 genuinely invalid
  records identified by `db021_validator.py` in section 2.

This is the fix implemented on this ticket - see "Fix implemented" below.

## 4. Duplicate barcodes

Good news here: **exact-string duplicate barcodes are correctly detected and
merged.** `deduplicate_products()` groups by barcode, ranks candidates by
`completeness`, and merges missing fields from the less-complete record into
the most-complete one. Confirmed with a real test case
(`test_exact_duplicate_barcodes_are_merged`) and against the live seed data,
which has **zero** exact-duplicate barcodes surviving to the cleaned output.

The gap is **normalisation-dependent duplicates** - two records that
represent the same physical barcode but aren't textually identical (e.g. one
has embedded dashes). The dedup *key* strips non-digit characters, so these
ARE correctly grouped as duplicates and merged into a single record -
but the **surviving record keeps whichever raw, unstripped value** belonged
to the higher-completeness row. If that row's barcode had punctuation, the
punctuation survives into the final stored value despite the "duplicate"
having technically been resolved. Confirmed with
`test_punctuation_variant_duplicates_are_not_caught_by_final_value`.

## 5. Current barcode normalisation behaviour

Across every stage inspected, barcode normalisation is minimal or absent:

| Stage | File | What it does to the barcode |
|---|---|---|
| Ingestion | `ensure_code_field()` | Trims whitespace only. No digit-only enforcement, no punctuation removal. |
| Ingestion | `deduplicate_products()` | Strips non-digits, but **only** for the internal matching key - not applied to the value actually stored |
| Pre-seed validation | `db021_validator.preprocess_record()` | `str(barcode).strip()` - same as ingestion, whitespace only |
| Client-side scan | `scanPipeline_BE03.js: cleanData()` | `raw.barcode \|\| null` - literally no transformation at all |
| Client-side cache | `persistenceLayer_BE03.js` | Stores whatever string it's given, unchanged |

None of these stages reconcile the leading-zero-loss case: if a barcode is
ever represented as a JSON/JS number instead of a string anywhere upstream
(a plausible real-world source: a spreadsheet import, or a scanner SDK
returning a number), a leading zero is lost permanently before any of this
code runs. `int("0009542005948")` is `9542005948` - three digits shorter,
and indistinguishable at that point from a different, shorter barcode.
Confirmed empirically: mixing string- and int-typed versions of the same
real seed barcodes through `deduplicate_products()` produces **zero**
matches between the two forms (`db032_investigation.py` sandbox script).

Given that ~11% of the current EAN-13 catalogue relies on a leading zero,
this is not a theoretical edge case.

## 6. Relationship between stored barcodes and product lookup

No barcode-lookup query was available for direct inspection (see Scope). What
was confirmed is that **nothing in the ingestion or scan path guarantees a
canonical barcode representation**, and this directly implicates lookup
behaviour: an exact-match lookup (`WHERE barcode = ?` / `.where('barcode',
'==', ...)`) will only succeed if the scanned string matches the stored
string byte-for-byte. Given section 5's findings, there are at least three
realistic ways a scan can fail to match an existing record:

1. **Leading-zero loss** - stored as `"0009542005948"`, looked up as `"9542005948"` (or vice versa) if either value passed through a numeric type anywhere in its history.
2. **Punctuation survival** - stored as `"9542-0059-48123"` after a dedup merge kept the punctuated variant (section 4), looked up as a clean digit string from a scanner.
3. **Whitespace** - `ensure_code_field()` trims the ingestion-side value, but nothing guarantees the scan-side value is trimmed the same way before comparison.

In all three cases the product genuinely exists in the database - the
lookup fails purely on string-representation mismatch, which would present
to a user as "No record" even though the barcode was scanned correctly.

## 7. Examples of barcode scanning that would return "No record"

Reproduced via code trace (see caveat in Scope - not a live app/API
reproduction):

- Product ingested with `code: "0009542005948"` (string, leading zero
  preserved) → stored barcode `"0009542005948"`. A scan that produces
  `9542005948` (e.g. if the barcode ever passed through a numeric field on
  the way to the scanner/app) would not match on an exact-string lookup.
- Two source records for the same product, one formatted `"9542-0059-48123"`
  and one `"9542005948123"`, get merged by `deduplicate_products()` (section
  4) - if the punctuated version wins on completeness, the stored barcode
  retains the dashes. A scan producing the plain digit string would not
  match.
- The 3 genuinely invalid records from section 2 (e.g. `123456789101112`)
  would never usefully match any real scan, since no real product carries
  that barcode.

---

## Fix implemented

**`validate_record()`'s barcode check in `cleanProductData.py` now matches
`db021_validator.py`'s accepted lengths (8/12/13/14 digits) and uses the same
digit-only regex instead of `str.isdigit()`** (which also accepts non-ASCII
"digit" characters - fullwidth digits, superscripts, Arabic-Indic digits -
that aren't valid barcode characters).

This was chosen as the one low-risk improvement for this ticket because:

- It's a **warning-only** code path - `validate_record()` only prints
  diagnostics, it never drops or mutates data, so the change carries no risk
  of altering what gets seeded.
- It's **self-contained** to a single function.
- It closes a proven, current, real bug: 115 of 5,000 real products (2.3% of
  the catalogue) were receiving an incorrect "Barcode must be 13 digits"
  warning on every pipeline run.
- It brings the cleaning-stage check in line with logic DB012 already
  established, tested, and documented as correct - rather than introducing
  new validation policy.

The dedup/normalisation issues in sections 1, 4, and 5 are real and
higher-impact, but touch shared logic used by every record (not just
barcodes) and would need their own dedicated ticket and regression pass -
they're listed under Recommended follow-up rather than fixed here.

### Diff summary

```python
# Before (DB001-era):
if not (record['barcode'].isdigit() and len(record['barcode']) == 13):
    warnings.append("Barcode must be 13 digits")

# After (DB032):
_BARCODE_DIGIT_PATTERN = re.compile(r"^[0-9]+$")
_BARCODE_LENGTHS = (8, 12, 13, 14)
...
barcode = record['barcode']
if not (bool(_BARCODE_DIGIT_PATTERN.fullmatch(barcode)) and len(barcode) in _BARCODE_LENGTHS):
    warnings.append("Barcode must be 8, 12, 13, or 14 digits")
```

---

## Testing

All tests in `tests/test_db032_barcode.py`, run against the real
(unmodified except for the one fix above) pipeline functions.

### Test valid barcodes
Parametrised test covering all four standard lengths (EAN-8, UPC-A, EAN-13
with and without leading zero, GTIN-14) - all pass with no barcode warning.

### Test missing and malformed barcodes
Parametrised test covering: empty string, too short, too long, letters,
embedded punctuation, embedded whitespace, and fullwidth (non-ASCII) digits
- all correctly flagged. A separate test confirms a genuinely absent
`barcode` key raises `KeyError` (a loud failure) rather than being silently
skipped.

### Test duplicate barcode cases
- Exact-string duplicates: confirmed merged into one record, keeping the
  higher-completeness values.
- Punctuation-variant duplicates: confirmed merged (same digits recognised),
  but confirmed the surviving stored value can still carry punctuation -
  documented as a known issue, not fixed on this ticket.
- `None` barcode: confirmed it is silently dropped during dedup (0 rows
  survive) vs. an empty-string barcode, which correctly survives (1 row) -
  documented as a known issue, not fixed on this ticket.

### Compare stored barcode values with lookup behaviour
Covered in sections 5-7 above via code trace across ingestion, validation,
and client-side scan/cache paths, since no live lookup endpoint was
available to test directly.

### Run applicable tests

```bash
python3 -m pytest tests/test_db032_barcode.py -v
```

Result: **18 passed, 0 failed.**

Also re-ran the existing DB012 batch validator end-to-end against the live
seed file to confirm the fix doesn't change seeding behaviour (it shouldn't
- the fix only touches the earlier cleaning-stage warning, not the pre-seed
gate):

```bash
python3 -c "from database.Validation.db012_validator import BatchValidator; print(BatchValidator().validate())"
```

Result: `False` - **this is expected and correct.** The 3 genuinely invalid
barcodes from section 2 still correctly fail `db021_validator`'s check
(untouched by this ticket's fix). This also surfaces a separate finding:
the currently checked-in `schema_validation_report.json` claims
`"barcode_ok": true`, but running the real validator against the current
`database/seeding/products_enriched.json` returns `false` right now. That
report appears to be stale relative to the current seed file - worth
checking whether the validation gate is actually being re-run before each
seed, or whether the report was generated against an earlier dataset.

---

## Recommended follow-up tickets

1. **Fix the silent `None`-barcode drop in `deduplicate_products()`**
   (section 1) - highest priority, since it means "missing barcode" products
   don't even get logged as missing; they just vanish. Needs its own ticket
   given the function's shared, central role.
2. **Normalise the stored barcode value, not just the dedup matching key**
   (sections 4-5) - decide on a canonical stored format (likely: digits
   only, leading zeros preserved) and apply it consistently at ingestion,
   pre-seed validation, and client-side scan time. This is the change most
   likely to directly reduce "No record" lookup failures, but touches
   already-seeded data and multiple files, so it needs its own scoped
   ticket rather than a low-risk fix.
3. **Investigate the 3 confirmed-invalid records** (section 2) with whoever
   owns product data sourcing - the placeholder-looking value in particular
   suggests a data entry or import issue worth tracing further upstream.
4. **Confirm whether the pre-seed validation gate is actually blocking
   seeding in practice** - `schema_validation_report.json` says
   `barcode_ok: true` while the real validator currently returns `false` on
   the same seed file.
5. **Get access to the actual barcode lookup query** (API-side, not part of
   this ticket's uploaded files) to directly reproduce "No record" cases
   rather than inferring them from upstream normalisation behaviour.

---

## Expected result

DB032 is considered successful when:

- The main barcode data-quality issues (missing, invalid format, unexpected
  length, duplicates, normalisation, lookup relationship) are documented
  with real evidence from the current codebase and seed data - **done,
  above.**
- One low-risk improvement is implemented - **done: `validate_record()`
  barcode length/format check aligned with `db021_validator.py`.**
- All new tests pass and existing validation behaviour is unchanged except
  where intentionally fixed - **confirmed: 18/18 new tests pass;
  `BatchValidator.validate()` still correctly returns `False` on the 3
  genuinely invalid records.**
