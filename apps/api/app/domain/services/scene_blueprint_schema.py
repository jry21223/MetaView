from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

SCENE_BLUEPRINT_SCHEMA_ROOT = (
    Path(__file__).resolve().parents[5]
    / "apps"
    / "web"
    / "public"
    / "schemas"
)
SCENE_BLUEPRINT_SCHEMA_RESOURCE_URI = "metaview://schemas/scene-blueprint"


@lru_cache
def scene_blueprint_schema() -> dict[str, Any]:
    schema_path = SCENE_BLUEPRINT_SCHEMA_ROOT / "scene-blueprint.schema.json"
    return json.loads(schema_path.read_text(encoding="utf-8"))


def scene_blueprint_schema_metadata(
    valid: bool,
    errors: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "id": scene_blueprint_schema().get("$id"),
        "valid": valid,
        "resourceUri": SCENE_BLUEPRINT_SCHEMA_RESOURCE_URI,
    }
    if errors:
        metadata["errors"] = errors
    return metadata


def scene_blueprint_tool_schema() -> dict[str, Any]:
    return copy.deepcopy(scene_blueprint_schema())


def validate_scene_blueprint(blueprint: dict[str, Any]) -> list[dict[str, Any]]:
    return _validate_schema(scene_blueprint_schema(), blueprint, path="")


def _validate_schema(schema: dict[str, Any], value: Any, path: str) -> list[dict[str, Any]]:
    if "$ref" in schema:
        return _validate_schema(_resolve_ref(str(schema["$ref"])), value, path)

    errors: list[dict[str, Any]] = []
    expected_type = schema.get("type")
    if expected_type is not None and not _matches_type(value, expected_type):
        return [_error(path, f"Expected {expected_type}.")]

    if "enum" in schema and value not in schema["enum"]:
        errors.append(_error(path, f"Expected one of {schema['enum']}."))

    if isinstance(value, str):
        min_length = schema.get("minLength")
        if isinstance(min_length, int) and len(value) < min_length:
            errors.append(_error(path, f"Expected at least {min_length} characters."))

    if isinstance(value, int | float) and not isinstance(value, bool):
        exclusive_minimum = schema.get("exclusiveMinimum")
        if isinstance(exclusive_minimum, int | float) and value <= exclusive_minimum:
            errors.append(_error(path, f"Expected greater than {exclusive_minimum}."))
        minimum = schema.get("minimum")
        if isinstance(minimum, int | float) and value < minimum:
            errors.append(_error(path, f"Expected at least {minimum}."))

    if isinstance(value, dict):
        errors.extend(_validate_object(schema, value, path))

    if isinstance(value, list):
        errors.extend(_validate_array(schema, value, path))

    return errors


def _validate_object(
    schema: dict[str, Any],
    value: dict[str, Any],
    path: str,
) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    properties = schema.get("properties") or {}

    for required_key in schema.get("required", []):
        if required_key not in value:
            errors.append(_error(_join_path(path, required_key), "Missing required field."))

    additional = schema.get("additionalProperties", True)
    if additional is False:
        for key in value:
            if key not in properties:
                errors.append(_error(_join_path(path, key), "Unexpected field."))
    elif isinstance(additional, dict):
        for key in value:
            if key not in properties:
                errors.extend(_validate_schema(additional, value[key], _join_path(path, key)))

    for key, property_schema in properties.items():
        if key in value:
            errors.extend(_validate_schema(property_schema, value[key], _join_path(path, key)))

    return errors


def _validate_array(schema: dict[str, Any], value: list[Any], path: str) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    min_items = schema.get("minItems")
    if isinstance(min_items, int) and len(value) < min_items:
        errors.append(_error(path, f"Expected at least {min_items} items."))
    max_items = schema.get("maxItems")
    if isinstance(max_items, int) and len(value) > max_items:
        errors.append(_error(path, f"Expected at most {max_items} items."))

    prefix_items = schema.get("prefixItems")
    if isinstance(prefix_items, list):
        for index, item_schema in enumerate(prefix_items):
            if index < len(value):
                errors.extend(
                    _validate_schema(item_schema, value[index], _join_path(path, str(index))),
                )
        if schema.get("items") is False and len(value) > len(prefix_items):
            for index in range(len(prefix_items), len(value)):
                errors.append(_error(_join_path(path, str(index)), "Unexpected item."))
        return errors

    items = schema.get("items")
    if isinstance(items, dict):
        for index, item in enumerate(value):
            errors.extend(_validate_schema(items, item, _join_path(path, str(index))))

    return errors


def _resolve_ref(ref: str) -> dict[str, Any]:
    prefix = "#/$defs/"
    if not ref.startswith(prefix):
        raise ValueError(f"Unsupported SceneBlueprint schema ref: {ref}")
    definition = scene_blueprint_schema().get("$defs", {}).get(ref.removeprefix(prefix))
    if not isinstance(definition, dict):
        raise ValueError(f"Unknown SceneBlueprint schema ref: {ref}")
    return definition


def _matches_type(value: Any, expected_type: Any) -> bool:
    if isinstance(expected_type, list):
        return any(_matches_type(value, item) for item in expected_type)
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "number":
        return isinstance(value, int | float) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "null":
        return value is None
    return True


def _join_path(base: str, key: str) -> str:
    return f"{base}.{key}" if base else key


def _error(path: str, message: str) -> dict[str, str]:
    return {
        "path": path or "$",
        "message": message,
    }
