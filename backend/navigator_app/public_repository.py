"""Read-only Navigator adapter for the publication-safe POD 1.5 database.

This module intentionally knows only ``release_1_5_public``.  Keeping the
public profile separate from the full repository makes an accidental query of
restricted source prose, media, review state, or operational tables impossible
when Navigator is booted from the Zenodo database artifact.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Mapping
from pathlib import Path
from itertools import zip_longest
from functools import lru_cache
from threading import Lock
from typing import Any
from urllib.parse import quote

from .temperament_lookup import search_temperaments
from . import public_specifications
from .public_catalog_context import PublicCatalogContext, catalogue_path
from .config import Settings
from .public_source_actors import PublicSourceActorsMixin
from .public_actor_pages import PublicActorPagesMixin
from .public_actor_directory import PublicActorDirectoryMixin
from .db import connect
from .identity_ledger import IdentityLedgerError, cached_ledger_resolver
from .map_projection import COMPACT_EXACT_SELECTION_TOLERANCE
from .map_tiles import (
    WEB_MERCATOR_RADIUS,
    public_map_tile_bounds,
    public_map_tile_grid_size,
)
from .pipework import (
    apply_register_pipe_quantities,
    build_pipework_read_model,
    merge_pipework_read_models,
)
from .uri_policy import UriPolicy


SCHEMA = "release_1_5_public"
PROFILE = "pod-1.5-public"
CONTRACT = "modavis.release-1.5-public-postgresql/v4"
RELEASE_CONTRACTS = {
    "1.5.0": ("1.5", CONTRACT),
    "1.5.1": ("1.5.1", "modavis.release-1.5-public-postgresql/v5"),
    "1.5.2": ("1.5.2", "modavis.release-1.5-public-postgresql/v6"),
    "1.5.3": ("1.5.3", "modavis.release-1.5-public-postgresql/v7"),
    "1.5.4": ("1.5.4", "modavis.release-1.5-public-postgresql/v8"),
    "1.5.5": ("1.5.5", "modavis.release-1.5-public-postgresql/v8"),
    "1.6.0": ("1.6.0", "modavis.release-1.5-public-postgresql/v8"),
}
# POD 1.6 changes source assertions without minting or merging identities.
# Its independently versioned identity input is the exact accepted public ledger.
INHERITED_IDENTITY_LEDGER = {
    "1.6.0": ("1.5.5", "8be027fddeb9597141ac87b28be028afdced18b1f5423cf9f629673dd8167192"),
}
GDO_LITERATURE_CATALOG_URL = "https://www.gdo.de/recherchen/literaturdatenbank"
COMPONENT_GROUP_IDS = {
    "division": "divisions",
    "stop": "stops",
    "coupler": "couplers",
    "accessory": "accessories",
    "source_note": "source_notes",
    "keyboard": "keyboards",
    "compound_stop": "compound_stops",
}
COMPONENT_GROUP_LABELS = {
    "divisions": "Divisions / works",
    "stops": "Stops / registers",
    "couplers": "Couplers",
    "accessories": "Accessories",
    "source_notes": "Source notes · segmentation unresolved",
    "keyboards": "Keyboards",
    "compound_stops": "Compound-stop compositions",
}
COMPONENT_GROUP_ORDER = (
    "divisions", "keyboards", "stops", "compound_stops", "couplers", "accessories"
)


def _organ_page_route(mdvs_id: Any) -> str:
    token = str(mdvs_id or "").removeprefix("MDVS:ENTY:")
    return f"/organs/{quote(token, safe='-._~')}"


def _json(value: Any, fallback: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value) if value not in (None, "") else fallback
    except (TypeError, ValueError):
        return fallback


def _bounded(value: Any, default: int, maximum: int = 100) -> int:
    try:
        return max(1, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def _first_text(*values: Any, fallback: str = "") -> str:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return fallback


def _public_literature_source_url(value: Any) -> str | None:
    url = _first_text(value)
    if not url:
        return None
    if url.rstrip("/").casefold() == "https://literaturdb.gdo.de/bib.php":
        return GDO_LITERATURE_CATALOG_URL
    return url


def _temperament_match_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    text = text.replace("ß", "ss")
    text = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(re.findall(r"[a-z0-9]+", text))


def _temperament_family_term(temperament: Mapping[str, Any]) -> str | None:
    title = _first_text(
        temperament.get("title"), temperament.get("label"), temperament.get("tuningId")
    )
    ignored = {
        "temperament", "temperatur", "stimmung", "stufige", "genauer",
        "nach", "fuer", "für", "eine", "einen",
    }
    for word in re.findall(r"[^\W\d_]+", title, flags=re.UNICODE):
        key = _temperament_match_key(word)
        if len(key) >= 4 and key not in ignored:
            return word
    return _first_text(temperament.get("label"), temperament.get("tuningId")) or None


def _temperament_source_match_kind(
    source_value: Any, temperament: Mapping[str, Any]
) -> str | None:
    source_key = _temperament_match_key(source_value)
    if not source_key:
        return None
    exact_keys = {
        _temperament_match_key(value)
        for value in (
            temperament.get("id"), temperament.get("tuningId"),
            temperament.get("label"), temperament.get("title"),
        )
        if _first_text(value)
    }
    without_year = " ".join(
        re.sub(r"\b(?:1[0-9]{3}|20[0-9]{2})\b", "", source_key).split()
    )
    if source_key in exact_keys or without_year in exact_keys:
        return "exact_variant"
    family_key = _temperament_match_key(_temperament_family_term(temperament))
    return "family_wording" if family_key and family_key in source_key else None


def _date_claims(value: Any) -> list[dict[str, Any]]:
    """Normalize the exported structured date JSON for Navigator display."""
    parsed = _json(value, [])
    if not isinstance(parsed, list):
        return []
    claims: list[dict[str, Any]] = []
    for item in parsed:
        if isinstance(item, Mapping):
            expression = str(item.get("expression") or "").strip()
            start_year = item.get("startYear")
            end_year = item.get("endYear")
            if not expression:
                if start_year is not None and end_year is not None and start_year != end_year:
                    expression = f"{start_year}–{end_year}"
                elif start_year is not None:
                    expression = str(start_year)
                elif end_year is not None:
                    expression = str(end_year)
            if not expression:
                continue
            approximate = bool(item.get("approximate"))
            display = f"≈ {expression}" if approximate else expression
            claims.append(
                {
                    "display": display,
                    "expression": expression,
                    "startYear": start_year,
                    "endYear": end_year,
                    "approximate": approximate,
                    "kind": str(item.get("kind") or "source_date"),
                    "startDate": item.get("startDate"), "endDate": item.get("endDate"),
                }
            )
            continue
        expression = str(item).strip()
        if expression:
            claims.append(
                {
                    "display": expression,
                    "expression": expression,
                    "startYear": None,
                    "endYear": None,
                    "approximate": False,
                    "kind": "source_date",
                }
            )
    return claims


def _year_values(value: Any) -> list[int]:
    years: list[int] = []
    for claim in _date_claims(value):
        for candidate in (claim.get("startYear"), claim.get("endYear")):
            try:
                year = int(candidate)
            except (TypeError, ValueError):
                continue
            if 500 <= year <= 2200 and year not in years:
                years.append(year)
    return years


class PublicReleaseRepository(PublicActorDirectoryMixin, PublicActorPagesMixin, PublicSourceActorsMixin, PublicCatalogContext):
    """Fail-closed query layer for the Zenodo-reproducible public profile."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.policy = UriPolicy.from_settings(settings)
        self._metadata_cache: dict[str, str] | None = None
        self._capability_cache: tuple[str, ...] | None = None
        self._organ_facets_cache: dict[str, Any] | None = None
        self._organ_facets_cache_lock = Lock()
        self._literature_facets_cache: dict[str, Any] | None = None
        self._literature_facets_cache_lock = Lock()
        self._tuning_system_cache: list[dict[str, Any]] | None = None
        self._tuning_system_cache_lock = Lock()
        self._score_facets_cache: dict[str, Any] | None = None
        self._score_facets_cache_lock = Lock()

    @property
    def source_release_version(self) -> str:
        settings = getattr(self, "settings", None)
        return getattr(settings, "public_source_release_version", None) or self.policy.release_version

    def _metadata(self, *, refresh: bool = False) -> dict[str, str]:
        if self._metadata_cache is None or refresh:
            with connect(self.settings) as conn:
                rows = conn.execute(
                    f"select key, value from {SCHEMA}.metadata order by key"
                ).fetchall()
            self._metadata_cache = {str(row["key"]): str(row["value"]) for row in rows}
        return dict(self._metadata_cache)

    def capabilities(self, *, refresh: bool = False) -> list[str]:
        if self._capability_cache is None or refresh:
            with connect(self.settings) as conn:
                rows = conn.execute(
                    f"select capability_key from {SCHEMA}.capability where enabled=1 order by capability_key"
                ).fetchall()
            self._capability_cache = tuple(str(row["capability_key"]) for row in rows)
        return list(self._capability_cache)

    def _ledger(self):
        path = self.settings.identifier_ledger_path
        if not path:
            raise IdentityLedgerError("the public identifier ledger is required")
        ledger_release = self.source_release_version
        inherited = INHERITED_IDENTITY_LEDGER.get(ledger_release)
        if inherited:
            if (self.settings.identifier_ledger_sha256 or "").lower() != inherited[1]:
                raise IdentityLedgerError("POD 1.6.0 requires its exact retained 1.5.5 identity ledger")
            ledger_release = inherited[0]
        return cached_ledger_resolver(
            str(Path(path).expanduser().resolve()),
            self.policy,
            self.settings.identifier_ledger_sha256,
            ledger_release,
        )

    def assert_ready(self) -> dict[str, Any]:
        metadata = self._metadata(refresh=True)
        required = {
            "artifact_profile": "public_structured_dataset",
            "raw_source_prose_included": "false",
            "raw_source_media_included": "false",
        }
        failures = [
            f"{key}={metadata.get(key)!r} (expected {expected!r})"
            for key, expected in required.items()
            if metadata.get(key) != expected
        ]
        contract = metadata.get("public_postgresql_contract")
        description_contract = metadata.get("specification_description_contract")
        if description_contract and description_contract != public_specifications.CONTRACT:
            failures.append("unsupported specification description contract")
        if metadata.get("public_catalog_context_contract") not in {None, "", "modavis.public-catalog-context/v1"}:
            failures.append("unsupported public catalogue context contract")
        if metadata.get("release_version") == "1.5.2" and not self._has_catalog_context():
            failures.append("Release 1.5.2 catalogue context is missing")
        if metadata.get("release_version") in {"1.5.3", "1.5.4", "1.5.5", "1.6.0"} and not self._has_entity_exports():
            failures.append("Entity export tables are missing")
        expected = RELEASE_CONTRACTS.get(metadata.get("release_version"))
        if self.source_release_version != self.policy.release_version and self.policy.policy_version != "2":
            failures.append("a separate source release requires URI policy v2")
        if expected != (self.source_release_version, contract):
            failures.append("database release, URI release, and PostgreSQL contract differ")
        expected_ledger = (self.settings.identifier_ledger_sha256 or "").lower()
        imported_ledger = (metadata.get("uri_ledger_sha256") or "").lower()
        if not expected_ledger or imported_ledger != expected_ledger:
            failures.append("database and configured public identity-ledger SHA-256 differ")
        try:
            ledger_metadata = self._ledger().metadata()
        except IdentityLedgerError as exc:
            failures.append(str(exc))
            ledger_metadata = {}
        manifest_path = self.settings.public_database_manifest_path
        if manifest_path:
            path = Path(manifest_path).expanduser().resolve()
            if not path.is_file():
                failures.append(f"public database manifest is missing: {path}")
            else:
                manifest = json.loads(path.read_text(encoding="utf-8"))
                manifest_profile = manifest.get("dataProfile") or manifest.get("profile")
                if manifest_profile not in {PROFILE, "public_structured_dataset"}:
                    failures.append("public database manifest profile is unsupported")
                if manifest.get("releaseVersion") != metadata.get("release_version"):
                    failures.append("public database manifest release differs")
                manifest_ledger = str(
                    manifest.get("identifierLedgerSha256")
                    or (manifest.get("identifierLedger") or {}).get("sha256")
                    or ""
                ).lower()
                if manifest_ledger and manifest_ledger != expected_ledger:
                    failures.append("public database manifest ledger hash differs")
        if failures:
            raise RuntimeError("public release profile is not ready: " + "; ".join(failures))
        if self.source_release_version in {"1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5", "1.6.0"}:
            self.organ_facets()
        return {
            "ok": True,
            "profile": PROFILE,
            "release": metadata["release_version"],
            "capabilities": self.capabilities(refresh=True),
            "ledgerContract": ledger_metadata.get("contract"),
        }

    def database_status(self) -> dict[str, Any]:
        metadata = self._metadata()
        with connect(self.settings) as conn:
            counts = conn.execute(
                f"""
                select 'organs' as key, count(*)::int as count from {SCHEMA}.organ
                union all select 'actors', count(*)::int from {SCHEMA}.actor
                union all select 'events', count(*)::int from {SCHEMA}.documented_event
                union all select 'places', count(*)::int from {SCHEMA}.place
                union all select 'virtualInstruments', count(*)::int from {SCHEMA}.virtual_instrument
                union all select 'literature', count(*)::int from {SCHEMA}.literature_publication
                union all select 'tuningSystems', count(*)::int from {SCHEMA}.tuning_system
                union all select 'digitalScores', count(*)::int from {SCHEMA}.digital_score
                union all select 'scoreAnalyses', count(*)::int from {SCHEMA}.digital_score_analysis
                order by key
                """
            ).fetchall()
        return {
            "ok": True,
            "dataProfile": PROFILE,
            "release": metadata.get("release_version"),
            "rightsProfile": metadata.get("rights_profile_id"),
            "counts": {row["key"]: row["count"] for row in counts},
            "capabilities": self.capabilities(),
            "readOnly": True,
        }

    def ping(self) -> None:
        with connect(self.settings) as conn:
            conn.execute("select 1").fetchone()

    def release_context(self) -> dict[str, Any]:
        active = self.policy.publication_state == "active"
        return {
            "releaseVersion": self.policy.release_version,
            "sourceReleaseVersion": self.source_release_version,
            "identityLedgerReleaseVersion": INHERITED_IDENTITY_LEDGER.get(
                self.source_release_version, (self.source_release_version, None))[0],
            "releaseState": (
                "public_release_active"
                if active
                else "public_reproducibility_projection"
            ),
            "publicationAuthorized": active,
            "publicationLabel": "Public dataset" if active else "Prepared dataset",
            "usageScope": "Structured public pipe-organ records",
            "readOnly": True,
            "guideUrl": "/about/release",
            "documentationUrl": "",
            "documentationPolicy": "Citation and download information is distributed with the dataset record.",
            "title": "About the MODAVIS Pipe Organ Dataset",
            "summary": (
                "Navigator makes documented pipe organs and their connected people, "
                "places, events, specifications, and virtual instruments easier to explore."
            ),
            "changeFocus": (
                "Search the catalog, follow relationships between records, compare documented "
                "histories and specifications, and explore coordinate-backed places on the map."
            ),
            "dataProfile": PROFILE,
            "capabilities": self.capabilities(),
            "publicHighlights": [
                "Pipe-organ records with stable MODAVIS identifiers and links between related records.",
                "Documented builders, people, organizations, places, events, and structured specifications.",
                "Source citations, map locations with stated precision, and evidence-aware data stories.",
                "Source-backed digital score editions with linked formats and a bounded set of precomputed musical ranges.",
            ],
            "excludedFromPublicView": [
                "Restricted source prose and source media that are not licensed for public redistribution.",
                "Reviewer decisions, processing outcomes, internal provenance, and operational diagnostics.",
                "Accounts, contributions, moderation tools, and all write workflows.",
            ],
            "limitations": [
                "Coverage reflects the sources represented in this dataset; it is not a complete census of pipe organs.",
                "Historical dates, events, names, and specifications report documented evidence and may be incomplete or uncertain.",
                "Map markers use the best published coordinate evidence; the stated precision should be considered before interpretation.",
            ],
            "countDefinitions": [],
        }

    def resolve_mdvs_id(self, identifier: str) -> dict[str, Any] | None:
        return self._ledger().resolve(identifier)

    def resolve_route_alias(self, kind: str, slug: str) -> dict[str, Any] | None:
        return self._ledger().resolve_alias(kind, slug)

    def publication_status(self, identifier: str) -> dict[str, Any] | None:
        resolved = self.resolve_mdvs_id(identifier)
        if not resolved:
            return None
        return {
            "ok": True,
            "mdvsId": resolved.get("identityMdvsId") or resolved.get("mdvsId"),
            "status": "published",
            "publicationState": resolved.get("publicationState") or self.policy.publication_state,
            "publicationAuthorized": self.policy.publication_state == "active",
            "canonicalUri": resolved.get("canonicalUri"),
            "release": self.policy.release_version,
            "readOnly": True,
        }

    @staticmethod
    def _organ_card(row: Mapping[str, Any]) -> dict[str, Any]:
        coordinate = (
            {"lat": float(row["latitude"]), "lon": float(row["longitude"])}
            if row.get("latitude") is not None and row.get("longitude") is not None
            else None
        )
        place = row.get("place_label")
        builder = row.get("builder_label")
        mdvs_id = str(row["mdvs_id"])
        precision = row.get("precision")
        layer = row.get("marker_layer") if coordinate else None
        location_state, location_label = {
            "current_exact": ("coordinates", "Exact current location"),
            "current_fallback": ("fallback_coordinates", "Approximate current location"),
            "historical": ("historical_coordinates", "Historical location only"),
        }.get(layer, ("missing", "Location not available"))
        return {
            "id": mdvs_id,
            "mdvsId": mdvs_id,
            "targetMdvsId": mdvs_id,
            "pageUrl": _organ_page_route(mdvs_id),
            "catalogReference": mdvs_id,
            "catalogState": "linked",
            "canonicalProjectionAllowed": True,
            "publicationAllowed": True,
            "title": row.get("label") or mdvs_id,
            "summary": f"Documented in {int(row.get('source_count') or 0)} source collection(s).",
            "location": place,
            "coordinates": coordinate,
            "locationReadiness": {
                "state": location_state,
                "label": location_label,
                "georeferenceStatus": str(row.get("coordinate_state") or location_state),
                "hasTextLocation": bool(place),
                "hasStructuredLocation": bool(row.get("place_mdvs_id")),
                "hasCoordinates": bool(coordinate),
                "coordinatePrecision": precision,
                "coordinateFallback": layer == "current_fallback",
                "coordinateSource": row.get("coordinate_source"),
            },
            "builder": builder,
            "builderMdvsId": row.get("builder_mdvs_id"),
            "builderUrl": row.get("builder_url"),
            "placeMdvsId": row.get("place_mdvs_id"),
            "placeUrl": row.get("place_url"),
            "dateLabel": row.get("date_label"),
            "status": "Published structured record",
            "certainty": "Source-supported",
            "sourceCount": int(row.get("source_count") or 0),
            "sourceLabel": row.get("source_text"),
            "mediaCount": int(row.get("media_count") or 0),
            "documentCount": int(row.get("document_count") or 0),
            "heroImage": None,
            "specification": {"stops": row.get("stop_count")},
        }

    def _stop_total_expression(self):
        from .public_aggregate_quality import stop_total_expression
        return stop_total_expression(self._metadata().get("aggregate_quality_contract") == "modavis.aggregate-quality/v1")

    def _organ_select(self, candidate_sql: str | None = None) -> str:
        organ_source = (
            f"({candidate_sql}) o"
            if candidate_sql
            else f"{SCHEMA}.organ o"
        )
        media_columns = "coalesce(m.media_count,0)::int as media_count, coalesce(m.document_count,0)::int as document_count," if self._has_entity_exports() else "0::int as media_count, 0::int as document_count,"
        media_join = (f"""left join lateral (
                select count(*)::int as media_count,
                       count(*) filter(where media_kind='document')::int as document_count
                from {SCHEMA}.public_media_reference where organ_mdvs_id=o.mdvs_id
            ) m on true""" if self._has_entity_exports() else "")
        return f"""
            select o.*,
                   p.preferred_label as place_label,
                   p.place_mdvs_id, p.place_uri as place_url,
                   c.latitude, c.longitude, c.precision, c.coordinate_state,
                   c.marker_layer, c.coordinate_source,
                   b.actor_mdvs_id as builder_mdvs_id,
                   a.label as builder_label, a.canonical_uri as builder_uri,
                   case when a.actor_type='organization'
                        then '/organizations/' || replace(a.mdvs_id, 'MDVS:ENTY:', '')
                        else '/people/' || replace(a.mdvs_id, 'MDVS:ENTY:', '') end as builder_url,
                   sd.source_text,
                   {media_columns}
                   tf.stop_count, tf.stop_assertion_count,
                   null::text as date_label
            from {organ_source}
            left join lateral (
                select preferred_label, place_mdvs_id, place_uri
                from {SCHEMA}.place_assertion
                where organ_mdvs_id=o.mdvs_id and temporal_scope='current'
                order by (place_mdvs_id is not null) desc, assertion_id limit 1
            ) p on true
            left join lateral (
                select latitude, longitude, precision, coordinate_state, marker_layer, coordinate_source
                from {SCHEMA}.coordinate_assertion
                where organ_mdvs_id=o.mdvs_id and latitude is not null and longitude is not null
                order by case marker_layer when 'current_exact' then 0
                         when 'current_fallback' then 1 when 'historical' then 2 else 3 end,
                         source_organ_mdvs_id limit 1
            ) c on true
            left join lateral (
                select actor_mdvs_id from {SCHEMA}.organ_builder
                where organ_mdvs_id=o.mdvs_id order by assertion_count desc, actor_mdvs_id limit 1
            ) b on true
            left join {SCHEMA}.actor a on a.mdvs_id=b.actor_mdvs_id
            left join {SCHEMA}.organ_search_document sd on sd.organ_mdvs_id=o.mdvs_id
            {media_join}
            left join lateral (
                select {self._stop_total_expression()} as stop_count, count(*) as stop_assertion_count from {SCHEMA}.technical_fact
                where organ_mdvs_id=o.mdvs_id and family='stop_total'
            ) tf on true
        """

    @staticmethod
    def _organ_filter_sql(
        *, query: str | None = None, source: str | None = None,
        builder: str | None = None, location_state: str | None = None,
        media_state: str | None = None, conflict_scope: str | None = None,
        specification_state: str | None = None, event_type: str | None = None,
        virtual_instrument: str | None = None,
        organ_ids: tuple[str, ...] | None = None,
    ) -> tuple[list[str], dict[str, Any]]:
        """Apply every catalogue constraint to the same canonical organ."""
        clauses: list[str] = []
        params: dict[str, Any] = {}
        if organ_ids is not None:
            clauses.append("o.mdvs_id=any(%(organ_ids)s)")
            params["organ_ids"] = list(organ_ids)
        search_clauses = []
        for key, value, column in (
            ("query", query, "search_text"), ("builder", builder, "builder_text")
        ):
            if value and value.strip():
                if key == "builder" and value.strip().startswith("MDVS:ENTY:"):
                    clauses.append(
                        f"exists(select 1 from {SCHEMA}.organ_builder b "
                        "where b.organ_mdvs_id=o.mdvs_id and b.actor_mdvs_id=%(builder_id)s)"
                    )
                    params["builder_id"] = value.strip()
                    continue
                search_clauses.append(f"sd.{column} ilike %({key})s")
                params[key] = f"%{value.strip()}%"
        if search_clauses:
            clauses.append(
                f"exists(select 1 from {SCHEMA}.organ_search_document sd "
                "where sd.organ_mdvs_id=o.mdvs_id and " + " and ".join(search_clauses) + ")"
            )
        if source:
            clauses.append(
                f"exists(select 1 from {SCHEMA}.source_membership sm "
                "where sm.organ_mdvs_id=o.mdvs_id and sm.source_key=%(source)s)"
            )
            params["source"] = source.strip()
        coordinate = (
            f"select 1 from {SCHEMA}.coordinate_assertion c "
            "where c.organ_mdvs_id=o.mdvs_id and c.latitude is not null and c.longitude is not null"
        )
        if location_state == "coordinates":
            clauses.append(f"exists({coordinate} and c.marker_layer='current_exact')")
        elif location_state == "fallback_coordinates":
            clauses.extend([
                f"exists({coordinate} and c.marker_layer='current_fallback')",
                f"not exists({coordinate} and c.marker_layer='current_exact')",
            ])
        elif location_state == "historical_coordinates":
            clauses.extend([
                f"exists({coordinate} and c.marker_layer='historical')",
                f"not exists({coordinate} and c.marker_layer in ('current_exact','current_fallback'))",
            ])
        elif location_state in {"missing", "needs_georeferencing"}:
            clauses.append(f"not exists({coordinate})")
        if media_state in {"with_media", "available"}:
            clauses.append(f"exists(select 1 from {SCHEMA}.public_media_reference media where media.organ_mdvs_id=o.mdvs_id)")
        if conflict_scope in {"material", "material_technical_disagreement"}:
            clauses.append(f"exists(select 1 from {SCHEMA}.technical_conflict x where x.organ_mdvs_id=o.mdvs_id)")
        if specification_state in {"structured", "available"}:
            clauses.append(
                f"(exists(select 1 from {SCHEMA}.specification_component x where x.organ_mdvs_id=o.mdvs_id) "
                f"or exists(select 1 from {SCHEMA}.technical_fact x where x.organ_mdvs_id=o.mdvs_id))"
            )
        elif specification_state == "stops":
            clauses.append(f"exists(select 1 from {SCHEMA}.specification_component x where x.organ_mdvs_id=o.mdvs_id and x.component_type='stop')")
        if event_type:
            clauses.append(f"exists(select 1 from {SCHEMA}.documented_event x where x.organ_mdvs_id=o.mdvs_id and coalesce(x.controlled_event_type,x.source_event_type,'unspecified')=%(event_type)s)")
            params["event_type"] = event_type
        if virtual_instrument in {"yes", "no"}:
            exists = f"exists(select 1 from {SCHEMA}.organ_virtual_instrument vi where vi.organ_mdvs_id=o.mdvs_id and vi.resolution_state='accepted_canonical_organ_relation')"
            clauses.append(exists if virtual_instrument == "yes" else f"not {exists}")
        return clauses, params

    @lru_cache(maxsize=128)
    def list_organs(
        self,
        *,
        query: str | None = None,
        source: str | None = None,
        builder: str | None = None,
        location_state: str | None = None,
        media_state: str | None = None,
        conflict_scope: str | None = None,
        specification_state: str | None = None,
        event_type: str | None = None,
        virtual_instrument: str | None = None,
        sort: str | None = None,
        limit: int = 30,
        offset: int = 0,
        include_facets: bool = False,
        **_: Any,
    ) -> dict[str, Any]:
        # Public release databases are frozen. Keep bounded pages keyed by this
        # repository and every query argument, including pagination and filters.
        limit = _bounded(limit, 30)
        offset = max(0, int(offset or 0))
        clauses, params = self._organ_filter_sql(
            query=query, source=source, builder=builder, location_state=location_state,
            media_state=media_state, conflict_scope=conflict_scope,
            specification_state=specification_state, event_type=event_type, virtual_instrument=virtual_instrument,
        )
        params.update(limit=limit, offset=offset)
        where = "where " + " and ".join(clauses) if clauses else ""
        sort_key = str(sort or "stops").strip().lower()
        stop_count_join = ""
        candidate_prefix = ""
        if sort_key == "stops":
            # Release 1.5 contains comparatively few asserted stop totals.  Aggregate
            # that bounded subset once, rank the organ candidates, and only then run
            # the richer lateral joins in ``_organ_select``.  This keeps the public
            # default evidence-based without returning to the former all-row lateral
            # enrichment plan.
            candidate_prefix = f"""
                with stop_counts as materialized (
                    select organ_mdvs_id,
                           {self._stop_total_expression()} as stop_count
                    from {SCHEMA}.technical_fact
                    where family='stop_total'
                    group by organ_mdvs_id
                )
            """
            stop_count_join = "left join stop_counts sc on sc.organ_mdvs_id=o.mdvs_id"
            order = "sc.stop_count desc nulls last, lower(o.label), o.mdvs_id"
        elif sort_key == "sources":
            order = "o.source_count desc, lower(o.label), o.mdvs_id"
        elif sort_key == "media":
            order = f"(select count(*) from {SCHEMA}.public_media_reference media where media.organ_mdvs_id=o.mdvs_id) desc, lower(o.label), o.mdvs_id"
        else:
            order = "lower(o.label), o.mdvs_id"
        candidate_sql = f"""{candidate_prefix}
            select o.*
            from {SCHEMA}.organ o
            {stop_count_join}
            {where}
            order by {order}
            limit %(limit)s offset %(offset)s
        """
        page_select = self._organ_select(candidate_sql)
        with connect(self.settings) as conn:
            total = conn.execute(
                f"""select count(*)::int as count
                    from {SCHEMA}.organ o
                    {where}""",
                params,
            ).fetchone()["count"]
            rows = conn.execute(
                page_select,
                params,
            ).fetchall()
        result = {
            "items": [self._organ_card(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "filters": {"query": query or "", "source": source or "", "builder": builder or ""},
            "source": "release_1_5_public",
        }
        if include_facets:
            result["facets"] = self.organ_facets()
        return result

    def organ_facets(self, **_: Any) -> dict[str, Any]:
        with self._organ_facets_cache_lock:
            if self._organ_facets_cache is not None:
                return dict(self._organ_facets_cache)
            with connect(self.settings) as conn:
                sources = conn.execute(
                    f"select source_key as value, count(distinct organ_mdvs_id)::int as count from {SCHEMA}.source_membership group by source_key order by source_key"
                ).fetchall()
                builders = conn.execute(
                    f"""select a.label as value, count(distinct b.organ_mdvs_id)::int as count
                        from {SCHEMA}.organ_builder b join {SCHEMA}.actor a on a.mdvs_id=b.actor_mdvs_id
                        group by a.label order by count desc, a.label limit 250"""
                ).fetchall()
                events = conn.execute(
                    f"""select coalesce(controlled_event_type, source_event_type, 'unspecified') as value,
                               count(distinct organ_mdvs_id)::int as count
                        from {SCHEMA}.documented_event group by 1 order by count desc, value"""
                ).fetchall()
                periods = conn.execute(
                    f"""select bucket.value, count(*)::int as count
                        from {SCHEMA}.organ o
                        cross join lateral jsonb_array_elements_text(
                            coalesce(nullif(o.period_buckets_json, ''), '[]')::jsonb
                        ) bucket(value)
                        group by bucket.value order by bucket.value"""
                ).fetchall()
                conflicts = conn.execute(
                    f"select count(distinct organ_mdvs_id)::int as count from {SCHEMA}.technical_conflict"
                ).fetchone()["count"]
                structured = conn.execute(
                    f"""select count(*)::int as count from (
                            select organ_mdvs_id from {SCHEMA}.specification_component
                            union
                            select organ_mdvs_id from {SCHEMA}.technical_fact
                        ) specification_coverage"""
                ).fetchone()["count"]
                locations = conn.execute(
                    f"""select coalesce(c.priority, 3) as priority, count(*)::int as count
                        from {SCHEMA}.organ o
                        left join (
                            select organ_mdvs_id, min(case marker_layer
                                when 'current_exact' then 0 when 'current_fallback' then 1
                                when 'historical' then 2 else 3 end) as priority
                            from {SCHEMA}.coordinate_assertion
                            where latitude is not null and longitude is not null
                            group by organ_mdvs_id
                        ) c on c.organ_mdvs_id=o.mdvs_id
                        group by coalesce(c.priority, 3) order by priority"""
                ).fetchall()
                organ_count = conn.execute(
                    f"select count(*)::int as count from {SCHEMA}.organ"
                ).fetchone()["count"]
                media = conn.execute(
                    f"""select count(distinct organ_mdvs_id)::int as organs,count(*)::int as items
                        from {SCHEMA}.public_media_reference"""
                ).fetchone() if self._has_entity_exports() else {"organs": 0, "items": 0}

            def facet(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
                return [
                    {
                        key: str(row["value"]),
                        "label": str(row["value"]),
                        "count": int(row["count"]),
                    }
                    for row in rows
                ]

            self._organ_facets_cache = {
                "sources": facet(sources, "source"),
                "builders": facet(builders, "builder"),
                "countries": [],
                "institutions": [],
                "locationStates": [
                    {
                        "state": ("coordinates", "fallback_coordinates", "historical_coordinates", "missing")[row["priority"]],
                        "label": ("Exact current location", "Approximate current location", "Historical location only", "No coordinates")[row["priority"]],
                        "count": int(row["count"]),
                    }
                    for row in locations
                ],
                "mediaStates": ([{"state": "with_media", "label": "With source media references", "count": int(media["organs"])}]
                                if int(media["organs"]) else []),
                "periodBuckets": [
                    {"bucket": str(row["value"]), "label": str(row["value"]), "count": int(row["count"])}
                    for row in periods
                ],
                "reviewStates": [],
                "statuses": [{"status": "published_structured_record", "label": "Published structured record", "count": int(organ_count)}],
                "sourceCountBuckets": [],
                "evidenceStates": [],
                "conflictScopes": [{"scope": "material", "label": "Material technical disagreement", "count": conflicts}],
                "specificationStates": [{"state": "structured", "label": "Specification or technical facts", "count": structured}],
                "stopCountBuckets": [],
                "eventTypes": facet(events, "code"),
                "historyStates": [],
                "mediaKinds": ([{"kind": "all", "label": "Source media references", "count": int(media["items"])}]
                               if int(media["items"]) else []),
            }
            return dict(self._organ_facets_cache)

    def explore(self, *, query: str = "", limit: int = 8, **_: Any) -> dict[str, Any]:
        organs = self.list_organs(query=query or None, limit=limit, include_facets=False)
        mapped = self.list_organs(query=query or None, location_state="coordinates", limit=min(limit, 12))
        with connect(self.settings) as conn:
            source_count = conn.execute(
                f"select count(*)::int as count from {SCHEMA}.source_membership"
            ).fetchone()["count"]
        return {
            "query": query,
            "counts": {
                "organs": organs["total"],
                "sourceEvidence": source_count,
                "unreviewedContributions": 0,
                "georeferencingBacklog": 0,
            },
            "featuredOrgans": organs["items"][:6],
            "recentOrgans": organs["items"],
            "mapItems": [
                {key: item.get(key) for key in ("id", "mdvsId", "title", "location", "coordinates", "certainty")}
                for item in mapped["items"]
            ],
            "georeferencingItems": [],
            "georeferencingQueue": {"limit": 0, "offset": 0, "visible": 0, "total": 0, "hasMore": False},
            "filters": [
                {"id": "place", "label": "Place", "available": True},
                {"id": "period", "label": "Period", "available": True},
                {"id": "builder", "label": "Builder", "available": True},
                {"id": "status", "label": "Status", "available": True},
                {"id": "media", "label": "Media", "available": self._has_entity_exports()},
            ],
        }

    def entity_search(self, *, query: str, limit: int = 12) -> dict[str, Any]:
        limit = _bounded(limit, 12)
        organs = self.list_organs(query=query, limit=limit, include_facets=False)["items"]
        actors = self.list_persons(query=query, limit=limit)["items"]
        organ_items = [
            {
                "kind": "canonical_organ",
                "entityType": "organ",
                "searchGroup": "organs",
                "searchGroupLabel": "Pipe organs",
                "targetId": item["mdvsId"],
                "mdvsId": item["mdvsId"],
                "title": item["title"],
                "summary": item.get("summary"),
                "url": item.get("pageUrl"),
                "badges": ["Organ"],
            }
            for item in organs
        ]
        actor_items = [
            {
                "kind": "canonical_actor",
                "entityType": item.get("entityClass") or "person",
                "searchGroup": "people",
                "searchGroupLabel": "People and builders",
                "targetId": item.get("mdvsId"),
                "mdvsId": item.get("mdvsId"),
                "title": item["title"],
                "summary": item.get("summary"),
                "url": item.get("canonicalUrl"),
                "badges": item.get("badges") or [],
            }
            for item in actors
        ]
        items = [item for pair in zip_longest(organ_items, actor_items) for item in pair if item]
        normalized_query = query.strip().casefold()
        items.sort(key=lambda item: (
            str(item.get("mdvsId") or "").casefold() != normalized_query
            and str(item.get("title") or "").casefold() != normalized_query
        ))
        items = items[:limit]
        counts = Counter(item["searchGroup"] for item in items)
        return {
            "query": query,
            "items": items,
            "groups": [
                {"id": key, "label": "Pipe organs" if key == "organs" else "People and builders", "count": count}
                for key, count in counts.items()
            ],
            "total": len(items),
            "limit": limit,
            "counts": {"organs": counts["organs"], "events": 0, "candidateEntities": counts["people"], "vmiCandidates": 0},
        }

    def _resolve_organ_mdvs_id(self, organ_id: str) -> tuple[str, str | None] | None:
        value = str(organ_id or "").strip()
        with connect(self.settings) as conn:
            row = conn.execute(
                f"select mdvs_id from {SCHEMA}.organ where mdvs_id=%(value)s or replace(mdvs_id, 'MDVS:ENTY:', '')=%(value)s",
                {"value": value},
            ).fetchone()
            if row:
                return str(row["mdvs_id"]), None
            alias = conn.execute(
                f"select canonical_mdvs_id from {SCHEMA}.organ_alias where alias_mdvs_id=%(value)s or replace(alias_mdvs_id, 'MDVS:ENTY:', '')=%(value)s",
                {"value": value},
            ).fetchone()
        return (str(alias["canonical_mdvs_id"]), value) if alias else None

    def _organ_sources(self, mdvs_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"""select source_record_id, source_key, native_identifier, source_url,
                           source_revision_sha256, source_record_row_hash
                    from {SCHEMA}.source_membership where organ_mdvs_id=%(id)s
                    order by source_key, source_record_id""",
                {"id": mdvs_id},
            ).fetchall()
        return [
            {
                "id": row["source_record_id"],
                "title": row["source_key"],
                "source": row["source_key"],
                "status": "Structured source membership",
                "statusDetail": "Consult the original page for its description and documentation.",
                "payloadHash": row.get("source_record_row_hash") or row.get("source_revision_sha256"),
                "url": row.get("source_url"),
            }
            for row in rows
        ]

    @staticmethod
    def _source_stub(source_record_id: str, source_key: str, source_url: str | None = None) -> dict[str, Any]:
        return {
            "id": source_record_id,
            "title": source_key,
            "source": source_key,
            "status": "Structured source membership",
            "url": source_url,
        }

    def _organ_builders(self, mdvs_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"""select b.actor_mdvs_id, b.assertion_count, b.relation_count,
                           a.label, a.actor_type, a.canonical_uri
                    from {SCHEMA}.organ_builder b join {SCHEMA}.actor a on a.mdvs_id=b.actor_mdvs_id
                    where b.organ_mdvs_id=%(id)s
                    order by b.assertion_count desc, a.label, a.mdvs_id""",
                {"id": mdvs_id},
            ).fetchall()
        return [self._related_actor(row, relationship="Builder") for row in rows] + self._organ_source_builders(mdvs_id)

    @staticmethod
    def _actor_route(mdvs_id: str, actor_type: str) -> str:
        token = mdvs_id.removeprefix("MDVS:ENTY:")
        return f"/{'organizations' if actor_type == 'organization' else 'people'}/{quote(token, safe='-._~')}"

    @classmethod
    def _related_actor(cls, row: Mapping[str, Any], *, relationship: str) -> dict[str, Any]:
        mdvs_id = str(row["actor_mdvs_id"])
        actor_type = str(row.get("actor_type") or "person")
        return {
            "id": mdvs_id,
            "mdvsId": mdvs_id,
            "label": row.get("label") or mdvs_id,
            "kind": "Builder" if relationship == "Builder" else actor_type.title(),
            "relationship": relationship,
            "entityCategory": "organizations" if actor_type == "organization" else "people",
            "entityPageUrl": cls._actor_route(mdvs_id, actor_type),
            "entityPageState": "canonical",
            "entityPageLabel": "Open canonical actor",
            "publicationState": "canonical",
            "confidence": row.get("confidence"),
            "summary": f"{int(row.get('assertion_count') or 0)} source assertion(s).",
        }

    def _organ_places(self, mdvs_id: str) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"""select distinct on (coalesce(place_mdvs_id, assertion_id))
                           assertion_id, place_mdvs_id, place_uri, preferred_label,
                           place_kind, temporal_scope, relation_role
                    from {SCHEMA}.place_assertion where organ_mdvs_id=%(id)s
                    order by coalesce(place_mdvs_id, assertion_id),
                             (temporal_scope='current') desc, assertion_id""",
                {"id": mdvs_id},
            ).fetchall()
        return [
            {
                "id": row.get("place_mdvs_id") or row["assertion_id"],
                "mdvsId": row.get("place_mdvs_id"),
                "label": row.get("preferred_label") or row.get("place_mdvs_id") or "Documented place",
                "kind": "Place",
                "relationship": row.get("relation_role") or row.get("temporal_scope") or "Documented place",
                "entityCategory": "places",
                "entityPageUrl": (
                    f"/places/{quote(str(row['place_mdvs_id']).removeprefix('MDVS:LOCN:'), safe='-._~')}"
                    if row.get("place_mdvs_id") else (
                        f"/places/{quote(str(row['assertion_id']), safe='')}"
                        if self.policy.release_version not in {"1.5", "1.5.1"} else None
                    )
                ),
                "publicationState": "canonical" if row.get("place_mdvs_id") else "structured_assertion",
            }
            for row in rows
        ]

    def get_organ_surface(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        mdvs_id, resolved_from = resolved
        base = self._organ_select()
        with connect(self.settings) as conn:
            row = conn.execute(f"{base} where o.mdvs_id=%(id)s", {"id": mdvs_id}).fetchone()
        if not row:
            return None
        card = self._organ_card(row)
        sources = self._organ_sources(mdvs_id)
        builders = self._organ_builders(mdvs_id)
        places = self._organ_places(mdvs_id)
        history = self.get_organ_history_bundle(mdvs_id) or {}
        citation = self.get_organ_citation(mdvs_id)
        related = [*builders, *places]
        primary_builder = builders[0] if builders else None
        primary_place = next((item for item in places if item.get("relationship") == "current"), places[0] if places else None)
        if primary_builder:
            card.update(
                builder=primary_builder["label"],
                builderMdvsId=primary_builder["mdvsId"],
                builderUrl=primary_builder["entityPageUrl"],
            )
        if primary_place:
            card.update(
                location=(primary_place["label"] if self.policy.release_version == "1.5"
                          else row.get("place_label") or primary_place["label"]),
                placeMdvsId=primary_place.get("mdvsId"),
                placeUrl=primary_place.get("entityPageUrl"),
            )
        return {
            **card,
            "resolvedFromMdvsId": resolved_from,
            "entityType": "organ",
            "canonicalUrl": _organ_page_route(mdvs_id),
            "apiUrl": f"/api/organs/{quote(mdvs_id, safe='')}",
            "loadMode": "surface",
            "candidateContext": ({"label": "Organ descriptions · Review version", "parentRelease": metadata_release}
                                 if (metadata_release := self._metadata().get("release_version"))
                                 and self._metadata().get("candidate_status") == "review_candidate" else None),
            "specificationDescriptions": history.get("specificationDescriptions", []),
            "deferredSections": {
                "specification": f"/api/organs/{quote(mdvs_id, safe='')}/specification",
                "history": f"/api/organs/{quote(mdvs_id, safe='')}/history",
                "activities": f"/api/organs/{quote(mdvs_id, safe='')}/history",
                "media": f"/api/organs/{quote(mdvs_id, safe='')}/media",
                "related": f"/api/organs/{quote(mdvs_id, safe='')}/related",
                "contributions": f"/api/organs/{quote(mdvs_id, safe='')}/contributions",
            },
            "loadedSections": {"specification": False, "history": True, "media": False, "related": True, "contributions": True},
            "publicProfile": {
                "summary": "",
                "sections": [
                    {"key": "overview", "title": "The instrument", "items": [
                        {"label": "Location", "value": card.get("location"), "relatedUrl": card.get("placeUrl")},
                        {"label": "Documented builder", "value": card.get("builder"), "relatedUrl": card.get("builderUrl")},
                        {"label": "Source-reported stops", "value": str(row["stop_count"]) if row.get("stop_count") is not None else ("No single usable total · inspect source evidence" if row.get("stop_assertion_count") else None),
                         "relatedUrl": _organ_page_route(mdvs_id) + "?tab=specification"},
                        {"label": "Map precision", "value": card["locationReadiness"]["label"]},
                    ]},
                    {"key": "coverage", "title": "Source coverage", "items": [
                        {"label": "Source collections", "value": str(card["sourceCount"]), "relatedUrl": _organ_page_route(mdvs_id) + "?tab=identifiers"},
                        {"label": "Source records", "value": str(len(sources))},
                    ]},
                    {"key": "identity_summary", "title": "Stable identity", "items": [
                        {"label": "MODAVIS identifier", "value": mdvs_id, "relatedUrl": row["canonical_uri"]},
                    ]},
                ],
            },
            "facts": [],
            "quickFacts": [],
            "identifiers": [
                {
                    "scheme": "MODAVIS",
                    "value": mdvs_id,
                    "primary": True,
                    "url": row["canonical_uri"],
                    "linkLabel": "Open stable identity",
                }
            ],
            "specification": self._empty_specification(),
            "componentHierarchy": [],
            "sourceSpecifications": [],
            "technicalEvidence": None,
            "pipework": None,
            "timeline": history.get("timeline", []),
            "activities": history.get("activities", []),
            "documentedStateSummary": history.get("documentedStateSummary"),
            "relatedEntities": related,
            "relatedSummary": self._related_summary(related),
            "virtualInstruments": self._organ_virtual_instruments(mdvs_id),
            "media": [],
            "derivativeAssets": [],
            "sources": sources,
            "contributions": [],
            "researchSummary": {},
            "citation": citation,
            "export": self.entity_export_manifest("organ", mdvs_id),
        }

    def get_organ(self, organ_id: str) -> dict[str, Any] | None:
        return self.get_organ_surface(organ_id)

    @staticmethod
    def _empty_specification() -> dict[str, Any]:
        return {
            "summary": {}, "rows": [], "divisions": [], "stops": [],
            "keyboards": [], "couplers": [], "accessories": [], "rawAvailable": False,
        }

    @staticmethod
    def _related_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
        kinds = Counter(str(item.get("kind") or "Related") for item in items)
        relations = Counter(str(item.get("relationship") or "Related") for item in items)
        return {
            "total": len(items),
            "sourceBacked": len(items),
            "normalizerCandidates": 0,
            "relationCount": len(items),
            "kinds": [{"state": key, "count": count} for key, count in sorted(kinds.items())],
            "relationTypes": [{"state": key, "count": count} for key, count in sorted(relations.items())],
        }

    def get_organ_citation(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        with connect(self.settings) as conn:
            row = conn.execute(
                f"select label, canonical_uri from {SCHEMA}.organ where mdvs_id=%(id)s",
                {"id": mdvs_id},
            ).fetchone()
            hashes = conn.execute(
                f"select row_sha256 from {SCHEMA}.source_membership where organ_mdvs_id=%(id)s order by source_record_id",
                {"id": mdvs_id},
            ).fetchall()
        if not row:
            return None
        source_hashes = [str(item["row_sha256"]) for item in hashes]
        digest = hashlib.sha256("\n".join(source_hashes).encode()).hexdigest()
        metadata = self._metadata() if self.source_release_version in {"1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5", "1.6.0"} else {}
        citation_version = self.source_release_version if metadata else "1.5"
        from datetime import date
        access_date = date.today().isoformat()
        def bib(value):
            escapes = {"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "&": r"\&", "%": r"\%", "_": r"\_", "#": r"\#", "$": r"\$", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
            return "".join(escapes.get(char, char) for char in str(value))
        bibtex = (
            "@misc{modavis_" + mdvs_id.rsplit(":", 1)[-1].replace("-", "") + "_" + citation_version.replace(".", "") + ",\n"
            "  author = {Ukolov, Dominik and {MODAVIS}},\n"
            "  title = {" + bib(row["label"]) + "},\n"
            "  year = {2026},\n"
            "  publisher = {MODAVIS},\n"
            "  howpublished = {MODAVIS Pipe Organ Dataset (POD)},\n"
            "  version = {" + citation_version + "},\n"
            "  note = {Organ record " + bib(mdvs_id) + "; dataset version " + citation_version + "},\n"
            "  url = {" + str(row["canonical_uri"]) + "},\n"
            "  urldate = {" + access_date + "}\n}"
        )
        return {
            "entityType": "organ",
            "mdvsId": mdvs_id,
            "title": row["label"],
            "canonicalUrl": row["canonical_uri"],
            "apiUrl": f"/api/organs/{quote(mdvs_id, safe='')}/citation",
            "accessDate": access_date,
            "authors": [{"given": "Dominik", "family": "Ukolov"}, {"literal": "MODAVIS"}],
            "dataset": {"title": "MODAVIS Pipe Organ Dataset (POD)", "version": citation_version, "url": self.policy.dataset_version_uri},
            "bibtex": bibtex,
            "sourceHashes": source_hashes,
            "schemaVersions": [{"schemaKey": metadata.get("public_postgresql_contract", CONTRACT), "schemaVersion": metadata.get("initiator_schema_version", "2")}],
            "provenanceContext": {"dataProfile": PROFILE, "release": metadata.get("release_version", "1.5.0"), "rowSetSha256": digest},
            "versioning": {"status": "release_versioned", "currentProjectionStable": True, "versionedSnapshotsAvailable": True},
            "recommendedCitation": f"Ukolov, Dominik; MODAVIS (2026). {row['label']}. In MODAVIS Pipe Organ Dataset (POD), version {citation_version}. {row['canonical_uri']} (accessed {access_date}).",
        }

    def get_organ_sources_bundle(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        items = self._organ_sources(resolved[0])
        return {"sources": items, "items": items, "total": len(items)}

    def get_organ_specification_descriptions(self, organ_id: str) -> list[dict[str, Any]]:
        if self._metadata().get("specification_description_contract") != public_specifications.CONTRACT:
            return []
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return []
        with connect(self.settings) as conn:
            return public_specifications.index(conn, resolved[0], history=self._metadata().get("history_configuration_evidence_contract") == "modavis.history-configuration-evidence/v1")

    def get_organ_specification_description(self, organ_id: str, description_id: str) -> dict[str, Any] | None:
        if self._metadata().get("specification_description_contract") != public_specifications.CONTRACT:
            return None
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        with connect(self.settings) as conn:
            return public_specifications.detail(conn, resolved[0], description_id, quality=self._metadata().get("aggregate_quality_contract") == "modavis.aggregate-quality/v1", history=self._metadata().get("history_configuration_evidence_contract") == "modavis.history-configuration-evidence/v1")

    def get_organ_specification_bundle(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        with connect(self.settings) as conn:
            components = conn.execute(
                f"""select * from {SCHEMA}.specification_component
                    where organ_mdvs_id=%(id)s
                      and label_disclosure_state not like 'excluded_%%'
                    order by component_type, coalesce(division_label,''), label, component_id""",
                {"id": mdvs_id},
            ).fetchall()
            facts = conn.execute(
                f"""select * from {SCHEMA}.technical_fact where organ_mdvs_id=%(id)s
                    order by family, label, fact_id""",
                {"id": mdvs_id},
            ).fetchall()
            fact_evidence = {}
            if self._metadata().get("specification_summary_evidence_contract") == "modavis.specification-summary-evidence/v1":
                fact_evidence = {r["fact_id"]: _json(r["evidence_json"], {}) for r in conn.execute(
                    f"select e.* from {SCHEMA}.technical_fact_evidence e join {SCHEMA}.technical_fact f using(fact_id) where f.organ_mdvs_id=%(id)s",
                    {"id": mdvs_id}).fetchall()}
            memberships = conn.execute(
                f"""select source_record_id, source_key, source_url
                    from {SCHEMA}.source_membership where organ_mdvs_id=%(id)s
                    order by source_key, source_record_id""",
                {"id": mdvs_id},
            ).fetchall()
            temperament_rows = conn.execute(
                f"""select * from {SCHEMA}.organ_temperament_assertion
                    where organ_mdvs_id=%(id)s order by source_key, source_record_id""",
                {"id": mdvs_id},
            ).fetchall()
        source_by_record = {
            str(row["source_record_id"]): self._source_stub(
                str(row["source_record_id"]),
                str(row["source_key"]),
                row.get("source_url"),
            )
            for row in memberships
        }

        def source_for(row: Mapping[str, Any]) -> dict[str, Any]:
            source_record_id = str(row["source_record_id"])
            known = source_by_record.get(source_record_id)
            if known:
                return known
            return self._source_stub(
                source_record_id,
                str(row.get("source_key") or source_record_id),
                row.get("source_url"),
            )

        def component_item(row: Mapping[str, Any]) -> dict[str, Any]:
            source = source_for(row)
            parsed_detail = _json(row.get("detail_json"), {})
            detail = dict(parsed_detail) if isinstance(parsed_detail, Mapping) else {}
            if row.get("division_label") and not detail.get("division"):
                detail["division"] = row.get("division_label")
            if row.get("pitch_label") and not detail.get("pitch"):
                detail["pitch"] = row.get("pitch_label")
            occurrence_count = int(row.get("occurrence_count") or 1)
            if occurrence_count > 1:
                detail["occurrenceCount"] = occurrence_count
            return {
                "id": row["component_id"],
                "kind": row["component_type"],
                "label": row["label"],
                "detail": detail,
                "sourcePath": row.get("source_path") or f"specifications.components.{row['component_type']}",
                "sourceEntityId": row.get("source_entity_ref"),
                "source": source,
                "sources": [source],
                "sourceCount": 1,
                "trustState": "source_recorded",
                "certainty": "Source-recorded",
                "canContribute": False,
                "canDispute": False,
            }

        def hierarchy_for(rows: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for row in rows:
                group_id = COMPONENT_GROUP_IDS.get(
                    str(row["component_type"]),
                    f"{row['component_type']}s",
                )
                grouped[group_id].append(component_item(row))
            ordered_ids = [key for key in COMPONENT_GROUP_ORDER if key in grouped]
            ordered_ids.extend(sorted(set(grouped) - set(ordered_ids)))
            return [
                {
                    "id": key,
                    "label": COMPONENT_GROUP_LABELS.get(key, key.replace("_", " ").title()),
                    "count": len(grouped[key]),
                    "items": grouped[key],
                }
                for key in ordered_ids
            ]

        def manual_value(rows: list[Mapping[str, Any]]) -> str | None:
            manual_facts = [row for row in rows if str(row["family"]) == "manual_total"]
            if len(manual_facts) != 1:
                return None
            row = manual_facts[0]
            if row.get("normalized_number") is None and self._metadata().get("aggregate_quality_contract"):return None
            return _first_text(row.get("display_value"), row.get("normalized_number")) or None

        def specification_for(
            component_rows: list[Mapping[str, Any]],
            fact_rows: list[Mapping[str, Any]],
            *,
            source_set_count: int,
        ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
            hierarchy = hierarchy_for(component_rows)
            groups = {group["id"]: group["items"] for group in hierarchy}
            if component_rows and fact_rows:
                coverage_state = "components_and_technical_facts"
            elif component_rows:
                coverage_state = "structured_components"
            elif fact_rows:
                coverage_state = "technical_facts"
            else:
                coverage_state = "not_documented_in_current_public_sources"
            summary: dict[str, Any] = {
                "coverageState": coverage_state,
                "componentCount": len(component_rows),
                "technicalFactCount": len(fact_rows),
                "stopRowCount": len(groups.get("stops", [])),
                "sourceSpecificationCount": source_set_count,
            }
            manuals = manual_value(fact_rows)
            if manuals:
                summary["manuals"] = manuals
            specification = self._empty_specification()
            specification.update(
                summary=summary,
                divisions=groups.get("divisions", []),
                stops=groups.get("stops", []),
                keyboards=groups.get("keyboards", []),
                couplers=groups.get("couplers", []),
                accessories=groups.get("accessories", []),
                rawAvailable=False,
            )
            return specification, hierarchy

        values_by_family: dict[str, set[str]] = defaultdict(set)
        sources_by_family: dict[str, set[str]] = defaultdict(set)
        for row in facts:
            family = str(row["family"])
            value = _first_text(row.get("normalized_number"), row.get("display_value"))
            if value:
                values_by_family[family].add(_temperament_match_key(value))
            sources_by_family[family].add(str(row["source_record_id"]))

        technical_facts = []
        for row in facts:
            normalized_number = row.get("normalized_number")
            display_value = _first_text(
                row.get("display_value"),
                normalized_number if normalized_number is not None else None,
            )
            source = source_for(row)
            family = str(row["family"])
            cross_source_conflict = (
                len(sources_by_family[family]) > 1
                and len(values_by_family[family]) > 1
            )
            material_conflict = (
                row.get("conflict_state") == "material_technical_disagreement"
                or cross_source_conflict
            )
            captured_count = (
                row.get("captured_component_count")
                if family in {"manual_total", "stop_total"} else None
            )
            from .public_capture_comparison import restored_capture_comparison
            capture_evidence = restored_capture_comparison(row, components)
            if capture_evidence:
                captured_count = capture_evidence["capturedRows"]
                material_conflict = material_conflict or capture_evidence["disagrees"]
            comparison = None
            if (material_conflict and captured_count is not None
                    and normalized_number is not None
                    and normalized_number != captured_count):
                comparison = (
                    f"The source summary reports {display_value}; the captured structured list "
                    f"contains {int(captured_count):,} component row{'s' if captured_count != 1 else ''}. Both are retained."
                )
            elif cross_source_conflict:
                comparison = "Other source records give a different value for this field."
            technical_facts.append(
                {
                    "id": row["fact_id"],
                    "family": row["family"],
                    "label": row["label"],
                    "displayValue": display_value,
                    "normalizedNumber": normalized_number,
                    "sourceWording": "\n".join(e["wording"] for e in fact_evidence.get(row["fact_id"], {}).get("evidence", [])) or row.get("display_value") or row["label"],
                    "summaryEvidence": fact_evidence.get(row["fact_id"]),
                    "source": source["source"],
                    "sourceRecordId": row["source_record_id"],
                    "sourceUrl": row.get("source_url") or source.get("url"),
                    "sourcePath": row.get("source_path") or f"specifications.{row['family']}",
                    "evidenceSha256": row["evidence_sha256"],
                    "supportState": row["support_state"],
                    "conflictState": (
                        "material_technical_disagreement"
                        if material_conflict else row["conflict_state"]
                    ),
                    "comparison": comparison,
                    "capturedComponentCount": captured_count,
                    "captureComparison": capture_evidence,
                    "evidenceKind": "source_assertion",
                    "functionalPositionStatement": row["family"] == "functional_pipe_position",
                }
            )

        from .public_aggregate_quality import qualify_public_fact
        technical_facts = [qualify_public_fact(f) for f in technical_facts]

        def pipework_for(fact_rows: list[Mapping[str, Any]]) -> dict[str, Any] | None:
            models = []
            for row in fact_rows:
                if row["family"] != "pipe_total" or row.get("normalized_number") is None:
                    continue
                value = int(row["normalized_number"])
                if value < 0:
                    continue
                models.append(
                    build_pipework_read_model(
                        {
                            "specifications": {
                                "pipe_count": value,
                                "pipe_count_state": "Source-described organ configuration",
                            }
                        },
                        source_for(row),
                    )
                )
            return merge_pipework_read_models(*models)

        component_rows_by_source: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
        fact_rows_by_source: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
        for row in components:
            component_rows_by_source[str(row["source_record_id"])].append(row)
        for row in facts:
            fact_rows_by_source[str(row["source_record_id"])].append(row)
        specification_source_ids = sorted(
            set(component_rows_by_source) | set(fact_rows_by_source),
            key=lambda source_id: (
                -len(component_rows_by_source[source_id]),
                -len(fact_rows_by_source[source_id]),
                str(source_by_record.get(source_id, {}).get("source") or source_id),
                source_id,
            ),
        )
        default_source_id = specification_source_ids[0] if specification_source_ids else None
        if default_source_id:
            active_component_rows = component_rows_by_source[default_source_id]
            active_fact_rows = fact_rows_by_source[default_source_id]
        else:
            active_component_rows = list(components)
            active_fact_rows = list(facts)
        spec, hierarchy = specification_for(
            active_component_rows,
            active_fact_rows,
            source_set_count=len(specification_source_ids),
        )
        active_pipework, hierarchy = apply_register_pipe_quantities(
            pipework_for(active_fact_rows), hierarchy
        )

        source_specifications = []
        if specification_source_ids:
            for source_id in specification_source_ids:
                source_components = component_rows_by_source[source_id]
                source_facts = fact_rows_by_source.get(source_id, [])
                source_spec, source_hierarchy = specification_for(
                    source_components,
                    source_facts,
                    source_set_count=1,
                )
                source_pipework, source_hierarchy = apply_register_pipe_quantities(
                    pipework_for(source_facts), source_hierarchy
                )
                stop_totals = [
                    row for row in source_facts
                    if row["family"] == "stop_total" and row.get("normalized_number") is not None
                ]
                source_stop_count = (
                    int(stop_totals[0]["normalized_number"])
                    if len(stop_totals) == 1
                    else None
                )
                parsed_stop_count = sum(
                    row["component_type"] == "stop" for row in source_components
                )
                source_specifications.append(
                    {
                        "id": source_id,
                        "source": source_by_record.get(source_id)
                        or source_for((source_components or source_facts)[0]),
                        "preferred": source_id == default_source_id,
                        "displayPolicy": (
                            "default_complete_source_set"
                            if source_id == default_source_id
                            else "independently_attributed_source_alternative"
                        ),
                        "specification": source_spec,
                        "componentHierarchy": source_hierarchy,
                        "pipework": source_pipework,
                        "parser": {
                            "source": (source_by_record.get(source_id) or {}).get("source"),
                            "status": "structured_public_projection",
                            "resourceCount": len(source_components) + len(source_facts),
                            "sourceStopCount": source_stop_count,
                            "parsedStopCount": parsed_stop_count,
                            "technicalFactCount": len(source_facts),
                            "countDiscrepancy": bool(
                                source_stop_count is not None
                                and parsed_stop_count > 0
                                and source_stop_count != parsed_stop_count
                            ) or any(
                                row.get("conflict_state") == "material_technical_disagreement"
                                for row in stop_totals
                            ),
                        },
                    }
                )

        pitch_rows = [row for row in facts if row["family"] == "pitch_standard"]
        pitch_assertions = [
            {
                "value": _first_text(row.get("display_value"), row.get("normalized_number")),
                "rawValue": row.get("display_value"),
                "text": row.get("display_value"),
                "source": source_for(row)["source"],
                "sourceRecordId": row["source_record_id"],
                "sourceUrl": row.get("source_url") or source_for(row).get("url"),
                "sourcePath": "specifications.pitch_standard",
                "extraction": "structured_source_field",
            }
            for row in pitch_rows
        ]
        pitch_values = {
            _temperament_match_key(item["value"])
            for item in pitch_assertions
            if item["value"]
        }
        pitch_source_count = len({item["sourceRecordId"] for item in pitch_assertions})
        pitch_status = (
            "unavailable" if not pitch_assertions
            else "single_source" if pitch_source_count == 1
            else "agreement" if len(pitch_values) == 1
            else "sources_differ"
        )
        temperament_sources = [
            {
                "source_value": row["source_value"],
                "source_key": row["source_key"],
                "source_record_id": row["source_record_id"],
                "source_url": row.get("source_url"),
            }
            for row in temperament_rows
        ]
        seen_temperaments = {
            (
                str(row["source_record_id"]),
                _temperament_match_key(row["source_value"]),
            )
            for row in temperament_sources
        }
        for row in facts:
            if row["family"] != "temperament":
                continue
            value = _first_text(row.get("display_value"), row.get("normalized_number"))
            if not value:
                continue
            source = source_for(row)
            key = (str(row["source_record_id"]), _temperament_match_key(value))
            if key in seen_temperaments:
                continue
            seen_temperaments.add(key)
            temperament_sources.append(
                {
                    "source_value": value,
                    "source_key": source["source"],
                    "source_record_id": row["source_record_id"],
                    "source_url": row.get("source_url") or source.get("url"),
                }
            )
        temperament_assertions = [
            {
                "value": row["source_value"],
                "rawValue": row["source_value"],
                "text": row["source_value"],
                "source": row["source_key"],
                "sourceRecordId": row["source_record_id"],
                "sourceUrl": row.get("source_url"),
                "sourcePath": "specifications.temperament",
                "extraction": "structured_source_field",
            }
            for row in temperament_sources
        ]
        preferred_temperament = (
            str(temperament_sources[0]["source_value"])
            if temperament_sources else None
        )
        tuning_systems = self._tuning_systems()
        exact_records = [
            tuning for tuning in tuning_systems
            if _temperament_source_match_kind(preferred_temperament, tuning) == "exact_variant"
        ]
        exact_record = exact_records[0] if len(exact_records) == 1 else None
        lookup = search_temperaments(preferred_temperament, tuning_systems, identity_only=True)
        browse_url = (
            f"/temperaments?q={quote(preferred_temperament, safe='')}&scope=identity"
            if preferred_temperament
            else "/temperaments"
        )
        if exact_record:
            target_url = f"/temperaments/{quote(str(exact_record['id']), safe='')}"
            relation_state = "exact_record"
            guidance = (
                "The source wording uniquely matches this BDO tuning-system record and its cent vector."
            )
            matching_count = 1
        elif preferred_temperament and lookup.ids:
            target_url = browse_url
            relation_state = "candidate_set"
            guidance = (
                "Related catalogue entries are offered for comparison. The source wording and any "
                "adaptation comments remain separate evidence; they do not establish an exact cent vector."
            )
            matching_count = len(lookup.ids)
        else:
            target_url = browse_url
            relation_state = "source_wording_only"
            guidance = (
                "The source wording is retained without an exact or family-level catalogue match."
            )
            matching_count = 0
        temperament_status = "unavailable"
        if temperament_sources:
            normalized_values = {
                _temperament_match_key(row["source_value"])
                for row in temperament_sources
            }
            source_count = len({
                str(row["source_record_id"])
                for row in temperament_sources
            })
            temperament_status = (
                "single_source" if source_count == 1
                else "agreement" if len(normalized_values) == 1
                else "sources_differ"
            )
        return {
            "specification": spec,
            "componentHierarchy": hierarchy,
            "pipework": active_pipework,
            "sourceSpecifications": source_specifications,
            "specificationDescriptions": self.get_organ_specification_descriptions(organ_id),
            "technicalEvidence": {
                "descriptions": [],
                "descriptionSourceCount": 0,
                "pitch": {
                    "preferredValue": pitch_assertions[0]["value"] if pitch_assertions else None,
                    "status": pitch_status,
                    "assertions": pitch_assertions,
                },
                "temperament": {
                    "preferredValue": preferred_temperament,
                    "concept": ({
                        "id": exact_record["id"],
                        "label": exact_record["title"],
                        "matchKind": "exact_catalog_record",
                    } if exact_record else None),
                    "status": temperament_status,
                    "assertions": temperament_assertions,
                    "catalogRelation": {
                        "catalogSource": "BDO Lexikon der Stimmungen",
                        "catalogSourceKey": "bdo_tuning_systems",
                        "catalogRecordCount": len(tuning_systems),
                        "matchingRecordCount": matching_count,
                        "browseUrl": browse_url,
                        "targetUrl": target_url,
                        "exactRecordId": exact_record["id"] if exact_record else None,
                        "exactRecordUrl": target_url if exact_record else None,
                        "state": relation_state,
                        "guidance": guidance,
                        "searchInterpretation": lookup.interpretation,
                    },
                },
                "facts": technical_facts,
                "factCount": len(technical_facts),
                "materialConflictCount": sum(item["conflictState"] == "material_technical_disagreement" for item in technical_facts),
                "wordingVariantCount": sum(item["conflictState"] not in {"none", "material_technical_disagreement"} for item in technical_facts),
                "functionalPipePositionCount": sum(
                    item["family"] == "functional_pipe_position"
                    for item in technical_facts
                ),
            },
        }

    def get_organ_history_bundle(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"""select * from {SCHEMA}.documented_event where organ_mdvs_id=%(id)s
                    order by event_id""",
                {"id": mdvs_id},
            ).fetchall()
        rows.sort(key=lambda row: (min(_year_values(row["date_values_json"]), default=9999), row["event_id"]))
        timeline = [self._event_summary(row) for row in self._event_context(rows)]
        years = [year for row in rows for year in _year_values(row["date_values_json"])]
        # Earlier versioned representations retain their published count semantics.
        legacy_counts = self.policy.release_version in {"1.5", "1.5.1"}
        controlled = sum(
            bool(row.get("controlled_event_type")) and (legacy_counts or not row.get("source_only"))
            for row in rows
        )
        sources = {str(row["source_key"]) for row in rows}
        summary = {
            "state": "documented_assertions_available" if rows else "not_documented_in_current_sources",
            "scope": "documented_source_assertions_not_present_condition",
            "label": "Documented historical assertions" if rows else "No documented state assertions",
            "assertionCount": len(rows),
            "controlledAssertionCount": controlled,
            "sourceOnlyAssertionCount": len(rows) - controlled,
            "datedAssertionCount": sum(bool(_year_values(row["date_values_json"])) for row in rows),
            "typeCount": len({row.get("controlled_event_type") or row.get("source_event_type") for row in rows}),
            "sourceCount": len(sources),
            "firstYear": min(years) if years else None,
            "lastYear": max(years) if years else None,
            "yearLabel": (f"{min(years)}–{max(years)}" if years and min(years) != max(years) else str(years[0]) if years else None),
            "historyAvailable": bool(rows),
            "guidance": "These are documented source assertions and do not imply an undocumented present condition.",
        }
        return {"timeline": timeline, "activities": timeline, "documentedStateSummary": summary,
                "specificationDescriptions": self.get_organ_specification_descriptions(organ_id)}

    def get_organ_related_bundle(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        related = [*self._organ_builders(mdvs_id), *self._organ_places(mdvs_id)]
        return {
            "relatedEntities": related,
            "relatedSummary": self._related_summary(related),
            "virtualInstruments": self._organ_virtual_instruments(mdvs_id),
        }

    @staticmethod
    def empty_media_bundle() -> dict[str, Any]:
        return {"media": [], "derivativeAssets": [], "items": [], "total": 0}

    @staticmethod
    def empty_contribution_bundle() -> dict[str, Any]:
        return {"contributions": [], "items": [], "total": 0, "readOnly": True}

    def literature_status(self) -> dict[str, Any]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"select * from {SCHEMA}.literature_collection order by name, collection_key"
            ).fetchall()
        return {
            "status": "canonical",
            "schemaVersion": self._metadata()["initiator_schema_version"] if self.source_release_version in {"1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5", "1.6.0"} else "0.3.48",
            "publicProjection": True,
            "collections": [
                {
                    "key": row["collection_key"],
                    "name": row["name"],
                    "fullName": row.get("full_name"),
                    "description": row.get("description"),
                    "homepageUrl": row.get("homepage_url"),
                    "publicationCount": row["publication_count"],
                    "yearMin": row.get("year_min"),
                    "yearMax": row.get("year_max"),
                    "digitizedCount": row["digitized_count"],
                    "normalizationProfile": row.get("normalization_profile"),
                    "sourceArtifactSha256": row.get("source_artifact_sha256"),
                    "importedAt": row.get("imported_at"),
                }
                for row in rows
            ],
        }

    @staticmethod
    def _literature_summary(
        row: Mapping[str, Any],
        public_access_links: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        authors = _json(row.get("authors_json"), [])
        start_page = _first_text(row.get("iiif_start_page"))
        end_page = _first_text(row.get("iiif_end_page"))
        pages = _first_text(row.get("page_locator")) or (
            f"{start_page}-{end_page}"
            if start_page and end_page
            else start_page or end_page or None
        )
        return {
            "literatureId": row["literature_id"],
            "mdvsId": row["mdvs_id"],
            "canonicalUrl": catalogue_path(row["mdvs_id"], "literature"),
            "title": row["title"],
            "publicationYear": row.get("publication_year"),
            "publicationType": row.get("publication_type"),
            "language": None,
            "venue": row.get("venue"),
            "containerType": row.get("container_type"),
            "volume": row.get("volume"),
            "issue": row.get("issue"),
            "publisher": row.get("publisher_or_institution"),
            "place": row.get("place"),
            "pages": pages,
            "sourceUrl": _public_literature_source_url(row.get("source_url")),
            "authors": authors if isinstance(authors, list) else [],
            "externalIds": {"MODAVIS": row["mdvs_id"]},
            "reviewFlags": [],
            "parserStatus": "canonical",
            "sourceRecordId": row["source_record_id"],
            "source": {
                "key": row["collection_key"],
                "name": row.get("collection_full_name") or row["collection_name"],
            },
            "reviewStatus": "source_backed",
            "identifierSchemes": [row["collection_key"]],
            "url": None,
            "collection": {
                "key": row["collection_key"],
                "name": row["collection_name"],
                "fullName": row.get("collection_full_name"),
            },
            "classificationConfidence": row.get("classification_confidence"),
            "digitized": bool(row.get("iiif_manifest_url") or public_access_links),
            "iiifManifestUrl": row.get("iiif_manifest_url"),
            "publicAccessLinks": public_access_links or [],
            "publicProjection": True,
            "depthAvailable": False,
        }

    def _literature_facets(self) -> dict[str, Any]:
        with self._literature_facets_cache_lock:
            if self._literature_facets_cache is not None:
                return dict(self._literature_facets_cache)
            with connect(self.settings) as conn:
                collections = conn.execute(
                    f"""select collection_key, min(collection_name) as name,
                               min(collection_full_name) as full_name, count(*)::int as count
                        from {SCHEMA}.literature_publication group by collection_key
                        order by name, collection_key"""
                ).fetchall()
                publication_types = conn.execute(
                    f"""select publication_type, count(*)::int as count
                        from {SCHEMA}.literature_publication
                        where publication_type is not null group by publication_type
                        order by count desc, publication_type"""
                ).fetchall()
                container_types = conn.execute(
                    f"""select container_type, count(*)::int as count
                        from {SCHEMA}.literature_publication
                        where container_type is not null group by container_type
                        order by count desc, container_type"""
                ).fetchall()
                confidences = conn.execute(
                    f"""select classification_confidence, count(*)::int as count
                        from {SCHEMA}.literature_publication
                        where classification_confidence is not null
                        group by classification_confidence order by count desc, classification_confidence"""
                ).fetchall()
                year_range = conn.execute(
                    f"select min(publication_year)::int as minimum, max(publication_year)::int as maximum from {SCHEMA}.literature_publication"
                ).fetchone()
                authors = conn.execute(
                    f"""select author.value as author, count(*)::int as count
                        from {SCHEMA}.literature_publication publication
                        cross join lateral jsonb_array_elements_text(publication.authors_json::jsonb) author(value)
                        group by author.value order by count desc, author.value limit 100"""
                ).fetchall()
                venues = conn.execute(
                    f"""select venue, count(*)::int as count
                        from {SCHEMA}.literature_publication where venue is not null
                        group by venue order by count desc, venue limit 100"""
                ).fetchall()
                digitized = conn.execute(
                    f"""select
                               count(*) filter(where publication.iiif_manifest_url is not null or exists(
                                   select 1 from {SCHEMA}.literature_access_link link
                                   where link.literature_id=publication.literature_id
                               ))::int as available,
                               count(*) filter(where publication.iiif_manifest_url is null and not exists(
                                   select 1 from {SCHEMA}.literature_access_link link
                                   where link.literature_id=publication.literature_id
                               ))::int as unavailable
                        from {SCHEMA}.literature_publication publication"""
                ).fetchone()
            self._literature_facets_cache = {
                "collections": [
                    {"collection": row["collection_key"], "name": row["name"], "fullName": row["full_name"], "count": row["count"]}
                    for row in collections
                ],
                "publicationTypes": [
                    {"publicationType": row["publication_type"], "count": row["count"]}
                    for row in publication_types
                ],
                "containerTypes": [
                    {"containerType": row["container_type"], "count": row["count"]}
                    for row in container_types
                ],
                "confidences": [
                    {"confidence": row["classification_confidence"], "count": row["count"]}
                    for row in confidences
                ],
                "yearRange": dict(year_range),
                "authors": [dict(row) for row in authors],
                "venues": [dict(row) for row in venues],
                "digitized": dict(digitized),
                "years": [], "reviewFlags": [], "parserStatuses": [],
                "sources": [
                    {"source": row["collection_key"], "count": row["count"]}
                    for row in collections
                ],
                "identifierSchemes": [],
            }
            return dict(self._literature_facets_cache)

    def list_literature(
        self, *, mode: str = "surface", query: str = "",
        collection: str | None = None, year_from: int | None = None,
        year_to: int | None = None, publication_type: str | None = None,
        author: str | None = None, venue: str | None = None, volume: str | None = None,
        container_type: str | None = None, confidence: str | None = None,
        digitized: bool | None = None, sort: str = "newest",
        limit: int = 40, offset: int = 0,
    ) -> dict[str, Any]:
        limit = _bounded(limit, 40)
        offset = max(0, int(offset or 0))
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if query.strip():
            query_value = query.strip()
            if query_value.startswith(("MDVS:", "gdo-lit-", "sr:")):
                clauses.append("(literature_id=%(query_exact)s or mdvs_id=%(query_exact)s or source_record_id=%(query_exact)s)")
                params["query_exact"] = query_value
            else:
                clauses.append("to_tsvector('simple',search_text) @@ websearch_to_tsquery('simple',%(query)s)")
                params["query"] = query_value
        for key, value, expression in (
            ("collection", collection, "collection_key=%(collection)s"),
            ("year_from", year_from, "publication_year>=%(year_from)s"),
            ("year_to", year_to, "publication_year<=%(year_to)s"),
            ("publication_type", publication_type, "publication_type=%(publication_type)s"),
            ("author", author, "author_text ilike %(author)s"),
            ("venue", venue, "venue ilike %(venue)s"),
            ("volume", volume, "volume=%(volume)s"),
            ("container_type", container_type, "container_type=%(container_type)s"),
            ("confidence", confidence, "classification_confidence=%(confidence)s"),
        ):
            if value not in (None, ""):
                params[key] = f"%{value}%" if key in {"author", "venue"} else value
                clauses.append(expression)
        if digitized is not None:
            access_clause = (
                f"exists(select 1 from {SCHEMA}.literature_access_link access_link "
                "where access_link.literature_id=literature_publication.literature_id)"
            )
            clauses.append(
                f"(iiif_manifest_url is not null or {access_clause})"
                if digitized else
                f"(iiif_manifest_url is null and not {access_clause})"
            )
        where = "where " + " and ".join(clauses) if clauses else ""
        order = {
            "title": "lower(title), literature_id",
            "author": "lower(author_text), lower(title), literature_id",
            "venue": "lower(venue) nulls last, lower(title), literature_id",
            "oldest": "publication_year asc nulls last, lower(title), literature_id",
        }.get(sort, "publication_year desc nulls last, lower(title), literature_id")
        with connect(self.settings) as conn:
            total = conn.execute(
                f"select count(*)::int as count from {SCHEMA}.literature_publication {where}", params
            ).fetchone()["count"]
            rows = conn.execute(
                f"select * from {SCHEMA}.literature_publication {where} order by {order} limit %(limit)s offset %(offset)s",
                params,
            ).fetchall()
            literature_ids = [row["literature_id"] for row in rows]
            access_rows = conn.execute(
                f"""SELECT literature_id,url,link_kind,provider,verified_at
                    FROM {SCHEMA}.literature_access_link
                    WHERE literature_id=ANY(%(ids)s)
                    ORDER BY literature_id,CASE WHEN link_kind='public_pdf' THEN 0 ELSE 1 END,link_id""",
                {"ids": literature_ids},
            ).fetchall() if literature_ids else []
        links_by_literature: dict[str, list[dict[str, Any]]] = {}
        for access in access_rows:
            links_by_literature.setdefault(str(access["literature_id"]), []).append({
                "url": access["url"],
                "label": "Open digitized page" if access["link_kind"] == "iiif_viewer" else "Read or download PDF",
                "kind": access["link_kind"], "provider": access.get("provider"),
                "verifiedAt": access["verified_at"], "access": "public",
            })
        return {
            "mode": "surface", "items": [
                self._literature_summary(row, links_by_literature.get(str(row["literature_id"]), []))
                for row in rows
            ],
            "total": total, "limit": limit, "offset": offset, "sort": sort,
            "query": query, "filters": {
                "collection": collection or "", "yearFrom": year_from, "yearTo": year_to,
                "publicationType": publication_type or "", "author": author or "",
                "venue": venue or "", "volume": volume or "", "containerType": container_type or "",
                "confidence": confidence or "", "digitized": digitized,
            },
            "facets": self._literature_facets(),
            "source": {"module": "release_1_5_public", "schemaVersion": self._metadata()["initiator_schema_version"] if self.source_release_version in {"1.5.1", "1.5.2", "1.5.3", "1.5.4", "1.5.5", "1.6.0"} else "0.3.48", "publicProjection": True},
        }

    def get_literature(self, literature_id: str, *, mode: str = "surface") -> dict[str, Any] | None:
        value = str(literature_id or "").strip()
        with connect(self.settings) as conn:
            row = conn.execute(
                f"""select * from {SCHEMA}.literature_publication
                    where literature_id=%(value)s or mdvs_id=%(value)s or source_record_id=%(value)s or mdvs_id='MDVS:LITR:' || %(value)s
                    limit 1""",
                {"value": value},
            ).fetchone()
        if not row:
            return None
        detail = self._literature_summary(row)
        identity = self.resolve_mdvs_id(row["mdvs_id"])
        detail.update({
            "identifierUri": identity.get("canonicalUri") if identity else None,
            "publicAccessLinks": self._literature_access_links(row["literature_id"]),
            "mode": "surface", "citationText": None, "publicationDetails": None,
            "notes": None, "classificationMethod": row.get("classification_method"),
            "container": {
                "type": row.get("container_type"), "title": row.get("venue"),
                "volume": row.get("volume"), "issue": row.get("issue"),
                "place": row.get("place"),
                "publisherOrInstitution": row.get("publisher_or_institution"),
                "editor": row.get("editor"), "citation": None,
            },
            "relatedContainers": _json(row.get("related_containers_json"), []),
            "locator": {
                "type": "iiif", "manifestUrl": row.get("iiif_manifest_url"),
                "startPage": row.get("iiif_start_page"), "endPage": row.get("iiif_end_page"),
                "canvasStart": row.get("iiif_canvas_start"), "canvasEnd": row.get("iiif_canvas_end"),
                "basis": row.get("iiif_locator_basis"),
                "exclusionReason": row.get("iiif_exclusion_reason"),
            },
            "normalizerLineage": {
                "literatureId": row["literature_id"],
                "sourceRecordId": row["source_record_id"],
                "canonicalWritesAllowed": False, "requiresReview": False,
                "publicProjection": True,
            },
        })
        return detail

    @staticmethod
    def _score_evidence(row: Mapping[str, Any]) -> dict[str, Any]:
        basis = str(row.get("evidence_basis") or "")
        if basis == "curated_organ_collection":
            return {
                "strength": "strong",
                "label": "Curated organ collection",
                "description": "The upstream collection explicitly identifies this edition as organ repertoire.",
            }
        if basis == "explicit_organ_metadata_and_track_19":
            return {
                "strength": "strong",
                "label": "Organ named in source metadata",
                "description": "PDMX metadata contains explicit organ wording and also includes track 19.",
            }
        if basis == "explicit_organ_metadata":
            return {
                "strength": "strong",
                "label": "Organ named in source metadata",
                "description": "PDMX metadata contains explicit organ wording.",
            }
        return {
            "strength": "candidate",
            "label": "PDMX organ candidate",
            "description": "Selected by PDMX's track-19 proxy; the public metadata does not independently assert organ instrumentation.",
        }

    @staticmethod
    def _score_ambitus(row: Mapping[str, Any], parts: list[Mapping[str, Any]] | None = None) -> dict[str, Any]:
        available = bool(row.get("analysis_id"))
        return {
            "status": row.get("analysis_result_status") if available else "not_analyzed",
            "analysisId": row.get("analysis_id"),
            "assetId": row.get("analysis_asset_id"),
            "assetFormat": row.get("analysis_asset_format"),
            "inputSha256": row.get("input_content_sha256"),
            "computedAt": row.get("computed_at"),
            "pitchBasis": row.get("pitch_basis") if available else None,
            "globalMinMidi": float(row["global_min_midi"]) if row.get("global_min_midi") is not None else None,
            "globalMaxMidi": float(row["global_max_midi"]) if row.get("global_max_midi") is not None else None,
            "globalMinPitch": row.get("global_min_pitch"),
            "globalMaxPitch": row.get("global_max_pitch"),
            "spanSemitones": float(row["span_semitones"]) if row.get("span_semitones") is not None else None,
            "noteCount": int(row.get("analysis_note_count") or 0),
            "parts": [
                {
                    "partKey": part["part_key"], "partName": part["part_name"],
                    "partIndex": int(part["part_index"]),
                    "soundingMinMidi": float(part["sounding_min_midi"]),
                    "soundingMaxMidi": float(part["sounding_max_midi"]),
                    "soundingMinPitch": part["sounding_min_pitch"],
                    "soundingMaxPitch": part["sounding_max_pitch"],
                    "writtenMinMidi": float(part["written_min_midi"]),
                    "writtenMaxMidi": float(part["written_max_midi"]),
                    "writtenMinPitch": part["written_min_pitch"],
                    "writtenMaxPitch": part["written_max_pitch"],
                    "noteCount": int(part["note_count"]),
                    "staffKeys": _json(part.get("staff_keys_json"), []),
                    "channels": _json(part.get("channels_json"), []),
                    "assignment": part["assignment"],
                    "assignmentConfidence": part.get("assignment_confidence"),
                    "metadata": {},
                }
                for part in (parts or [])
            ],
            "warnings": _json(row.get("warnings_json"), []) if available else [],
            "errors": [],
            "metadata": {
                "extractorName": row.get("extractor_name"),
                "extractorVersion": row.get("extractor_version"),
            } if available else {},
            "projectionReady": False,
        }

    @classmethod
    def _score_summary(cls, row: Mapping[str, Any]) -> dict[str, Any]:
        formats = _json(row.get("formats_json"), [])
        evidence = cls._score_evidence(row)
        ambitus = cls._score_ambitus(row)
        score_id = str(row["score_id"])
        return {
            "scoreId": score_id,
            "sourceRecordId": row["source_record_id"],
            "workKey": row["work_key"],
            "title": row["title"],
            "normalizedTitle": row["normalized_title"],
            "composer": row.get("composer"),
            "catalogNumber": row.get("catalog_number"),
            "instrumentation": row.get("instrumentation"),
            "collection": {"key": row["collection_key"], "displayName": row["collection_name"]},
            "license": {"name": row.get("license_name"), "url": row.get("license_url")},
            "sourceUrl": row["source_url"],
            "formats": formats if isinstance(formats, list) else [],
            "flags": {
                "hasMusicxml": bool(row["has_musicxml"]), "hasMidi": bool(row["has_midi"]),
                "hasPdf": bool(row["has_pdf"]), "hasLilypond": bool(row["has_lilypond"]),
                "hasArchive": any(value in {"compressed_musicxml", "archive"} for value in formats),
                "hasSymbolicScore": bool(row["has_musicxml"] or row["has_midi"] or row["has_lilypond"]),
            },
            "assetCounts": {"total": int(row.get("asset_count") or 0), "downloaded": 0, "failed": 0, "blocked": 0},
            "credentialRequired": False,
            "assetHealth": "source_available",
            "qualityWarnings": ["candidate_instrument_evidence"] if evidence["strength"] == "candidate" else [],
            "evidence": evidence,
            "evidenceStrength": evidence["strength"],
            "evidenceBasis": row["evidence_basis"],
            "ambitusStatus": "available" if row.get("analysis_id") else "not_analyzed",
            "ambitusProjectionReady": False,
            "ambitus": ambitus,
            "schema": {"key": "aggregator.digital_sheet_music_record", "version": "1.0.0", "artifactUri": None},
            "sourceRecordStatus": "source_backed",
            "urls": {"score": f"/scores/{quote(score_id, safe='')}", "api": f"/api/scores/{quote(score_id, safe='')}"},
            "depthAvailable": False,
        }

    def _score_facets(self) -> dict[str, Any]:
        with self._score_facets_cache_lock:
            if self._score_facets_cache is not None:
                return dict(self._score_facets_cache)
            with connect(self.settings) as conn:
                collections = conn.execute(
                    f"""select collection_key,min(collection_name) collection_display_name,count(*)::int count
                        from {SCHEMA}.digital_score group by collection_key order by count desc,collection_key"""
                ).fetchall()
                formats = conn.execute(
                    f"""select asset.format,count(distinct asset.score_id)::int count
                        from {SCHEMA}.digital_score_asset asset group by asset.format order by count desc,asset.format"""
                ).fetchall()
                evidence = conn.execute(
                    f"""select evidence_strength,count(*)::int count from {SCHEMA}.digital_score
                        group by evidence_strength order by evidence_strength desc"""
                ).fetchall()
                analyses = conn.execute(
                    f"""select analysis_status,count(*)::int count from {SCHEMA}.digital_score
                        group by analysis_status order by analysis_status"""
                ).fetchall()
                licenses = conn.execute(
                    f"""select coalesce(license_name,'Not stated') license_name,count(*)::int count
                        from {SCHEMA}.digital_score group by coalesce(license_name,'Not stated')
                        order by count desc,license_name"""
                ).fetchall()
            self._score_facets_cache = {
                "collections": [dict(row) for row in collections],
                "formats": [dict(row) for row in formats],
                "evidence": [dict(row) for row in evidence],
                "analysis": [dict(row) for row in analyses],
                "assetHealth": [{"asset_health": "source_available", "count": sum(row["count"] for row in collections)}],
                "ambitus": [
                    {"ambitus_status": "available" if row["analysis_status"] == "available" else "not_analyzed", "count": row["count"]}
                    for row in analyses
                ],
                "licenses": [dict(row) for row in licenses],
            }
            return dict(self._score_facets_cache)

    def list_digital_scores(
        self, *, mode: str = "surface", query: str = "", collection: str | None = None,
        format: str | None = None, evidence_strength: str | None = None,
        analysis_status: str | None = None, sort: str = "evidence",
        limit: int = 40, offset: int = 0, **_: Any,
    ) -> dict[str, Any]:
        limit = _bounded(limit, 40)
        offset = max(0, int(offset or 0))
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if query.strip():
            clauses.append("to_tsvector('simple',score.search_text) @@ websearch_to_tsquery('simple',%(query)s)")
            params["query"] = query.strip()
        if collection:
            clauses.append("score.collection_key=%(collection)s")
            params["collection"] = collection
        if format:
            clauses.append(f"exists(select 1 from {SCHEMA}.digital_score_asset filter_asset where filter_asset.score_id=score.score_id and filter_asset.format=%(format)s)")
            params["format"] = format
        if evidence_strength:
            clauses.append("score.evidence_strength=%(evidence_strength)s")
            params["evidence_strength"] = evidence_strength
        if analysis_status:
            clauses.append("score.analysis_status=%(analysis_status)s")
            params["analysis_status"] = analysis_status
        where = "where " + " and ".join(clauses) if clauses else ""
        order = {
            "composer": "lower(score.composer) nulls last,lower(score.title),score.score_id",
            "catalog": "lower(score.catalog_number) nulls last,lower(score.title),score.score_id",
            "collection": "lower(score.collection_name),lower(score.title),score.score_id",
            "analyzed": "case when score.analysis_status='available' then 0 else 1 end,lower(score.title),score.score_id",
            "evidence": "case when score.evidence_strength='strong' then 0 else 1 end,case when score.analysis_status='available' then 0 else 1 end,lower(score.title),score.score_id",
        }.get(sort, "lower(score.title),score.score_id")
        select = f"""select score.*,analysis.analysis_id,analysis.asset_id analysis_asset_id,
                            analysis.status analysis_result_status,analysis.extractor_name,analysis.extractor_version,
                            analysis.input_content_sha256,analysis.computed_at,analysis.pitch_basis,
                            analysis.global_min_midi,analysis.global_max_midi,analysis.global_min_pitch,
                            analysis.global_max_pitch,analysis.span_semitones,
                            analysis.note_count analysis_note_count,analysis.warnings_json,
                            analysis_asset.format analysis_asset_format,
                            (select count(*)::int from {SCHEMA}.digital_score_asset asset where asset.score_id=score.score_id) asset_count
                       from {SCHEMA}.digital_score score
                       left join {SCHEMA}.digital_score_analysis analysis using(score_id)
                       left join {SCHEMA}.digital_score_asset analysis_asset on analysis_asset.asset_id=analysis.asset_id"""
        with connect(self.settings) as conn:
            total = conn.execute(f"select count(*)::int count from {SCHEMA}.digital_score score {where}", params).fetchone()["count"]
            rows = conn.execute(f"{select} {where} order by {order} limit %(limit)s offset %(offset)s", params).fetchall()
        return {
            "mode": "surface", "items": [self._score_summary(row) for row in rows],
            "total": total, "limit": limit, "offset": offset, "sort": sort,
            "facets": self._score_facets(),
            "readModel": {"available": True, "rowCount": total, "publicProjection": True, "isFresh": True},
        }

    def get_digital_score(self, score_id: str, *, mode: str = "surface") -> dict[str, Any] | None:
        value = str(score_id or "").strip()
        select = f"""select score.*,analysis.analysis_id,analysis.asset_id analysis_asset_id,
                            analysis.status analysis_result_status,analysis.extractor_name,analysis.extractor_version,
                            analysis.input_content_sha256,analysis.computed_at,analysis.pitch_basis,
                            analysis.global_min_midi,analysis.global_max_midi,analysis.global_min_pitch,
                            analysis.global_max_pitch,analysis.span_semitones,
                            analysis.note_count analysis_note_count,analysis.warnings_json,
                            analysis_asset.format analysis_asset_format,
                            (select count(*)::int from {SCHEMA}.digital_score_asset asset where asset.score_id=score.score_id) asset_count
                       from {SCHEMA}.digital_score score
                       left join {SCHEMA}.digital_score_analysis analysis using(score_id)
                       left join {SCHEMA}.digital_score_asset analysis_asset on analysis_asset.asset_id=analysis.asset_id"""
        with connect(self.settings) as conn:
            row = conn.execute(f"{select} where score.score_id=%(value)s or score.source_record_id=%(value)s limit 1", {"value": value}).fetchone()
            if not row:
                return None
            assets = conn.execute(
                f"select * from {SCHEMA}.digital_score_asset where score_id=%(score_id)s order by position,asset_id",
                {"score_id": row["score_id"]},
            ).fetchall()
            parts = conn.execute(
                f"select * from {SCHEMA}.digital_score_part_range where analysis_id=%(analysis_id)s order by part_index,part_key",
                {"analysis_id": row.get("analysis_id") or ""},
            ).fetchall()
            related = conn.execute(
                f"""select score.*,null::text analysis_id,
                            (select count(*)::int from {SCHEMA}.digital_score_asset asset where asset.score_id=score.score_id) asset_count
                       from {SCHEMA}.digital_score score
                      where score.work_key=%(work_key)s and score.score_id<>%(score_id)s
                        and %(has_catalog)s and nullif(trim(score.catalog_number),'') is not null
                      order by lower(score.collection_name),lower(score.title),score.score_id limit 12""",
                {"work_key": row["work_key"], "score_id": row["score_id"],
                 "has_catalog": bool(str(row.get("catalog_number") or "").strip()) and not str(row["work_key"]).endswith(":unknown")},
            ).fetchall()
            collection = conn.execute(
                f"select * from {SCHEMA}.digital_score_collection where collection_key=%(key)s",
                {"key": row["collection_key"]},
            ).fetchone()
        summary = self._score_summary(row)
        summary["ambitus"] = self._score_ambitus(row, parts)
        summary["assets"] = [
            {
                "assetId": asset["asset_id"], "scoreId": asset["score_id"],
                "sourceRecordId": row["source_record_id"], "format": asset["format"],
                "role": asset["role"], "label": asset["label"], "fileName": asset["file_name"],
                "downloadStatus": asset["availability"], "contentSha256": asset.get("content_sha256"),
                "contentSizeBytes": asset.get("content_size_bytes"), "url": asset.get("access_url"),
                "resolvedUrl": asset.get("access_url"), "archiveUrl": asset.get("archive_url"),
                "archiveMemberPath": asset.get("archive_member_path"), "position": int(asset["position"]),
                "urls": {"asset": f"/scores/{quote(str(asset['score_id']), safe='')}/assets/{quote(str(asset['asset_id']), safe='')}", "api": f"/api/scores/{quote(str(asset['score_id']), safe='')}/assets/{quote(str(asset['asset_id']), safe='')}", "midi": None},
                "depthAvailable": False,
            }
            for asset in assets
        ]
        summary.update({
            "evidenceLabel": summary["evidence"]["label"],
            "collectionDetails": {
                "key": collection["collection_key"],
                "name": collection["name"],
                "description": collection["description"],
                "homepageUrl": collection["homepage_url"],
                "scoreCount": int(collection["score_count"]),
                "evidenceNote": collection["evidence_note"],
                "licenseNote": collection["license_note"],
            } if collection else None,
            "relatedEditions": [self._score_summary(item) for item in related],
            "sections": {
                "overview": {"sourceUrl": row["source_url"], "collection": summary["collection"], "license": summary["license"]},
                "projection": {"enabled": False, "status": "not_applicable", "ambitusProjectionReady": False, "message": "The musical range is a descriptive score summary and is not projected onto an organ."},
                "ambitus": summary["ambitus"],
                "midi": [asset for asset in summary["assets"] if asset["format"] == "midi"],
            },
        })
        return summary

    def get_digital_score_asset(self, score_id: str, asset_id: str, *, mode: str = "surface") -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                f"""select asset.*,score.source_record_id,score.title score_title,score.composer,
                            score.collection_key,score.collection_name
                       from {SCHEMA}.digital_score_asset asset join {SCHEMA}.digital_score score using(score_id)
                      where asset.score_id=%(score_id)s and asset.asset_id=%(asset_id)s limit 1""",
                {"score_id": score_id, "asset_id": asset_id},
            ).fetchone()
        if not row:
            return None
        return {
            "assetId": row["asset_id"], "scoreId": row["score_id"], "sourceRecordId": row["source_record_id"],
            "format": row["format"], "role": row["role"], "label": row["label"], "fileName": row["file_name"],
            "downloadStatus": row["availability"], "contentSha256": row.get("content_sha256"),
            "contentSizeBytes": row.get("content_size_bytes"), "url": row.get("access_url"),
            "resolvedUrl": row.get("access_url"), "archiveUrl": row.get("archive_url"),
            "archiveMemberPath": row.get("archive_member_path"), "position": int(row["position"]),
            "parentScore": {"scoreId": row["score_id"], "title": row["score_title"], "composer": row.get("composer"), "collection": {"key": row["collection_key"], "displayName": row["collection_name"]}, "assetHealth": "source_available", "ambitusStatus": None, "url": f"/scores/{quote(str(row['score_id']), safe='')}"},
            "depthAvailable": False,
        }

    @staticmethod
    def _tuning_summary(row: Mapping[str, Any]) -> dict[str, Any]:
        memberships = _json(row.get("group_memberships_json"), [])
        tone_order = _json(row.get("tone_order_json"), [])
        cent_values = _json(row.get("cent_values_json"), [])
        group_memberships = [
            {
                "groupKey": item.get("group_key"), "groupTitle": item.get("group_title"),
                "label": " · ".join(value for value in (item.get("group_key", "").replace("_", " ").title(), item.get("group_title")) if value),
            }
            for item in memberships if isinstance(item, Mapping)
        ] if isinstance(memberships, list) else []
        tuning_id = str(row["tuning_id"])
        values = [float(value) for value in cent_values] if isinstance(cent_values, list) else []
        precise = bool(row.get("is_precise_variant"))
        return {
            "id": tuning_id, "tuningId": tuning_id, "entityId": None,
            "sourceRecordId": row["source_record_id"], "label": row["label"],
            "title": row["title"], "groupKey": row.get("group_key"),
            "groupTitle": row.get("group_title"),
            "groupLabel": " · ".join(value for value in (
                _first_text(row.get("group_key")).replace("_", " ").title(),
                _first_text(row.get("group_title")),
            ) if value) or "Ungrouped",
            "groupMemberships": group_memberships,
            "precision": {"isPreciseVariant": precise, "label": "Precise" if precise else "Rounded", "variant": "precise" if precise else "rounded"},
            "toneOrder": tone_order if isinstance(tone_order, list) else [],
            "centValues": values, "centstr": row.get("centstr"),
            "centVectorPreview": ",".join(f"{value:g}" for value in values[:6]) + (", ..." if len(values) > 6 else ""),
            "commentary": {"available": bool(row.get("commentary_available")), "url": row.get("commentary_url"), "literatureEntries": []},
            "literatureCount": int(row.get("literature_count") or 0),
            "source": {"key": "bdo_tuning_systems", "name": row["source_name"], "url": "https://bund-deutscher-orgelbaumeister.de/stimmungen/", "retrievedAt": row.get("last_seen_at")},
            "sourceUrl": row.get("source_url"), "commentaryUrl": row.get("commentary_url"),
            "status": "published", "schema": {"key": row["schema_key"], "version": row.get("schema_version"), "name": "MODAVIS Tuning System Record"},
            "counts": {"documents": 0, "entityRefs": 0, "events": 0, "literature": int(row.get("literature_count") or 0), "links": int(bool(row.get("source_url"))) + int(bool(row.get("commentary_url")))},
            "lastSeenAt": row.get("last_seen_at") or row.get("first_seen_at"),
            "urls": {"temperament": f"/temperaments/{quote(tuning_id, safe='')}", "api": f"/api/temperaments/{quote(tuning_id, safe='')}"},
            "depthAvailable": False, "publicProjection": True,
            "searchText": row.get("search_text") or "",
        }

    def _tuning_systems(self) -> list[dict[str, Any]]:
        with self._tuning_system_cache_lock:
            if self._tuning_system_cache is None:
                with connect(self.settings) as conn:
                    rows = conn.execute(
                        f"select * from {SCHEMA}.tuning_system order by group_key nulls last, title, tuning_id"
                    ).fetchall()
                self._tuning_system_cache = [self._tuning_summary(row) for row in rows]
            return [dict(item) for item in self._tuning_system_cache]

    @staticmethod
    def _tuning_facets(items: list[Mapping[str, Any]]) -> dict[str, Any]:
        groups = Counter(_first_text(item.get("groupKey")) for item in items if _first_text(item.get("groupKey")))
        precise = sum(bool(item.get("precision", {}).get("isPreciseVariant")) for item in items)
        commentary = sum(bool(item.get("commentary", {}).get("available")) for item in items)
        return {
            "groups": [{"value": key, "groupKey": key, "label": key.replace("_", " ").title(), "count": count} for key, count in sorted(groups.items(), key=lambda pair: (-pair[1], pair[0]))],
            "precision": [{"value": "precise", "label": "Precise variants", "count": precise}, {"value": "rounded", "label": "Rounded values", "count": len(items) - precise}],
            "commentary": [{"value": "available", "label": "Commentary available", "count": commentary}, {"value": "missing", "label": "No commentary", "count": len(items) - commentary}],
        }

    def list_tuning_systems(
        self, *, mode: str = "surface", limit: int = 40, offset: int = 0,
        query: str | None = None, group_key: str | None = None,
        precise_variant: bool | None = None, commentary_available: bool | None = None,
        commentary_query: str | None = None, query_scope: str | None = None,
    ) -> dict[str, Any]:
        limit = _bounded(limit, 40)
        offset = max(0, int(offset or 0))
        items = self._tuning_systems()
        lookup = search_temperaments(query, items, identity_only=query_scope == "identity")
        filtered = []
        for item in items:
            if str(item["id"]) not in lookup.ids:
                continue
            if group_key and item.get("groupKey") != group_key:
                continue
            if precise_variant is not None and bool(item["precision"]["isPreciseVariant"]) != precise_variant:
                continue
            if commentary_available is not None and bool(item["commentary"]["available"]) != commentary_available:
                continue
            if commentary_query and _temperament_match_key(commentary_query) not in _temperament_match_key(item.get("searchText")):
                continue
            filtered.append(item)
        return {
            "mode": "surface", "items": filtered[offset:offset + limit],
            "total": len(filtered), "limit": limit, "offset": offset,
            "query": (query or "").strip(),
            "searchInterpretation": lookup.interpretation,
            "filters": {"query": query, "groupKey": group_key, "preciseVariant": precise_variant, "commentaryAvailable": commentary_available, "commentaryQuery": commentary_query, "queryScope": query_scope},
            "facets": self._tuning_facets(filtered),
            "source": {"schemaKey": "aggregator.tuning_system_record", "sourceKey": "bdo_tuning_systems", "rowCount": len(self._tuning_systems()), "publicProjection": True},
        }

    def get_tuning_system(self, tuning_id: str, *, mode: str = "surface") -> dict[str, Any] | None:
        value = str(tuning_id or "").strip()
        with connect(self.settings) as conn:
            row = conn.execute(
                f"""select * from {SCHEMA}.tuning_system
                    where tuning_id=%(value)s or source_record_id=%(value)s or label=%(value)s
                    limit 1""", {"value": value},
            ).fetchone()
            if not row:
                return None
            citations = conn.execute(
                f"select * from {SCHEMA}.tuning_system_literature where tuning_id=%(id)s order by citation_id",
                {"id": row["tuning_id"]},
            ).fetchall()
        detail = self._tuning_summary(row)
        derived = _json(row.get("derived_intervals_json"), {})
        reference = _json(row.get("cent_reference_json"), {})
        tones = detail["toneOrder"]
        cents = detail["centValues"]
        absolute = {item.get("tone"): item.get("cents") for item in derived.get("absolute_cents", []) if isinstance(item, Mapping)}
        relative = {item.get("tone"): item.get("cents") for item in derived.get("relative_to_a", []) if isinstance(item, Mapping)}
        detail.update({
            "evidenceLabel": "BDO tuning-system record",
            "centReference": reference if isinstance(reference, Mapping) else {},
            "toneRows": [{"index": index, "tone": tone, "cent": cents[index] if index < len(cents) else None, "absoluteCent": absolute.get(tone), "relativeToA": relative.get(tone)} for index, tone in enumerate(tones)],
            "derivedIntervals": {
                "calculationBasis": derived.get("calculation_basis"),
                "precisionVariant": derived.get("precision_variant"),
                "absoluteCents": derived.get("absolute_cents", []),
                "fifths": derived.get("fifths", []),
                "majorThirds": derived.get("major_thirds", []),
                "relativeToA": derived.get("relative_to_a", []),
            },
            "commentarySections": [],
            "literature": [{"entityId": item["citation_id"], "citationText": item["citation_text"], "sourceUrl": item.get("source_url"), "sourcePath": item.get("source_path"), "sourcePageIsProvenance": bool(item.get("source_page_is_provenance"))} for item in citations],
            "links": [item for item in (
                {"url": row.get("source_url"), "label": "BDO tuning visualization", "kind": "source_record"} if row.get("source_url") else None,
                {"url": row.get("commentary_url"), "label": "BDO commentary", "kind": "commentary"} if row.get("commentary_url") else None,
            ) if item],
            "provenance": {}, "quality": {}, "identifiers": [{"scheme": "BDO", "value": row["tuning_id"]}],
            "documents": [], "entityRefs": [], "literatureRefs": [], "linkRefs": [], "events": [],
            "sourceSnapshot": {}, "extensions": {},
        })
        return detail

    def list_organs_for_tuning_system(
        self, tuning_id: str, *, limit: int = 200, offset: int = 0,
    ) -> dict[str, Any] | None:
        temperament = self.get_tuning_system(tuning_id, mode="surface")
        if not temperament:
            return None
        family_term = _temperament_family_term(temperament)
        if not family_term:
            rows = []
        else:
            with connect(self.settings) as conn:
                rows = conn.execute(
                    f"""select assertion.*, organ.label as title,
                               assertion.organ_mdvs_id as target_mdvs_id
                        from {SCHEMA}.organ_temperament_assertion assertion
                        join {SCHEMA}.organ organ on organ.mdvs_id=assertion.organ_mdvs_id
                        where assertion.source_value ilike %(family)s
                        order by assertion.organ_mdvs_id, assertion.source_record_id""",
                    {"family": f"%{family_term}%"},
                ).fetchall()
        organs: dict[str, dict[str, Any]] = {}
        rank = {"exact_variant": 0, "family_wording": 1}
        for row in rows:
            match_kind = _temperament_source_match_kind(row.get("source_value"), temperament)
            mdvs_id = _first_text(row.get("target_mdvs_id"))
            if not match_kind or not mdvs_id:
                continue
            organ = organs.setdefault(mdvs_id, {
                "mdvsId": mdvs_id, "title": row.get("title") or mdvs_id,
                "url": _organ_page_route(mdvs_id),
                "country": row.get("country") or "Country not recorded",
                "location": ", ".join(dict.fromkeys(value for value in (row.get("building"), row.get("town"), row.get("country")) if value)),
                "matchKind": match_kind, "assertions": [],
            })
            if rank[match_kind] < rank[organ["matchKind"]]:
                organ["matchKind"] = match_kind
            assertion = {"source": row.get("source_key"), "sourceRecordId": row.get("source_record_id"), "sourceUrl": row.get("source_url"), "sourceValue": row.get("source_value"), "matchKind": match_kind}
            if assertion not in organ["assertions"]:
                organ["assertions"].append(assertion)
        items = sorted(organs.values(), key=lambda item: (rank[item["matchKind"]], str(item["country"]).casefold(), str(item["title"]).casefold(), item["mdvsId"]))
        counts = Counter(item["matchKind"] for item in items)
        page = items[offset:offset + _bounded(limit, 200, 1000)]
        groups = []
        for key, label, guidance in (
            ("exact_variant", "Exact variant assertions", "The cited source wording uniquely names this tuning-system record."),
            ("family_wording", "Related temperament-family wording", "The source names the temperament family, but does not prove this exact cent-vector variant."),
        ):
            if not counts.get(key):
                continue
            countries: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for item in page:
                if item["matchKind"] == key:
                    countries[item["country"]].append(item)
            groups.append({"key": key, "label": label, "guidance": guidance, "total": counts[key], "countries": [{"country": country, "count": len(country_items), "items": country_items} for country, country_items in countries.items()]})
        return {
            "temperament": {"id": temperament["id"], "label": temperament["label"], "title": temperament["title"]},
            "items": page, "groups": groups, "total": len(items),
            "exactVariantCount": counts.get("exact_variant", 0), "familyWordingCount": counts.get("family_wording", 0),
            "limit": limit, "offset": offset, "hasMore": offset + limit < len(items),
            "evidenceBoundary": "Exact source wording and family-level wording are grouped separately; family evidence never asserts one specific cent vector.",
            "publicProjection": True,
        }

    def _organ_virtual_instruments(self, mdvs_id: str) -> dict[str, Any]:
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"""select vi.*, rel.confidence, rel.resolution_state, rel.represented_organ_label
                    from {SCHEMA}.organ_virtual_instrument rel
                    join {SCHEMA}.virtual_instrument vi on vi.mdvs_id=rel.vmi_mdvs_id
                    where rel.organ_mdvs_id=%(id)s
                    order by vi.canonical_title, vi.mdvs_id""",
                {"id": mdvs_id},
            ).fetchall()
        items = [
            {
                "id": row["mdvs_id"],
                "title": row["canonical_title"],
                "canonicalUrl": catalogue_path(str(row["mdvs_id"]), "virtual-instruments"),
                "relationshipState": row["resolution_state"],
                "score": row.get("confidence"),
                "confidenceTier": self._confidence_tier(row.get("confidence")),
                "method": "release_1_5_reconciliation",
                "sourceLinks": [],
            }
            for row in rows
        ]
        linked = sum(item["relationshipState"] in {"accepted", "accepted_canonical_organ_relation"} for item in items)
        return {
            "available": bool(items), "organMdvsId": mdvs_id, "total": len(items),
            "linked": linked, "probableSuggestions": len(items) - linked,
            "inheritedSubordinateCount": 0,
            "guidance": f"Accepted and retained public virtual-instrument relationships from Release {self.policy.release_version}.",
            "items": items,
        }

    @staticmethod
    def _confidence_tier(value: Any) -> str:
        if value is None:
            return "unscored"
        score = float(value)
        return "high" if score >= 0.9 else "medium" if score >= 0.7 else "low"

    def list_persons(
        self,
        *,
        query: str | None = None,
        entity_class: str | None = None,
        sort: str | None = None,
        limit: int = 30,
        offset: int = 0,
        **_: Any,
    ) -> dict[str, Any]:
        if self._has_actor_directory():
            return self._list_actor_directory(query=query, entity_class=entity_class, sort=sort,
                limit=limit, offset=offset, source=_.get('source'),
                publication_state=_.get('publication_state'), role=_.get('role'))
        limit = _bounded(limit, 30)
        offset = max(0, int(offset or 0))
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if query:
            clauses.append("sd.search_text ilike %(query)s")
            params["query"] = f"%{query.strip()}%"
        if entity_class in {"person", "organization"}:
            clauses.append("a.actor_type=%(entity_class)s")
            params["entity_class"] = entity_class
        where = "where " + " and ".join(clauses) if clauses else ""
        order = "organ_count desc, a.label, a.mdvs_id" if sort == "organs" else "a.label, a.mdvs_id"
        sql = f"""
            select a.*, sd.search_text,
                   count(distinct b.organ_mdvs_id)::int as organ_count,
                   coalesce(sum(b.assertion_count),0)::int as assertion_count
            from {SCHEMA}.actor a
            left join {SCHEMA}.actor_search_document sd on sd.actor_mdvs_id=a.mdvs_id
            left join {SCHEMA}.organ_builder b on b.actor_mdvs_id=a.mdvs_id
            {where}
            group by a.actor_pk, a.mdvs_id, a.canonical_uri, a.label, a.actor_type,
                     a.structured_name_count, sd.search_text
        """
        with connect(self.settings) as conn:
            total = conn.execute(
                f"select count(*)::int as count from {SCHEMA}.actor a left join {SCHEMA}.actor_search_document sd on sd.actor_mdvs_id=a.mdvs_id {where}",
                params,
            ).fetchone()["count"]
            rows = conn.execute(f"{sql} order by {order} limit %(limit)s offset %(offset)s", params).fetchall()
            class_rows = conn.execute(
                f"select actor_type as class, count(*)::int as count from {SCHEMA}.actor group by actor_type order by actor_type"
            ).fetchall()
        items = [self._person_summary(row) for row in rows]
        return {
            "query": query or "", "items": items, "total": total, "limit": limit, "offset": offset,
            "page": {"loaded": len(items), "hasMore": offset + len(items) < total,
                     "nextOffset": offset + len(items) if offset + len(items) < total else None,
                     "previousOffset": max(0, offset - limit) if offset else None},
            "filters": {"entityClass": entity_class or "", "sort": sort or ""},
            "facets": {
                "sources": [],
                "publicationStates": [{"state": "canonical", "label": "Canonical", "count": total}],
                "roles": [{"role": "builder", "label": "Builder", "count": total}],
                "entityClasses": [{"class": row["class"], "label": str(row["class"]).title(), "count": row["count"]} for row in class_rows],
                "sortOptions": [{"value": "label", "label": "Name"}, {"value": "organs", "label": "Associated organs"}],
            },
            "counts": {"canonical": total, "sourceMentioned": 0, "musixplora": 0},
            "source": "release_1_5_public",
        }

    def _person_summary(self, row: Mapping[str, Any]) -> dict[str, Any]:
        mdvs_id = str(row["mdvs_id"])
        actor_type = str(row["actor_type"])
        route = self._actor_route(mdvs_id, actor_type)
        organ_count = int(row.get("organ_count") or 0)
        return {
            "id": mdvs_id, "kind": "canonical_person", "publicationState": "canonical",
            "publicationStateLabel": "Canonical", "entityClass": actor_type,
            "entityClassLabel": actor_type.title(), "title": row["label"], "label": row["label"],
            "mdvsId": mdvs_id, "canonicalUrl": route, "detailUrl": route,
            "apiUrl": f"/api/entities/{'organizations' if actor_type == 'organization' else 'people'}/{quote(mdvs_id, safe='')}",
            "summary": f"Canonical {actor_type} linked to {organ_count} pipe organ(s).",
            "sourceKeys": [], "sourceLabels": [], "sourceRecordCount": int(row.get("assertion_count") or 0),
            "candidateCount": 0, "occurrenceCount": int(row.get("assertion_count") or 0),
            "associatedOrganCount": organ_count, "aliases": [], "roleTags": ["Builder"],
            "identifiers": [{"scheme": "MODAVIS", "value": mdvs_id, "url": row["canonical_uri"]}],
            "badges": [actor_type.title(), "Reconciled"],
        }

    def _resolve_actor_mdvs_id(self, actor_id: str) -> tuple[str, str | None] | None:
        value = str(actor_id or "").strip()
        with connect(self.settings) as conn:
            row = conn.execute(
                f"select mdvs_id from {SCHEMA}.actor where mdvs_id=%(value)s or replace(mdvs_id,'MDVS:ENTY:','')=%(value)s",
                {"value": value},
            ).fetchone()
            if row:
                return str(row["mdvs_id"]), None
            alias = conn.execute(
                f"select canonical_mdvs_id from {SCHEMA}.actor_alias where alias_mdvs_id=%(value)s or replace(alias_mdvs_id,'MDVS:ENTY:','')=%(value)s",
                {"value": value},
            ).fetchone()
        return (str(alias["canonical_mdvs_id"]), value) if alias else None

    def get_actor(self, actor_id: str, *, summary: bool = False) -> dict[str, Any] | None:
        resolved = self._resolve_actor_mdvs_id(actor_id)
        if not resolved:
            return None
        mdvs_id, resolved_from = resolved
        with connect(self.settings) as conn:
            actor = conn.execute(
                f"select * from {SCHEMA}.actor where mdvs_id=%(id)s", {"id": mdvs_id}
            ).fetchone()
            names = conn.execute(
                f"""select n.* from {SCHEMA}.actor_name an
                    join {SCHEMA}.structured_name n on n.name_mdvs_id=an.name_mdvs_id
                    where an.actor_mdvs_id=%(id)s order by n.display_name, n.name_mdvs_id""",
                {"id": mdvs_id},
            ).fetchall()
            aliases = conn.execute(
                f"select * from {SCHEMA}.actor_alias where canonical_mdvs_id=%(id)s order by alias_mdvs_id",
                {"id": mdvs_id},
            ).fetchall()
            from .actor_label_evidence import read_public
            label_evidence = read_public(conn, [mdvs_id])
            organs = conn.execute(
                f"""select o.mdvs_id, o.label, b.assertion_count
                    from {SCHEMA}.organ_builder b join {SCHEMA}.organ o on o.mdvs_id=b.organ_mdvs_id
                    where b.actor_mdvs_id=%(id)s order by o.label, o.mdvs_id""",
                {"id": mdvs_id},
            ).fetchall() if not summary else []
            identifiers = conn.execute(
                f"SELECT * FROM {SCHEMA}.actor_external_identifier WHERE actor_mdvs_id=%(id)s ORDER BY scheme_code,identifier_value",
                {"id": mdvs_id},
            ).fetchall() if self._has_entity_exports() else []
            temporal = conn.execute(
                f"SELECT * FROM {SCHEMA}.actor_temporal_assertion WHERE actor_mdvs_id=%(id)s ORDER BY start_year NULLS LAST,temporality_mdvs_id",
                {"id": mdvs_id},
            ).fetchall() if self._has_entity_exports() else []
        if not actor:
            return None
        actor_type = str(actor["actor_type"])
        category = "organizations" if actor_type == "organization" else "people"
        route = self._actor_route(mdvs_id, actor_type)
        name_items = [
            {
                "mdvsId": row["name_mdvs_id"], "value": row["display_name"],
                "displayName": row["display_name"],
                "pageUrl": f"/names/{quote(str(row['name_mdvs_id']).removeprefix('MDVS:NAME:'), safe='-._~')}",
                "canonicalUri": row["canonical_uri"],
            }
            for row in names
        ]
        relationships = [
            {
                "id": f"{mdvs_id}:{row['mdvs_id']}", "direction": "outgoing",
                "relationType": "builder_of", "relationLabel": "Builder of",
                "label": row["label"], "relationship": "Builder of", "kind": "Organ",
                "mdvsId": row["mdvs_id"],
                "entityPageUrl": _organ_page_route(row["mdvs_id"]),
                "relatedLabel": row["label"], "relatedMdvsId": row["mdvs_id"],
                "relatedUrl": _organ_page_route(row["mdvs_id"]),
                "evidenceSummary": f"{row['assertion_count']} source assertion(s).",
            }
            for row in organs
        ]
        mentions = [] if summary else self._actor_mentions(mdvs_id)
        counts = self._actor_collection_summary(mdvs_id) if summary else None
        identifier_items = [{"scheme": "MODAVIS", "value": mdvs_id, "url": actor["canonical_uri"]}] + [
            {
                "id": item["identifier_mdvs_id"], "scheme": item["scheme_code"],
                "schemeLabel": item["scheme_label"], "value": item["identifier_value"],
                "url": item.get("identifier_url"),
            }
            for item in identifiers
        ]
        date_items = [
            {
                "id": item["temporality_mdvs_id"], "kind": str(item.get("anchor_code") or "activity").removeprefix("anchetype:"),
                "label": item.get("anchor_label") or "Documented date", "display": item.get("raw_expression") or item.get("start_year") or item.get("end_year"),
                "start": item.get("start_date"), "end": item.get("end_date"),
                "startYear": item.get("start_year"), "endYear": item.get("end_year"),
            }
            for item in temporal
        ]
        return {
            "id": mdvs_id, "mdvsId": mdvs_id, "resolvedFromMdvsId": resolved_from,
            "coreEntityId": int(actor["actor_pk"]), "kind": "canonical_actor", "category": category,
            "title": actor["label"], "label": actor["label"], "entityType": actor_type,
            "entityTypeCode": actor_type, "entityTypeLabel": actor_type.title(), "status": "canonical",
            "canonicalUrl": route,
            "apiUrl": f"/api/entities/{category}/{quote(mdvs_id, safe='')}",
            "profile": {"names": name_items, "preferredNames": name_items[:1], "variantNames": name_items[1:], "identifiers": identifier_items, "dates": date_items},
            "publicProfile": {
                "status": "canonical", "summary": f"Reconciled {actor_type} identity.",
                "factCount": len(name_items), "evidenceCount": counts["evidenceCount"] if counts else sum(int(row["assertion_count"]) for row in organs),
                "relationshipCount": counts["relationshipCount"] if counts else len(relationships),
                "sections": [{"key": "names", "title": "Structured names", "items": [{"label": item["value"], "value": item["mdvsId"], "url": item["pageUrl"]} for item in name_items]}],
            },
            "labelInterpretations": list(label_evidence.values()),
            "relationships": relationships,
            "candidateSupport": [], "candidateSupportCount": 0,
            "identityAliases": [{"mdvsId": row["alias_mdvs_id"], "label": row.get("alias_label") or row["alias_mdvs_id"], "sharedEvidenceCount": 1} for row in aliases],
            "identityProjection": {"releaseVersion": self.policy.release_version, "projectionId": aliases[0]["projection_id"] if aliases else None, "differentAuthorityIdentifiersRemainDistinct": True},
            "sourceRecords": [], "sourceRecordCount": counts["sourceRecordCount"] if counts else len(mentions),
            "sourceFamilyCount": len(counts["sourceCollections"]) if counts else len({m["sourceFamily"] for m in mentions}),
            "sourceMentions": mentions,
            **({"eventEvidence": self._actor_event_evidence(mdvs_id), "collectionDelivery": {
                "mode": "paginated", "pageSize": 100,
                "scope": "Builder assertions and their supporting source records",
                "mentionsUrl": f"/api/actors/{quote(mdvs_id, safe='')}/mentions",
                "relationshipsUrl": f"/api/actors/{quote(mdvs_id, safe='')}/relationships",
                "sourceCollections": counts["sourceCollections"],
            }} if summary else {}),
            "guidance": f"Documented in MODAVIS Pipe Organ Dataset {self.policy.release_version}.",
            "promotionState": "accepted_release_projection",
            "export": self.entity_export_manifest("organization" if actor_type == "organization" else "person", mdvs_id),
        }

    def get_structured_name(self, name_id: str) -> dict[str, Any] | None:
        value = str(name_id or "").strip()
        with connect(self.settings) as conn:
            row = conn.execute(
                f"select * from {SCHEMA}.structured_name where name_mdvs_id=%(value)s or replace(name_mdvs_id,'MDVS:NAME:','')=%(value)s",
                {"value": value},
            ).fetchone()
            if not row:
                return None
            entities = conn.execute(
                f"""select a.mdvs_id, a.label, a.actor_type from {SCHEMA}.actor_name an
                    join {SCHEMA}.actor a on a.mdvs_id=an.actor_mdvs_id
                    where an.name_mdvs_id=%(id)s order by a.label, a.mdvs_id""",
                {"id": row["name_mdvs_id"]},
            ).fetchall()
            from .actor_label_evidence import read_public
            label_evidence = read_public(conn, [item["mdvs_id"] for item in entities])
        components = [
            {"key": key, "label": key.replace("_", " ").title(), "value": str(row[key])}
            for key in ("given_name", "middle_names", "family_name", "particle", "prefix", "suffix")
            if row.get(key)
        ]
        mdvs_id = str(row["name_mdvs_id"])
        token = mdvs_id.removeprefix("MDVS:NAME:")
        return {
            "id": mdvs_id, "mdvsId": mdvs_id, "kind": "structured_name", "title": row["display_name"],
            "canonicalUrl": f"/names/{quote(token, safe='-._~')}",
            "apiUrl": f"/api/entities/names/{quote(mdvs_id, safe='')}",
            "type": {"mdvsId": "MDVS:TYPE:structured-name", "code": "structured_name", "name": "Structured name"},
            "forms": {key: row.get(column) for key, column in (("display", "display_name"), ("canonical", "display_name"), ("abbreviation", "abbreviation"), ("romanization", "romanization"), ("transliteration", "transliteration"))},
            "components": components, "verificationScore": row.get("verification_score"),
            "isNative": bool(row["is_native"]) if row.get("is_native") is not None else None,
            "labelInterpretations": list(label_evidence.values()),
            "variants": [],
            "relatedEntities": [
                {"mdvsId": item["mdvs_id"], "label": item["label"], "kind": item["actor_type"], "pageUrl": self._actor_route(str(item["mdvs_id"]), str(item["actor_type"]))}
                for item in entities
            ],
            "releaseVersion": self.policy.release_version, "guidance": "Structured public name form and its canonical entity links.",
            "export": self.entity_export_manifest("name", mdvs_id),
        }

    @staticmethod
    def _event_summary(row: Mapping[str, Any]) -> dict[str, Any]:
        event_id = str(row["event_id"])
        event_type = row.get("controlled_event_type") or row.get("source_event_type") or "documented_event"
        date_claims = _date_claims(row.get("date_values_json"))
        subject_id = str(row["organ_mdvs_id"])
        mapping_kind = row.get("mapping_kind") or ("source_only" if row.get("source_only") else "controlled")
        display_name = str(event_type).replace("_", " ").title()
        date_label = ", ".join(claim["display"] for claim in date_claims) if date_claims else "Undated"
        return {
            "id": event_id, "mdvsId": event_id,
            "title": display_name,
            # Timeline aliases are retained because the standard Navigator
            # component consumes this stable public read-model vocabulary.
            "label": display_name,
            "date": date_label,
            "certainty": "Documented",
            "eventType": event_type,
            "sourceOnly": bool(row.get("source_only")),
            "sourceReported": True,
            "description": "Documented source event assertion.",
            "sourceEventType": row.get("source_event_type"),
            "retainedRepresentations": row.get("retainedRepresentations", []),
            "type": {"code": row.get("concept_code") or event_type, "name": event_type, "displayName": display_name, "mappingKind": mapping_kind},
            "mappingKind": mapping_kind,
            "temporalStatus": {"code": "historical" if date_claims else "undated", "label": "Dated" if date_claims else "Undated", "explanation": "Structured source date values."},
            "when": {
                "rawExpression": date_label if date_claims else None,
                "start": (date_claims[0].get("startDate") or (str(date_claims[0]["startYear"]) if date_claims[0]["startYear"] is not None else None)) if date_claims else None,
                "end": (date_claims[-1].get("endDate") or (str(date_claims[-1]["endYear"]) if date_claims[-1]["endYear"] is not None else None)) if date_claims else None,
            },
            "subject": {"id": subject_id, "mdvsId": subject_id, "title": row.get("organ_label") or subject_id, "pageUrl": _organ_page_route(subject_id)},
            "participants": row.get("participants", []), "places": row.get("places", []),
            "description": row.get("description"), "technicalFacts": row.get("technicalFacts", []),
            "unresolvedAttributions": row.get("unresolvedAttributions", []),
            "counts": {"participants": len(row.get("participants", [])), "locations": len(row.get("places", [])), "sources": 1},
            "completeness": {"state": "complete", "required": {"identity": True, "type": True, "subject": True, "source": True}, "missingOptional": [key for key, value in (("participants", row.get("participants")), ("locations", row.get("places"))) if not value]},
            "movement": row.get("movement") or {"status": "unresolved"},
            "source": {"id": row["source_record_id"], "source": row["source_key"], "title": row["source_key"], "status": "Structured event assertion", "url": row.get("source_url")},
            "pageUrl": f"/events/{quote(event_id, safe='')}",
        }

    @lru_cache(maxsize=1)
    def _public_event_facets(self) -> list[dict[str, Any]]:
        with connect(self.settings) as conn:
            return conn.execute(
                f"""select coalesce(controlled_event_type,source_event_type,'unspecified') as value,
                           count(*)::int as count
                    from {SCHEMA}.documented_event group by 1 order by count desc, value"""
            ).fetchall()

    @lru_cache(maxsize=128)
    def list_events(
        self, *, query: str | None = None, subject: str | None = None,
        event_type: str | None = None, source: str | None = None,
        participant: str | None = None,
        year_from: int | None = None, year_to: int | None = None,
        sort: str | None = None, limit: int = 30, offset: int = 0, route: str | None = None, **_: Any,
    ) -> dict[str, Any]:
        limit = _bounded(limit, 30)
        offset = max(0, int(offset or 0))
        clauses: list[str] = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if participant:
            resolved = self._resolve_actor_mdvs_id(participant)
            if resolved:
                clauses.append(f"e.event_id IN (SELECT c.event_id FROM {SCHEMA}.documented_event_context c WHERE c.participants_json::jsonb @> %(participant_match)s::jsonb)")
                params["participant_match"] = json.dumps([{"targetId": resolved[0]}])
            else:
                clauses.append("false")
        if query:
            clauses.append("(e.event_id ilike %(query)s or e.source_event_type ilike %(query)s or e.controlled_event_type ilike %(query)s or e.organ_mdvs_id ilike %(query)s "
                           f"or exists(select 1 from {SCHEMA}.organ o where o.mdvs_id=e.organ_mdvs_id and o.label ilike %(query)s))")
            params["query"] = f"%{query.strip()}%"
        if subject:
            clauses.append(f"exists(select 1 from {SCHEMA}.organ o where o.mdvs_id=e.organ_mdvs_id and (o.mdvs_id=%(subject)s or replace(o.mdvs_id,'MDVS:ENTY:','')=%(subject)s or o.label ilike %(subject_label)s))")
            params.update(subject=subject, subject_label=f"%{subject.strip()}%")
        if event_type:
            clauses.append("coalesce(e.controlled_event_type,e.source_event_type,'unspecified')=%(event_type)s")
            params["event_type"] = event_type
        if source:
            clauses.append("e.source_key=%(source)s")
            params["source"] = source
        if route in {"mapped","unresolved"}:
            clauses.append("e.controlled_event_type='transfer'")
            ids=sorted({x["eventMdvsId"] for x in self.public_relocation_movements() if x["status"]=="linked_complete_route"})
            params["mapped_ids"]=ids
            clauses.append(("" if route=="mapped" else "not ")+"(e.event_id=ANY(%(mapped_ids)s))")
        date_join = """left join lateral (
            select min(coalesce((d->>'startYear')::int,(d->>'endYear')::int)) as year_start,
                   max(coalesce((d->>'endYear')::int,(d->>'startYear')::int)) as year_end
            from jsonb_array_elements(e.date_values_json::jsonb) d
        ) dates on true"""
        if year_from is not None:
            clauses.append("dates.year_end >= %(year_from)s")
            params["year_from"] = year_from
        if year_to is not None:
            clauses.append("dates.year_start <= %(year_to)s")
            params["year_to"] = year_to
        where = "where " + " and ".join(clauses) if clauses else ""
        order = {
            "oldest": "dates.year_start asc nulls last, e.event_id",
            "type": "coalesce(e.controlled_event_type,e.source_event_type), dates.year_end desc nulls last, e.event_id",
        }.get(sort, "dates.year_end desc nulls last, e.event_id")
        with connect(self.settings) as conn:
            total = conn.execute(
                f"select count(*)::int as count from {SCHEMA}.documented_event e "
                f"{date_join if year_from is not None or year_to is not None else ''} {where}", params,
            ).fetchone()["count"]
            rows = conn.execute(
                f"select e.*, (select o.label from {SCHEMA}.organ o where o.mdvs_id=e.organ_mdvs_id) as organ_label "
                f"from {SCHEMA}.documented_event e {date_join} {where} "
                f"order by {order} limit %(limit)s offset %(offset)s", params,
            ).fetchall()
        facets = self._public_event_facets()
        return {
            "items": [self._event_summary(row) for row in self._event_context(rows)], "total": total, "limit": limit, "offset": offset,
            "filters": {"query": query or "", "subject": subject or "", "participant": participant or "", "type": event_type or "", "source": source or "", "yearFrom": year_from, "yearTo": year_to, "sort": sort or "newest"},
            "facets": {"eventTypes": [{"code": row["value"], "name": row["value"], "displayName": str(row["value"]).replace("_", " ").title(), "count": row["count"]} for row in facets]},
        }

    def get_event(self, event_id: str) -> dict[str, Any] | None:
        with connect(self.settings) as conn:
            row = conn.execute(
                f"select * from {SCHEMA}.documented_event where event_id=%(id)s", {"id": event_id}
            ).fetchone()
            if not row and self._metadata().get("history_configuration_evidence_contract") == "modavis.history-configuration-evidence/v1":
                row = conn.execute(f"select e.* from {SCHEMA}.documented_event_representation r join {SCHEMA}.documented_event e using(event_id) where representation_id=%(id)s", {"id":event_id}).fetchone()
            if not row and self._metadata().get("public_relocation_evidence_contract") == "modavis.public-relocation-evidence/v1":
                row = conn.execute(f"select e.* from {SCHEMA}.relocation_evidence r join {SCHEMA}.documented_event e using(event_id) where r.activity_id=%(id)s", {"id":event_id}).fetchone()
            if not row:
                return None
            organ = conn.execute(
                f"select label from {SCHEMA}.organ where mdvs_id=%(id)s", {"id": row["organ_mdvs_id"]}
            ).fetchone()
        result = self._event_summary(self._event_context([row])[0])
        result["entityType"] = "event"
        result["subject"]["title"] = organ["label"] if organ else row["organ_mdvs_id"]
        dates = _date_claims(row.get("date_values_json"))
        result["temporalClaims"] = [
            {
                "id": f"{event_id}:date:{index}",
                "rawExpression": value["expression"],
                "startDate": value.get("startDate") or (str(value["startYear"]) if value["startYear"] is not None else None),
                "endDate": value.get("endDate") or (str(value["endYear"]) if value["endYear"] is not None else None),
                "precisionName": str(value["kind"]).replace("_", " ").title(),
                "certaintyName": "Approximate" if value["approximate"] else "Documented",
            }
            for index, value in enumerate(dates)
        ]
        result["participants"] = [{**p, "id": f"{event_id}:participant:{index}",
            "title": p["name"], "role": {"name": ", ".join(p.get("activities") or [p.get("role") or "Participant"])}}
            for index, p in enumerate(result["participants"])]
        result["locations"] = [{"id": f"{event_id}:place:{index}", "title": p["name"],
            "role": {"name": p.get("role") or "Documented place"}} for index, p in enumerate(result["places"])]
        movement = result.get("movement") or {}
        if movement.get("movements"):
            result["locations"] = [{"id":f"{event_id}:{role}", "title":movement[role]["title"],
                "pageUrl":movement[role]["pageUrl"], "role":{"name":role + ("; coordinates unresolved" if not movement[role].get("coordinates") else "; historical endpoint")}}
                for role in ("origin","destination")]
            result["description"] = movement["summary"] + (" Endpoint coordinates remain unresolved; no map connection is shown." if movement["status"] != "mapped" else "")
        result["subjects"] = [result["subject"]]
        source = result.pop("source")
        source["originalSourceUrl"] = source.pop("url", None)
        source["captureAvailable"] = False
        result["sources"] = [source]
        result["evidenceReferences"] = [{"id":r["representationId"], "mdvsId":r["representationId"]} for r in result.get("retainedRepresentations", [])]
        result["requestedRepresentationId"] = event_id if event_id != row["event_id"] else None
        result["externalIdentifiers"] = []
        result["provenance"] = {"summary": "Publication-safe structured source assertion.", "activities": []}
        result["relatedEntities"] = []
        result["urls"] = {"page": result["pageUrl"], "api": f"/api/events/{quote(event_id, safe='')}", "citation": "", "research": ""}
        return result

    @staticmethod
    def _vmi_summary(row: Mapping[str, Any]) -> dict[str, Any]:
        mdvs_id = str(row["mdvs_id"])
        relations = _json(row.get("organ_relations"), [])
        targets = [
            {
                "mdvsId": relation["targetOrganMdvsId"],
                "title": relation.get("targetOrganTitle") or relation["targetOrganMdvsId"],
                "canonicalUrl": _organ_page_route(relation["targetOrganMdvsId"]),
                "score": relation.get("confidence"),
                "confidenceTier": PublicReleaseRepository._confidence_tier(relation.get("confidence")),
            }
            for relation in relations
            if relation.get("targetOrganMdvsId") and relation.get("resolutionState") == "accepted_canonical_organ_relation"
        ]
        target = targets[0] if targets else None
        represented = "; ".join(dict.fromkeys(
            relation.get("targetOrganTitle") or relation.get("representedOrganLabel")
            for relation in relations if relation.get("targetOrganTitle") or relation.get("representedOrganLabel")
        )) or None
        result = {
            "id": mdvs_id, "canonicalUrl": catalogue_path(mdvs_id, "virtual-instruments"),
            "title": row["canonical_title"], "sampledInstrumentName": represented, "producer": None,
            "kind": {"catalogEntityType": "virtual_instrument", "recordingBasis": "pipe_organ" if row.get("is_pipe_organ_related") else None, "granularity": "instrument", "independentlyDistributed": None},
            "availability": {"catalogStatus": "documented", "accessModel": None, "licenseClass": None},
            "platforms": {"native": None, "all": []},
            "physicalInstrument": {"name": represented, "builder": None, "location": {"type": None}},
            "localAvailability": {"state": "not_in_public_dataset", "status": "Binary instrument data is not included", "integrityVerified": False, "fileCount": 0, "wavFileCount": 0, "byteSize": 0},
            "canonical": {"state": "canonical_vmi", "instrumentMdvsId": mdvs_id},
            "relationships": {
                "organDecision": {"outcome": "accepted" if targets else "unresolved", "reason": "Documented organ relationships in the public dataset", "target": target, "targets": targets},
                "placeDecision": {"outcome": "not_projected", "reason": "No independent public place decision."},
                "canonicalOrganRelations": relations, "linkState": "linked" if targets else "unlinked",
            },
            "evidence": {"confidence": PublicReleaseRepository._confidence_tier(row.get("confidence")), "rowSha256": row.get("row_hash")},
            "technical": {},
        }
        detail = _json(row.get("detail_json"), {})
        for key in ("sampledInstrumentName", "producer", "kind", "availability", "platforms", "physicalInstrument", "technical", "notes"):
            if detail.get(key) is not None:
                result[key] = detail[key]
        result["canonical"].update(detail.get("canonical") or {})
        result["evidence"].update(detail.get("evidence") or {})
        descriptions = {r["rowSha256"]: r for r in detail.get("relationDescriptions", [])}
        result["relationships"]["canonicalOrganRelations"] = [{**relation, **descriptions.get(relation.get("rowSha256"), {})} for relation in relations]
        result["identifierUri"] = row.get("canonical_uri")
        return result

    def list_virtual_instruments(self, *, query: str = "", limit: int = 30, offset: int = 0, **filters: Any) -> dict[str, Any]:
        return self._list_public_virtual_instruments(query=query, limit=_bounded(limit, 30), offset=max(0, int(offset or 0)), **filters)

    def get_virtual_instrument(self, entity_id: str) -> dict[str, Any] | None:
        mdvs_id = entity_id if entity_id.startswith("MDVS:VMIN:") else "MDVS:VMIN:" + entity_id
        entry = next((item for item in self._public_vmi_catalog() if item["id"] == mdvs_id), None)
        if not entry:
            return None
        identity = self.resolve_mdvs_id(mdvs_id)
        return {**entry, "entityType": "virtual_instrument", "apiUrl": f"/api/virtual-instruments/{quote(mdvs_id, safe='')}",
                "identifierUri": identity.get("canonicalUri") if identity else None,
                "releaseBoundary": {"targetRelease": self.policy.release_version, "dataProfile": PROFILE},
                "source": {"label": "MODAVIS Pipe Organ Dataset " + self.policy.release_version, "key": "modavis-pod", "catalogResearchDate": entry.get("evidence", {}).get("researchDate")},
                "parents": [], "children": [], "relatedEditions": [], "familyEdges": [],
                "export": self.entity_export_manifest("virtual_instrument", mdvs_id)}

    @lru_cache(maxsize=128)
    def _temperament_organ_ids(self, temperament_id: str, scope: str) -> tuple[str, ...]:
        temperament = self.get_tuning_system(temperament_id, mode="surface")
        if not temperament:
            return ()
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"select organ_mdvs_id, source_value from {SCHEMA}.organ_temperament_assertion"
            ).fetchall()
        kind = "family_wording" if scope == "family" else "exact_variant"
        return tuple(sorted({
            row["organ_mdvs_id"] for row in rows
            if _temperament_source_match_kind(row["source_value"], temperament) == kind
        }))

    def _public_map_organ_filters(self, filters: dict[str, Any]) -> dict[str, Any]:
        filters = dict(filters)
        temperament = filters.pop("temperament", None)
        scope = filters.pop("temperament_scope", None) or "exact"
        if temperament:
            filters["organ_ids"] = self._temperament_organ_ids(temperament, scope)
        return filters

    def _public_map_relation(
        self, *, coordinate_scope: str = "all",
        bbox: tuple[float, float, float, float] | None = None,
        site_group_id: str | None = None, **filters: Any,
    ) -> tuple[str, str, dict[str, Any]]:
        clauses: list[str] = []
        params: dict[str, Any] = {}
        if coordinate_scope == "exact":
            clauses.append("g.coordinate_fallback=0")
        elif coordinate_scope == "fallback":
            clauses.append("g.coordinate_fallback=1")
        if bbox:
            clauses.extend(["g.longitude between %(min_lon)s and %(max_lon)s", "g.latitude between %(min_lat)s and %(max_lat)s"])
            params.update(min_lon=bbox[0], min_lat=bbox[1], max_lon=bbox[2], max_lat=bbox[3])
        if site_group_id is not None:
            clauses.append("g.site_group_id=%(site_group_id)s")
            params["site_group_id"] = site_group_id
        organ_clauses, organ_params = self._organ_filter_sql(**self._public_map_organ_filters(filters))
        params.update(organ_params)
        if not organ_clauses:
            where = "where " + " and ".join(clauses) if clauses else ""
            return f"{SCHEMA}.map_site_group g", where, params
        where = "where " + " and ".join([*clauses, *organ_clauses])
        # Count and label only members that satisfy every filter together.
        relation = f"""(
            select g.site_group_id, g.latitude, g.longitude,
                   g.coordinate_fallback, g.coordinate_precision,
                   min(m.title) as title,
                   min(m.organ_mdvs_id) as representative_organ_mdvs_id,
                   count(distinct m.organ_mdvs_id)::int as entity_count,
                   count(*)::int as location_count
            from {SCHEMA}.map_site_group g
            join {SCHEMA}.map_site_member m on m.site_group_id=g.site_group_id
            join {SCHEMA}.organ o on o.mdvs_id=m.organ_mdvs_id
            {where}
            group by g.site_group_id
        ) g"""
        return relation, "", params

    def public_map_site_groups(
        self,
        *,
        limit: int = 250_000,
        coordinate_scope: str = "all",
        bbox: tuple[float, float, float, float] | None = None,
        query: str | None = None,
        builder: str | None = None,
        source: str | None = None,
        **filters: Any,
    ) -> list[dict[str, Any]]:
        relation, where, params = self._public_map_relation(
            coordinate_scope=coordinate_scope,
            bbox=bbox,
            query=query,
            builder=builder,
            source=source,
            **filters,
        )
        params["limit"] = max(1, min(int(limit), 250_000))
        with connect(self.settings) as conn:
            rows = conn.execute(
                f"select g.* from {relation} {where} order by g.site_group_id limit %(limit)s",
                params,
            ).fetchall()
        return [dict(row) for row in rows]

    def public_map_tile_features(
        self,
        *,
        zoom: int,
        tile_x: int,
        tile_y: int,
        coordinate_scope: str = "exact",
        query: str | None = None,
        builder: str | None = None,
        source: str | None = None,
        **filters: Any,
    ) -> list[dict[str, Any]]:
        """Return a bounded zoom-dependent map projection for one slippy tile.

        Broad views aggregate into a deliberately sparse Web-Mercator-aligned
        density grid. Close views return the persisted site groups themselves,
        keeping identity selection possible without sending the global point
        collection to every browser.
        """
        bounds = public_map_tile_bounds(zoom, tile_x, tile_y)
        grid_size = public_map_tile_grid_size(zoom)
        longitude_buffer = bounds.longitude_span / 64
        latitude_buffer = (bounds.latitude_max - bounds.latitude_min) / 64
        relation, where, params = self._public_map_relation(
            coordinate_scope=coordinate_scope,
            bbox=(
                max(-180.0, bounds.longitude_min - longitude_buffer),
                max(-90.0, bounds.latitude_min - latitude_buffer),
                min(180.0, bounds.longitude_max + longitude_buffer),
                min(90.0, bounds.latitude_max + latitude_buffer),
            ),
            query=query,
            builder=builder,
            source=source,
            **filters,
        )
        if grid_size is None:
            sql = f"""select
                    g.site_group_id,
                    g.latitude,
                    g.longitude,
                    g.coordinate_fallback,
                    g.coordinate_precision,
                    g.title,
                    g.entity_count,
                    g.location_count,
                    1::int as group_count,
                    false as aggregate
                from {relation}
                {where}
                order by g.site_group_id"""
        else:
            params.update(
                grid_size=grid_size,
                tile_longitude_min=bounds.longitude_min,
                tile_longitude_span=bounds.longitude_span,
                tile_projected_y_min=(bounds.projected_y_min / WEB_MERCATOR_RADIUS),
                tile_projected_y_span=(bounds.projected_y_span / WEB_MERCATOR_RADIUS),
            )
            sql = f"""select
                    avg(g.longitude)::double precision as longitude,
                    avg(g.latitude)::double precision as latitude,
                    g.coordinate_fallback,
                    case
                        when min(g.coordinate_precision) = max(g.coordinate_precision)
                            then min(g.coordinate_precision)
                        when g.coordinate_fallback = 1 then 'mixed locality precision'
                        else 'mixed persisted position precision'
                    end as coordinate_precision,
                    count(*)::int as group_count,
                    coalesce(sum(g.entity_count), 0)::bigint as entity_count,
                    coalesce(sum(g.location_count), 0)::bigint as location_count,
                    true as aggregate,
                    floor(
                        (g.longitude - %(tile_longitude_min)s)
                        / %(tile_longitude_span)s * %(grid_size)s
                    )::int as grid_x,
                    floor(
                        (
                            ln(tan(pi() / 4 + radians(g.latitude) / 2))
                            - %(tile_projected_y_min)s
                        ) / %(tile_projected_y_span)s * %(grid_size)s
                    )::int as grid_y
                from {relation}
                {where}
                group by g.coordinate_fallback, grid_x, grid_y
                order by g.coordinate_fallback, grid_x, grid_y"""
        with connect(self.settings) as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    @lru_cache(maxsize=128)
    def public_map_summary(
        self,
        *,
        coordinate_scope: str = "all",
        bbox: tuple[float, float, float, float] | None = None,
        query: str | None = None,
        builder: str | None = None,
        source: str | None = None,
        **filters: Any,
    ) -> dict[str, Any]:
        relation, where, params = self._public_map_relation(
            coordinate_scope=coordinate_scope,
            bbox=bbox,
            query=query,
            builder=builder,
            source=source,
            **filters,
        )
        with connect(self.settings) as conn:
            row = conn.execute(
                f"""select
                        count(*)::int as group_count,
                        coalesce(sum(g.entity_count), 0)::bigint as entity_count,
                        coalesce(sum(g.location_count), 0)::bigint as location_count,
                        count(*) filter(where g.coordinate_fallback=0)::int as exact_group_count,
                        count(*) filter(where g.coordinate_fallback=1)::int as fallback_group_count,
                        coalesce(sum(g.entity_count) filter(where g.coordinate_fallback=0), 0)::bigint as exact_entity_count,
                        coalesce(sum(g.entity_count) filter(where g.coordinate_fallback=1), 0)::bigint as fallback_entity_count,
                        coalesce(sum(g.location_count) filter(where g.coordinate_fallback=0), 0)::bigint as exact_location_count,
                        coalesce(sum(g.location_count) filter(where g.coordinate_fallback=1), 0)::bigint as fallback_location_count
                    from {relation}
                    {where}""",
                params,
            ).fetchone()
        return {
            "contract": "modavis.navigator.public-map-summary/v1",
            "dataProfile": PROFILE,
            "coordinateScope": coordinate_scope,
            "groupCount": int(row["group_count"]),
            "entityCount": int(row["entity_count"]),
            "locationCount": int(row["location_count"]),
            "exactGroupCount": int(row["exact_group_count"]),
            "fallbackGroupCount": int(row["fallback_group_count"]),
            "exactEntityCount": int(row["exact_entity_count"]),
            "fallbackEntityCount": int(row["fallback_entity_count"]),
            "exactLocationCount": int(row["exact_location_count"]),
            "fallbackLocationCount": int(row["fallback_location_count"]),
            "canonicalMutationAllowed": False,
        }

    def public_map_has_site_group(self, **filters: Any) -> bool:
        return bool(self.public_map_site_groups(limit=1, **filters))

    def public_map_group_at(
        self,
        *,
        longitude: float,
        latitude: float,
        coordinate_scope: str = "exact",
        **filters: Any,
    ) -> dict[str, Any] | None:
        """Resolve one compact exact feature without embedding its long id.

        Persisted exact site groups are unique by coordinate.  A metre-scale
        indexed window tolerates the pinned vector-tile renderer's coordinate
        quantization; more than one candidate fails closed instead of opening
        an arbitrary identity.
        """
        tolerance = COMPACT_EXACT_SELECTION_TOLERANCE
        rows = self.public_map_site_groups(
            limit=2,
            coordinate_scope=coordinate_scope,
            bbox=(
                longitude - tolerance,
                latitude - tolerance,
                longitude + tolerance,
                latitude + tolerance,
            ),
            **filters,
        )
        if len(rows) != 1:
            return None
        row = rows[0]
        return {
            "contract": "modavis.navigator.public-map-site-lookup/v1",
            "siteGroupId": str(row["site_group_id"]),
            "coordinateFallback": bool(row["coordinate_fallback"]),
            "coordinatePrecision": str(
                row.get("coordinate_precision")
                or ("locality" if row["coordinate_fallback"] else "venue")
            ),
            "entityCount": int(row.get("entity_count") or 0),
        }

    def public_map_group_members(self, site_group_id: str, *, limit: int = 24, offset: int = 0, **filters: Any) -> dict[str, Any]:
        limit = _bounded(limit, 24)
        offset = max(0, int(offset or 0))
        relation, where, params = self._public_map_relation(site_group_id=site_group_id, **filters)
        organ_clauses, organ_params = self._organ_filter_sql(**self._public_map_organ_filters(filters))
        params.update(organ_params, limit=limit, offset=offset)
        member_where = " and ".join(["m.site_group_id=%(site_group_id)s", *organ_clauses])
        with connect(self.settings) as conn:
            group = conn.execute(f"select g.* from {relation} {where}", params).fetchone()
            if not group:
                raise ValueError("unknown public map site group for these filters")
            total = int(group["entity_count"])
            rows = conn.execute(
                f"""select * from (
                        select distinct on (m.organ_mdvs_id) m.*
                        from {SCHEMA}.map_site_member m
                        join {SCHEMA}.organ o on o.mdvs_id=m.organ_mdvs_id
                        where {member_where}
                        order by m.organ_mdvs_id, m.source_organ_mdvs_id
                    ) members order by title, organ_mdvs_id
                    limit %(limit)s offset %(offset)s""",
                params,
            ).fetchall()
        return {
            "contract": "modavis.navigator.public-map-site-members/v1",
            "siteGroupId": str(group["site_group_id"]),
            "title": str(group.get("title") or "Selected map site"),
            "coordinateFallback": bool(group["coordinate_fallback"]),
            "coordinatePrecision": str(
                group.get("coordinate_precision")
                or ("locality" if group["coordinate_fallback"] else "venue")
            ),
            "siteGroup": dict(group),
            "items": [
                self._public_map_member(row)
                for row in rows
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasPrevious": offset > 0,
            "hasMore": offset + len(rows) < total,
        }

    @staticmethod
    def _public_map_member(row: Mapping[str, Any]) -> dict[str, Any]:
        organ_mdvs_id = str(row["organ_mdvs_id"])
        organ_code = (
            organ_mdvs_id.removeprefix("MDVS:ENTY:")
            if organ_mdvs_id.startswith("MDVS:ENTY:")
            else organ_mdvs_id
        )
        navigator_url = _organ_page_route(organ_code)
        return {
            "organMdvsId": organ_mdvs_id,
            "organCode": organ_code,
            "title": row.get("title") or organ_mdvs_id,
            "navigatorUrl": navigator_url,
            "coordinateState": row.get("coordinate_state"),
            "markerLayer": row.get("marker_layer"),
            "coordinatePrecision": row.get("coordinate_precision"),
            # Retain the release-overlay field names for older clients while the
            # canonical public contract above prevents an identity-less /id/ URL.
            "id": row.get("source_organ_mdvs_id") or organ_mdvs_id,
            "mdvsId": organ_mdvs_id,
            "pageUrl": navigator_url,
        }

    @lru_cache(maxsize=128)
    def organ_map_context(self, organ_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_organ_mdvs_id(organ_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        with connect(self.settings) as conn:
            organ = conn.execute(f"select label from {SCHEMA}.organ where mdvs_id=%(id)s", {"id": mdvs_id}).fetchone()
            builder = conn.execute(
                f"""select b.actor_mdvs_id, a.label from {SCHEMA}.organ_builder b join {SCHEMA}.actor a on a.mdvs_id=b.actor_mdvs_id
                    where b.organ_mdvs_id=%(id)s order by b.assertion_count desc, b.actor_mdvs_id limit 1""", {"id": mdvs_id}
            ).fetchone()
            builder_ids = ()
            if builder:
                rows = conn.execute(
                    f"""select distinct organ_mdvs_id from {SCHEMA}.organ_builder
                        where actor_mdvs_id=%(actor)s and organ_mdvs_id<>%(organ)s
                        order by organ_mdvs_id""",
                    {"actor": builder["actor_mdvs_id"], "organ": mdvs_id},
                ).fetchall()
                builder_ids = tuple(row["organ_mdvs_id"] for row in rows)
        current_groups = self.public_map_site_groups(organ_ids=(mdvs_id,))
        builder_groups = self.public_map_site_groups(organ_ids=builder_ids, limit=5000) if builder_ids else []
        return {
            "mdvsId": mdvs_id, "title": organ["label"] if organ else mdvs_id,
            "currentGroups": [dict(row) for row in current_groups],
            "builderGroups": [dict(row) for row in builder_groups],
            "builderLabel": builder["label"] if builder else None,
        }

    @lru_cache(maxsize=128)
    def actor_map_context(self, actor_id: str) -> dict[str, Any] | None:
        resolved = self._resolve_actor_mdvs_id(actor_id)
        if not resolved:
            return None
        mdvs_id = resolved[0]
        with connect(self.settings) as conn:
            actor = conn.execute(f"select label, actor_type from {SCHEMA}.actor where mdvs_id=%(id)s", {"id": mdvs_id}).fetchone()
            related_count = conn.execute(
                f"select count(distinct organ_mdvs_id)::int as count from {SCHEMA}.organ_builder where actor_mdvs_id=%(id)s",
                {"id": mdvs_id},
            ).fetchone()["count"]
            rows = conn.execute(
                f"""select distinct on (m.organ_mdvs_id)
                           m.organ_mdvs_id, o.label, g.longitude, g.latitude,
                           g.coordinate_fallback, g.coordinate_precision
                    from {SCHEMA}.map_site_group g
                    join {SCHEMA}.map_site_member m on m.site_group_id=g.site_group_id
                    join {SCHEMA}.organ_builder b on b.organ_mdvs_id=m.organ_mdvs_id
                    join {SCHEMA}.organ o on o.mdvs_id=m.organ_mdvs_id
                    where b.actor_mdvs_id=%(id)s
                    order by m.organ_mdvs_id, g.coordinate_fallback, g.site_group_id
                    limit 5001""", {"id": mdvs_id}
            ).fetchall()
        if not actor:
            return None
        features = [
            {
                "type": "Feature", "id": row["organ_mdvs_id"],
                "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]},
                "properties": {
                    "organMdvsId": row["organ_mdvs_id"], "title": row["label"],
                    "navigatorUrl": _organ_page_route(row["organ_mdvs_id"]),
                    "coordinateFallback": bool(row["coordinate_fallback"]),
                    "coordinatePrecision": row["coordinate_precision"],
                    "locationLabel": "Approximate current location" if row["coordinate_fallback"] else "Exact current location",
                    "activities": [{"label": "Documented builder relationship"}],
                },
            }
            for row in rows[:5000]
        ]
        return {
            "mdvsId": mdvs_id, "title": actor["label"], "category": actor["actor_type"],
            "relatedOrganCount": related_count, "bounded": len(rows) > 5000,
            "collection": {"type": "FeatureCollection", "features": features},
        }
