from __future__ import annotations

from app.domain.skills.base import SkillCapability, SkillManifest

BINARY_SEARCH_CORE_MANIFEST = SkillManifest(
    skill_id="binary_search_core",
    domain="algorithm",
    name="Binary Search Core",
    description="Deterministic binary-search traces for small sorted numeric arrays.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="binary_search_core.trace",
            description="Trace low, mid, and high while searching a sorted numeric array.",
            examples=["演示在有序数组 [1,3,5,7,9,11] 里二分查找 7"],
            output_schema="BinarySearchProblemSpec",
        )
    ],
    unsupported_notes=[
        "The input array must contain at most 64 finite numbers in ascending order.",
        "V1 requires the target to appear in the array so the trace ends with a verified hit.",
        "Custom comparison functions and non-numeric arrays are not supported.",
    ],
)
