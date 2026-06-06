from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.domain.skills.quadratic_transform.problem_spec import (
    QuadraticTransformProblemSpec,
    format_number,
)

TransformKind = Literal["horizontal_shift", "vertical_scale", "vertical_shift"]


@dataclass(frozen=True)
class QuadraticTransform:
    kind: TransformKind
    explanation: str


def derive_transforms(spec: QuadraticTransformProblemSpec) -> list[QuadraticTransform]:
    return [
        QuadraticTransform(
            kind="horizontal_shift",
            explanation=_horizontal_explanation(spec),
        ),
        QuadraticTransform(
            kind="vertical_scale",
            explanation=_scale_explanation(spec),
        ),
        QuadraticTransform(
            kind="vertical_shift",
            explanation=_vertical_explanation(spec),
        ),
    ]


def _horizontal_explanation(spec: QuadraticTransformProblemSpec) -> str:
    if spec.h == 0:
        return "括号里没有水平平移量，所以图像在水平方向保持不变。"
    direction = "右" if spec.h > 0 else "左"
    return f"图像整体向{direction}平移 {format_number(abs(spec.h))} 个单位。"


def _scale_explanation(spec: QuadraticTransformProblemSpec) -> str:
    if spec.a == 1:
        return "a 等于 1，开口方向和宽窄与母函数 y=x^2 一致。"
    if spec.a == -1:
        return "a 等于 -1，图像关于 x 轴翻折，开口向下，宽窄不变。"
    if spec.a < 0:
        return (
            f"a 等于 {format_number(spec.a)}，图像关于 x 轴翻折，"
            "并按 |a| 做纵向伸缩。"
        )
    return f"a 等于 {format_number(spec.a)}，图像按这个系数做纵向伸缩。"


def _vertical_explanation(spec: QuadraticTransformProblemSpec) -> str:
    if spec.k == 0:
        return "末尾没有常数 k，所以图像在竖直方向保持不变。"
    direction = "上" if spec.k > 0 else "下"
    return f"图像整体向{direction}平移 {format_number(abs(spec.k))} 个单位。"
