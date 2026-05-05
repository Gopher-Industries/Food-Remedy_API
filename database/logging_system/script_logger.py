"""
Helpers for standalone backend scripts such as scraping, cleaning, and seeding.
"""

from __future__ import annotations

from .logger import get_error_logger, get_logger


class ScriptLogger:
    """
    Small helper for logging the lifecycle of standalone scripts.
    """

    def __init__(self, script_name: str, channel: str = "pipeline"):
        self.script_name = script_name
        self.logger = get_logger(script_name, channel=channel)
        self.error_logger = get_error_logger(script_name)

    def log_start(self, input_source: str | None = None) -> None:
        message = f"event=script_start script={self.script_name}"
        if input_source:
            message += f" input_source={input_source}"
        self.logger.info(message)

    def log_progress(self, step: str, records_processed: int | None = None) -> None:
        message = f"event=script_progress script={self.script_name} step={step}"
        if records_processed is not None:
            message += f" records_processed={records_processed}"
        self.logger.info(message)

    def log_success(
        self,
        output_target: str | None = None,
        total_records: int | None = None,
    ) -> None:
        message = f"event=script_success script={self.script_name}"
        if output_target:
            message += f" output_target={output_target}"
        if total_records is not None:
            message += f" total_records={total_records}"
        self.logger.info(message)

    def log_warning(self, warning_message: str) -> None:
        self.logger.warning(
            "event=script_warning script=%s warning=%s",
            self.script_name,
            warning_message,
        )

    def log_error(self, error: Exception | str, step: str | None = None) -> None:
        details = f"event=script_error script={self.script_name}"
        if step:
            details += f" step={step}"
        self.error_logger.exception("%s error=%s", details, error)
