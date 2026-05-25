"""
Global exception handler helpers for FastAPI apps.
"""

from __future__ import annotations

from .logger import get_error_logger

try:
    from fastapi import Request
    from fastapi.responses import JSONResponse
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "exception_handler.py requires FastAPI to be installed."
    ) from exc


error_logger = get_error_logger("exceptions")


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Log unexpected exceptions and return a safe response to the client.
    """
    request_id = getattr(request.state, "request_id", "unknown")

    error_logger.exception(
        "event=unhandled_exception request_id=%s method=%s path=%s error=%s",
        request_id,
        request.method,
        request.url.path,
        str(exc),
    )

    return JSONResponse(
        status_code=500,
        content={
            "message": "Internal server error",
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
    )
