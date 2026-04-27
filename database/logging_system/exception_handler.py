"""
Global exception handler helpers for FastAPI apps.
"""

from __future__ import annotations

from typing import Any

from .logger import get_error_logger

try:
    from fastapi import FastAPI, HTTPException, Request, status
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "exception_handler.py requires FastAPI to be installed."
    ) from exc


error_logger = get_error_logger("exceptions")


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _error_response(
    *,
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: Any | None = None,
) -> JSONResponse:
    content = {
        "error": {
            "code": code,
            "message": message,
            "request_id": _request_id(request),
        }
    }

    if details:
        content["error"]["details"] = details

    return JSONResponse(status_code=status_code, content=content)


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Convert FastAPI HTTPException instances into the shared error response shape.
    """
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"

    return _error_response(
        request=request,
        status_code=exc.status_code,
        code=f"HTTP_{exc.status_code}",
        message=message,
        details=exc.detail if isinstance(exc.detail, dict) else None,
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """
    Return validation failures with a stable 422 response body.
    """
    return _error_response(
        request=request,
        status_code=422,
        code="VALIDATION_ERROR",
        message="Invalid request data",
        details={"errors": exc.errors()},
    )


async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """
    Treat ValueError as a client-side bad request.
    """
    return _error_response(
        request=request,
        status_code=status.HTTP_400_BAD_REQUEST,
        code="BAD_REQUEST",
        message=str(exc) or "Bad request",
    )


async def not_found_exception_handler(
    request: Request,
    exc: KeyError | FileNotFoundError,
) -> JSONResponse:
    """
    Treat missing keys/files as not-found errors without leaking internal paths.
    """
    return _error_response(
        request=request,
        status_code=status.HTTP_404_NOT_FOUND,
        code="NOT_FOUND",
        message="Requested resource was not found",
    )


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Log unexpected exceptions and return a safe response to the client.
    """
    request_id = _request_id(request)

    error_logger.exception(
        "event=unhandled_exception request_id=%s method=%s path=%s error=%s",
        request_id,
        request.method,
        request.url.path,
        str(exc),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Internal server error",
                "request_id": request_id,
            }
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """
    Register all centralised Food Remedy API exception handlers.
    """
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ValueError, value_error_handler)
    app.add_exception_handler(KeyError, not_found_exception_handler)
    app.add_exception_handler(FileNotFoundError, not_found_exception_handler)
    app.add_exception_handler(Exception, global_exception_handler)
