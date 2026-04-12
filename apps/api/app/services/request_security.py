from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class SafetyVerdict(str, Enum):
    ALLOW = "allow"
    REVIEW = "review"
    BLOCK = "block"


@dataclass(frozen=True)
class SafetyInspection:
    decision: SafetyVerdict
    reasons: list[str]


_PROMPT_INJECTION_PATTERNS: tuple[tuple[str, str], ...] = (
    ("ignore previous instructions", "命中提示词注入特征：ignore previous instructions"),
    ("ignore all previous instructions", "命中提示词注入特征：ignore all previous instructions"),
    ("system prompt", "命中提示词注入特征：system prompt"),
    ("developer message", "命中提示词注入特征：developer message"),
    ("reveal the hidden prompt", "命中提示词注入特征：reveal the hidden prompt"),
    ("reveal hidden prompt", "命中提示词注入特征：reveal hidden prompt"),
    ("忽略以上规则", "命中提示词注入特征：忽略以上规则"),
    ("忽略之前的指令", "命中提示词注入特征：忽略之前的指令"),
    ("显示系统提示词", "命中提示词注入特征：显示系统提示词"),
)
_SOURCE_CODE_INJECTION_PATTERNS: tuple[tuple[str, str], ...] = (
    (
        "ignore previous instructions",
        "源码中命中提示词注入特征：ignore previous instructions",
    ),
    (
        "ignore all previous instructions",
        "源码中命中提示词注入特征：ignore all previous instructions",
    ),
    ("system prompt", "源码中命中提示词注入特征：system prompt"),
    (
        "developer message",
        "源码中命中提示词注入特征：developer message",
    ),
    (
        "reveal hidden prompt",
        "源码中命中提示词注入特征：reveal hidden prompt",
    ),
    ("忽略以上规则", "源码中命中提示词注入特征：忽略以上规则"),
)

_DANGEROUS_SOURCE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("import subprocess", "检测到危险源码模式：import subprocess"),
    ("subprocess.", "检测到危险源码模式：subprocess"),
    ("socket.", "检测到危险源码模式：socket"),
    ("import socket", "检测到危险源码模式：import socket"),
    ("requests.", "检测到危险源码模式：requests"),
    ("import requests", "检测到危险源码模式：import requests"),
    ("httpx.", "检测到危险源码模式：httpx"),
    ("import httpx", "检测到危险源码模式：import httpx"),
    ("urllib.", "检测到危险源码模式：urllib"),
    ("import urllib", "检测到危险源码模式：import urllib"),
    ("os.system", "检测到危险源码模式：os.system"),
    ("os.popen", "检测到危险源码模式：os.popen"),
    ("eval(", "检测到危险源码模式：eval"),
    ("exec(", "检测到危险源码模式：exec"),
    ("compile(", "检测到危险源码模式：compile"),
    ("open(", "检测到危险源码模式：open"),
    ("__import__(", "检测到危险源码模式：__import__"),
)


def inspect_pipeline_request(
    *,
    prompt: str,
    source_code: str | None,
    source_image_name: str | None,
) -> SafetyInspection:
    reasons = [
        *_match_patterns(prompt, _PROMPT_INJECTION_PATTERNS),
        *_match_patterns(source_code or "", _SOURCE_CODE_INJECTION_PATTERNS),
        *_inspect_source_image_name(source_image_name),
    ]
    return _build_inspection(reasons)


def inspect_manim_source(source: str) -> SafetyInspection:
    reasons = _match_patterns(source, _DANGEROUS_SOURCE_PATTERNS)
    return _build_inspection(reasons)


def _build_inspection(reasons: list[str]) -> SafetyInspection:
    if reasons:
        return SafetyInspection(decision=SafetyVerdict.BLOCK, reasons=reasons)
    return SafetyInspection(decision=SafetyVerdict.ALLOW, reasons=[])


def _match_patterns(text: str, patterns: tuple[tuple[str, str], ...]) -> list[str]:
    lowered = text.lower()
    return [reason for needle, reason in patterns if needle in lowered]


def _inspect_source_image_name(source_image_name: str | None) -> list[str]:
    if source_image_name is None:
        return []
    normalized = source_image_name.strip()
    if not normalized:
        return []
    lowered = normalized.lower()
    if ".." in normalized or lowered.startswith(("file://", "/etc/", "/proc/", "/sys/")):
        return ["检测到可疑图片文件名路径。"]
    return []
