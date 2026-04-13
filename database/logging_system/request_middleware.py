"""
Request/response logging middleware for FastAPI or Starlette apps.
"""

from __future__ import annotations

import time
import uuid
from typing import Callable

from .logger import get_access_logger, get_api_logger, get_error_logger

try:
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "request_middleware.py requires FastAPI/Starlette to be installed."
    ) from exc


access_logger = get_access_logger("requests")
api_logger = get_api_logger("requests")
error_logger = get_error_logger("requests")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs request start, request end, and unexpected request failures.
    """

    async def dispatch(self, request: Request, call_next: Callable):
        request_id = str(uuid.uuid4())
        start_time = time.perf_counter()

        request.state.request_id = request_id
        client_ip = request.client.host if request.client else "unknown"

        access_logger.info(
            "event=request_start request_id=%s method=%s path=%s client_ip=%s",
            request_id,
            request.method,
            request.url.path,
            client_ip,
        )

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            response.headers["X-Request-ID"] = request_id

            access_logger.info(
                "event=request_end request_id=%s method=%s path=%s status_code=%s duration_ms=%s",
                request_id,
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )

            api_logger.info(
                "request_id=%s method=%s path=%s status_code=%s duration_ms=%s",
                request_id,
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )

            return response
        except Exception:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            error_logger.exception(
                "event=request_failed request_id=%s method=%s path=%s duration_ms=%s",
                request_id,
                request.method,
                request.url.path,
                duration_ms,
            )
            raise
