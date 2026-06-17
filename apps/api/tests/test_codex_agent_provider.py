from __future__ import annotations

import sys
import types
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.application.ports.agent_provider import AgentProviderError
from app.infrastructure.agent.codex_agent_provider import CodexAgentProvider

_PLAYBOOK_JSON = """{
  "schema_version": "1.0.0",
  "fps": 30,
  "total_frames": 60,
  "domain": "math",
  "title": "Line",
  "summary": "Show a line.",
  "steps": [
    {
      "step_id": "step_01",
      "end_frame": 60,
      "title": "Plot",
      "voiceover_text": "Draw y=x.",
      "snapshot": {
        "kind": "math_plot",
        "curves": [{"expression": "x", "label": "y=x", "emphasis": "primary"}],
        "x_min": -5,
        "x_max": 5
      },
      "layers": [
        {
          "body": {
            "kind": "math_plot",
            "curves": [{"expression": "x", "label": "y=x", "emphasis": "primary"}],
            "x_min": -5,
            "x_max": 5
          }
        }
      ]
    }
  ],
  "parameter_controls": []
}"""


class _FakeThread:
    def __init__(self, response: str) -> None:
        self.response = response
        self.run_calls: list[dict[str, Any]] = []

    async def run(self, input_text: str, **kwargs: Any) -> Any:
        self.run_calls.append({"input": input_text, **kwargs})
        return SimpleNamespace(error=None, final_response=self.response)


class _FakeCodex:
    instances: list["_FakeCodex"] = []
    response = _PLAYBOOK_JSON

    def __init__(self) -> None:
        self.login_keys: list[str] = []
        self.thread_start_calls: list[dict[str, Any]] = []
        self.thread = _FakeThread(self.response)
        self.instances.append(self)

    async def __aenter__(self) -> "_FakeCodex":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def login_api_key(self, api_key: str) -> None:
        self.login_keys.append(api_key)

    async def thread_start(self, **kwargs: Any) -> _FakeThread:
        self.thread_start_calls.append(kwargs)
        return self.thread


@pytest.fixture(autouse=True)
def _fake_openai_codex(monkeypatch: pytest.MonkeyPatch):
    _FakeCodex.instances = []
    _FakeCodex.response = _PLAYBOOK_JSON
    fake_module = types.SimpleNamespace(
        AsyncCodex=_FakeCodex,
        Sandbox=types.SimpleNamespace(read_only="read_only"),
    )
    monkeypatch.setitem(sys.modules, "openai_codex", fake_module)
    yield


@pytest.mark.asyncio
async def test_codex_provider_returns_validated_playbook_dict() -> None:
    provider = CodexAgentProvider(cwd=".", model="gpt-5.5", effort="high")

    out = await provider.generate("explain y=x")

    assert out["title"] == "Line"
    assert out["steps"][0]["snapshot"]["kind"] == "math_plot"
    fake = _FakeCodex.instances[0]
    assert fake.thread_start_calls[0]["model"] == "gpt-5.5"
    assert fake.thread.run_calls[0]["effort"] == "high"
    assert "JSON Schema" in fake.thread.run_calls[0]["input"]
    assert "output_schema" not in fake.thread.run_calls[0]


@pytest.mark.asyncio
async def test_codex_provider_defaults_to_gpt_55() -> None:
    provider = CodexAgentProvider(cwd=".")

    await provider.generate("explain y=x")

    fake = _FakeCodex.instances[0]
    assert fake.thread_start_calls[0]["model"] == "gpt-5.5"
    assert fake.thread.run_calls[0]["model"] == "gpt-5.5"


@pytest.mark.asyncio
async def test_codex_provider_loads_domain_skill_into_developer_instructions(
    tmp_path: Path,
) -> None:
    skills_dir = tmp_path / "skills"
    (skills_dir / "generic").mkdir(parents=True)
    (skills_dir / "chemistry").mkdir(parents=True)
    (skills_dir / "generic" / "SKILL.md").write_text(
        "# Generic MetaView Teacher\nUse guided questions.",
        encoding="utf-8",
    )
    (skills_dir / "chemistry" / "SKILL.md").write_text(
        "# Chemistry Runtime Skill\nUse stoichiometry tools instead of mental math.",
        encoding="utf-8",
    )
    provider = CodexAgentProvider(cwd=".", skills_dir=skills_dir)

    await provider.generate(
        "配平 H2 + O2 -> H2O",
        route_decision={"domain": "chemistry", "skill_id": "chemistry_stoichiometry"},
    )

    instructions = _FakeCodex.instances[0].thread_start_calls[0]["developer_instructions"]
    assert "# Generic MetaView Teacher" in instructions
    assert "# Chemistry Runtime Skill" in instructions
    assert "Use stoichiometry tools instead of mental math." in instructions


@pytest.mark.asyncio
async def test_codex_provider_falls_back_to_generic_skill_when_domain_skill_missing(
    tmp_path: Path,
) -> None:
    skills_dir = tmp_path / "skills"
    (skills_dir / "generic").mkdir(parents=True)
    (skills_dir / "generic" / "SKILL.md").write_text(
        "# Generic MetaView Teacher\nGuide before answering.",
        encoding="utf-8",
    )
    provider = CodexAgentProvider(cwd=".", skills_dir=skills_dir)

    await provider.generate("open ended", route_decision={"domain": "astronomy"})

    instructions = _FakeCodex.instances[0].thread_start_calls[0]["developer_instructions"]
    assert "# Generic MetaView Teacher" in instructions
    assert "astronomy" not in instructions


@pytest.mark.asyncio
async def test_codex_provider_forwards_api_key_and_model_override() -> None:
    provider = CodexAgentProvider(cwd=".", model="default-model", effort=None)

    await provider.generate(
        "prompt",
        provider_config={"api_key": "sk-test", "model": "override-model"},
    )

    fake = _FakeCodex.instances[0]
    assert fake.login_keys == ["sk-test"]
    assert fake.thread_start_calls[0]["model"] == "override-model"
    assert fake.thread.run_calls[0]["model"] == "override-model"


@pytest.mark.asyncio
async def test_codex_provider_raises_on_invalid_json() -> None:
    _FakeCodex.response = "not json"
    provider = CodexAgentProvider(cwd=".")

    with pytest.raises(AgentProviderError) as excinfo:
        await provider.generate("prompt")

    assert "invalid JSON" in str(excinfo.value)
