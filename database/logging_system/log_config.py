"""
Shared logging configuration for API, access, error, and pipeline logs.
"""

from __future__ import annotations

import os
from datetime import datetime

LOG_DIR = os.path.join("database", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
DEFAULT_LOG_FORMAT = (
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

TODAY = datetime.now().strftime("%Y_%m_%d")

LOG_FILE_NAMES = {
    "pipeline": f"pipeline_{TODAY}.log",
    "api": f"api_{TODAY}.log",
    "access": f"access_{TODAY}.log",
    "error": f"error_{TODAY}.log",
}


def get_log_file_path(channel: str) -> str:
    """
    Return the full path for a given logging channel.
    """
    filename = LOG_FILE_NAMES.get(channel, f"{channel}_{TODAY}.log")
    return os.path.join(LOG_DIR, filename)
