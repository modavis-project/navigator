"""Small, disposable PostgreSQL fixture using the retained public POD schema."""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
import time
from uuid import uuid4

import psycopg
from psycopg import sql

from navigator_app.config import Settings
from navigator_app.db import close_pools
from navigator_app.fixture_contract import AUTHORITY, CONTRACT, RELEASE
from navigator_app.uri_policy import UriPolicy

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "fixtures/public-mini"
DEFAULT_IMAGE = "postgres:15-bookworm@sha256:5d1d70e254e3c5d7d76847a9deebb18478cd518df37abf6b278d4bdb1fe5d96c"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_inputs(directory=FIXTURE):
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("contract") != CONTRACT or manifest.get("synthetic") is not True:
        raise ValueError("Not a synthetic Navigator fixture")
    for entry in manifest["files"]:
        path = (directory / entry["path"]).resolve()
        if not path.is_relative_to(directory.resolve()) or sha256(path) != entry["sha256"]:
            raise ValueError("Fixture input hash differs: " + entry["path"])
    payload = json.dumps(manifest["files"], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if hashlib.sha256(payload.encode()).hexdigest() != manifest["inputSha256"]:
        raise ValueError("Fixture input manifest digest differs")
    return manifest


def build_ledger(path, records):
    policy = UriPolicy.for_release(RELEASE, canonical_id_base=AUTHORITY,
                                  resolver_base=AUTHORITY, data_base=AUTHORITY, human_base=AUTHORITY)
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.executescript((FIXTURE / "identity-ledger.sql").read_text())
        for table, kind in (("organ", "organ"), ("actor", "person"), ("place", "place")):
            for row in records[table]:
                identifier = row["mdvs_id"]
                _, family, token = identifier.split(":")
                values = (identifier, family, token, "mdvs-v1", "identity", row["canonical_uri"],
                          kind, policy.human_route(kind, identifier), row["label"], "prepared")
                connection.execute("INSERT INTO identifier VALUES (?,?,?,?,?,?,?,?,?,?)", values)
        metadata = {"contract": "modavis.identity.ledger/v1", "ledgerState": "validated",
                    "release": RELEASE, "publicationState": "prepared", "publicationEffectCount": "0",
                    "fixtureProfile": CONTRACT, "counts": "{}", "uriPolicy": json.dumps(policy.as_dict())}
        connection.executemany("INSERT INTO metadata VALUES (?,?)", sorted(metadata.items()))
    return sha256(path)


class FixtureDatabase:
    """Own one container only; never connect to an existing database or volume."""

    def __init__(self, image=DEFAULT_IMAGE):
        self.image = image
        self.name = "modavis-navigator-fixture-" + uuid4().hex[:12]
        self.admin_password = secrets.token_urlsafe(32)
        self.reader_password = secrets.token_urlsafe(32)
        self.private_canary = secrets.token_urlsafe(32)
        self.created = False
        self.removed = False
        allowed = ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "TMPDIR")
        self.env = {key: os.environ[key] for key in allowed if key in os.environ}
        self.env["POSTGRES_PASSWORD"] = self.admin_password

    def docker(self, *args):
        result = subprocess.run(["docker", *args], env=self.env, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(f"Docker {args[0]} failed; check the explicitly selected local image/container")
        return result.stdout.decode().strip()

    def __enter__(self):
        try:
            self.manifest = verify_inputs()
            self.image_id = self.docker("image", "inspect", self.image, "--format", "{{.Id}}")
            self.docker("run", "-d", "--pull=never", "--name", self.name,
                        "--label", "org.modavis.acceptance=navigator", "--memory=1g", "--shm-size=128m",
                        "--tmpfs", "/var/lib/postgresql/data:rw,size=1g", "-e", "POSTGRES_USER=fixture_admin",
                        "-e", "POSTGRES_DB=navigator_fixture", "-e", "POSTGRES_PASSWORD",
                        "-p", "127.0.0.1::5432", self.image_id)
            self.created = True
            address = self.docker("port", self.name, "5432/tcp")
            if not address.startswith("127.0.0.1:") or "\n" in address:
                raise RuntimeError("Fixture requires exactly one loopback port")
            self.admin = dict(host="127.0.0.1", port=int(address.rsplit(":", 1)[1]),
                              dbname="navigator_fixture", user="fixture_admin", password=self.admin_password,
                              connect_timeout=2)
            for attempt in range(100):
                try:
                    with psycopg.connect(**self.admin) as connection:
                        if not 150000 <= connection.info.server_version < 160000:
                            raise RuntimeError("Fixture acceptance requires PostgreSQL 15")
                        self.server_version = connection.info.server_version
                    break
                except psycopg.OperationalError:
                    if attempt == 99:
                        raise RuntimeError("Owned fixture database did not become ready") from None
                    time.sleep(.25)
            self.temporary = tempfile.TemporaryDirectory(prefix="navigator-fixture-")
            self.ledger = Path(self.temporary.name) / "identity-ledger.sqlite"
            records = json.loads((FIXTURE / "records.json").read_text())
            self.ledger_sha256 = build_ledger(self.ledger, records)
            self.seed(records)
            self.settings = Settings(db_host=self.admin["host"], db_port=self.admin["port"],
                db_name=self.admin["dbname"], db_user="fixture_reader", db_password=self.reader_password,
                identifier_ledger_path=str(self.ledger), identifier_ledger_sha256=self.ledger_sha256,
                uri_release_version=RELEASE, uri_policy_version="2", uri_publication_state="prepared",
                public_base_url=AUTHORITY,
                canonical_id_base=AUTHORITY, resolver_base_url=AUTHORITY, linked_data_base_url=AUTHORITY,
                dataset_distribution_manifest_path=None, public_database_manifest_path=str(FIXTURE / "manifest.json"))
            return self
        except BaseException:
            self.close()
            raise

    def seed(self, records):
        with psycopg.connect(**self.admin) as connection:
            for entry in self.manifest["files"]:
                if entry["path"].startswith("schema/"):
                    connection.execute((FIXTURE / entry["path"]).read_text())
            for table, rows in records.items():
                for row in rows:
                    query = sql.SQL("INSERT INTO {}.{} ({}) VALUES ({})").format(
                        sql.Identifier("release_1_5_public"), sql.Identifier(table),
                        sql.SQL(",").join(map(sql.Identifier, row)),
                        sql.SQL(",").join(sql.Placeholder() for _ in row))
                    connection.execute(query, list(row.values()))
            metadata = {"artifact_profile": "public_structured_dataset", "release_version": RELEASE,
                "raw_source_prose_included": "false", "raw_source_media_included": "false",
                "public_postgresql_contract": self.manifest["schemaContract"], "initiator_schema_version": "fixture-pinned",
                "public_catalog_context_contract": "modavis.public-catalog-context/v1",
                "public_entity_export_contract": "modavis.public-entity-export/v1",
                "uri_ledger_sha256": self.ledger_sha256, "fixture_profile": CONTRACT,
                "fixture_manifest_sha256": sha256(FIXTURE / "manifest.json")}
            with connection.cursor() as cursor:
                cursor.executemany("INSERT INTO release_1_5_public.metadata VALUES (%s,%s)", sorted(metadata.items()))
                cursor.executemany("INSERT INTO release_1_5_public.capability VALUES (%s,1,'[]',%s)",
                                   [(key, "Synthetic demonstration fixture") for key in ("catalog", "actors", "events", "places", "entity_exports")])
            connection.execute(sql.SQL("CREATE ROLE fixture_reader LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT").format(sql.Literal(self.reader_password)))
            connection.execute("REVOKE ALL ON DATABASE navigator_fixture FROM PUBLIC")
            connection.execute("GRANT CONNECT ON DATABASE navigator_fixture TO fixture_reader")
            connection.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
            connection.execute("GRANT USAGE ON SCHEMA release_1_5_public TO fixture_reader")
            connection.execute("GRANT SELECT ON ALL TABLES IN SCHEMA release_1_5_public TO fixture_reader")
            connection.execute("ALTER ROLE fixture_reader SET default_transaction_read_only=on")
            # A synthetic forbidden record tests the read boundary without any
            # private POD input. This is not part of the public projection.
            connection.execute("CREATE SCHEMA fixture_private_canary")
            connection.execute("CREATE TABLE fixture_private_canary.record (token text NOT NULL)")
            connection.execute("INSERT INTO fixture_private_canary.record VALUES (%s)", (self.private_canary,))

    def close(self):
        close_pools()
        if self.created and not self.removed:
            self.docker("rm", "-f", self.name)
            self.removed = True
        if hasattr(self, "temporary"):
            self.temporary.cleanup()

    def __exit__(self, *_exc):
        self.close()
