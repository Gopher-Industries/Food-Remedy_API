# DB039 – Investigate Data Validation Reporting

## Objective

Investigate how validation results and data-quality failures are currently reported by the database pipeline, and determine whether developers can easily identify which records failed validation and why.

No existing functionality was changed as part of this investigation.

## Files Reviewed

- `database/pipeline/modules/schema_validator.py`
- `database/Validation/report_generator.py`
- `database/Validation/schema_validation_report.json`
- `database/seeding/schema_validation_report.json`
- `database/pipeline/test_reports/schema_report_*.json`
- `database/seeding/schema_definition.json`
- `database/Validation/schema_loader.py`

## Existing Validation Reports

### 1. Validation Report

File:

`database/Validation/schema_validation_report.json`

Current report:

- Total records: 5000
- Valid records: 5000
- Invalid records: 0
- Errors: none
- `barcode_ok`: false
- `schema_valid`: true

This report provides useful high-level summary information.

However, `barcode_ok` is false while `invalid_records` is 0 and the errors list is empty. The report does not explain which barcode caused the barcode check to fail or why it failed.

This can make the result unclear for developers.

### 2. Seeding Validation Report

File:

`database/seeding/schema_validation_report.json`

Current report:

- Total records: 5000
- Invalid records: 7
- Record-level errors are included

Example:

- Barcode: `0097744081372`
- Error: `productName missing; fallback applied: 'Product barcode 0097744081372'`

This report provides better traceability because developers can identify both the affected record and the reason for the issue.

Seven records were reported with missing product names.

### 3. Pipeline Schema Reports

Files:

`database/pipeline/test_reports/schema_report_*.json`

Example report:

- Total: 5000
- Valid: 5000
- Invalid: 0
- Invalid examples: none

These reports provide a simple validation summary.

The pipeline schema validator can include:

- barcode
- validation errors

for invalid records.

However, the implementation stores only the first 10 invalid examples.

Therefore, if more than 10 records fail validation, the report does not provide record-level information for every failed record.

## Representative Validation Testing

The `_validate_record()` function in:

`database/pipeline/modules/schema_validator.py`

was tested using representative valid and invalid records.

### Valid Product

Result:

`[]`

No validation errors were reported.

### Missing Barcode

Result:

`['missing_barcode']`

### Missing Product Name

Result:

`['missing_productName']`

### Invalid Field Types

Result:

- `invalid_nutriments_type`
- `invalid_allergens_type`
- `invalid_categories_type`
- `invalid_completeness_value`

These tests confirm that the validator itself can identify specific validation problems.

## Findings

### 1. Multiple Reporting Formats

Validation results are reported in several different formats across the database workflow.

The Validation report, seeding report and pipeline schema reports use different structures and provide different levels of detail.

### 2. Validation Results Are Not Fully Consistent

For the current 5000-record dataset:

- `database/Validation/schema_validation_report.json` reports 0 invalid records.
- Pipeline schema reports also report 0 invalid records.
- `database/seeding/schema_validation_report.json` reports 7 invalid records.

The different validation components appear to use different validation logic or reporting criteria.

This can make it difficult for developers to determine which report should be treated as the main validation result.

### 3. Record-Level Traceability Is Inconsistent

The seeding validation report provides the barcode and reason for each reported issue.

Other reports may provide only summary information or limited examples.

Therefore, developers cannot always identify the exact failed record from every validation report.

### 4. Error Reasons Are Available but Not Always Reported

The pipeline schema validator can return specific errors such as:

- `missing_barcode`
- `missing_productName`
- `invalid_nutriments_type`
- `invalid_allergens_type`
- `invalid_categories_type`
- `invalid_completeness_value`

However, this information is not consistently represented across all validation reports.

### 5. Pipeline Report Limits Invalid Examples

`schema_validator.py` stores only the first 10 invalid examples.

This keeps reports small, but can limit debugging when a larger number of records fail validation.

### 6. Some Summary Fields Can Be Unclear

The Validation report can show:

- `invalid_records: 0`
- `errors: []`
- `barcode_ok: false`

at the same time.

Because barcode validation is reported separately from schema validation, developers may not immediately understand why the overall result contains conflicting-looking status values.

### 7. Batch Total Fallback Has a Limitation

`database/Validation/report_generator.py` contains a fallback calculation for `total_records` when the caller does not provide it.

The code comments state that this fallback is mainly suitable for single-record validation and should not be relied on for multi-record batch validation.

## Strengths

Current validation reporting has several useful features:

- Overall record counts are available.
- The pipeline validator provides clear machine-readable error codes.
- The seeding report provides barcode-level traceability.
- Reports are stored in JSON format and are easy to inspect.
- Some reports provide both summary and detailed error information.

## Limitations

The main limitations identified are:

- Multiple report structures exist.
- Validation results can differ between reports.
- Record-level information is not consistently available.
- Some summary fields can be difficult to interpret.
- Pipeline reports only store up to 10 invalid examples.
- There is no common error summary showing how many failures occurred for each field or error type.

## Recommendations

Future validation reporting improvements could consider:

1. Use a more consistent report structure across validation stages.
2. Include a clear identifier such as barcode for every failed record where possible.
3. Include the failed field and reason for each validation failure.
4. Clearly separate schema validation, barcode validation and other validation categories.
5. Add an error summary showing counts by validation error type.
6. Clarify whether reported invalid counts represent schema failures, data-quality warnings, or all validation failures.
7. Consider providing access to all invalid records while keeping a smaller summary section for quick review.
8. Ensure batch-level totals are calculated consistently.

## Conclusion

The existing validation system can identify specific data-quality problems, but reporting is inconsistent across different parts of the database workflow.

Some reports provide good record-level traceability, while others provide only high-level summaries or limited examples.

Improving consistency and diagnostic detail would make it easier for developers to identify which records failed validation and understand the reason for each failure.
