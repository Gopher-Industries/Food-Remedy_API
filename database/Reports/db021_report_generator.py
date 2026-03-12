from database.logging_system.logger import PipelineLogger
from datetime import datetime

logger = PipelineLogger("DB021_REPORT")

class DB021ReportGenerator:

    def generate_pdf(self, results):

        content = f"""
        DB021 VALIDATION REPORT
        =======================

        Date: {datetime.now()}

        Total Records: {results['total_records']}

        Schema Valid: {results['schema_valid']}
        Nutrients Valid: {results['nutrient_check']}
        Allergens Valid: {results['allergen_check']}
        Accessibility: {results['accessibility']}

        Duration: {results['duration_seconds']} seconds
        """

        with open("seeding_result_20k.pdf", "w") as f:
            f.write(content)

        logger.info("PDF Report Generated")
