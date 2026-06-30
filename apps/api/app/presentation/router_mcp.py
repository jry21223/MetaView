from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.domain.models.director import DirectorScript
from app.domain.models.playbook import PlaybookScript
from app.domain.services.director_builder import build_default_director

router = APIRouter(prefix="/mcp", tags=["mcp"])


class BuildDirectorScriptRequest(BaseModel):
    playbook: PlaybookScript
    run_id: str = Field(default="mcp-director-preview", min_length=1)


class BuildDirectorScriptResponse(BaseModel):
    director_script: DirectorScript
    provenance: dict[str, str]


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
