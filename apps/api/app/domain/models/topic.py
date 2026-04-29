from enum import Enum


class TopicDomain(str, Enum):
    ALGORITHM = "algorithm"
    MATH = "math"
    CODE = "code"
    PHYSICS = "physics"
    CHEMISTRY = "chemistry"
    BIOLOGY = "biology"
    GEOGRAPHY = "geography"


class VisualKind(str, Enum):
    ARRAY = "array"
    FLOW = "flow"
    FORMULA = "formula"
    GRAPH = "graph"
    TEXT = "text"
    MOTION = "motion"
    CIRCUIT = "circuit"
    MOLECULE = "molecule"
    MAP = "map"
    CELL = "cell"
