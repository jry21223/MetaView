from __future__ import annotations

from typing import Any

from app.domain.models.playbook import (
    BioCellCallout,
    BioCellSceneSnapshot,
    BioCellStructure,
    BioProcessConnection,
    BioProcessSceneSnapshot,
    BioProcessStep,
)
from app.domain.services.asset_manifest_resolver import (
    resolve_asset_by_role,
    resolve_asset_for_renderer,
)

DEFAULT_BIOLOGY_PACK_ID = "biology-basic"
DEFAULT_CORE_PACK_ID = "core-visual-basic"


def _asset_id_for_role(
    renderer_kind: str,
    subject: str,
    pack_id: str,
    semantic_role: str,
    *,
    fallbacks: tuple[str, ...] = (),
) -> str | None:
    for role in (semantic_role, *fallbacks):
        asset = (
            resolve_asset_for_renderer(renderer_kind, role, pack_id=pack_id)
            or resolve_asset_by_role(subject, role, pack_id=pack_id)
            or resolve_asset_for_renderer(renderer_kind, role)
            or resolve_asset_by_role(subject, role)
        )
        if asset:
            return str(asset["id"])
    return None


def _number(value: Any, fallback: float) -> float:
    return float(value) if isinstance(value, int | float) else fallback


def _callout(raw: dict[str, Any], index: int) -> BioCellCallout:
    target_id = str(raw.get("targetId") or raw.get("target_id") or "cell")
    return BioCellCallout(
        id=str(raw.get("id") or f"{target_id}-callout-{index + 1}"),
        target_id=target_id,
        label=str(raw.get("label") or target_id),
        side=raw.get("side"),
    )


def _structure(raw: dict[str, Any], pack_id: str, index: int) -> BioCellStructure:
    semantic_role = str(raw.get("semanticRole") or raw.get("semantic_role") or "cell")
    return BioCellStructure(
        id=str(raw.get("id") or f"{semantic_role}-{index + 1}"),
        semantic_role=semantic_role,
        label=raw.get("label") or semantic_role,
        x=_number(raw.get("x"), 50),
        y=_number(raw.get("y"), 50),
        width=_number(raw.get("width"), 16),
        height=_number(raw.get("height"), 12),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role("bio_cell_scene", "biology", pack_id, semantic_role),
    )


def compile_bio_cell_snapshot(blueprint: dict[str, Any]) -> BioCellSceneSnapshot:
    pack_id = str(blueprint.get("packId") or DEFAULT_BIOLOGY_PACK_ID)
    raw_structures = blueprint.get("structures") or []
    raw_callouts = blueprint.get("callouts") or []
    return BioCellSceneSnapshot(
        pack_id=pack_id,
        cell_type=str(blueprint.get("cellType") or "animal"),
        structures=[
            _structure(structure, pack_id, index)
            for index, structure in enumerate(raw_structures)
        ]
        if raw_structures
        else [
            BioCellStructure(
                id="cell",
                semantic_role="cell",
                label="cell membrane",
                x=50,
                y=52,
                width=66,
                height=50,
                asset_id=_asset_id_for_role("bio_cell_scene", "biology", pack_id, "cell"),
            ),
            BioCellStructure(
                id="nucleus",
                semantic_role="nucleus",
                label="nucleus",
                x=47,
                y=48,
                width=20,
                height=18,
                asset_id=_asset_id_for_role("bio_cell_scene", "biology", pack_id, "nucleus"),
            ),
            BioCellStructure(
                id="mitochondrion",
                semantic_role="mitochondrion",
                label="mitochondrion",
                x=67,
                y=59,
                width=16,
                height=10,
                asset_id=_asset_id_for_role(
                    "bio_cell_scene", "biology", pack_id, "mitochondrion"
                ),
            ),
            BioCellStructure(
                id="ribosome",
                semantic_role="ribosome",
                label="ribosome",
                x=36,
                y=61,
                width=8,
                height=7,
                asset_id=_asset_id_for_role("bio_cell_scene", "biology", pack_id, "ribosome"),
            ),
            BioCellStructure(
                id="dna",
                semantic_role="dna",
                label="DNA",
                x=47,
                y=48,
                width=8,
                height=12,
                asset_id=_asset_id_for_role("bio_cell_scene", "biology", pack_id, "dna"),
            ),
        ],
        callouts=[_callout(callout, index) for index, callout in enumerate(raw_callouts)]
        if raw_callouts
        else [
            BioCellCallout(
                id="nucleus-callout", target_id="nucleus", label="stores DNA", side="left"
            ),
            BioCellCallout(
                id="mitochondrion-callout",
                target_id="mitochondrion",
                label="releases energy",
                side="right",
            ),
        ],
        caption=str(
            blueprint.get("caption")
            or "Animal cells contain specialized organelles with distinct functions."
        ),
    )


def _process_step(raw: dict[str, Any], pack_id: str, index: int) -> BioProcessStep:
    semantic_role = str(raw.get("semanticRole") or raw.get("semantic_role") or "process_step")
    return BioProcessStep(
        id=str(raw.get("id") or f"{semantic_role}-{index + 1}"),
        semantic_role=semantic_role,
        label=raw.get("label") or semantic_role,
        x=_number(raw.get("x"), 50),
        y=_number(raw.get("y"), 50),
        width=_number(raw.get("width"), 18),
        height=_number(raw.get("height"), 18),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role(
            "bio_process_scene",
            "biology",
            pack_id,
            semantic_role,
            fallbacks=("process_step",),
        ),
        description=raw.get("description"),
    )


def _process_connection(raw: dict[str, Any], index: int) -> BioProcessConnection:
    semantic_role = str(raw.get("semanticRole") or raw.get("semantic_role") or "flow_arrow")
    from_id = str(raw.get("from") or "step-1")
    to_id = str(raw.get("to") or "step-2")
    return BioProcessConnection(
        id=str(raw.get("id") or f"{from_id}-to-{to_id}-{index + 1}"),
        **{"from": from_id},
        to=to_id,
        semantic_role=semantic_role,
        label=raw.get("label"),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role(
            "bio_process_scene",
            "core",
            DEFAULT_CORE_PACK_ID,
            semantic_role,
            fallbacks=("flow_arrow", "causal_arrow"),
        ),
    )


def compile_bio_process_snapshot(blueprint: dict[str, Any]) -> BioProcessSceneSnapshot:
    pack_id = str(blueprint.get("packId") or DEFAULT_BIOLOGY_PACK_ID)
    raw_steps = blueprint.get("steps") or blueprint.get("processSteps") or []
    raw_connections = blueprint.get("connections") or []
    raw_callouts = blueprint.get("callouts") or []
    dna_asset_id = _asset_id_for_role("bio_process_scene", "biology", pack_id, "dna")
    fork_asset_id = _asset_id_for_role(
        "bio_process_scene", "biology", pack_id, "process_step"
    )
    flow_arrow_asset_id = _asset_id_for_role(
        "bio_process_scene",
        "core",
        DEFAULT_CORE_PACK_ID,
        "flow_arrow",
        fallbacks=("causal_arrow",),
    )
    return BioProcessSceneSnapshot(
        pack_id=pack_id,
        process_id=str(blueprint.get("processId") or "dna_replication"),
        steps=[_process_step(step, pack_id, index) for index, step in enumerate(raw_steps)]
        if raw_steps
        else [
            BioProcessStep(
                id="template",
                semantic_role="dna",
                label="template DNA",
                x=22,
                y=48,
                width=18,
                height=38,
                asset_id=dna_asset_id,
            ),
            BioProcessStep(
                id="fork",
                semantic_role="process_step",
                label="replication fork",
                x=50,
                y=48,
                width=24,
                height=24,
                asset_id=fork_asset_id,
                description="strand separation and base pairing",
            ),
            BioProcessStep(
                id="copy",
                semantic_role="dna",
                label="new strands",
                x=78,
                y=48,
                width=18,
                height=38,
                asset_id=dna_asset_id,
            ),
        ],
        connections=[
            _process_connection(connection, index)
            for index, connection in enumerate(raw_connections)
        ]
        if raw_connections
        else [
            BioProcessConnection(
                id="template-to-fork",
                **{"from": "template"},
                to="fork",
                semantic_role="flow_arrow",
                label="unzip",
                asset_id=flow_arrow_asset_id,
            ),
            BioProcessConnection(
                id="fork-to-copy",
                **{"from": "fork"},
                to="copy",
                semantic_role="flow_arrow",
                label="copy",
                asset_id=flow_arrow_asset_id,
            ),
        ],
        callouts=[_callout(callout, index) for index, callout in enumerate(raw_callouts)]
        if raw_callouts
        else [
            BioCellCallout(id="base-pairing", target_id="fork", label="base pairing", side="top"),
        ],
        caption=str(
            blueprint.get("caption")
            or "DNA replication copies each strand by complementary base pairing."
        ),
    )
