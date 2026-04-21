import json
from pathlib import Path
from datetime import datetime

def generate_quality_report(
    input_path: str = "database/seeding/seeded_products.json",
    output_md: str = "database/Reports/dataset_quality_report.md"
):
    with open(input_path, encoding='utf-8') as f:
        data = json.load(f)

    total = len(data)
    if total == 0:
        print("No data found.")
        return

    all_fields = set().union(*(p.keys() for p in data))

    # Average completeness score
    completeness_values = [p.get("completeness", 0) for p in data]
    avg_completeness = sum(completeness_values) / total

    # Core Field Completeness
    core_fields = ["barcode", "productName", "nutriments"]
    missing_rates = {}
    for field in core_fields:
        missing = sum(1 for p in data if not p.get(field))
        missing_rates[field] = missing / total * 100

    # Extended Completeness
    extended_fields = sorted(all_fields - set(core_fields))
    extended_missing = {}
    for field in extended_fields:
        missing = sum(1 for p in data if not p.get(field))
        extended_missing[field] = missing / total * 100

    # Sort extended fields by missing rate (ascending)
    sorted_extended = sorted(extended_missing.items(), key=lambda x: x[1])

    # Generate clean Markdown report
    mtime = Path(output_md).stat().st_mtime if Path(output_md).exists() else None
    report_time = datetime.fromtimestamp(mtime).astimezone().strftime("%d-%m-%Y %H:%M:%S") if mtime else "N/A"

    report = f"""# Dataset Quality Report

**Generated on:** {Path(input_path).name}  
**Total products:** {total}  
**Report time:** {report_time}

## Summary Statistics
- Average completeness score: {avg_completeness:.3f}  
  *(based on the Open Food Facts completeness metric (0–1): how much recommended data is filled)*

## Core Field Completeness by Missing Rate %
"""
    for field, rate in missing_rates.items():
        report += f"- `{field}` missing: {rate:.1f}%\n"

    report += """
## Extended Field Completeness by Missing Rate % (in ascending order)
"""
    for field, rate in sorted_extended:
        report += f"- `{field}` missing: {rate:.1f}%\n"

    report += """
## Notes
- This report measures dataset quality after the full clean → enrich → seed pipeline.
"""

    Path(output_md).write_text(report, encoding='utf-8')
    print(f"Quality report successfully generated: {output_md}")

if __name__ == "__main__":
    generate_quality_report()