from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from .active_baseline import DEFAULT_ACTIVE_BASELINE_PATH


DEFAULT_RELEASE_ARTIFACT_STORAGE_DIR = str(Path(__file__).resolve().parents[1] / "generated" / "release-artifacts")
DEFAULT_DOCUMENTATION_STAGING_DIR = str(Path(__file__).resolve().parents[1] / "generated" / "documentation-staging")
DEFAULT_RELEASE_02_CANDIDATE_CHECKPOINT = str(
    Path(__file__).resolve().parents[2]
    / "instance/future-release/release-0.2-orgelseite-candidate-private-v1/checkpoint.json"
)
DEFAULT_RELEASE_02_SPECIFICATION_CHECKPOINT = str(
    Path(__file__).resolve().parents[2]
    / "instance/future-release/release-0.2-orgelseite-specification-evidence-v4/checkpoint.json"
)
DEFAULT_RELEASE_03_CANDIDATE_CHECKPOINT = str(
    Path(__file__).resolve().parents[2]
    / "instance/future-release/release-0.3-npor-candidate-v2/checkpoint.json"
)
DEFAULT_PUBLIC_MAP_SNAPSHOT_PATH: str | None = None
DEFAULT_VIRTUAL_INSTRUMENT_CATALOG_PATH = str(
    Path(__file__).resolve().parents[2]
    / "instance/successor-candidates/virtual-instruments-release-1.5-v1/virtual-instruments.json.gz"
)
DEFAULT_RELEASE_1_5_IDENTIFIER_LEDGER_SHA256 = (
    "3203d885ff9148e875b3bc42d5a9be35aeed38b4ad46c6dfabddbe28a4878dd5"
)
DEFAULT_DATASET_DISTRIBUTION_MANIFEST_PATH = str(
    Path(__file__).resolve().parents[1]
    / "config/release_1_5_5_dataset_distributions.json"
)


@dataclass(frozen=True)
class Settings:
    data_profile: str = "pod-1.5-public"
    public_database_manifest_path: str | None = None
    public_release_history_path: str | None = None
    db_host: str = "localhost"
    db_port: int = 8444
    db_name: str = "modavis-data"
    db_user: str = "postgres"
    db_password: str = "postgres"
    initiator_url: str = "http://localhost:8501"
    aggregator_url: str = "http://localhost:8504/aggregator"
    processor_url: str = "http://127.0.0.1:8510"
    processor_job_timeout_seconds: int = 120
    processor_read_actor_id: str = "modavis:mcp:service"
    processor_auth_header_secret: str | None = None
    read_model_auto_refresh: bool = False
    release_artifact_storage_dir: str = DEFAULT_RELEASE_ARTIFACT_STORAGE_DIR
    release_artifact_storage_provider: str = "local_filesystem"
    release_artifact_mirror_dir: str | None = None
    release_artifact_public_base_url: str | None = None
    release_artifact_s3_bucket: str | None = None
    release_artifact_s3_prefix: str = "modavis-release-artifacts"
    release_artifact_s3_region: str | None = None
    release_artifact_s3_endpoint_url: str | None = None
    release_artifact_s3_access_key_id: str | None = None
    release_artifact_s3_secret_access_key: str | None = None
    release_artifact_s3_session_token: str | None = None
    documentation_staging_dir: str = DEFAULT_DOCUMENTATION_STAGING_DIR
    documentation_upload_max_bytes: int = 50 * 1024 * 1024
    internal_documentation_bundle_path: str | None = None
    local_documentation_bundle_path: str | None = None
    public_base_url: str = "http://127.0.0.1:5173"
    canonical_id_base: str = "https://w3id.org/modavis"
    resolver_base_url: str = "https://id.modavis.org"
    linked_data_base_url: str = "https://data.modavis.org"
    dataset_distribution_manifest_path: str | None = (
        DEFAULT_DATASET_DISTRIBUTION_MANIFEST_PATH
    )
    dataset_distribution_organ_root: str | None = None
    dataset_distribution_entity_root: str | None = None
    ontology_base_url: str = "https://w3id.org/modavis/ontology/0.1.0"
    identifier_ledger_path: str | None = None
    identifier_ledger_sha256: str | None = DEFAULT_RELEASE_1_5_IDENTIFIER_LEDGER_SHA256
    uri_policy_key: str = "auto"
    uri_policy_version: str = "auto"
    public_source_release_version: str | None = None
    uri_release_version: str = "1.5"
    uri_publication_state: str = "prepared"
    active_successor_baseline_path: str | None = str(DEFAULT_ACTIVE_BASELINE_PATH)
    release_1_5_acceptance_path: str | None = None
    historical_release_mode: bool = False
    release_02_candidate_checkpoint_path: str = (
        DEFAULT_RELEASE_02_CANDIDATE_CHECKPOINT
    )
    release_02_specification_checkpoint_path: str = (
        DEFAULT_RELEASE_02_SPECIFICATION_CHECKPOINT
    )
    release_03_candidate_checkpoint_path: str = (
        DEFAULT_RELEASE_03_CANDIDATE_CHECKPOINT
    )
    public_map_snapshot_path: str | None = DEFAULT_PUBLIC_MAP_SNAPSHOT_PATH
    virtual_instrument_catalog_path: str | None = DEFAULT_VIRTUAL_INSTRUMENT_CATALOG_PATH
    release_identifier_governance_approved: bool = False
    datacite_mode: str = "disabled"
    datacite_api_url: str | None = None
    datacite_repository_id: str | None = None
    datacite_doi_prefix: str | None = None
    datacite_username: str | None = None
    datacite_password: str | None = None
    handle_mode: str = "disabled"
    handle_api_url: str | None = None
    handle_prefix: str | None = None
    handle_auth_token: str | None = None
    session_secret: str = "navigator-dev-session-secret"
    bootstrap_admin_email: str | None = None
    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None
    bootstrap_admin_display_name: str | None = None
    bootstrap_reviewer_accounts: tuple[dict[str, str], ...] = ()
    auth_mail_mode: str = "disabled"
    auth_mail_smtp_host: str = "smtp.hostinger.com"
    auth_mail_smtp_port: int = 465
    auth_mail_smtp_ssl: bool = True
    auth_mail_smtp_starttls: bool = False
    auth_mail_timeout_seconds: int = 15
    register_mail_from: str | None = None
    register_mail_username: str | None = None
    register_mail_password: str | None = None
    login_mail_from: str | None = None
    login_mail_username: str | None = None
    login_mail_password: str | None = None
    auth_code_ttl_minutes: int = 10

    @property
    def db_dsn(self) -> str:
        return (
            f"host={self.db_host} port={self.db_port} dbname={self.db_name} "
            f"user={self.db_user} password={self.db_password}"
        )


def load_settings() -> Settings:
    data_profile = (os.getenv("NAVIGATOR_DATA_PROFILE") or "pod-1.5-public").strip().lower()
    if data_profile not in {"full", "pod-1.5-public"}:
        raise ValueError(
            "NAVIGATOR_DATA_PROFILE must be 'full' or 'pod-1.5-public'"
        )
    return Settings(
        data_profile=data_profile,
        public_database_manifest_path=(
            os.getenv("NAVIGATOR_PUBLIC_DATABASE_MANIFEST") or None
        ),
        public_release_history_path=os.getenv("NAVIGATOR_PUBLIC_RELEASE_HISTORY") or None,
        db_host=os.getenv("DB_HOST", "localhost"),
        db_port=_int_env("DB_PORT", 8444),
        db_name=os.getenv("DB_NAME", "modavis-data"),
        db_user=os.getenv("DB_USER", "postgres"),
        db_password=os.getenv("DB_PASSWORD", "postgres"),
        initiator_url=os.getenv("MODAVIS_INITIATOR_URL", "http://localhost:8501"),
        aggregator_url=os.getenv("MODAVIS_AGGREGATOR_URL", "http://localhost:8504/aggregator"),
        processor_url=os.getenv("MODAVIS_PROCESSOR_URL", "http://127.0.0.1:8510"),
        processor_job_timeout_seconds=_int_env("MODAVIS_PROCESSOR_JOB_TIMEOUT_SECONDS", 120),
        processor_read_actor_id=(os.getenv("NAVIGATOR_PROCESSOR_READ_ACTOR_ID") or "modavis:mcp:service").strip(),
        processor_auth_header_secret=os.getenv("PROCESSOR_AUTH_HEADER_SECRET") or None,
        read_model_auto_refresh=_bool_env("NAVIGATOR_READ_MODEL_AUTO_REFRESH", False),
        release_artifact_storage_dir=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_STORAGE_DIR") or DEFAULT_RELEASE_ARTIFACT_STORAGE_DIR,
        release_artifact_storage_provider=(os.getenv("NAVIGATOR_RELEASE_ARTIFACT_STORAGE_PROVIDER") or "local_filesystem").strip().lower(),
        release_artifact_mirror_dir=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_MIRROR_DIR") or None,
        release_artifact_public_base_url=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_PUBLIC_BASE_URL") or None,
        release_artifact_s3_bucket=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_BUCKET") or None,
        release_artifact_s3_prefix=(os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_PREFIX") or "modavis-release-artifacts").strip("/"),
        release_artifact_s3_region=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_REGION") or None,
        release_artifact_s3_endpoint_url=(os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_ENDPOINT_URL") or "").rstrip("/") or None,
        release_artifact_s3_access_key_id=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_ACCESS_KEY_ID") or None,
        release_artifact_s3_secret_access_key=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_SECRET_ACCESS_KEY") or None,
        release_artifact_s3_session_token=os.getenv("NAVIGATOR_RELEASE_ARTIFACT_S3_SESSION_TOKEN") or None,
        documentation_staging_dir=os.getenv("NAVIGATOR_DOCUMENTATION_STAGING_DIR") or DEFAULT_DOCUMENTATION_STAGING_DIR,
        documentation_upload_max_bytes=_int_env("NAVIGATOR_DOCUMENTATION_UPLOAD_MAX_BYTES", 50 * 1024 * 1024),
        internal_documentation_bundle_path=os.getenv("NAVIGATOR_INTERNAL_DOCUMENTATION_BUNDLE_PATH") or None,
        local_documentation_bundle_path=os.getenv("NAVIGATOR_LOCAL_DOCUMENTATION_BUNDLE_PATH") or None,
        public_base_url=(os.getenv("NAVIGATOR_PUBLIC_BASE_URL") or "http://127.0.0.1:5173").rstrip("/"),
        canonical_id_base=(os.getenv("NAVIGATOR_CANONICAL_ID_BASE") or "https://w3id.org/modavis").rstrip("/"),
        resolver_base_url=(os.getenv("NAVIGATOR_RESOLVER_BASE_URL") or "https://id.modavis.org").rstrip("/"),
        linked_data_base_url=(os.getenv("NAVIGATOR_LINKED_DATA_BASE_URL") or "https://data.modavis.org").rstrip("/"),
        dataset_distribution_manifest_path=(
            os.getenv("NAVIGATOR_DATASET_DISTRIBUTION_MANIFEST")
            or DEFAULT_DATASET_DISTRIBUTION_MANIFEST_PATH
        ),
        dataset_distribution_organ_root=(
            os.getenv("NAVIGATOR_DATASET_DISTRIBUTION_ORGAN_ROOT") or None
        ),
        dataset_distribution_entity_root=(
            os.getenv("NAVIGATOR_DATASET_DISTRIBUTION_ENTITY_ROOT") or None
        ),
        ontology_base_url=(os.getenv("NAVIGATOR_ONTOLOGY_BASE_URL") or "https://w3id.org/modavis/ontology/0.1.0").rstrip("/"),
        identifier_ledger_path=os.getenv("NAVIGATOR_IDENTIFIER_LEDGER_PATH") or None,
        identifier_ledger_sha256=(
            os.getenv("NAVIGATOR_IDENTIFIER_LEDGER_SHA256")
            or DEFAULT_RELEASE_1_5_IDENTIFIER_LEDGER_SHA256
        ).strip().lower(),
        uri_policy_key=(os.getenv("NAVIGATOR_URI_POLICY_KEY") or "auto").strip(),
        uri_policy_version=(os.getenv("NAVIGATOR_URI_POLICY_VERSION") or "auto").strip(),
        public_source_release_version=os.getenv("NAVIGATOR_PUBLIC_SOURCE_RELEASE_VERSION") or None,
        uri_release_version=(os.getenv("NAVIGATOR_URI_RELEASE_VERSION") or "1.5").strip(),
        uri_publication_state=(os.getenv("NAVIGATOR_URI_PUBLICATION_STATE") or "prepared").strip().lower(),
        release_02_candidate_checkpoint_path=(
            os.getenv("NAVIGATOR_RELEASE_02_CANDIDATE_CHECKPOINT")
            or DEFAULT_RELEASE_02_CANDIDATE_CHECKPOINT
        ),
        release_02_specification_checkpoint_path=(
            os.getenv("NAVIGATOR_RELEASE_02_SPECIFICATION_CHECKPOINT")
            or DEFAULT_RELEASE_02_SPECIFICATION_CHECKPOINT
        ),
        release_03_candidate_checkpoint_path=(
            os.getenv("NAVIGATOR_RELEASE_03_CANDIDATE_CHECKPOINT")
            or DEFAULT_RELEASE_03_CANDIDATE_CHECKPOINT
        ),
        public_map_snapshot_path=(
            os.getenv("NAVIGATOR_PUBLIC_MAP_SNAPSHOT_PATH")
            or None
        ),
        virtual_instrument_catalog_path=(
            os.getenv("NAVIGATOR_VIRTUAL_INSTRUMENT_CATALOG_PATH")
            or DEFAULT_VIRTUAL_INSTRUMENT_CATALOG_PATH
        ),
        active_successor_baseline_path=(
            os.getenv("NAVIGATOR_ACTIVE_SUCCESSOR_BASELINE")
            or str(DEFAULT_ACTIVE_BASELINE_PATH)
        ),
        release_1_5_acceptance_path=(
            os.getenv("NAVIGATOR_RELEASE_1_5_ACCEPTANCE_PATH") or None
        ),
        historical_release_mode=_bool_env("NAVIGATOR_HISTORICAL_RELEASE", False),
        release_identifier_governance_approved=_bool_env("NAVIGATOR_RELEASE_IDENTIFIER_GOVERNANCE_APPROVED", False),
        datacite_mode=(os.getenv("NAVIGATOR_DATACITE_MODE") or "disabled").strip().lower(),
        datacite_api_url=(os.getenv("NAVIGATOR_DATACITE_API_URL") or "").rstrip("/") or None,
        datacite_repository_id=os.getenv("NAVIGATOR_DATACITE_REPOSITORY_ID") or None,
        datacite_doi_prefix=os.getenv("NAVIGATOR_DATACITE_DOI_PREFIX") or None,
        datacite_username=os.getenv("NAVIGATOR_DATACITE_USERNAME") or None,
        datacite_password=os.getenv("NAVIGATOR_DATACITE_PASSWORD") or None,
        handle_mode=(os.getenv("NAVIGATOR_HANDLE_MODE") or "disabled").strip().lower(),
        handle_api_url=(os.getenv("NAVIGATOR_HANDLE_API_URL") or "").rstrip("/") or None,
        handle_prefix=os.getenv("NAVIGATOR_HANDLE_PREFIX") or None,
        handle_auth_token=os.getenv("NAVIGATOR_HANDLE_AUTH_TOKEN") or None,
        session_secret=os.getenv("NAVIGATOR_SESSION_SECRET") or "navigator-dev-session-secret",
        bootstrap_admin_email=os.getenv("NAVIGATOR_BOOTSTRAP_ADMIN_EMAIL") or None,
        bootstrap_admin_username=os.getenv("NAVIGATOR_BOOTSTRAP_ADMIN_USERNAME") or None,
        bootstrap_admin_password=os.getenv("NAVIGATOR_BOOTSTRAP_ADMIN_PASSWORD") or None,
        bootstrap_admin_display_name=os.getenv("NAVIGATOR_BOOTSTRAP_ADMIN_DISPLAY_NAME") or None,
        bootstrap_reviewer_accounts=_json_list_env("NAVIGATOR_BOOTSTRAP_REVIEWER_ACCOUNTS_JSON"),
        auth_mail_mode=(os.getenv("NAVIGATOR_AUTH_MAIL_MODE") or "disabled").strip().lower(),
        auth_mail_smtp_host=os.getenv("NAVIGATOR_AUTH_MAIL_SMTP_HOST") or "smtp.hostinger.com",
        auth_mail_smtp_port=_int_env("NAVIGATOR_AUTH_MAIL_SMTP_PORT", 465),
        auth_mail_smtp_ssl=_bool_env("NAVIGATOR_AUTH_MAIL_SMTP_SSL", True),
        auth_mail_smtp_starttls=_bool_env("NAVIGATOR_AUTH_MAIL_SMTP_STARTTLS", False),
        auth_mail_timeout_seconds=_int_env("NAVIGATOR_AUTH_MAIL_TIMEOUT_SECONDS", 15),
        register_mail_from=os.getenv("NAVIGATOR_REGISTER_MAIL_FROM") or None,
        register_mail_username=os.getenv("NAVIGATOR_REGISTER_MAIL_USERNAME") or None,
        register_mail_password=os.getenv("NAVIGATOR_REGISTER_MAIL_PASSWORD") or None,
        login_mail_from=os.getenv("NAVIGATOR_LOGIN_MAIL_FROM") or None,
        login_mail_username=os.getenv("NAVIGATOR_LOGIN_MAIL_USERNAME") or None,
        login_mail_password=os.getenv("NAVIGATOR_LOGIN_MAIL_PASSWORD") or None,
        auth_code_ttl_minutes=_int_env("NAVIGATOR_AUTH_CODE_TTL_MINUTES", 10),
    )


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _json_list_env(name: str) -> tuple[dict[str, str], ...]:
    raw = os.getenv(name)
    if not raw:
        return ()
    try:
        decoded = json.loads(raw)
    except ValueError:
        return ()
    if not isinstance(decoded, list):
        return ()
    items: list[dict[str, str]] = []
    for item in decoded:
        if not isinstance(item, dict):
            continue
        clean = {str(key): str(value) for key, value in item.items() if value is not None}
        if clean:
            items.append(clean)
    return tuple(items)
