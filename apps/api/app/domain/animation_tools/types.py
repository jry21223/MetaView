"""Type aliases for the Animation Tool Registry."""

from __future__ import annotations

from collections.abc import Callable

from app.domain.models.cir import LayerSpec

# A registered animation tool accepts a free-form ``args`` dict and returns
# zero or more ``LayerSpec`` objects to be prepended to the step's layers.
AnimationTool = Callable[[dict], list[LayerSpec]]
