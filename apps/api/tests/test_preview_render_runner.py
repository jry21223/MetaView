from pathlib import Path

import pytest

from app.services import preview_video_renderer as renderer_module
from app.services.preview_video_renderer import GVisorCommandBuilder, PreviewVideoRenderer


def test_gvisor_command_builder_includes_runsc_and_limits(tmp_path) -> None:
    work_dir = tmp_path / "job"
    work_dir.mkdir()
    script_path = work_dir / "scene.py"
    script_path.write_text("from manim import *", encoding="utf-8")
    output_dir = work_dir / "media"
    output_dir.mkdir()

    command = GVisorCommandBuilder(
        docker_binary="docker",
        runtime="runsc",
        image="metaview-manim:latest",
        network_enabled=False,
        memory_limit_mb=512,
        cpu_limit="1.5",
        pids_limit=64,
    ).build(
        script_path=script_path,
        output_dir=output_dir,
        scene_class_name="Demo",
        cli_module="manim",
        quality="l",
        output_format="mp4",
        disable_caching=True,
    )

    joined = " ".join(command)
    assert command[:4] == ["docker", "run", "--rm", "--runtime=runsc"]
    assert "--network=none" in command
    assert "--read-only" in command
    assert "--memory=512m" in command
    assert "--cpus=1.5" in command
    assert "--pids-limit=64" in command
    assert "--tmpfs" in command
    assert str(script_path) in joined
    assert str(output_dir) in joined
    assert "python" in command
    assert "-m" in command
    assert "manim" in command
    assert "Demo" in command


def test_preview_renderer_uses_local_runner_for_real_render(monkeypatch, tmp_path) -> None:
    calls: list[list[str]] = []
    original_run = renderer_module.subprocess.run

    def fake_run(command, capture_output, text, check, timeout=None):
        if "--media_dir" not in command:
            return original_run(command, capture_output=capture_output, text=text, check=check)
        calls.append(command)
        media_dir = Path(command[command.index("--media_dir") + 1])
        output_file = media_dir / "Demo.mp4"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_bytes(b"fake")
        return type("CompletedProcess", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(renderer_module.subprocess, "run", fake_run)

    renderer = PreviewVideoRenderer(
        output_root=str(tmp_path / "media-root"),
        backend_mode="manim",
        render_runner="local",
        manim_python_path="/usr/local/bin/python",
    )
    monkeypatch.setattr(renderer.manim_backend, "is_available", lambda: True)

    result = renderer.render(
        script="from manim import *\n\nclass Demo(Scene):\n    def construct(self):\n        self.play(Write(Text('ok')))\n        self.wait(0.5)\n",
        request_id="local-demo",
        scene_class_name="Demo",
        require_real=True,
    )

    assert result.backend == "manim-cli"
    assert calls
    assert calls[0][0] == "/usr/local/bin/python"
    assert calls[0][1:3] == ["-m", "manim"]
    assert "docker" not in calls[0]


def test_preview_renderer_uses_gvisor_runner_for_real_render(monkeypatch, tmp_path) -> None:
    calls: list[list[str]] = []
    original_run = renderer_module.subprocess.run

    def fake_run(command, capture_output, text, check, timeout=None):
        if "--media_dir" not in command:
            return original_run(command, capture_output=capture_output, text=text, check=check)
        calls.append(command)
        media_dir = Path(command[command.index("--media_dir") + 1])
        output_file = media_dir / "Demo.mp4"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_bytes(b"fake")
        return type("CompletedProcess", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(renderer_module.subprocess, "run", fake_run)

    renderer = PreviewVideoRenderer(
        output_root=str(tmp_path / "media-root"),
        backend_mode="manim",
        render_runner="gvisor",
        gvisor_image="metaview-manim:test",
    )
    monkeypatch.setattr(renderer.manim_backend, "is_available", lambda: True)

    result = renderer.render(
        script="from manim import *\n\nclass Demo(Scene):\n    def construct(self):\n        self.play(Write(Text('ok')))\n        self.wait(0.5)\n",
        request_id="gvisor-demo",
        scene_class_name="Demo",
        require_real=True,
    )

    assert result.backend == "manim-cli"
    assert calls
    assert calls[0][:4] == ["docker", "run", "--rm", "--runtime=runsc"]
    assert "--network=none" in calls[0]
    assert "metaview-manim:test" in calls[0]
    assert "python" in calls[0]
    assert "manim" in calls[0]


def test_preview_renderer_gvisor_availability_depends_on_docker(monkeypatch, tmp_path) -> None:
    renderer = PreviewVideoRenderer(
        output_root=str(tmp_path / "media-root"),
        backend_mode="manim",
        render_runner="gvisor",
    )

    monkeypatch.setattr(renderer_module.shutil, "which", lambda name: None)

    assert renderer.manim_backend.is_available() is False


