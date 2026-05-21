from __future__ import annotations

from pydantic import BaseModel


class ExecutionParameterControl(BaseModel):
    """User-adjustable runtime parameter surfaced in the playbook (e.g. array
    length). Part of the PlaybookScript output contract, not a CIR internal —
    lives in its own module so the contract no longer depends on cir.py.
    """

    id: str
    label: str
    value: str
    description: str | None = None
    placeholder: str | None = None
