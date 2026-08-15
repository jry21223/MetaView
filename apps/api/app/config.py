from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ALL_DOMAINS = "algorithm,math,code,physics,chemistry,biology,geography"

GenerationMode = Literal["single", "agent"]
AgentProviderKind = Literal["http", "codex"]
PaymentGatewayKind = Literal["wechat", "easypay"]
AppEdition = Literal["self", "ops"]
RouterMode = Literal["off", "heuristic", "llm", "hybrid"]
_GENERATION_MODES: frozenset[str] = frozenset(("single", "agent"))
_AGENT_PROVIDERS: frozenset[str] = frozenset(("http", "codex"))
_APP_EDITIONS: frozenset[str] = frozenset(("self", "ops"))
_ROUTER_MODES: frozenset[str] = frozenset(("off", "heuristic", "llm", "hybrid"))
_PAYMENT_GATEWAYS: frozenset[str] = frozenset(("wechat", "easypay"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="METAVIEW_",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    app_name: str = "MetaView API"
    app_version: str = "2.0.0"
    app_edition: AppEdition = "self"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    default_provider: str | None = None
    default_router_provider: str | None = None
    default_generation_provider: str | None = None
    mock_provider_enabled: bool = True
    enabled_domains: str = _ALL_DOMAINS
    max_repair_attempts: int = 2
    pipeline_timeout_s: float | None = 900.0
    history_db_path: str = "data/pipeline_runs.db"
    reviewer_mode: str = "on_failure"

    # Request-shape guards (issue #39). Defaults protect against accidental
    # large-body uploads and runaway LLM cost; production should tune via
    # METAVIEW_* env vars.
    max_body_bytes: int = 5_000_000  # 5 MB
    rate_limit_enabled: bool = True
    rate_limit_write: str = "10/minute"  # POST pipeline/exports — LLM cost path
    rate_limit_read: str = "60/minute"  # GET runs/exports — cheap reads

    # Remotion playbook defaults — all configurable, no hardcoding in domain code
    playbook_default_fps: int = 30
    playbook_default_step_frames: int = 60
    playbook_composition_width: int = 960
    playbook_composition_height: int = 540

    # Export (Remotion render) — relative to repo root unless absolute
    export_web_app_dir: str = "apps/web"
    export_artifacts_dir: str = "data/exports"

    # TTS proxy (issue #40) — the player no longer stores an OpenAI key in
    # localStorage. ``tts_api_key`` falls back to ``openai_api_key`` so a
    # single env var still works for hobby setups; production deployments can
    # split them and apply tighter quotas to TTS.
    tts_api_key: str | None = None
    tts_base_url: str = "https://api.openai.com/v1"
    tts_model: str = "tts-1"
    tts_default_voice: str = "alloy"
    tts_timeout_s: float = 60.0

    # OpenAI-compatible provider
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str | None = None
    openai_router_model: str | None = None
    openai_planning_model: str | None = None
    openai_coding_model: str | None = None
    openai_critic_model: str | None = None
    openai_test_model: str | None = None
    openai_supports_vision: bool = False
    openai_timeout_s: float | None = 300.0
    # Generation budget — wider room for longer, more thorough teaching scripts.
    # Set ``None`` to fall back to the provider default; otherwise we pass
    # ``max_tokens`` on each chat/completions call.
    openai_max_tokens: int | None = 16000
    # Optional. When set we forward ``reasoning_effort`` (gpt-5 / o-series) so
    # the model thinks for longer. Leave empty for providers that reject the
    # field (DeepSeek, local vLLM, etc.). Allowed: minimal/low/medium/high.
    openai_reasoning_effort: str | None = None

    # Model router. Hybrid mode uses the small router first and falls back to
    # deterministic parsers / legacy topic routing when the model is unavailable
    # or too uncertain.
    router_mode: RouterMode = "hybrid"
    router_model: str | None = None
    router_timeout_s: float = 12.0
    router_min_confidence: float = Field(default=0.72, ge=0.0, le=1.0)
    router_refine_confidence: float = Field(default=0.55, ge=0.0, le=1.0)
    router_temperature: float = 0.0

    # ── Generation pipeline mode (single-shot vs agent sidecar) ─────────────
    # ``single`` keeps the current OpenAIProvider.complete() → CIR JSON path.
    # ``agent`` routes to the apps/agent Node sidecar (pi-agent-core) which
    # builds the PlaybookScript turn-by-turn via Drawing CLI tool calls and
    # calls back into /api/v1/agent/assert/* for sympy-based geometry checks.
    # Toggle is per-deployment; per-request override stays out of scope for now.
    generation_mode: GenerationMode = "single"
    agent_provider: AgentProviderKind = "http"
    agent_base_url: str = "http://agent:8001"
    agent_timeout_s: float = 600.0
    agent_shared_token: str | None = None
    codex_model: str | None = "gpt-5.5"
    codex_effort: str | None = None
    codex_cwd: str = "."
    codex_bin: str | None = None
    agent_skills_dir: str = "skills/metaview-agent"

    # Account / recharge
    account_session_cookie: str = "mv_session"
    account_session_days: int = 30
    account_session_secure: bool = False
    recharge_min_cents: int = 500
    generation_cost_cents: int = 10

    # Ops edition trust boundary (issue #227): the single ``user_id`` that is
    # permitted to reach ops routes. Optional for ``self`` edition; mandatory
    # when ``app_edition == "ops"`` — the model validator below refuses to
    # serve an ops deployment that has not bound its admin identity.
    ops_admin_user_id: str | None = None

    # Ops admin subdomain (issue #233): the host the dedicated ops build is
    # served on (e.g. ``ops.metaview.top``). Optional for ``self`` edition;
    # mandatory when ``app_edition == "ops"`` — the validator below refuses to
    # boot an ops deployment without it and collapses credentialed CORS to
    # ``https://<ops_host>`` so the apex origin can never talk to the ops API.
    ops_host: str | None = None

    # WeChat OAuth login (Website App / Open Platform)
    wechat_login_appid: str | None = None
    wechat_login_secret: str | None = None
    wechat_login_redirect_uri: str | None = None
    wechat_login_success_url: str = "http://127.0.0.1:5173/"

    # Legacy WeChat Pay API v3 Native recharge (legacy / deprecated; kept for compatibility only).
    wechat_pay_appid: str | None = None
    wechat_pay_mchid: str | None = None
    wechat_pay_merchant_serial_no: str | None = None
    wechat_pay_private_key_path: str | None = None
    wechat_pay_private_key: str | None = None
    wechat_pay_api_v3_key: str | None = None
    wechat_pay_notify_url: str | None = None
    wechat_pay_platform_public_key_path: str | None = None
    wechat_pay_api_base: str = "https://api.mch.weixin.qq.com"
    wechat_notify_max_skew_s: int = 300
    wechat_notify_replay_ttl_s: int = 600

    # Pluggable payment gateway (wechat/easypay)
    payment_gateway: PaymentGatewayKind = "easypay"
    # Primary Easypay-compatible fields (prefer these in configuration).
    # Legacy `METAVIEW_EASYPAY_*` are supported as compatibility aliases.
    epay_api_base: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_API_BASE",
            "METAVIEW_EASYPAY_API_BASE",
            "epay_api_base",
            "easypay_api_base",
        ),
    )
    epay_submit_path: str = Field(
        default="/submit.php",
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_SUBMIT_PATH",
            "METAVIEW_EASYPAY_SUBMIT_PATH",
            "epay_submit_path",
            "easypay_submit_path",
        ),
    )
    epay_submit_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_SUBMIT_URL",
            "METAVIEW_EASYPAY_SUBMIT_URL",
            "epay_submit_url",
            "easypay_submit_url",
        ),
    )
    epay_pid: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_PID",
            "METAVIEW_EASYPAY_PID",
            "epay_pid",
            "easypay_pid",
        ),
    )
    epay_merchant_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_MERCHANT_ID",
            "METAVIEW_EASYPAY_MERCHANT_ID",
            "epay_merchant_id",
            "easypay_merchant_id",
        ),
    )
    epay_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_KEY",
            "METAVIEW_EASYPAY_KEY",
            "epay_key",
            "easypay_key",
        ),
    )
    epay_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_API_KEY",
            "METAVIEW_EASYPAY_API_KEY",
            "epay_api_key",
            "easypay_api_key",
        ),
    )
    epay_sign_type: str = Field(
        default="MD5",
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_SIGN_TYPE",
            "METAVIEW_EASYPAY_SIGN_TYPE",
            "epay_sign_type",
            "easypay_sign_type",
        ),
    )
    epay_pay_type: str = Field(
        default="wxpay",
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_PAY_TYPE",
            "METAVIEW_EASYPAY_PAY_TYPE",
            "epay_pay_type",
            "easypay_pay_type",
        ),
    )
    epay_notify_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_NOTIFY_URL",
            "METAVIEW_EASYPAY_NOTIFY_URL",
            "epay_notify_url",
            "easypay_notify_url",
        ),
    )
    epay_return_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "METAVIEW_EPAY_RETURN_URL",
            "METAVIEW_EASYPAY_RETURN_URL",
            "epay_return_url",
            "easypay_return_url",
        ),
    )

    # NewAPI redirect top-up bridge (local/dev checkout integration)
    newapi_topup_intent_secret: str | None = None
    newapi_topup_receipt_token: str | None = None
    newapi_topup_dev_mode: bool = False
    newapi_topup_allowed_return_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000"
    )
    newapi_quota_per_yuan: int = 500_000

    @field_validator("openai_timeout_s", "pipeline_timeout_s", mode="before")
    @classmethod
    def normalize_optional_timeout(cls, value: float | str | None) -> float | str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("reviewer_mode", mode="before")
    @classmethod
    def normalize_reviewer_mode(cls, value: str | None) -> str:
        if value is None:
            return "on_failure"
        normalized = value.strip().lower()
        if normalized not in {"off", "on_failure", "math_always", "always"}:
            return "on_failure"
        return normalized

    @field_validator("openai_reasoning_effort", mode="before")
    @classmethod
    def normalize_reasoning_effort(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized not in {"minimal", "low", "medium", "high"}:
            return None
        return normalized

    @field_validator("generation_mode", mode="before")
    @classmethod
    def normalize_generation_mode(cls, value: str | None) -> GenerationMode:
        if value is None:
            return "single"
        normalized = value.strip().lower()
        if normalized not in _GENERATION_MODES:
            return "single"
        return normalized  # type: ignore[return-value]

    @field_validator("payment_gateway", mode="before")
    @classmethod
    def normalize_payment_gateway(cls, value: str | None) -> PaymentGatewayKind:
        if value is None:
            return "easypay"
        normalized = value.strip().lower()
        if normalized not in _PAYMENT_GATEWAYS:
            return "easypay"
        return normalized  # type: ignore[return-value]

    @field_validator("router_mode", mode="before")
    @classmethod
    def normalize_router_mode(cls, value: str | None) -> RouterMode:
        if value is None:
            return "hybrid"
        normalized = value.strip().lower()
        if normalized not in _ROUTER_MODES:
            return "hybrid"
        return normalized  # type: ignore[return-value]

    @field_validator("agent_provider", mode="before")
    @classmethod
    def normalize_agent_provider(cls, value: str | None) -> AgentProviderKind:
        if value is None:
            return "http"
        normalized = value.strip().lower()
        if normalized not in _AGENT_PROVIDERS:
            return "http"
        return normalized  # type: ignore[return-value]

    @field_validator("codex_effort", mode="before")
    @classmethod
    def normalize_codex_effort(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in {"minimal", "low", "medium", "high", "xhigh"}:
            return None
        return normalized

    @field_validator("app_edition", mode="before")
    @classmethod
    def normalize_app_edition(cls, value: str | None) -> AppEdition:
        if value is None:
            return "self"
        normalized = value.strip().lower()
        if normalized not in _APP_EDITIONS:
            return "self"
        return normalized  # type: ignore[return-value]

    @model_validator(mode="after")
    def _require_ops_mandatory_settings_when_ops(self) -> "Settings":
        # Ops edition trust boundary (issue #227): the bound admin identity is
        # mandatory for an ops deployment. Issue #233 extends the mandatory
        # set with the ops host and restricts credentialed CORS to the ops
        # origin — the apex self bundle never carries credentials.
        if self.app_edition != "ops":
            return self
        if not self.ops_admin_user_id:
            raise ValueError(
                "METAVIEW_OPS_ADMIN_USER_ID is required when app_edition='ops'; "
                "set it to the user_id of the bound ops admin account"
            )
        if not self.ops_host:
            raise ValueError(
                "METAVIEW_OPS_HOST is required when app_edition='ops'; "
                "set it to the ops admin subdomain the ops build is served on "
                "(e.g. ops.metaview.top)"
            )
        self.cors_origins = [f"https://{self.ops_host}"]
        return self

    @model_validator(mode="after")
    def _reject_loopback_wechat_login_success_url_when_ops(self) -> "Settings":
        # Issue #226: an ops deployment that forgets to set
        # METAVIEW_WECHAT_LOGIN_SUCCESS_URL keeps the localhost default, which
        # silently breaks the WeChat OAuth callback by redirecting users back
        # to 127.0.0.1 in production. Refuse to boot rather than ship a broken
        # redirect target. Declared after the #227 validator so a missing
        # ops_admin_user_id still raises first.
        if self.app_edition == "ops" and self.wechat_login_success_url.startswith(
            ("http://localhost", "http://127.0.0.1")
        ):
            raise ValueError(
                "wechat_login_success_url must not target http://localhost or "
                "http://127.0.0.1 in ops edition; set METAVIEW_WECHAT_LOGIN_SUCCESS_URL "
                "to the public HTTPS URL the WeChat OAuth callback should redirect to"
            )
        return self

    @property
    def enabled_topic_domains(self) -> tuple[str, ...]:
        return tuple(
            item.strip().lower()
            for item in self.enabled_domains.split(",")
            if item.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
