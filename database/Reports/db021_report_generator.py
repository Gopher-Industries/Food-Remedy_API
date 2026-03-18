from database.logging_system.logger import PipelineLogger
from datetime import datetime

logger = PipelineLogger("DB021_REPORT")

class DB021ReportGenerator:

    def generate_pdf(self, results):

        barcode_check = results.get("barcode_check", {})
        barcode_details = results.get("barcode_details", {})
        
        content = f"""
        DB021 VALIDATION REPORT
        =======================
        
        Date: {datetime.now()}
        
        Original Records: {results.get('original_records', results['total_records'])}
        Total Records (after cleaning): {results['total_records']}
        Removed Barcodes: {results.get('removed_barcodes', 0)}
        
        Schema Valid: {results['schema_valid']}
        Nutrients Valid: {results['nutrient_check']}
        Allergens Valid: {results['allergen_check']}
        Accessibility: {results['accessibility']}
        
        Barcode Check OK: {barcode_check.get('ok', 'n/a')}
        Barcode Issues: empty={barcode_check.get('empty', 0)}, invalid_format={barcode_check.get('invalid_format', 0)}, duplicates={barcode_check.get('duplicates', 0)}
        Barcode Removed Breakdown: empty={barcode_details.get('removed_empty', 0)}, invalid_format={barcode_details.get('removed_invalid_format', 0)}, duplicates={barcode_details.get('removed_duplicates', 0)}
        
        Duration: {results['duration_seconds']} seconds
        """

        with open("seeding_result_20k.pdf", "w") as f:
            f.write(content)

        logger.info("PDF Report Generated")
