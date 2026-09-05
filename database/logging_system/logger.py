"""
Central logging configuration for Food Remedy.
Supports pipeline, API, access, and error logging channels.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from .log_config import (
    DEFAULT_DATE_FORMAT,
    DEFAULT_LOG_FORMAT,
    DEFAULT_LOG_LEVEL,
    get_log_file_path,
)


def _build_formatter() -> logging.Formatter:
    return logging.Formatter(DEFAULT_LOG_FORMAT, DEFAULT_DATE_FORMAT)


def _build_file_handler(channel: str) -> RotatingFileHandler:
    handler = RotatingFileHandler(
        get_log_file_path(channel),
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(_build_formatter())
    return handler


def _build_stream_handler() -> logging.StreamHandler:
    handler = logging.StreamHandler()
    handler.setFormatter(_build_formatter())
    return handler


def get_logger(name: str, channel: str = "pipeline") -> logging.Logger:
    """
    Return a logger configured for the given logging channel.
    """
    logger_name = f"{channel}.{name}"
    logger = logging.getLogger(logger_name)

    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, DEFAULT_LOG_LEVEL, logging.INFO))
    logger.propagate = False

    logger.addHandler(_build_file_handler(channel))
    logger.addHandler(_build_stream_handler())

    return logger


def get_api_logger(name: str = "api") -> logging.Logger:
    return get_logger(name=name, channel="api")


def get_access_logger(name: str = "access") -> logging.Logger:
    return get_logger(name=name, channel="access")


def get_error_logger(name: str = "error") -> logging.Logger:
    return get_logger(name=name, channel="error")


class PipelineLogger:
    def __init__(self, name: str):
        self.logger = get_logger(name=name, channel="pipeline")

    def info(self, msg: str):
        self.logger.info(msg)

    def warning(self, msg: str):
        self.logger.warning(msg)

    def error(self, msg: str, exc_info: bool = False):
        self.logger.error(msg, exc_info=exc_info)
