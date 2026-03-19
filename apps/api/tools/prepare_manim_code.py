#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "apps" / "api"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from app.services.manim_script import ManimScriptError, prepare_manim_script  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize raw text into runnable Python Manim code.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Path to the source text or code file. Defaults to stdin.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output file path. Defaults to stdout.",
    )
    parser.add_argument(
        "--scene-class-name",
        default="GeneratedScene",
        help="Scene class name to use when the input lacks one.",
    )
    return parser.parse_args()


def read_source(path: Path | None) -> str:
    if path is None:
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def write_output(path: Path | None, content: str) -> None:
    if path is None:
        sys.stdout.write(content)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    source = read_source(args.input)
    try:
        prepared = prepare_manim_script(
            source,
            scene_class_name=args.scene_class_name,
        )
    except ManimScriptError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    for diagnostic in prepared.diagnostics:
        print(f"- {diagnostic}", file=sys.stderr)
    write_output(args.output, prepared.code)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
