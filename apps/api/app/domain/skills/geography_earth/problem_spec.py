from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

GeographyEarthKind = Literal["east_asia_monsoon"]


class GeographyEarthProblemSpec(BaseModel):
    language: str = "zh-CN"
    kind: GeographyEarthKind
    scene_type: GeographyEarthKind = "east_asia_monsoon"
    pack_id: str = "geography-earth-basic"
    visual_intent: list[str] = Field(
        default_factory=lambda: ["land_ocean_contrast", "monsoon_flow", "pressure_system"]
    )
    emphasis_points: list[str] = Field(
        default_factory=lambda: ["map_layer", "wind", "pressure", "moisture_particles"]
    )
