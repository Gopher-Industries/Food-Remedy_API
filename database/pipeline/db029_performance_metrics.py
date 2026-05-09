"""
DB029 - Pipeline Performance Measurement
Records runtime per stage (clean, enrich, seed) on large inputs.
Identifies slow steps and documents bottlenecks.
Location: database/pipeline/db029_performance_metrics.py
"""

import time
import json
import os
import logging
import argparse
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(h)
    logger.setLevel(logging.INFO)

LARGE_INPUT_MIN_RECORDS = 50000


def _assess_input_size(record_count: int) -> Dict[str, Any]:
    """Assess whether the run qualifies as a large-input performance test."""
    is_large_input = record_count >= LARGE_INPUT_MIN_RECORDS
    records_short = max(0, LARGE_INPUT_MIN_RECORDS - record_count)
    return {
        "record_count": record_count,
        "large_input_min_records": LARGE_INPUT_MIN_RECORDS,
        "is_large_input": is_large_input,
        "records_short_of_large_input": records_short,
        "note": (
            "Large-input requirement satisfied."
            if is_large_input
            else (
                f"Input is below large-input threshold by {records_short} records. "
                "Run again with a larger dataset to fully satisfy DB029 evidence."
            )
        )
    }


class StageTimer:
    """Records start, end and duration for a single pipeline stage."""

    def __init__(self, stage_name: str):
        self.stage_name = stage_name
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.duration_seconds: Optional[float] = None
        self.record_count: int = 0
        self.status: str = "pending"
        self.notes: str = ""

    def start(self):
        self.start_time = time.perf_counter()
        self.status = "running"
        logger.info(f"[DB029] Stage '{self.stage_name}' started")

    def stop(self, record_count: int = 0, notes: str = ""):
        self.end_time = time.perf_counter()
        self.duration_seconds = round(self.end_time - self.start_time, 4)
        self.record_count = record_count
        self.status = "completed"
        self.notes = notes
        logger.info(
            f"[DB029] Stage '{self.stage_name}' completed in "
            f"{self.duration_seconds}s ({record_count} records)"
        )

    def to_dict(self) -> Dict[str, Any]:
        records_per_second = None
        if self.duration_seconds and self.record_count:
            records_per_second = round(self.record_count / self.duration_seconds, 2)

        return {
            "stage": self.stage_name,
            "status": self.status,
            "duration_seconds": self.duration_seconds,
            "record_count": self.record_count,
            "records_per_second": records_per_second,
            "notes": self.notes
        }


class PipelineProfiler:
    """Measures and records performance metrics for all pipeline stages."""

    def __init__(self):
        self.stage_timers: List[StageTimer] = []
        self.run_start: Optional[float] = None
        self.run_end: Optional[float] = None
        self.total_duration: Optional[float] = None

    def start_run(self):
        self.run_start = time.perf_counter()
        logger.info("[DB029] Pipeline performance measurement started")

    def time_stage(self, stage_name: str) -> StageTimer:
        timer = StageTimer(stage_name)
        self.stage_timers.append(timer)
        return timer

    def end_run(self):
        self.run_end = time.perf_counter()
        self.total_duration = round(self.run_end - self.run_start, 4)
        logger.info(
            f"[DB029] Pipeline run completed in {self.total_duration}s"
        )

    def identify_bottlenecks(self) -> List[Dict[str, Any]]:
        """Identify the slowest stages as bottlenecks."""
        completed = [
            t for t in self.stage_timers
            if t.status == "completed" and t.duration_seconds is not None
        ]
        if not completed:
            return []

        sorted_stages = sorted(
            completed,
            key=lambda t: t.duration_seconds,
            reverse=True
        )

        bottlenecks = []
        for i, stage in enumerate(sorted_stages):
            pct = round(
                (stage.duration_seconds / self.total_duration) * 100, 1
            ) if self.total_duration else 0

            bottlenecks.append({
                "rank": i + 1,
                "stage": stage.stage_name,
                "duration_seconds": stage.duration_seconds,
                "percentage_of_total": pct,
                "is_slowest": i == 0
            })

        return bottlenecks

    def generate_report(self) -> Dict[str, Any]:
        """Generate a full performance report."""
        stage_metrics = [t.to_dict() for t in self.stage_timers]
        bottlenecks = self.identify_bottlenecks()

        # Find slowest stage
        slowest = bottlenecks[0] if bottlenecks else None
        slowest_note = (
            f"Slowest stage: '{slowest['stage']}' took "
            f"{slowest['duration_seconds']}s "
            f"({slowest['percentage_of_total']}% of total runtime)"
            if slowest else "No stages completed"
        )

        report = {
            "report_generated": datetime.now().isoformat(),
            "total_duration_seconds": self.total_duration,
            "stages": stage_metrics,
            "bottlenecks": bottlenecks,
            "summary": slowest_note,
            "recommendations": _generate_recommendations(bottlenecks)
        }

        return report


def _generate_recommendations(bottlenecks: List[Dict]) -> List[str]:
    """Generate recommendations based on bottleneck analysis."""
    recommendations = []

    for b in bottlenecks:
        stage = b["stage"]
        pct = b["percentage_of_total"]

        if pct > 50:
            recommendations.append(
                f"Stage '{stage}' accounts for over 50% of total runtime. "
                f"Consider optimising or parallelising this stage."
            )
        elif pct > 30:
            recommendations.append(
                f"Stage '{stage}' is relatively slow ({pct}% of total). "
                f"Review for optimisation opportunities."
            )

    if not recommendations:
        recommendations.append(
            "All stages are performing within acceptable ranges."
        )

    return recommendations


def measure_pipeline_performance(
    input_path: str,
    output_dir: str = "database/pipeline/test_reports"
) -> Dict[str, Any]:
    """
    Main function to measure pipeline performance.
    Loads data and times each processing stage.
    """
    profiler = PipelineProfiler()
    profiler.start_run()

    # --- Stage 1: Load data ---
    load_timer = profiler.time_stage("load_data")
    load_timer.start()
    try:
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data = [data]
        record_count = len(data)
        input_assessment = _assess_input_size(record_count)
        load_timer.stop(
            record_count=record_count,
            notes=f"Loaded {record_count} records from {input_path}"
        )
    except Exception as e:
        load_timer.status = "failed"
        load_timer.notes = str(e)
        logger.error(f"[DB029] Failed to load data: {e}")
        return {"error": str(e)}

    # --- Stage 2: Clean stage simulation ---
    clean_timer = profiler.time_stage("clean")
    clean_timer.start()
    try:
        cleaned = []
        for record in data:
            if isinstance(record, dict):
                flat = {}
                for k, v in record.items():
                    if isinstance(v, (list, dict)):
                        flat[k] = json.dumps(v)
                    else:
                        flat[k] = v
                cleaned.append(flat)
        clean_timer.stop(
            record_count=len(cleaned),
            notes="Flattened nested fields for all records"
        )
    except Exception as e:
        clean_timer.status = "failed"
        clean_timer.notes = str(e)
        logger.error(f"[DB029] Clean stage failed: {e}")

    # --- Stage 3: Enrich stage simulation ---
    enrich_timer = profiler.time_stage("enrich")
    enrich_timer.start()
    try:
        enriched_count = 0
        for record in cleaned:
            # Simulate enrichment — tag assignment
            record["_enriched"] = True
            enriched_count += 1
        enrich_timer.stop(
            record_count=enriched_count,
            notes="Applied enrichment tags to all records"
        )
    except Exception as e:
        enrich_timer.status = "failed"
        enrich_timer.notes = str(e)
        logger.error(f"[DB029] Enrich stage failed: {e}")

    # --- Stage 4: Seed stage simulation ---
    seed_timer = profiler.time_stage("seed")
    seed_timer.start()
    try:
        # Simulate seeding in batches of 500
        batch_size = 500
        batches = [
            cleaned[i:i + batch_size]
            for i in range(0, len(cleaned), batch_size)
        ]
        seeded_count = sum(len(b) for b in batches)
        seed_timer.stop(
            record_count=seeded_count,
            notes=f"Simulated seeding in {len(batches)} batches of {batch_size}"
        )
    except Exception as e:
        seed_timer.status = "failed"
        seed_timer.notes = str(e)
        logger.error(f"[DB029] Seed stage failed: {e}")

    profiler.end_run()

    # Generate report
    report = profiler.generate_report()
    report["input_assessment"] = input_assessment
    if not input_assessment["is_large_input"]:
        report["recommendations"].append(
            "Re-run profiling with a large dataset "
            f"(>= {LARGE_INPUT_MIN_RECORDS} records) for ticket-complete evidence."
        )

    # Save report
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(
        output_dir, f"db029_performance_report_{timestamp}.json"
    )
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    logger.info(f"[DB029] Performance report saved to {report_path}")
    print(f"\n[DB029] Performance Report")
    print(f"Total duration: {report['total_duration_seconds']}s")
    print(f"\nStage breakdown:")
    for stage in report["stages"]:
        print(
            f"  {stage['stage']}: {stage['duration_seconds']}s "
            f"({stage['record_count']} records, "
            f"{stage['records_per_second']} rec/s)"
        )
    print(f"\nBottlenecks:")
    for b in report["bottlenecks"]:
        marker = " <- SLOWEST" if b["is_slowest"] else ""
        print(
            f"  #{b['rank']} {b['stage']}: "
            f"{b['duration_seconds']}s "
            f"({b['percentage_of_total']}%){marker}"
        )
    print(f"\nSummary: {report['summary']}")
    print(f"\nInput assessment: {report['input_assessment']['note']}")
    print(f"\nRecommendations:")
    for r in report["recommendations"]:
        print(f"  - {r}")

    return report


def _create_dummy_dataset(output_path: str, record_count: int) -> str:
    """Create a dummy JSON dataset for performance profiling."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    dummy_data = [
        {
            "barcode": f"100000000{str(i).zfill(6)}",
            "productName": f"Test Product {i}",
            "nutriments": {
                "energy-kcal_100g": 200 + (i % 500),
                "proteins_100g": 5 + (i % 10),
                "carbohydrates_100g": 30 + (i % 20),
                "sugars_100g": 10 + (i % 5),
                "fat_100g": 8 + (i % 8)
            },
            "categories": ["Snacks"],
            "brand": "Test Brand"
        }
        for i in range(record_count)
    ]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dummy_data, f)
    return output_path


# Quick test
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="DB029 pipeline performance measurement utility"
    )
    parser.add_argument(
        "--input",
        dest="input_path",
        default=None,
        help="Input JSON file path for profiling."
    )
    parser.add_argument(
        "--generate-large-dummy",
        action="store_true",
        help=(
            "Generate a dummy dataset and run profiling on it. "
            "Default size is the DB029 large-input threshold."
        )
    )
    parser.add_argument(
        "--dummy-size",
        type=int,
        default=LARGE_INPUT_MIN_RECORDS,
        help="Number of dummy records to generate (default: 50000)."
    )
    args = parser.parse_args()

    if args.generate_large_dummy:
        dummy_path = (
            f"database/pipeline/test_reports/dummy_test_data_{args.dummy_size}.json"
        )
        print(f"Creating dummy dataset with {args.dummy_size} records...")
        created_path = _create_dummy_dataset(dummy_path, args.dummy_size)
        print(f"Created dummy dataset: {created_path}\n")
        print(f"Running performance measurement on: {created_path}\n")
        measure_pipeline_performance(created_path)
    elif args.input_path:
        if os.path.exists(args.input_path):
            print(f"Running performance measurement on: {args.input_path}\n")
            measure_pipeline_performance(args.input_path)
        else:
            print(f"Input file does not exist: {args.input_path}")
    else:
        # Use existing sample data for testing
        test_input = "database/seeding/cleanTestSample.json"
        if not os.path.exists(test_input):
            test_input = "database/data_investigation/exampleProductCleaned.json"

        if os.path.exists(test_input):
            print(f"Running performance measurement on: {test_input}\n")
            measure_pipeline_performance(test_input)
        else:
            print("No sample input found. Use --generate-large-dummy or --input.")
