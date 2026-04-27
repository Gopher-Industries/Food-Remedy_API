from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from database.logging_system.exception_handler import register_exception_handlers


class ProductPayload(BaseModel):
    barcode: str


def create_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/missing-http")
    async def missing_http():
        raise HTTPException(status_code=404, detail="Product not found")

    @app.get("/bad-value")
    async def bad_value():
        raise ValueError("Barcode is required")

    @app.get("/missing-key")
    async def missing_key():
        raise KeyError("barcode")

    @app.get("/unexpected")
    async def unexpected():
        raise RuntimeError("database connection failed")

    @app.post("/products")
    async def create_product(payload: ProductPayload):
        return payload

    return app


def test_http_exception_uses_consistent_error_shape():
    client = TestClient(create_app())

    response = client.get("/missing-http")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "HTTP_404",
            "message": "Product not found",
            "request_id": "unknown",
        }
    }


def test_validation_error_returns_422_with_details():
    client = TestClient(create_app())

    response = client.post("/products", json={})
    body = response.json()

    assert response.status_code == 422
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Invalid request data"
    assert body["error"]["request_id"] == "unknown"
    assert body["error"]["details"]["errors"][0]["loc"] == ["body", "barcode"]


def test_value_error_returns_bad_request():
    client = TestClient(create_app())

    response = client.get("/bad-value")

    assert response.status_code == 400
    assert response.json()["error"] == {
        "code": "BAD_REQUEST",
        "message": "Barcode is required",
        "request_id": "unknown",
    }


def test_missing_resource_errors_return_not_found_without_internal_details():
    client = TestClient(create_app())

    response = client.get("/missing-key")

    assert response.status_code == 404
    assert response.json()["error"] == {
        "code": "NOT_FOUND",
        "message": "Requested resource was not found",
        "request_id": "unknown",
    }


def test_unexpected_exception_returns_safe_internal_error():
    client = TestClient(create_app(), raise_server_exceptions=False)

    response = client.get("/unexpected")

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "Internal server error",
        "request_id": "unknown",
    }
    assert "database connection failed" not in response.text
