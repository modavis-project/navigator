"""Read-only access to a deterministic MODAVIS identity-ledger artifact."""

from __future__ import annotations

from functools import lru_cache
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any

from .uri_policy import UriPolicy, decorate_resolution, parse_identifier, validate_alias_slug


LEDGER_CONTRACT = "modavis.identity.ledger/v1"


class IdentityLedgerError(RuntimeError):
    pass


class IdentityLedgerResolver:
    def __init__(
        self,
        path: str | Path,
        *,
        policy: UriPolicy,
        expected_sha256: str | None = None,
        source_release: str | None = None,
    ):
        self.path = Path(path).expanduser().resolve()
        self.policy = policy
        self.source_release = source_release or policy.release_version
        if source_release and source_release != policy.release_version and policy.policy_version != "2":
            raise IdentityLedgerError("a separate source release requires URI policy v2")
        if not self.path.is_file():
            raise IdentityLedgerError(f"identity ledger does not exist: {self.path}")
        if expected_sha256:
            expected = str(expected_sha256).strip().lower()
            if len(expected) != 64 or any(character not in "0123456789abcdef" for character in expected):
                raise IdentityLedgerError("configured identity ledger SHA-256 is invalid")
            if _sha256_file(self.path) != expected:
                raise IdentityLedgerError("configured identity ledger SHA-256 does not match")
        self._verify_contract()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(f"file:{self.path}?mode=ro&immutable=1", uri=True)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only = ON")
        return connection

    def _verify_contract(self) -> None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT value FROM metadata WHERE key = 'contract'"
            ).fetchone()
            if row is None or row["value"] != LEDGER_CONTRACT:
                raise IdentityLedgerError("identity ledger contract is missing or unsupported")
            state = connection.execute(
                "SELECT value FROM metadata WHERE key = 'ledgerState'"
            ).fetchone()
            if state is None or state["value"] != "validated":
                raise IdentityLedgerError("identity ledger is not validated")
            release = connection.execute(
                "SELECT value FROM metadata WHERE key = 'release'"
            ).fetchone()
            if release is None or release["value"] != self.source_release:
                raise IdentityLedgerError("identity ledger release does not match the URI policy")
            effects = connection.execute(
                "SELECT value FROM metadata WHERE key = 'publicationEffectCount'"
            ).fetchone()
            if effects is None:
                artifact_profile = connection.execute(
                    "SELECT value FROM metadata WHERE key = 'artifactProfile'"
                ).fetchone()
                counts = connection.execute(
                    "SELECT value FROM metadata WHERE key = 'counts'"
                ).fetchone()
                try:
                    count_values = json.loads(counts["value"]) if counts else {}
                except (TypeError, ValueError):
                    count_values = {}
                if (
                    artifact_profile is None
                    or artifact_profile["value"] != "public_identifier_ledger"
                    or int(count_values.get("representation", -1)) != 0
                    or int(count_values.get("routeAlias", -1)) != 0
                ):
                    raise IdentityLedgerError(
                        "identity ledger publication effects are missing"
                    )
            elif effects["value"] != "0":
                raise IdentityLedgerError("identity ledger publication effects are nonzero")

    def metadata(self) -> dict[str, Any]:
        with self._connect() as connection:
            values = {
                row["key"]: row["value"]
                for row in connection.execute("SELECT key, value FROM metadata ORDER BY key")
            }
        for key in ("counts", "uriPolicy"):
            if key in values:
                values[key] = json.loads(values[key])
        return values

    def resolve(self, identifier: str) -> dict[str, Any] | None:
        requested = str(identifier or "").strip()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM identifier WHERE identifier_value = ? COLLATE NOCASE",
                (requested,),
            ).fetchone()
            if row is None:
                row = connection.execute(
                    """
                    SELECT target.*
                    FROM binding binding
                    JOIN identifier target
                      ON target.identifier_value = binding.identifier_value
                    WHERE binding.local_identifier_value = ? COLLATE NOCASE
                      AND binding.binding_state = 'active'
                    ORDER BY CASE binding.binding_role
                        WHEN 'domain_specialization' THEN 0
                        WHEN 'legacy_identifier' THEN 1
                        ELSE 2 END,
                        binding.binding_key
                    LIMIT 1
                    """,
                    (requested,),
                ).fetchone()
            if row is None:
                return None
            source_value = row["identifier_value"]
            canonical, redirect = self._canonical_row(connection, source_value)
            representations = [
                dict(item)
                for item in connection.execute(
                    """
                    SELECT profile_key AS profile, media_type AS mediaType,
                           representation_uri AS uri, representation_state AS state
                    FROM representation
                    WHERE identifier_value = ?
                    ORDER BY profile_key, media_type, representation_uri
                    """,
                    (canonical["identifier_value"],),
                )
            ]
            bindings = connection.execute(
                "SELECT count(*) AS count FROM binding WHERE identifier_value = ?",
                (canonical["identifier_value"],),
            ).fetchone()["count"]
        base = {
            "mdvsId": source_value,
            "identityMdvsId": canonical["identifier_value"],
            "entityMdvsId": canonical["identifier_value"],
            "entityType": canonical["canonical_route_kind"],
            "domainKind": canonical["canonical_route_kind"],
            "title": canonical["canonical_label"] or canonical["identifier_value"],
            "pageUrl": canonical["canonical_route"],
            "canonicalRoute": canonical["canonical_route"],
            "canonicalRouteKind": canonical["canonical_route_kind"],
            "canonicalUri": canonical["canonical_uri"],
            "stableUri": canonical["canonical_uri"],
            "publicationState": canonical["publication_state"],
            "validationProfile": canonical["validation_profile"],
            "identityTier": canonical["identity_tier"],
            "bindingCount": bindings,
            "ledgerBacked": True,
        }
        decorated = decorate_resolution(base, requested_identifier=requested, policy=self.policy)
        if representations:
            decorated["representations"] = representations
        if redirect:
            decorated.update(
                {
                    "resolutionStatus": redirect["relation_type"],
                    "redirectStatus": 308,
                    "redirectFrom": source_value,
                    "redirectTo": canonical["identifier_value"],
                }
            )
        else:
            decorated["resolutionStatus"] = "canonical"
        if canonical["publication_state"] in {"retired", "tombstoned"}:
            decorated["httpStatus"] = 410
            decorated["resolutionStatus"] = canonical["publication_state"]
        return decorated

    def resolve_alias(self, alias_kind: str, alias_slug: str) -> dict[str, Any] | None:
        kind = str(alias_kind or "").strip().lower().replace("-", "_")
        slug = validate_alias_slug(alias_slug)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM route_alias WHERE alias_kind = ? AND alias_slug = ?",
                (kind, slug),
            ).fetchone()
            if row is None:
                return None
            result = dict(row)
            if row["alias_state"] == "ambiguous":
                result.update({"httpStatus": 300, "resolutionStatus": "ambiguous"})
                return result
            if row["alias_state"] in {"retired", "tombstoned"}:
                result.update({"httpStatus": 410, "resolutionStatus": row["alias_state"]})
                return result
            target = self.resolve(str(row["target_identifier_value"]))
        if target is None:
            raise IdentityLedgerError("active alias target is missing from the ledger")
        return {
            **result,
            "httpStatus": 308,
            "resolutionStatus": "route_alias",
            "canonical": target,
            "canonicalUri": target["canonicalUri"],
            "canonicalRoute": target["canonicalRoute"],
        }

    @staticmethod
    def _canonical_row(
        connection: sqlite3.Connection, source_identifier: str
    ) -> tuple[sqlite3.Row, sqlite3.Row | None]:
        current = source_identifier
        seen: set[str] = set()
        first_relation: sqlite3.Row | None = None
        for _ in range(32):
            if current in seen:
                raise IdentityLedgerError(f"redirect cycle in validated ledger at {current}")
            seen.add(current)
            relation = connection.execute(
                """
                SELECT * FROM relation
                WHERE source_identifier_value = ?
                  AND relation_type IN ('alias_of', 'merged_into', 'replaced_by')
                  AND relation_state IN ('prepared', 'active')
                ORDER BY relation_key
                LIMIT 1
                """,
                (current,),
            ).fetchone()
            if relation is None:
                row = connection.execute(
                    "SELECT * FROM identifier WHERE identifier_value = ?", (current,)
                ).fetchone()
                if row is None:
                    raise IdentityLedgerError(f"redirect target missing from ledger: {current}")
                return row, first_relation
            if first_relation is None:
                first_relation = relation
            current = relation["target_identifier_value"]
        raise IdentityLedgerError("redirect chain exceeds the fail-closed depth limit")


@lru_cache(maxsize=8)
def cached_ledger_resolver(
    path: str, policy: UriPolicy, expected_sha256: str | None = None, source_release: str | None = None
) -> IdentityLedgerResolver:
    return IdentityLedgerResolver(path, policy=policy, expected_sha256=expected_sha256, source_release=source_release)


def resolve_from_optional_ledger(
    path: str | None,
    identifier: str,
    *,
    policy: UriPolicy,
    expected_sha256: str | None = None,
) -> dict[str, Any] | None:
    if not path:
        return None
    return cached_ledger_resolver(
        str(Path(path).expanduser().resolve()), policy, expected_sha256
    ).resolve(identifier)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
