from app.config import Settings


def test_settings_load_dotenv_from_project_root(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ALGO_VIS_PREVIEW_TTS_MODEL=mimotts-v2-from-dotenv\n", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_PREVIEW_TTS_MODEL", raising=False)

    settings = Settings()

    assert settings.preview_tts_model == "mimotts-v2-from-dotenv"


def test_settings_default_preview_tts_timeout(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_PREVIEW_TTS_TIMEOUT_S", raising=False)

    settings = Settings()

    assert settings.preview_tts_timeout_s == 120.0


def test_settings_use_bounded_default_openai_timeout(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_OPENAI_TIMEOUT_S", raising=False)

    settings = Settings()

    assert settings.openai_timeout_s == 300.0


def test_settings_allow_blank_preview_tts_timeout(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ALGO_VIS_PREVIEW_TTS_TIMEOUT_S=\n", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_PREVIEW_TTS_TIMEOUT_S", raising=False)

    settings = Settings()

    assert settings.preview_tts_timeout_s is None


def test_settings_allow_blank_openai_timeout(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ALGO_VIS_OPENAI_TIMEOUT_S=\n", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_OPENAI_TIMEOUT_S", raising=False)

    settings = Settings()

    assert settings.openai_timeout_s is None


def test_settings_default_gvisor_render_config(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)

    settings = Settings()

    assert settings.render_runner == "gvisor"
    assert settings.gvisor_runtime == "runsc"
    assert settings.gvisor_network_enabled is False
    assert settings.gvisor_memory_limit_mb == 512
    assert settings.gvisor_cpu_limit == "1.0"
    assert settings.gvisor_pids_limit == 64


def test_settings_default_manim_quality_is_1080p(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_MANIM_QUALITY", raising=False)

    settings = Settings()

    assert settings.manim_quality == "h"
