import pytest

from app.services.providers.openai import ProviderInvocationError, _extract_json_object


def test_extract_json_object_parses_response() -> None:
    payload = _extract_json_object('prefix {"focus":"test","concepts":["a"],"warnings":[]} suffix')
    assert payload["focus"] == "test"


def test_extract_json_object_rejects_invalid_payload() -> None:
    with pytest.raises(ProviderInvocationError):
        _extract_json_object("not-json")
