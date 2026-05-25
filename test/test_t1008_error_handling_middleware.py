import pytest

fastapi = pytest.importorskip("fastapi")
pytest.importorskip("starlette")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from database.logging_system.exception_handler import global_exception_handler
from database.logging_system.request_middleware import RequestLoggingMiddleware


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)
    app.add_exception_handler(Exception, global_exception_handler)

    @app.get("/ok")
    async def ok_route():
        return {"ok": True}

    @app.get("/explode")
    async def explode_route():
        raise RuntimeError("TEST008 forced failure")

    return app


def test_t1008_success_request_has_request_id_header():
    client = TestClient(_build_test_app())

    response = client.get("/ok")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"]


def test_t1008_error_response_has_consistent_shape_and_status_code():
    client = TestClient(_build_test_app(), raise_server_exceptions=False)

    response = client.get("/explode")

    assert response.status_code == 500
    payload = response.json()
    assert payload["message"] == "Internal server error"
    assert "request_id" in payload
    assert payload["request_id"]
    assert response.headers["X-Request-ID"] == payload["request_id"]
