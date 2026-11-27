from dataclasses import replace
import json
from pathlib import Path
import secrets
import shutil
import sqlite3

import pytest
from psycopg.conninfo import conninfo_to_dict

from navigator_app.config import Settings, load_settings
from navigator_app.fixture_contract import AUTHORITY, CONTRACT, RELEASE, validate_fixture
from navigator_app.identity_ledger import IdentityLedgerError, IdentityLedgerResolver
from navigator_app.public_repository import PublicReleaseRepository
from navigator_app.uri_policy import UriPolicy
from tools.fixture_support import FIXTURE, build_ledger, sha256, verify_inputs


def settings_for(path, ledger_hash):
    return Settings(identifier_ledger_path=str(path), identifier_ledger_sha256=ledger_hash,
                    uri_release_version=RELEASE, uri_policy_version="2",
                    public_base_url=AUTHORITY,
                    canonical_id_base=AUTHORITY, resolver_base_url=AUTHORITY, linked_data_base_url=AUTHORITY,
                    public_database_manifest_path=str(FIXTURE / "manifest.json"))


def test_fixture_inputs_are_small_attributed_and_hash_bound(tmp_path):
    manifest = verify_inputs()
    assert manifest["expectedCounts"]["organ"] == 2
    assert manifest["attribution"]["license"] == "Apache-2.0"
    assert sum((FIXTURE / entry["path"]).stat().st_size for entry in manifest["files"]) < 100_000
    copied = tmp_path / "fixture"
    shutil.copytree(FIXTURE, copied)
    with (copied / "records.json").open("a") as stream:
        stream.write(" ")
    with pytest.raises(ValueError, match="records.json"):
        verify_inputs(copied)


def test_fixture_ledger_is_reproducible_and_read_only(tmp_path):
    records = json.loads((FIXTURE / "records.json").read_text())
    left, right = tmp_path / "left.sqlite", tmp_path / "right.sqlite"
    assert build_ledger(left, records) == build_ledger(right, records)
    settings = settings_for(left, sha256(left))
    ledger = IdentityLedgerResolver(left, policy=UriPolicy.from_settings(settings), expected_sha256=sha256(left))
    resolved = ledger.resolve("MDVS:ENTY:TEST-0001-A")
    assert resolved["canonicalUri"].startswith(AUTHORITY)
    assert resolved["publicationState"] == "prepared"
    assert ledger.resolve("MDVS:ENTY:TEST-9999-X") is None
    with ledger._connect() as connection, pytest.raises(sqlite3.OperationalError, match="readonly"):
        connection.execute("DELETE FROM identifier")


@pytest.mark.parametrize("change", [
    {"uri_publication_state": "active"}, {"canonical_id_base": "https://w3id.org/modavis"},
    {"resolver_base_url": "https://id.modavis.org"}, {"linked_data_base_url": "https://data.modavis.org"},
    {"public_base_url": "https://navigator.modavis.org"},
    {"uri_release_version": "1.6.0"}, {"public_database_manifest_path": None},
])
def test_fixture_cannot_claim_a_public_release(change):
    settings = settings_for(Path("unused"), "0" * 64)
    metadata = {"fixture_manifest_sha256": sha256(FIXTURE / "manifest.json"), "fixture_profile": CONTRACT}
    assert validate_fixture(settings, UriPolicy.from_settings(settings), metadata)["synthetic"]
    changed = replace(settings, **change)
    with pytest.raises(ValueError):
        validate_fixture(changed, UriPolicy.from_settings(changed), metadata)


def test_production_ledger_guard_still_rejects_synthetic_identity_input(tmp_path):
    path = tmp_path / "ledger.sqlite"
    digest = build_ledger(path, json.loads((FIXTURE / "records.json").read_text()))
    settings = replace(settings_for(path, digest), uri_release_version="1.6.0")
    with pytest.raises(IdentityLedgerError, match="exact retained"):
        PublicReleaseRepository(settings)._ledger()


def test_unconfigured_database_fails_before_connecting(monkeypatch):
    for key in ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"):
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(ValueError, match="explicitly"):
        _ = load_settings().db_dsn


def test_database_parameters_are_escaped_as_values():
    value = secrets.token_urlsafe(16) + " ' \\ host=unexpected.invalid"
    settings = Settings(db_host="127.0.0.1", db_name="fixture", db_user="fixture_reader", db_password=value)
    parsed = conninfo_to_dict(settings.db_dsn)
    assert parsed["host"] == "127.0.0.1"
    assert parsed["password"] == value


def test_optional_reference_inputs_require_explicit_configuration(monkeypatch):
    names = ("NAVIGATOR_DATASET_DISTRIBUTION_MANIFEST",
             "NAVIGATOR_RELEASE_02_CANDIDATE_CHECKPOINT",
             "NAVIGATOR_RELEASE_02_SPECIFICATION_CHECKPOINT",
             "NAVIGATOR_RELEASE_03_CANDIDATE_CHECKPOINT",
             "NAVIGATOR_VIRTUAL_INSTRUMENT_CATALOG_PATH")
    for name in names:
        monkeypatch.delenv(name, raising=False)
    settings = load_settings()
    assert settings.dataset_distribution_manifest_path is None
    assert settings.release_02_candidate_checkpoint_path is None
    assert settings.release_02_specification_checkpoint_path is None
    assert settings.release_03_candidate_checkpoint_path is None
    assert settings.virtual_instrument_catalog_path is None
    monkeypatch.setenv(names[-1], "/explicit/public-catalog.json.gz")
    assert load_settings().virtual_instrument_catalog_path == "/explicit/public-catalog.json.gz"


def test_explicit_missing_distribution_manifest_still_fails(monkeypatch, tmp_path):
    from navigator_app.dataset_distributions import DatasetDistributionCatalog, DatasetDistributionError
    missing = tmp_path / "missing-distribution-manifest.json"
    monkeypatch.setenv("NAVIGATOR_DATASET_DISTRIBUTION_MANIFEST", str(missing))
    settings = load_settings()
    assert settings.dataset_distribution_manifest_path == str(missing)
    with pytest.raises(DatasetDistributionError, match="manifest is missing"):
        DatasetDistributionCatalog.load(settings.dataset_distribution_manifest_path)


def test_pool_max_size_can_be_bounded_for_a_shared_database(monkeypatch):
    monkeypatch.setenv("NAVIGATOR_DB_POOL_MAX_SIZE", "3")
    assert load_settings().db_pool_max_size == 3
    monkeypatch.setenv("NAVIGATOR_DB_POOL_MAX_SIZE", "0")
    with pytest.raises(ValueError, match="NAVIGATOR_DB_POOL_MAX_SIZE"):
        load_settings()
