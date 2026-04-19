from .logger import (
    PipelineLogger,
    get_access_logger,
    get_api_logger,
    get_error_logger,
    get_logger,
)
from .pipeline_logger import PipelineStageLogger
from .script_logger import ScriptLogger

__all__ = [
    "PipelineLogger",
    "PipelineStageLogger",
    "ScriptLogger",
    "get_logger",
    "get_api_logger",
    "get_access_logger",
    "get_error_logger",
]

try:
    from .exception_handler import global_exception_handler
    from .request_middleware import RequestLoggingMiddleware
except ImportError:  # FastAPI/Starlette not installed yet.
    global_exception_handler = None
    RequestLoggingMiddleware = None
else:
    __all__.extend(
        [
            "RequestLoggingMiddleware",
            "global_exception_handler",
        ]
    )
