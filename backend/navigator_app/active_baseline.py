from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping


_MODULE_PATH = Path(__file__).resolve()
_SOURCE_ROOT = _MODULE_PATH.parents[2]
_PACKAGED_ROOT = _MODULE_PATH.parents[1]
REPO_ROOT = _SOURCE_ROOT if (_SOURCE_ROOT / "backend").is_dir() else _PACKAGED_ROOT
DEFAULT_ACTIVE_BASELINE_PATH = (
    REPO_ROOT / "backend/config/active_successor_baseline_v1.json"
)
ACTIVE_BASELINE_CONTRACT = "modavis.navigator.active-successor-baseline/v1"
MAP_SNAPSHOT_CONTRACT = "modavis.navigator.public-map-snapshot/v1"
MAP_CHECKPOINT_CONTRACT = "modavis.navigator.public-map-snapshot-checkpoint/v1"


class ActiveBaselineError(RuntimeError):
    """Raised when a runtime or analytical input is outside the active baseline."""


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _mapping(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ActiveBaselineError(f"{label} must be an object")
    return dict(value)


def _read_json(path: Path, *, compressed: bool = False) -> dict[str, Any]:
    try:
        if compressed:
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return _mapping(json.load(handle), label=str(path))
        with path.open("r", encoding="utf-8") as handle:
            return _mapping(json.load(handle), label=str(path))
    except (OSError, ValueError, TypeError) as exc:
        raise ActiveBaselineError(f"cannot read baseline input {path}: {exc}") from exc


def _repo_path(value: Any) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ActiveBaselineError("terminal checkpoint path is missing")
    relative = Path(value)
    if relative.is_absolute():
        raise ActiveBaselineError("terminal checkpoint path must be repository-relative")
    resolved = (REPO_ROOT / relative).resolve()
    try:
        resolved.relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise ActiveBaselineError("terminal checkpoint path escapes the repository") from exc
    return resolved


def _database_runtime(baseline: Mapping[str, Any]) -> dict[str, Any]:
    database = _mapping(baseline.get("database"), label="database")
    runtime = _mapping(database.get("runtime"), label="database.runtime")
    if not str(runtime.get("name") or "").strip():
        raise ActiveBaselineError("active successor runtime database name is missing")
    return runtime


def load_active_baseline(
    path: Path | str = DEFAULT_ACTIVE_BASELINE_PATH,
) -> dict[str, Any]:
    baseline_path = Path(path).resolve()
    baseline = _read_json(baseline_path)
    if baseline.get("contractVersion") != ACTIVE_BASELINE_CONTRACT:
        raise ActiveBaselineError("unsupported active-successor baseline contract")
    if baseline.get("status") != "active_for_read_only_successor_analysis":
        raise ActiveBaselineError("successor baseline is not active for read-only analysis")
    if baseline.get("publicationAuthorized") is not False:
        raise ActiveBaselineError("active successor baseline must not authorize publication")

    release_version = str(baseline.get("releaseVersion") or "").strip()
    if not release_version:
        raise ActiveBaselineError("active successor release version is missing")

    terminal_ref = _mapping(
        baseline.get("terminalCheckpoint"), label="terminalCheckpoint"
    )
    terminal_path = _repo_path(terminal_ref.get("path"))
    expected_file_hash = str(terminal_ref.get("fileSha256") or "")
    if not terminal_path.is_file() or file_sha256(terminal_path) != expected_file_hash:
        raise ActiveBaselineError("terminal release checkpoint file hash mismatch")
    terminal = _read_json(terminal_path)
    expected_terminal = {
        "contractVersion": terminal_ref.get("contractVersion"),
        "releaseVersion": release_version,
        "releaseState": baseline.get("releaseState"),
        "checkpointSha256": terminal_ref.get("checkpointSha256"),
        "candidateIdentitySha256": terminal_ref.get("contentSha256"),
    }
    for key, expected in expected_terminal.items():
        if terminal.get(key) != expected:
            raise ActiveBaselineError(
                f"terminal release checkpoint {key} does not match active baseline"
            )

    database = _mapping(baseline.get("database"), label="database")
    database_name = str(database.get("name") or "")
    if database.get("contentSha256") != terminal.get("candidateIdentitySha256"):
        raise ActiveBaselineError("active database content fingerprint mismatch")
    terminal_databases = terminal.get("databaseStates")
    matching_database = next(
        (
            item
            for item in terminal_databases
            if isinstance(item, Mapping) and item.get("database") == database_name
        ),
        None,
    ) if isinstance(terminal_databases, list) else None
    if matching_database is None:
        raise ActiveBaselineError("active database is absent from terminal checkpoint")
    if database.get("requiredReadOnly") is not True or matching_database.get("defaultReadOnly") is not True:
        raise ActiveBaselineError("active successor database is not bound as read-only")
    restore_fingerprint = _mapping(
        terminal.get("restoreFingerprint"), label="terminal restoreFingerprint"
    )
    if database.get("schemaSha256") != restore_fingerprint.get("schemaSha256"):
        raise ActiveBaselineError("active database schema fingerprint mismatch")
    if database.get("requiredPostgresMajor") != restore_fingerprint.get("postgresMajor"):
        raise ActiveBaselineError("active database PostgreSQL major mismatch")
    runtime = _database_runtime(baseline)
    if runtime.get("name") == database_name:
        raise ActiveBaselineError(
            "successor runtime database must be isolated from the accepted database name"
        )
    if not isinstance(runtime.get("port"), int) or int(runtime["port"]) <= 0:
        raise ActiveBaselineError("active successor runtime database port is invalid")
    _repo_path(runtime.get("fingerprintPath"))

    snapshot = _mapping(baseline.get("publicMapSnapshot"), label="publicMapSnapshot")
    if snapshot.get("releaseVersion") != release_version:
        raise ActiveBaselineError("map snapshot release does not match active release")
    if snapshot.get("database") != database_name:
        raise ActiveBaselineError("map snapshot database does not match active database")
    if snapshot.get("contractVersion") != MAP_SNAPSHOT_CONTRACT:
        raise ActiveBaselineError("unsupported active map snapshot contract")
    if snapshot.get("checkpointContractVersion") != MAP_CHECKPOINT_CONTRACT:
        raise ActiveBaselineError("unsupported active map checkpoint contract")
    return baseline


def validate_public_map_snapshot(
    snapshot_path: Path | str,
    checkpoint_path: Path | str,
    baseline: Mapping[str, Any],
) -> dict[str, Any]:
    snapshot_path = Path(snapshot_path).resolve()
    checkpoint_path = Path(checkpoint_path).resolve()
    if not snapshot_path.is_file():
        raise ActiveBaselineError(f"configured public map snapshot is missing: {snapshot_path}")
    if not checkpoint_path.is_file():
        raise ActiveBaselineError(f"public map snapshot checkpoint is missing: {checkpoint_path}")
    expected = _mapping(
        baseline.get("publicMapSnapshot"), label="publicMapSnapshot"
    )
    database = _mapping(baseline.get("database"), label="database")
    release_version = baseline.get("releaseVersion")

    actual_snapshot_hash = file_sha256(snapshot_path)
    actual_checkpoint_hash = file_sha256(checkpoint_path)
    if actual_snapshot_hash != expected.get("sha256"):
        raise ActiveBaselineError(
            f"refusing snapshot SHA-256 {actual_snapshot_hash}: active Release "
            f"{release_version} requires {expected.get('sha256')}"
        )
    if snapshot_path.stat().st_size != expected.get("byteSize"):
        raise ActiveBaselineError("active map snapshot byte size mismatch")
    if actual_checkpoint_hash != expected.get("checkpointFileSha256"):
        raise ActiveBaselineError("active map checkpoint file SHA-256 mismatch")

    snapshot = _read_json(snapshot_path, compressed=True)
    checkpoint = _read_json(checkpoint_path)
    if snapshot.get("contractVersion") != MAP_SNAPSHOT_CONTRACT:
        raise ActiveBaselineError("unsupported public map snapshot contract")
    if checkpoint.get("contractVersion") != MAP_CHECKPOINT_CONTRACT:
        raise ActiveBaselineError("unsupported public map checkpoint contract")
    for document, label in ((snapshot, "snapshot"), (checkpoint, "checkpoint")):
        if document.get("releaseVersion") != release_version:
            raise ActiveBaselineError(
                f"refusing {label} Release {document.get('releaseVersion')}: "
                f"active successor baseline is Release {release_version}"
            )
        if document.get("database") != database.get("name"):
            raise ActiveBaselineError(
                f"{label} database does not match active successor database"
            )

    logical = dict(snapshot)
    embedded_logical_hash = logical.pop("snapshotSha256", None)
    actual_logical_hash = canonical_sha256(logical)
    if embedded_logical_hash != actual_logical_hash:
        raise ActiveBaselineError("public map snapshot logical hash is invalid")
    if actual_logical_hash != expected.get("logicalSha256"):
        raise ActiveBaselineError("public map snapshot logical hash is outside baseline")

    checkpoint_without_hash = dict(checkpoint)
    embedded_checkpoint_hash = checkpoint_without_hash.pop("checkpointSha256", None)
    actual_checkpoint_logical_hash = canonical_sha256(checkpoint_without_hash)
    if embedded_checkpoint_hash != actual_checkpoint_logical_hash:
        raise ActiveBaselineError("public map checkpoint logical hash is invalid")
    if actual_checkpoint_logical_hash != expected.get("checkpointSha256"):
        raise ActiveBaselineError("public map checkpoint is outside active baseline")

    receipt = _mapping(checkpoint.get("snapshot"), label="checkpoint.snapshot")
    if (
        receipt.get("sha256") != actual_snapshot_hash
        or receipt.get("logicalSha256") != actual_logical_hash
        or receipt.get("byteSize") != snapshot_path.stat().st_size
    ):
        raise ActiveBaselineError("public map checkpoint does not bind snapshot bytes")
    if list(snapshot.get("sources") or []) != list(expected.get("requiredSources") or []):
        raise ActiveBaselineError("public map snapshot source slices are outside baseline")
    effects = _mapping(checkpoint.get("effects"), label="checkpoint.effects")
    if any(int(effects.get(key) or 0) != 0 for key in ("databaseWrites", "providerCalls", "publicationWrites")):
        raise ActiveBaselineError("public map snapshot checkpoint records prohibited effects")

    return {
        "activeBaselineContract": baseline.get("contractVersion"),
        "activeBaselineManifestSha256": canonical_sha256(dict(baseline)),
        "terminalCheckpointFileSha256": _mapping(
            baseline.get("terminalCheckpoint"), label="terminalCheckpoint"
        ).get("fileSha256"),
        "releaseVersion": release_version,
        "databaseName": database.get("name"),
        "snapshotSha256": actual_snapshot_hash,
        "snapshotLogicalSha256": actual_logical_hash,
        "checkpointSha256": actual_checkpoint_logical_hash,
        "checkpointFileSha256": actual_checkpoint_hash,
    }


def validate_runtime_public_map_snapshot(
    snapshot_path: Path | str,
    *,
    database_name: str,
    baseline_path: Path | str = DEFAULT_ACTIVE_BASELINE_PATH,
) -> dict[str, Any]:
    snapshot_path = Path(snapshot_path).resolve()
    baseline = load_active_baseline(baseline_path)
    runtime_database = _database_runtime(baseline).get("name")
    if database_name != runtime_database:
        raise ActiveBaselineError(
            f"runtime database {database_name!r} is outside active Release "
            f"{baseline.get('releaseVersion')} baseline"
        )
    return validate_public_map_snapshot(
        snapshot_path,
        snapshot_path.with_name("checkpoint.json"),
        baseline,
    )


def validate_runtime_database_fingerprint(
    baseline: Mapping[str, Any],
    fingerprint_path: Path | str | None = None,
) -> dict[str, Any]:
    """Bind an isolated runtime reconstruction to the terminal Release 1.3 proof."""

    runtime = _database_runtime(baseline)
    path = (
        Path(fingerprint_path).resolve()
        if fingerprint_path is not None
        else _repo_path(runtime.get("fingerprintPath"))
    )
    fingerprint = _read_json(path)
    if fingerprint.get("database") != runtime.get("name"):
        raise ActiveBaselineError("runtime database fingerprint names another database")

    terminal_ref = _mapping(
        baseline.get("terminalCheckpoint"), label="terminalCheckpoint"
    )
    terminal = _read_json(_repo_path(terminal_ref.get("path")))
    expected = _mapping(
        terminal.get("restoreFingerprint"), label="terminal restoreFingerprint"
    )
    for key, expected_value in expected.items():
        if key == "database":
            continue
        if fingerprint.get(key) != expected_value:
            raise ActiveBaselineError(
                f"runtime database fingerprint {key} is outside active Release "
                f"{baseline.get('releaseVersion')} baseline"
            )
    if fingerprint.get("defaultReadOnly") is not True:
        raise ActiveBaselineError("runtime database fingerprint is not read-only")
    return fingerprint


def validate_live_runtime_database(
    connection: Any,
    baseline: Mapping[str, Any],
    fingerprint_path: Path | str | None = None,
) -> dict[str, Any]:
    """Verify the live runtime identity and fail closed before successor analysis."""

    fingerprint = validate_runtime_database_fingerprint(baseline, fingerprint_path)
    runtime = _database_runtime(baseline)
    row = connection.execute(
        "select current_database(), current_setting('server_version_num'), "
        "current_setting('default_transaction_read_only'), "
        "current_setting('transaction_read_only')"
    ).fetchone()
    if row is None:
        raise ActiveBaselineError("runtime database identity query returned no row")
    database_name, server_version_num, default_read_only, transaction_read_only = row
    postgres_major = int(server_version_num) // 10_000
    expected_major = _mapping(baseline.get("database"), label="database").get(
        "requiredPostgresMajor"
    )
    if database_name != runtime.get("name"):
        raise ActiveBaselineError(
            f"live database {database_name!r} is outside the configured successor runtime"
        )
    if postgres_major != expected_major:
        raise ActiveBaselineError(
            f"live PostgreSQL major {postgres_major} does not match {expected_major}"
        )
    if default_read_only != "on" or transaction_read_only != "on":
        raise ActiveBaselineError("live successor baseline session is not read-only")
    return {
        "databaseName": database_name,
        "postgresMajor": postgres_major,
        "defaultReadOnly": True,
        "transactionReadOnly": True,
        "contentSha256": fingerprint.get("contentSha256"),
        "schemaSha256": fingerprint.get("schemaSha256"),
        "fingerprintPath": str(
            Path(fingerprint_path).resolve()
            if fingerprint_path is not None
            else _repo_path(runtime.get("fingerprintPath"))
        ),
    }
