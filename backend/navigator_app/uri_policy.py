"""Canonical MODAVIS identifier and URI policy.

Canonical identities are derived from governed identifier literals and never
from an incoming HTTP Host header.  The default policy describes the prepared
Release 1.5 public surface; it does not claim DNS, W3ID, or publication
activation.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
import hashlib
import json
import math
import re
from typing import Any, Mapping
import unicodedata
from urllib.parse import quote, unquote, urlsplit

from .resource_families import ResourceFamily, require_resource_family


CANONICAL_ID_BASE = "https://w3id.org/modavis"
RESOLVER_BASE = "https://id.modavis.org"
HUMAN_BASE = "https://navigator.modavis.org"
DATA_BASE = "https://data.modavis.org"
ONTOLOGY_BASE = "https://w3id.org/modavis/ontology/0.1.0/"
DATASET_URI = f"{CANONICAL_ID_BASE}/dataset/pod"
DATASET_VERSION_URI = f"{DATASET_URI}/version/1.5"
POLICY_KEY = "pod-1.5-uri-policy-v1"
POLICY_VERSION = "1"
RELEASE_VERSION = "1.5"

PUBLIC_FAMILIES = frozenset({"ENTY", "NAME", "LOCN"})
VALID_MDVS_V1 = re.compile(
    r"^MDVS:(ENTY|NAME|LOCN):[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$"
)
MDVS_REFERENCE = re.compile(r"^MDVS:([A-Z0-9]{4}):(.+)$", re.IGNORECASE)
TOKEN_REFERENCE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._~-]{0,191}$")
ALIAS_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])$")
RESOURCE_PATH_TOKEN = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._~-]{0,255}$")
GOVERNED_TERM_TOKEN = re.compile(r"^[0-9A-Za-z][0-9A-Za-z:._~-]{0,255}$")
PROFILE_TOKEN = re.compile(r"^[a-z][a-z0-9-]{0,31}$")

FAMILY_PATHS = {"ENTY": "entity", "NAME": "name", "LOCN": "location"}
ROUTE_PATHS = {
    "organ": "organs",
    "person": "people",
    "organization": "organizations",
    "place": "places",
    "event": "events",
    "virtual_instrument": "virtual-instruments",
    "name": "names",
    "entity": "entities",
}
PROFILE_URIS = {
    "cidoc": "https://cidoc-crm.org/get-last-official-release",
    "pon": "https://w3id.org/polifonia/ontology/organs/1.0/",
    "edm": "https://pro.europeana.eu/page/edm-documentation",
}


@dataclass(frozen=True)
class IdentifierReference:
    value: str
    family: str
    token: str
    validation_profile: str


@dataclass(frozen=True, slots=True)
class ResourceAnnotation:
    uri: str
    family: str
    source_key: str | None = None
    source_path: str | None = None
    label: str | None = None
    raw_value: str | None = None


def _normalized_json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("canonical resource keys cannot contain non-finite numbers")
        return value
    if isinstance(value, Decimal):
        return unicodedata.normalize("NFC", str(value))
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for raw_key, item in value.items():
            key = unicodedata.normalize("NFC", str(raw_key))
            if key in normalized:
                raise ValueError("canonical resource key has duplicate Unicode-normalized fields")
            normalized[key] = _normalized_json_value(item)
        return {key: normalized[key] for key in sorted(normalized)}
    if isinstance(value, (list, tuple)):
        return [_normalized_json_value(item) for item in value]
    if isinstance(value, (set, frozenset)):
        normalized = [_normalized_json_value(item) for item in value]
        return sorted(normalized, key=lambda item: canonical_json_bytes(item))
    raise TypeError(f"unsupported canonical resource key type: {type(value).__name__}")


def canonical_json_bytes(value: Any) -> bytes:
    """Return deterministic UTF-8 JSON after recursive Unicode NFC normalization."""
    return json.dumps(
        _normalized_json_value(value),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def canonical_resource_digest(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _annotation_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, (Mapping, list, tuple, set, frozenset)):
        return canonical_json_bytes(value).decode("utf-8")
    return unicodedata.normalize("NFC", str(value))


def _safe_term_slug(value: Any) -> str:
    normalized = unicodedata.normalize("NFC", str(value or "")).casefold()
    normalized = re.sub(r"https?://[^\s]+", " ", normalized, flags=re.IGNORECASE)
    pieces: list[str] = []
    separator = False
    for character in normalized:
        if character.isascii() and character.isalnum():
            pieces.append(character)
            separator = False
        elif character in {"-", "_", ".", "~", ":"}:
            emitted = "-" if character in {"_", ":"} else character
            if emitted != "-" or not separator:
                pieces.append(emitted)
            separator = emitted == "-"
        elif not separator:
            pieces.append("-")
            separator = True
    slug = "".join(pieces).strip("-._~")[:64].rstrip("-._~") or "term"
    return slug


@dataclass(slots=True)
class ResourceUriFactory:
    """Create all release-local identifiers for one canonical owner record."""

    policy: "UriPolicy"
    owner_kind: str
    owner_identifier: str
    owner_uri: str
    owner_family: str
    owner_token: str
    _annotations: dict[str, ResourceAnnotation] = field(default_factory=dict)

    @classmethod
    def for_release(cls, policy: "UriPolicy") -> "ResourceUriFactory":
        """Mint shared resources without supplying an artificial owner."""
        return cls(policy, "", "", "", "", "")

    @classmethod
    def for_owner(
        cls,
        policy: "UriPolicy",
        *,
        owner_kind: str,
        owner_identifier: str,
        owner_uri: str | None = None,
    ) -> "ResourceUriFactory":
        kind = str(owner_kind or "entity").strip().lower().replace("-", "_")
        expected_family = "name" if kind == "name" else "location" if kind == "place" else "entity"
        identifier = unicodedata.normalize("NFC", str(owner_identifier or "").strip())
        canonical = str(owner_uri or "").strip()
        family = expected_family
        token = ""
        if canonical:
            parts = urlsplit(canonical)
            if parts.query or parts.fragment:
                raise ValueError("canonical owner URI cannot contain a query or fragment")
            for candidate in ("entity", "name", "location"):
                prefix = f"{policy.canonical_id_base}/{candidate}/"
                if canonical.startswith(prefix):
                    family = candidate
                    token = unquote(canonical[len(prefix):])
                    break
            if not token and policy.policy_version == "2":
                raise ValueError("canonical owner URI is outside the configured MODAVIS authority")
        if not token:
            try:
                reference = parse_identifier(identifier)
                family = FAMILY_PATHS[reference.family]
                token = reference.token
                canonical = policy.identity_uri(reference)
            except ValueError:
                token = identifier.rsplit(":", 1)[-1]
                canonical = (
                    canonical
                    or f"{policy.canonical_id_base}/{expected_family}/{quote(token, safe='-._~')}"
                )
                family = expected_family
        if family != expected_family:
            raise ValueError(
                f"canonical owner family {family!r} does not match entity kind {kind!r}"
            )
        if not RESOURCE_PATH_TOKEN.fullmatch(token):
            raise ValueError("canonical owner token contains route-unsafe characters")
        return cls(
            policy=policy,
            owner_kind=kind,
            owner_identifier=identifier,
            owner_uri=canonical,
            owner_family=family,
            owner_token=token,
        )

    @property
    def dataset_version_uri(self) -> str:
        return self.policy.dataset_version_uri

    @property
    def human_base(self) -> str:
        return self.policy.human_base

    @property
    def uses_scoped_identifiers(self) -> bool:
        return self.policy.policy_version == "2"

    def identity_uri(self, identifier: str | IdentifierReference) -> str:
        literal = identifier.value if isinstance(identifier, IdentifierReference) else str(identifier).strip()
        if literal == self.owner_identifier:
            return self.owner_uri
        return self.policy.identity_uri(identifier)

    def human_uri(self, route_kind: str, identifier: str | IdentifierReference) -> str:
        literal = identifier.value if isinstance(identifier, IdentifierReference) else str(identifier).strip()
        if literal == self.owner_identifier:
            family = {"entity": "ENTY", "name": "NAME", "location": "LOCN"}[self.owner_family]
            normalized = normalize_route_kind(route_kind, family)
            return (
                f"{self.human_base}/{ROUTE_PATHS[normalized]}/"
                f"{quote(self.owner_token, safe='-._~')}"
            )
        return self.policy.human_uri(route_kind, identifier)

    def canonical_uri(self) -> str:
        return self.owner_uri

    def profile_document_uri(self, profile: str) -> str:
        if not self.owner_uri:
            raise ValueError("an owner is required for a profile document")
        value = str(profile or "").strip().lower()
        if not PROFILE_TOKEN.fullmatch(value):
            raise ValueError(f"invalid resource profile: {profile!r}")
        return (
            f"{self.dataset_version_uri}/{self.owner_family}/{self.owner_token}"
            f"/profile/{value}"
        )

    def first_class_uri(
        self,
        family_name: str,
        *,
        stable_key: Any = None,
        structural_record: Any = None,
        source_path: Any = None,
        label: Any = None,
        raw_value: Any = None,
    ) -> str:
        family = require_resource_family(family_name)
        if family.semantic_category != "first_class_resource":
            raise ValueError(f"{family_name} is not a first-class resource family")
        key_kind, key = self._resource_key(stable_key, structural_record)
        if family.ownership_rule == "release":
            token = self._release_source_token(key)
            segment = "source-record" if family.name == "source-record" else f"resource/{family.name}"
            uri = f"{self.dataset_version_uri}/{segment}/{token}"
        elif family.ownership_rule == "owner":
            digest = canonical_resource_digest(
                {
                    "uriPolicyVersion": self.policy.policy_version,
                    "owner": self.owner_uri,
                    "authoritativeProfile": family.authoritative_profile,
                    "resourceFamily": family.name,
                    "keyKind": key_kind,
                    "key": key,
                }
            )
            uri = (
                f"{self.profile_document_uri(family.authoritative_profile)}"
                f"/resource/{family.name}/{digest}"
            )
        else:
            raise ValueError(f"unsupported first-class ownership rule: {family.ownership_rule}")
        self._remember(uri, family, key, source_path, label, raw_value)
        return uri

    def structural_uri(
        self,
        family_name: str,
        *,
        stable_key: Any = None,
        structural_record: Any = None,
        source_path: Any = None,
        label: Any = None,
        raw_value: Any = None,
    ) -> str:
        family = require_resource_family(family_name)
        if family.semantic_category != "structural_resource":
            raise ValueError(f"{family_name} is not a structural resource family")
        key_kind, key = self._resource_key(stable_key, structural_record)
        digest = canonical_resource_digest(
            {
                "uriPolicyVersion": self.policy.policy_version,
                "owner": self.owner_uri,
                "authoritativeProfile": family.authoritative_profile,
                "resourceFamily": family.name,
                "keyKind": key_kind,
                "key": key,
            }
        )
        uri = (
            f"{self.profile_document_uri(family.authoritative_profile)}"
            f"#{family.name}-{digest}"
        )
        self._remember(uri, family, key, source_path, label, raw_value)
        return uri

    def shared_term_uri(
        self,
        family_name: str,
        *,
        stable_key: Any,
        label: Any = None,
        raw_value: Any = None,
    ) -> str:
        family = require_resource_family(family_name)
        category = family.semantic_category
        key = unicodedata.normalize("NFC", str(stable_key or "").strip())
        if not key:
            raise ValueError(f"{family_name} requires a non-empty governed key")
        if category == "governed_term":
            if not GOVERNED_TERM_TOKEN.fullmatch(key):
                raise ValueError(f"governed term contains route-unsafe characters: {key!r}")
            uri = f"{self.policy.canonical_id_base}/vocab/event-type/{key}"
        elif category in {"release_schema_term", "release_scheme_term"}:
            slug = _safe_term_slug(key)
            digest = canonical_resource_digest(
                {
                    "uriPolicyVersion": self.policy.policy_version,
                    "resourceFamily": family.name,
                    "key": key,
                }
            )
            if category == "release_schema_term":
                uri = (
                    f"{self.dataset_version_uri}/schema/release-resource-properties"
                    f"#{family.name}-{slug}-{digest}"
                )
            else:
                uri = (
                    f"{self.dataset_version_uri}/scheme/{family.name}"
                    f"#{slug}-{digest}"
                )
        else:
            raise ValueError(f"{family_name} is not a governed or shared term family")
        self._remember(uri, family, key, None, label, raw_value)
        return uri

    def resource_uri(
        self,
        family_name: str,
        *,
        stable_key: Any = None,
        structural_record: Any = None,
        source_path: Any = None,
        label: Any = None,
        raw_value: Any = None,
    ) -> str:
        family = require_resource_family(family_name)
        if not self.uses_scoped_identifiers:
            value = stable_key if stable_key not in (None, "") else structural_record
            return (
                f"{self.dataset_version_uri}/{family.name}/"
                f"{quote(str(value or 'unknown'), safe='-._~')}"
            )
        if family.semantic_category == "first_class_resource":
            return self.first_class_uri(
                family_name,
                stable_key=stable_key,
                structural_record=structural_record,
                source_path=source_path,
                label=label,
                raw_value=raw_value,
            )
        if family.semantic_category == "structural_resource":
            return self.structural_uri(
                family_name,
                stable_key=stable_key,
                structural_record=structural_record,
                source_path=source_path,
                label=label,
                raw_value=raw_value,
            )
        return self.shared_term_uri(
            family_name,
            stable_key=stable_key,
            label=label,
            raw_value=raw_value,
        )

    def annotations(self) -> tuple[ResourceAnnotation, ...]:
        return tuple(self._annotations[key] for key in sorted(self._annotations))

    @staticmethod
    def _resource_key(stable_key: Any, structural_record: Any) -> tuple[str, Any]:
        if stable_key not in (None, ""):
            return "persisted", _normalized_json_value(stable_key)
        if structural_record is not None:
            return "structural", _normalized_json_value(structural_record)
        raise ValueError("resource URI requires a stable key or structural record")

    @staticmethod
    def _release_source_token(value: Any) -> str:
        if not isinstance(value, str):
            value = canonical_json_bytes(value).decode("utf-8")
        token = base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii").rstrip("=")
        if not token or not RESOURCE_PATH_TOKEN.fullmatch(token):
            raise ValueError("release resource token is not path-safe")
        return token

    def _remember(
        self,
        uri: str,
        family: ResourceFamily,
        source_key: Any,
        source_path: Any,
        label: Any,
        raw_value: Any,
    ) -> None:
        annotation = ResourceAnnotation(
            uri=uri,
            family=family.name,
            source_key=_annotation_text(source_key),
            source_path=_annotation_text(source_path),
            label=_annotation_text(label),
            raw_value=_annotation_text(raw_value),
        )
        previous = self._annotations.get(uri)
        if previous is None:
            self._annotations[uri] = annotation
            return
        if previous.family != annotation.family or previous.source_key != annotation.source_key:
            raise ValueError(f"conflicting source metadata for resource URI: {uri}")

        def merged(field_name: str) -> str | None:
            earlier = getattr(previous, field_name)
            later = getattr(annotation, field_name)
            if earlier is not None and later is not None and earlier != later:
                raise ValueError(f"conflicting {field_name} for resource URI: {uri}")
            return earlier if earlier is not None else later

        self._annotations[uri] = ResourceAnnotation(
            uri=uri,
            family=family.name,
            source_key=previous.source_key,
            source_path=merged("source_path"),
            label=merged("label"),
            raw_value=merged("raw_value"),
        )


@dataclass(frozen=True)
class UriPolicy:
    canonical_id_base: str = CANONICAL_ID_BASE
    resolver_base: str = RESOLVER_BASE
    human_base: str = HUMAN_BASE
    data_base: str = DATA_BASE
    ontology_base: str = ONTOLOGY_BASE
    dataset_uri: str = DATASET_URI
    dataset_version_uri: str = DATASET_VERSION_URI
    release_version: str = RELEASE_VERSION
    policy_key: str = POLICY_KEY
    policy_version: str = POLICY_VERSION
    publication_state: str = "prepared"

    @classmethod
    def for_release(
        cls, release: str, *, policy_version: str | None = None,
        policy_key: str | None = None, **overrides: Any,
    ) -> "UriPolicy":
        """Bind a release to its recorded legacy policy or the successor policy."""
        version = str(policy_version or "auto")
        if version == "auto":
            match = re.fullmatch(r"(\d+)\.(\d+)(?:\.(\d+))?", release)
            historical = bool(match and tuple(int(v or 0) for v in match.groups()) <= (1, 5, 5))
            version = "1" if historical else "2"
        if version not in {"1", "2"}:
            raise ValueError(f"unsupported URI policy version: {version}")
        canonical = overrides.get("canonical_id_base", CANONICAL_ID_BASE)
        dataset = overrides.pop("dataset_uri", f"{canonical}/dataset/pod")
        dataset_version = overrides.pop(
            "dataset_version_uri", f"{dataset}/version/{quote(release, safe='.-')}"
        )
        key = policy_key if policy_key not in (None, "", "auto") else (
            POLICY_KEY if version == "1" else "pod-release-resource-uri-policy-v2"
        )
        return cls(
            release_version=release, dataset_uri=dataset,
            dataset_version_uri=dataset_version, policy_version=version,
            policy_key=key, **overrides,
        )

    @classmethod
    def from_settings(cls, settings: Any) -> "UriPolicy":
        canonical = _base(getattr(settings, "canonical_id_base", CANONICAL_ID_BASE))
        release = str(getattr(settings, "uri_release_version", RELEASE_VERSION) or RELEASE_VERSION)
        dataset = f"{canonical}/dataset/pod"
        return cls.for_release(
            release,
            canonical_id_base=canonical,
            resolver_base=_base(getattr(settings, "resolver_base_url", RESOLVER_BASE)),
            human_base=_base(getattr(settings, "public_base_url", HUMAN_BASE)),
            data_base=_base(getattr(settings, "linked_data_base_url", DATA_BASE)),
            ontology_base=_base(getattr(settings, "ontology_base_url", ONTOLOGY_BASE)) + "/",
            dataset_uri=dataset,
            dataset_version_uri=f"{dataset}/version/{quote(release, safe='.-')}",
            policy_key=getattr(settings, "uri_policy_key", "auto"),
            policy_version=getattr(settings, "uri_policy_version", "auto"),
            publication_state=str(
                getattr(settings, "uri_publication_state", "prepared") or "prepared"
            ),
        )

    def identity_uri(self, identifier: str | IdentifierReference) -> str:
        reference = identifier if isinstance(identifier, IdentifierReference) else parse_identifier(identifier)
        if reference.family not in PUBLIC_FAMILIES:
            raise ValueError(f"identifier family is not a canonical public family: {reference.family}")
        return (
            f"{self.canonical_id_base}/{FAMILY_PATHS[reference.family]}/"
            f"{quote(reference.token, safe='-._~')}"
        )

    def resolver_uri(self, identifier: str | IdentifierReference) -> str:
        reference = identifier if isinstance(identifier, IdentifierReference) else parse_identifier(identifier)
        return (
            f"{self.resolver_base}/resolve/{FAMILY_PATHS[reference.family]}/"
            f"{quote(reference.token, safe='-._~')}"
        )

    def human_route(self, route_kind: str, identifier: str | IdentifierReference) -> str:
        reference = identifier if isinstance(identifier, IdentifierReference) else parse_identifier(identifier)
        normalized = normalize_route_kind(route_kind, reference.family)
        return f"/{ROUTE_PATHS[normalized]}/{quote(reference.token, safe='-._~')}"

    def human_uri(self, route_kind: str, identifier: str | IdentifierReference) -> str:
        return f"{self.human_base}{self.human_route(route_kind, identifier)}"

    def representation_uri(
        self,
        identifier: str | IdentifierReference,
        *,
        profile: str = "modavis",
        media_extension: str = "jsonld",
        release_version: str | None = None,
    ) -> str:
        reference = identifier if isinstance(identifier, IdentifierReference) else parse_identifier(identifier)
        release = quote(release_version or self.release_version, safe=".-")
        family_path = FAMILY_PATHS[reference.family]
        token = quote(reference.token, safe="-._~")
        return (
            f"{self.data_base}/dataset/pod/version/{release}/{family_path}/"
            f"{token}.{quote(profile, safe='-')}.{quote(media_extension, safe='-')}"
        )

    def profile_uri(self, profile: str) -> str:
        key = str(profile or "modavis").strip().lower()
        return self.ontology_base if key == "modavis" else PROFILE_URIS.get(key, self.ontology_base)

    def dataset_representation_uri(
        self,
        *,
        profile: str = "modavis",
        release_version: str | None = None,
        versioned: bool = True,
    ) -> str:
        release = quote(release_version or self.release_version, safe=".-")
        profile_key = quote(profile, safe="-")
        extension = "xml" if str(profile).strip().lower() == "edm" else "jsonld"
        if versioned:
            return (
                f"{self.data_base}/dataset/pod/version/{release}/"
                f"dataset.{profile_key}.{extension}"
            )
        return f"{self.data_base}/dataset/pod/dataset.{profile_key}.{extension}"

    def public_source_projection_schema_uri(
        self, *, release_version: str | None = None
    ) -> str:
        release = quote(release_version or self.release_version, safe=".-")
        return (
            f"{self.data_base}/dataset/pod/version/{release}/schema/"
            "public-source-projection-1.0.json"
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "contract": "modavis.identity.uri-policy/v1",
            "policyKey": self.policy_key,
            "policyVersion": self.policy_version,
            "release": self.release_version,
            "publicationState": self.publication_state,
            "canonicalAuthority": self.canonical_id_base,
            "resolverBase": self.resolver_base,
            "humanBase": self.human_base,
            "dataBase": self.data_base,
            "ontologyBase": self.ontology_base,
            "datasetUri": self.dataset_uri,
            "datasetVersionUri": self.dataset_version_uri,
            "identifierFamilies": sorted(PUBLIC_FAMILIES),
            "vanityAliasesAreCanonical": False,
        }


def _base(value: Any) -> str:
    return str(value or "").strip().rstrip("/")


def parse_identifier(value: str, *, family_hint: str | None = None) -> IdentifierReference:
    literal = str(value or "").strip()
    match = MDVS_REFERENCE.fullmatch(literal)
    if match:
        family = match.group(1).upper()
        token = match.group(2)
        canonical_literal = f"MDVS:{family}:{token}"
    else:
        family = str(family_hint or "").strip().upper()
        token = literal
        if family not in PUBLIC_FAMILIES or not TOKEN_REFERENCE.fullmatch(token):
            raise ValueError("identifier must be an MDVS literal or a safe token with a public family hint")
        canonical_literal = f"MDVS:{family}:{token}"
    if family not in PUBLIC_FAMILIES:
        raise ValueError(f"unsupported canonical identifier family: {family}")
    if not token or any(character in token for character in "/?#") or any(
        character.isspace() for character in token
    ):
        raise ValueError("identifier token contains route-unsafe characters")
    validation = "mdvs_v1_valid" if VALID_MDVS_V1.fullmatch(canonical_literal) else "mdvs_v1_observed"
    return IdentifierReference(canonical_literal, family, token, validation)


def normalize_route_kind(route_kind: str | None, family: str = "ENTY") -> str:
    candidate = str(route_kind or "").strip().lower().replace("-", "_")
    aliases = {
        "organs": "organ",
        "people": "person",
        "persons": "person",
        "organizations": "organization",
        "places": "place",
        "events": "event",
        "virtual_instruments": "virtual_instrument",
        "vmi": "virtual_instrument",
        "names": "name",
        "entities": "entity",
    }
    candidate = aliases.get(candidate, candidate)
    if candidate in ROUTE_PATHS:
        return candidate
    return "name" if family == "NAME" else "place" if family == "LOCN" else "entity"


def route_kind_for_entity_type(entity_type: str | None, *, fallback: str = "entity") -> str:
    value = str(entity_type or "").strip().lower().replace("-", "_")
    if any(word in value for word in ("pipe_organ", "organ")) and "organization" not in value:
        return "organ"
    if "organization" in value or "institution" in value or "workshop" in value:
        return "organization"
    if "person" in value:
        return "person"
    if "actor" in value:
        return "person"
    if "location" in value or "place" in value or "building" in value:
        return "place"
    if "activity" in value or "event" in value:
        return "event"
    if "virtual" in value or value == "vmi":
        return "virtual_instrument"
    if "name" in value:
        return "name"
    return normalize_route_kind(fallback)


def decorate_resolution(
    resolution: Mapping[str, Any],
    *,
    requested_identifier: str,
    policy: UriPolicy,
) -> dict[str, Any]:
    identity_value = str(
        resolution.get("identityMdvsId")
        or resolution.get("entityMdvsId")
        or resolution.get("mdvsId")
        or requested_identifier
    )
    try:
        reference = parse_identifier(identity_value)
    except ValueError:
        return dict(resolution)
    route_kind = route_kind_for_entity_type(
        str(resolution.get("domainKind") or resolution.get("entityType") or ""),
        fallback="name" if reference.family == "NAME" else "place" if reference.family == "LOCN" else "entity",
    )
    canonical_route = policy.human_route(route_kind, reference)
    current_page = resolution.get("pageUrl")
    compatibility_routes = [str(current_page)] if current_page and str(current_page) != canonical_route else []
    representations = [
        {
            "profile": profile,
            "profileUri": policy.profile_uri(profile),
            "mediaType": "application/ld+json",
            "uri": policy.representation_uri(reference, profile=profile),
            "state": policy.publication_state,
        }
        for profile in ("modavis", "cidoc", "pon", "edm")
    ]
    if policy.release_version in {"1.5.3", "1.5.4", "1.5.5"}:
        representations.extend({
            "profile": "modavis", "profileUri": "https://w3id.org/modavis/ontology/0.1.0",
            "mediaType": media_type,
            "uri": policy.representation_uri(reference, profile="modavis", media_extension=extension),
            "state": policy.publication_state,
        } for extension, media_type in (
            ("ttl", "text/turtle"), ("nt", "application/n-triples"), ("rdf", "application/rdf+xml"),
        ))
        representations.append({
            "profile": "edm", "profileUri": policy.profile_uri("edm"),
            "mediaType": "application/rdf+xml",
            "uri": policy.representation_uri(reference, profile="edm", media_extension="xml"),
            "state": policy.publication_state,
        })
    return {
        **dict(resolution),
        "requestedIdentifier": requested_identifier,
        "identityMdvsId": reference.value,
        "identifierFamily": reference.family,
        "identifierToken": reference.token,
        "validationProfile": reference.validation_profile,
        "identityTier": "A",
        "canonicalUri": policy.identity_uri(reference),
        "stableUri": policy.identity_uri(reference),
        "resolverUri": policy.resolver_uri(reference),
        "canonicalRouteKind": route_kind,
        "canonicalRoute": canonical_route,
        "pageUrl": canonical_route,
        "compatibilityRoutes": compatibility_routes,
        "publicationState": policy.publication_state,
        "uriPolicy": {
            "key": policy.policy_key,
            "version": policy.policy_version,
            "release": policy.release_version,
        },
        "representations": representations,
    }


def validate_alias_slug(value: str) -> str:
    slug = str(value or "").strip().lower()
    if not ALIAS_SLUG.fullmatch(slug):
        raise ValueError("alias slug must be lowercase ASCII words separated by single hyphens")
    return slug
