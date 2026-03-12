"""
Central logging configuration for the Food Remedy database pipeline.
Provides consistent formatting + levels (INFO, WARNING, ERROR).
"""

import logging
import os
from datetime import datetime

# Create logs folder if missing
LOG_DIR = "database/logs"
os.makedirs(LOG_DIR, exist_ok=True)

# Log file name with date
LOG_FILE = os.path.join(LOG_DIR, f"pipeline_{datetime.now().strftime('%Y_%m_%d')}.log")

def get_logger(name: str):
    """
    Returns a logger with consistent formatting across the pipeline.
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        logger.setLevel(logging.INFO)

        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            "%Y-%m-%d %H:%M:%S"
        )

        file_handler = logging.FileHandler(LOG_FILE)
        file_handler.setFormatter(formatter)

        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)

        logger.addHandler(file_handler)
        logger.addHandler(stream_handler)

    return logger

# Optional: PipelineLogger class wrapper
class PipelineLogger:
    def __init__(self, name: str):
        self.logger = get_logger(name)
    
    def info(self, msg: str):
        self.logger.info(msg)
    
    def warning(self, msg: str):
        self.logger.warning(msg)
    
    def error(self, msg: str):
        self.logger.error(msg)
