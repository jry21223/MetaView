from enum import Enum


class PipelineRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class SandboxMode(str, Enum):
    DRY_RUN = "dry_run"
    OFF = "off"


class SandboxStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


class UITheme(str, Enum):
    DARK = "dark"
    LIGHT = "light"


class ValidationSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ValidationStatus(str, Enum):
    VALID = "valid"
    INVALID = "invalid"
