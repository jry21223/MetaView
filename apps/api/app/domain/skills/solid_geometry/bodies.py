from __future__ import annotations

from dataclasses import dataclass

import sympy as sp


@dataclass(frozen=True)
class BodyGeometry:
    points: dict[str, tuple[sp.Expr, sp.Expr, sp.Expr]]
    edges: list[tuple[str, str]]
    faces: dict[str, tuple[str, ...]]


def build_cube(side: sp.Expr) -> BodyGeometry:
    return build_cuboid(side, side, side)


def build_cuboid(length: sp.Expr, width: sp.Expr, height: sp.Expr) -> BodyGeometry:
    points = {
        "A": (sp.Integer(0), sp.Integer(0), sp.Integer(0)),
        "B": (length, sp.Integer(0), sp.Integer(0)),
        "C": (length, width, sp.Integer(0)),
        "D": (sp.Integer(0), width, sp.Integer(0)),
        "A1": (sp.Integer(0), sp.Integer(0), height),
        "B1": (length, sp.Integer(0), height),
        "C1": (length, width, height),
        "D1": (sp.Integer(0), width, height),
    }
    edges = [
        ("A", "B"),
        ("B", "C"),
        ("C", "D"),
        ("D", "A"),
        ("A1", "B1"),
        ("B1", "C1"),
        ("C1", "D1"),
        ("D1", "A1"),
        ("A", "A1"),
        ("B", "B1"),
        ("C", "C1"),
        ("D", "D1"),
    ]
    faces = {
        "ABCD": ("A", "B", "C", "D"),
        "A1B1C1D1": ("A1", "B1", "C1", "D1"),
        "ABB1A1": ("A", "B", "B1", "A1"),
        "BCC1B1": ("B", "C", "C1", "B1"),
        "CDD1C1": ("C", "D", "D1", "C1"),
        "DAA1D1": ("D", "A", "A1", "D1"),
    }
    return BodyGeometry(points=points, edges=edges, faces=faces)


def build_regular_quad_pyramid(base: sp.Expr, height: sp.Expr) -> BodyGeometry:
    half = base / 2
    points = {
        "A": (-half, -half, sp.Integer(0)),
        "B": (half, -half, sp.Integer(0)),
        "C": (half, half, sp.Integer(0)),
        "D": (-half, half, sp.Integer(0)),
        "S": (sp.Integer(0), sp.Integer(0), height),
    }
    edges = [
        ("A", "B"),
        ("B", "C"),
        ("C", "D"),
        ("D", "A"),
        ("S", "A"),
        ("S", "B"),
        ("S", "C"),
        ("S", "D"),
    ]
    faces = {
        "ABCD": ("A", "B", "C", "D"),
        "SAB": ("S", "A", "B"),
        "SBC": ("S", "B", "C"),
        "SCD": ("S", "C", "D"),
        "SDA": ("S", "D", "A"),
    }
    return BodyGeometry(points=points, edges=edges, faces=faces)
