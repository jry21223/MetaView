"""Tests for issue #51 — granular HTTP mapping in error handlers."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.presentation.error_handlers import register_error_handlers


class _Payload(BaseModel):
    n: int


@pytest.fixture
def client():
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/raise-value")
    def raise_value() -> None:
        raise ValueError("bad business rule")

    @app.get("/raise-key")
    def raise_key() -> None:
        raise KeyError("missing_field")

    @app.get("/raise-lookup")
    def raise_lookup() -> None:
        raise IndexError("list index out of range")

    @app.get("/raise-type")
    def raise_type() -> None:
        raise TypeError("expected str, got int")

    @app.get("/raise-pydantic")
    def raise_pydantic() -> None:
        _Payload.model_validate({"n": "not-an-int"})  # raises ValidationError

    @app.get("/raise-other")
    def raise_other() -> None:
        raise RuntimeError("oh no")

    return TestClient(app, raise_server_exceptions=False)


def test_value_error_maps_to_422(client) -> None:
    r = client.get("/raise-value")
    assert r.status_code == 422
    assert r.json()["detail"] == "bad business rule"


def test_key_error_maps_to_400_with_offending_key(client) -> None:
    r = client.get("/raise-key")
    assert r.status_code == 400
    assert "missing_field" in r.json()["detail"]


def test_lookup_error_maps_to_400(client) -> None:
    r = client.get("/raise-lookup")
    assert r.status_code == 400


def test_type_error_maps_to_400(client) -> None:
    r = client.get("/raise-type")
    assert r.status_code == 400


def test_pydantic_validation_error_maps_to_422_with_errors_list(client) -> None:
    r = client.get("/raise-pydantic")
    assert r.status_code == 422
    body = r.json()
    assert body["detail"] == "validation error"
    assert isinstance(body["errors"], list) and len(body["errors"]) >= 1
    assert body["errors"][0]["loc"][0] == "n"


def test_unhandled_exception_maps_to_500_without_leaking_message(client) -> None:
    r = client.get("/raise-other")
    assert r.status_code == 500
    assert r.json()["detail"] == "Internal server error"
    assert "oh no" not in r.text  # don't leak internal detail
