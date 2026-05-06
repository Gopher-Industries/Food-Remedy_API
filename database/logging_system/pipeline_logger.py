"""
Helpers for logging pipeline stages and run summaries.
"""

from __future__ import annotations

from typing import Any

from .logger import get_error_logger, get_logger


class PipelineStageLogger:
    """
    Convenience wrapper for logging pipeline stage lifecycle events.
    """

    def __init__(self, pipeline_name: str = "DataPipeline"):
        self.pipeline_name = pipeline_name
        self.logger = get_logger(pipeline_name, channel="pipeline")
        self.error_logger = get_error_logger(pipeline_name)

    def log_pipeline_start(self, input_source: str | None = None) -> None:
        message = f"event=pipeline_start pipeline={self.pipeline_name}"
        if input_source:
            message += f" input_source={input_source}"
        self.logger.info(message)

    def log_pipeline_end(
        self,
        total_duration_ms: float | None = None,
        total_records: int | None = None,
    ) -> None:
        message = f"event=pipeline_end pipeline={self.pipeline_name}"
        if total_duration_ms is not None:
            message += f" total_duration_ms={total_duration_ms}"
        if total_records is not None:
            message += f" total_records={total_records}"
        self.logger.info(message)

    def log_stage_start(
        self,
        stage_name: str,
        input_file: str | None = None,
        batch_id: str | None = None,
    ) -> None:
        message = f"event=stage_start pipeline={self.pipeline_name} stage={stage_name}"
        if input_file:
            message += f" input_file={input_file}"
        if batch_id:
            message += f" batch_id={batch_id}"
        self.logger.info(message)

    def log_stage_end(
        self,
        stage_name: str,
        duration_ms: float | None = None,
        input_records: int | None = None,
        output_records: int | None = None,
        failures: int | None = None,
        output_file: str | None = None,
        **extra, # added to support extra metadata
    ) -> None:
        message = f"event=stage_end pipeline={self.pipeline_name} stage={stage_name}"
        if duration_ms is not None:
            message += f" duration_ms={duration_ms}"
        if input_records is not None:
            message += f" input_records={input_records}"
        if output_records is not None:
            message += f" output_records={output_records}"
        if failures is not None:
            message += f" failures={failures}"
        if output_file:
            message += f" output_file={output_file}"

        # Logging extra metadata fields (started, finished, config_summary, modules_summary, etc.)
        for key, value in extra.items():
                    if value is not None:
                        if isinstance(value, dict):
                            # Flatten simple dicts for readability
                            for k, v in value.items():
                                message += f" {key}_{k}={v}"
                        else:
                            message += f" {key}={value}"

        self.logger.info(message)

    def log_stage_warning(self, stage_name: str, warning_message: str) -> None:
        self.logger.warning(
            "event=stage_warning pipeline=%s stage=%s warning=%s",
            self.pipeline_name,
            stage_name,
            warning_message,
        )

    def log_stage_error(
        self,
        stage_name: str,
        error: Exception | str,
        input_file: str | None = None,
        batch_id: str | None = None,
    ) -> None:
        """Log stage failure as structured event in both main log and error log."""
        details = f"event=stage_error pipeline={self.pipeline_name} stage={stage_name}"
        if input_file:
            details += f" input_file={input_file}"
        if batch_id:
            details += f" batch_id={batch_id}"

        error_msg = str(error)

        # Log to MAIN pipeline log
        self.logger.error("%s error=%s", details, error_msg)

        # Log to error logger with full traceback
        self.error_logger.exception("%s error=%s", details, error_msg)

    def log_metric(self, stage_name: str, metric_name: str, metric_value: Any) -> None:
        self.logger.info(
            "event=metric pipeline=%s stage=%s metric=%s value=%s",
            self.pipeline_name,
            stage_name,
            metric_name,
            metric_value,
        )

    def log_info(self, stage_name: str, message: str, **kwargs) -> None:
        """General info log with stage context"""
        extra = " ".join(f"{k}={v}" for k, v in kwargs.items())
        self.logger.info(
            "event=stage_info pipeline=%s stage=%s message=%s %s",
            self.pipeline_name, stage_name, message, extra
        )