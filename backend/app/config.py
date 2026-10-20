from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    # LLM
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = ""  # one OpenRouter key for every model
    # Optional comma-separated backup keys (other accounts). When the active key is rate-limited, the same
    # request is retried at once on the next key that is not cooling down; same base URL and models.
    llm_backup_api_keys: str = ""
    llm_site_url: str = ""  # optional HTTP-Referer for OpenRouter attribution
    llm_max_concurrency: int = 2  # parallel LLM calls in eval; free tiers rate-limit hard
    classifier_model: str = ""
    report_model: str = ""
    low_tier_reply_model: str = ""
    agent_model: str = ""

    # fastn
    fastn_enabled: bool = False
    fastn_gateway_url: str = "https://api.fastn.dev/api/v1/workflows"  # POST {url}/<id>/execute
    fastn_api_key: str = ""
    fastn_auth_method: str = "bearer"  # "bearer" or "api_key_header"
    fastn_env: str = "test"  # sent as x-fastn-env: "test" = latest published, "live" = live deployment
    fastn_timeout_seconds: float = 30.0
    # workflow name -> fastn workflow id (wf_...), JSON in .env; names without an entry are sent as-is
    fastn_workflow_ids: dict[str, str] = {}
    officer_email: str = ""  # optional recipient hint passed to notify_officer
    dashboard_url: str = ""  # optional base URL of the dashboard; ticket links to {url}/cases/<id>
    reply_auth_secret: str = ""  # shared with the fastn send_approved_reply workflow to verify tokens

    # Email intake: poll the bank's Gmail inbox (via the fastn fetch_inbound_emails workflow)
    inbound_email_enabled: bool = False  # needs fastn_enabled too
    bank_inbox_email: str = ""  # the inbox customers write to; mail from it is never ingested
    inbound_poll_seconds: int = 60
    # Only mail received after this ISO time is ingested; empty = from the first poll onwards
    inbound_email_since: str = ""
    inbound_gmail_query: str = (
        "in:inbox -from:me -category:promotions -category:social -category:updates -category:forums"
    )

    # Auth: signs the session cookie; unset = random per process (everyone is signed out on restart)
    auth_secret: str = ""
    auth_session_hours: int = 24 * 7
    auth_cookie_secure: bool = False  # set true when served over HTTPS

    # App
    database_url: str = "sqlite:///./app.db"
    seed_on_startup: bool = True  # load the demo dataset when the database is empty (fresh container)
    agent_max_steps: int = 8
    confidence_threshold: float = 0.7
    strong_cost_ratio: float = 10.0  # assumed cost of a strong-model token vs a cheap one
    agent_timeout_seconds: int = 60  # per agent turn (LLM call plus its tool calls), not for the whole run
    # Circuit breaker: after this many rate-limit failures in a row, stop calling the LLM for the cooldown
    llm_breaker_threshold: int = 3
    llm_breaker_cooldown_seconds: int = 120
    agent_review_timeout_seconds: int = 1800  # supervised runs: how long the agent waits on one reviewer answer
    # Layer 3 safeguard: complaint hints at lost money or an unresolved serious issue -> escalate
    escalation_phrases: list[str] = [
        "deducted",
        "money is missing",
        "lost money",
        "never received",
        "not received",
        "charged twice",
        "double charged",
    ]
    danger_phrases: list[str] = ["didn't make this", "hacked", "stolen", "not me"]


settings = Settings()
