from __future__ import annotations

from app.domain.models.playbook import SnapshotKind

# Canonical API-side snapshot kind contract. TypeScript/Web contract tests compare
# their renderer/self-check support against this enum rather than maintaining an
# untested parallel allow-list.
SUPPORTED_SNAPSHOT_KINDS: tuple[str, ...] = tuple(kind.value for kind in SnapshotKind)
SUPPORTED_SNAPSHOT_KIND_SET: frozenset[str] = frozenset(SUPPORTED_SNAPSHOT_KINDS)
