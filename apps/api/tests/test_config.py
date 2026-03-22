from app.config import Settings


def test_settings_load_dotenv_from_project_root(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ALGO_VIS_PREVIEW_TTS_MODEL=mimotts-v2-from-dotenv\n", encoding="utf-8")

    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ALGO_VIS_PREVIEW_TTS_MODEL", raising=False)

    settings = Settings()

    assert settings.preview_tts_model == "mimotts-v2-from-dotenv"
