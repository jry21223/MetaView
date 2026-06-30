from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.domain.models.director import DirectorScript
from app.domain.models.playbook import PlaybookScript
from app.domain.services.director_builder import build_default_director
from app.domain.services.metaview_core import MetaViewCoreService

router = APIRouter(prefix="/mcp", tags=["mcp"])

ASSET_MANIFEST_ROOT = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "web"
    / "public"
    / "assets"
    / "metaview-kits"
)


@lru_cache
def _metaview_core() -> MetaViewCoreService:
    return MetaViewCoreService(
        asset_packs=[
            json.loads(
                (ASSET_MANIFEST_ROOT / "geography-basic" / "manifest.json").read_text(
                    encoding="utf-8",
                ),
            ),
            json.loads(
                (ASSET_MANIFEST_ROOT / "physics-basic" / "manifest.json").read_text(
                    encoding="utf-8",
                ),
            ),
        ],
    )


class BuildDirectorScriptRequest(BaseModel):
    playbook: PlaybookScript
    run_id: str = Field(default="mcp-director-preview", min_length=1)


class BuildDirectorScriptResponse(BaseModel):
    director_script: DirectorScript
    provenance: dict[str, str]


class ResolveAssetsRequest(BaseModel):
    subject: str = Field(min_length=1)
    scene_type: str = Field(alias="sceneType", min_length=1)
    semantic_roles: list[str] = Field(alias="semanticRoles", min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class CompileSceneBlueprintRequest(BaseModel):
    topic: str = Field(min_length=1)
    subject: str | None = None
    audience: str | None = None
    duration_seconds: int | None = Field(default=None, alias="durationSeconds", gt=0)
    style: str | None = None
    language: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class VisualQualityRequest(BaseModel):
    playbook_script: dict[str, Any] = Field(alias="playbookScript")
    director_script: dict[str, Any] | None = Field(default=None, alias="directorScript")

    model_config = ConfigDict(populate_by_name=True)


@router.get("/capabilities")
async def list_capabilities() -> dict[str, Any]:
    return _metaview_core().list_capabilities()


@router.get("/asset-packs")
async def list_asset_packs(subject: str | None = None) -> dict[str, Any]:
    return _metaview_core().list_asset_packs(subject)


@router.post("/resolve-assets")
async def resolve_assets(payload: ResolveAssetsRequest) -> dict[str, Any]:
    return _metaview_core().resolve_assets(
        subject=payload.subject,
        scene_type=payload.scene_type,
        semantic_roles=payload.semantic_roles,
    )


@router.post("/scene-blueprint")
async def compile_scene_blueprint(payload: CompileSceneBlueprintRequest) -> dict[str, Any]:
    return _metaview_core().compile_scene_blueprint(
        topic=payload.topic,
        subject=payload.subject,
        audience=payload.audience,
        duration_seconds=payload.duration_seconds,
        style=payload.style,
        language=payload.language,
    )


@router.post("/visual-quality")
async def validate_visual_quality(payload: VisualQualityRequest) -> dict[str, Any]:
    return _metaview_core().validate_visual_quality(playbook_script=payload.playbook_script)


@router.post("/director-script", response_model=BuildDirectorScriptResponse)
async def build_director_script(payload: BuildDirectorScriptRequest) -> BuildDirectorScriptResponse:
    return BuildDirectorScriptResponse(
        director_script=build_default_director(payload.playbook, payload.run_id),
        provenance={
            "generatedBy": "metaview-core",
            "builder": "build_default_director",
            "renderingContract": "PlaybookScript",
        },
    )
