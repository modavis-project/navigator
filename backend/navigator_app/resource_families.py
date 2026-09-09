"""Registry for resources minted inside versioned dataset graphs.

The registry is the policy boundary between source values and public RDF
identifiers.  Exporters must register a family before minting a release-local
resource.  URI construction lives in :mod:`uri_policy`; HTTP resolution validates
resource scope against this registry before loading its defining graph.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from types import MappingProxyType
from typing import Iterable, Mapping


LINKED_DATA_REPRESENTATIONS = (
    "text/html",
    "application/ld+json",
    "text/turtle",
    "application/n-triples",
    "application/rdf+xml",
)

SEMANTIC_CATEGORIES = frozenset(
    {
        "first_class_resource",
        "structural_resource",
        "governed_term",
        "release_schema_term",
        "release_scheme_term",
    }
)
AUTHORITATIVE_PROFILES = frozenset({"modavis", "cidoc", "edm", "pon"})
OWNERSHIP_RULES = frozenset(
    {
        "owner",
        "owner_profile_document",
        "release",
        "governed_vocabulary",
        "release_schema",
        "release_scheme",
    }
)
TOKEN_STRATEGIES = frozenset(
    {
        "sha256_canonical_json_v1",
        "fragment_sha256_canonical_json_v1",
        "base64url_source_key_v1",
        "governed_iri_v1",
        "release_schema_slug_v1",
        "release_scheme_slug_v1",
    }
)
HUMAN_DESTINATIONS = frozenset(
    {
        "owner_export_resource",
        "release_source_record",
        "release_source_resource",
        "vocabulary_concept",
        "release_schema",
        "release_scheme",
    }
)
_FAMILY_NAME = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")


class UnregisteredResourceFamilyError(ValueError):
    """Raised when an exporter attempts to mint an undeclared family."""


@dataclass(frozen=True, slots=True)
class ResourceFamily:
    name: str
    semantic_category: str
    authoritative_profile: str
    rdf_types: tuple[str, ...]
    ownership_rule: str
    token_strategy: str
    human_destination: str
    projected_profiles: tuple[str, ...]
    supported_representations: tuple[str, ...] = LINKED_DATA_REPRESENTATIONS

    def __post_init__(self) -> None:
        if not _FAMILY_NAME.fullmatch(self.name):
            raise ValueError(f"invalid resource family name: {self.name!r}")
        if self.semantic_category not in SEMANTIC_CATEGORIES:
            raise ValueError(f"invalid semantic category for {self.name}")
        if self.authoritative_profile not in AUTHORITATIVE_PROFILES:
            raise ValueError(f"invalid authoritative profile for {self.name}")
        if not self.rdf_types or any(
            not value.startswith(("http://", "https://")) for value in self.rdf_types
        ):
            raise ValueError(f"invalid RDF type declaration for {self.name}")
        if self.ownership_rule not in OWNERSHIP_RULES:
            raise ValueError(f"invalid ownership rule for {self.name}")
        if self.token_strategy not in TOKEN_STRATEGIES:
            raise ValueError(f"invalid token strategy for {self.name}")
        if self.human_destination not in HUMAN_DESTINATIONS:
            raise ValueError(f"invalid human destination for {self.name}")
        if not self.projected_profiles or any(
            profile not in AUTHORITATIVE_PROFILES for profile in self.projected_profiles
        ):
            raise ValueError(f"invalid projected profiles for {self.name}")
        if self.authoritative_profile not in self.projected_profiles:
            raise ValueError(f"authoritative profile is not projected for {self.name}")
        if len(set(self.projected_profiles)) != len(self.projected_profiles):
            raise ValueError(f"duplicate projected profile for {self.name}")
        if not self.supported_representations:
            raise ValueError(f"no representations declared for {self.name}")

    def as_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "semanticCategory": self.semantic_category,
            "authoritativeProfile": self.authoritative_profile,
            "rdfTypes": list(self.rdf_types),
            "ownershipRule": self.ownership_rule,
            "tokenStrategy": self.token_strategy,
            "humanDestination": self.human_destination,
            "projectedProfiles": list(self.projected_profiles),
            "supportedRepresentations": list(self.supported_representations),
        }


def _family(
    name: str,
    semantic_category: str,
    authoritative_profile: str,
    rdf_type: str,
    ownership_rule: str,
    token_strategy: str,
    human_destination: str,
    *projected_profiles: str,
) -> ResourceFamily:
    return ResourceFamily(
        name=name,
        semantic_category=semantic_category,
        authoritative_profile=authoritative_profile,
        rdf_types=(rdf_type,),
        ownership_rule=ownership_rule,
        token_strategy=token_strategy,
        human_destination=human_destination,
        projected_profiles=tuple(projected_profiles),
    )


def _owner_resource(name: str, rdf_type: str, *profiles: str) -> ResourceFamily:
    return _family(
        name,
        "first_class_resource",
        "modavis",
        rdf_type,
        "owner",
        "sha256_canonical_json_v1",
        "owner_export_resource",
        *profiles,
    )


def _structural(
    name: str, rdf_type: str, authoritative_profile: str, *profiles: str
) -> ResourceFamily:
    return _family(
        name,
        "structural_resource",
        authoritative_profile,
        rdf_type,
        "owner_profile_document",
        "fragment_sha256_canonical_json_v1",
        "owner_export_resource",
        *profiles,
    )


CORE = "https://w3id.org/modavis/ontology/core#"
INST = "https://w3id.org/modavis/ontology/instrument#"
ORGAN = "https://w3id.org/modavis/ontology/organ#"
EVENT = "https://w3id.org/modavis/ontology/events#"
MEDIA = "https://w3id.org/modavis/ontology/media#"
EVIDENCE = "https://w3id.org/modavis/ontology/evidence#"
ASSERTION = "https://w3id.org/modavis/ontology/assertion#"
VMI = "https://w3id.org/modavis/ontology/virtual-instrument#"
SCHEMA = "https://schema.org/"
CRM = "http://www.cidoc-crm.org/cidoc-crm/"
ORE = "http://www.openarchives.org/ore/terms/"
PON_CORE = "https://w3id.org/polifonia/ontology/core/"
ARCO = "https://w3id.org/arco/ontology/core/"
RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
SKOS = "http://www.w3.org/2004/02/skos/core#"


_RESOURCE_FAMILY_ENTRIES = (
    _owner_resource("actor", CORE + "Agent", "modavis", "cidoc", "edm", "pon"),
    _owner_resource("actor-organ-relation", CORE + "Relationship", "modavis"),
    _structural(
        "administrative-hierarchy-property", SCHEMA + "PropertyValue", "modavis", "modavis"
    ),
    _owner_resource("administrative-place", CORE + "Place", "modavis", "cidoc", "edm"),
    _structural("agent-role", PON_CORE + "AgentRole", "pon", "pon"),
    _owner_resource("assertion", ASSERTION + "Assertion", "modavis", "pon"),
    _structural("interpretation-evidence", "http://www.w3.org/ns/prov#Entity", "modavis", "modavis", "cidoc", "edm", "pon"),
    _structural("evidence-property", SCHEMA + "PropertyValue", "modavis", "modavis", "cidoc", "edm", "pon"),
    _structural("participation-assertion", RDF + "Statement", "modavis", "modavis", "pon"),
    _structural("cidoc-participation-assertion", RDF + "Statement", "cidoc", "cidoc"),
    _structural("edm-participation-assertion", RDF + "Statement", "edm", "edm"),
    _structural("cidoc-appellation", CRM + "E41_Appellation", "cidoc", "cidoc"),
    _structural("cidoc-attribute-assignment", CRM + "E13_Attribute_Assignment", "cidoc", "cidoc"),
    _structural("cidoc-creation", CRM + "E65_Creation", "cidoc", "cidoc"),
    _structural("cidoc-identifier", CRM + "E42_Identifier", "cidoc", "cidoc"),
    _structural("cidoc-place-appellation", CRM + "E41_Appellation", "cidoc", "cidoc"),
    _structural("cidoc-production", CRM + "E12_Production", "cidoc", "cidoc"),
    _structural("cidoc-space-primitive", CRM + "E94_Space_Primitive", "cidoc", "cidoc"),
    _structural("cidoc-time-span", CRM + "E52_Time-Span", "cidoc", "cidoc"),
    _structural("component-membership", INST + "ComponentMembership", "modavis", "modavis", "pon"),
    _structural("conflict-set", ASSERTION + "ConflictSet", "modavis", "modavis", "pon"),
    _structural("coordinate-assertion", ASSERTION + "Assertion", "modavis", "modavis", "pon"),
    _structural("edm-aggregation", ORE + "Aggregation", "edm", "edm"),
    _owner_resource("event", EVENT + "Activity", "modavis", "cidoc", "edm", "pon"),
    _structural("source-event-type", SKOS + "Concept", "modavis", "modavis", "pon"),
    _structural("event-place", CORE + "Place", "modavis", "modavis", "pon"),
    _family(
        "event-type", "governed_term", "modavis", SKOS + "Concept",
        "governed_vocabulary", "governed_iri_v1", "vocabulary_concept",
        "modavis", "pon",
    ),
    _structural("evidence-relation", EVIDENCE + "EvidenceRelation", "modavis", "modavis", "pon"),
    _structural("identifier", CORE + "Identifier", "modavis", "modavis", "pon"),
    _owner_resource(
        "instrument-configuration", INST + "InstrumentConfiguration", "modavis", "pon"
    ),
    _owner_resource("instrument-state", INST + "InstrumentState", "modavis", "pon"),
    _owner_resource("media-reference", MEDIA + "DigitalRepresentation", "modavis", "cidoc", "pon"),
    _family(
        "media-status", "release_scheme_term", "modavis", SKOS + "Concept",
        "release_scheme", "release_scheme_slug_v1", "release_scheme",
        "modavis", "pon",
    ),
    _family(
        "musixplora-actor", "first_class_resource", "modavis", CORE + "Agent",
        "release", "base64url_source_key_v1", "release_source_resource", "modavis",
    ),
    _family(
        "musixplora-relation", "first_class_resource", "modavis", RDF + "Statement",
        "release", "base64url_source_key_v1", "release_source_resource", "modavis",
    ),
    _owner_resource("name", CORE + "Name", "modavis"),
    _owner_resource("organ-component", ORGAN + "OrganComponent", "modavis", "cidoc", "edm", "pon"),
    _owner_resource("organ-division", ORGAN + "OrganDivision", "modavis", "cidoc", "edm", "pon"),
    _owner_resource("place", CORE + "Place", "modavis", "cidoc", "edm", "pon"),
    _structural("place-assertion", CORE + "Place", "modavis", "modavis", "pon"),
    _owner_resource("place-containment", CORE + "PlaceContainmentRelation", "modavis"),
    _structural("place-hierarchy-assertion", ASSERTION + "Assertion", "modavis", "modavis"),
    _owner_resource("place-name", CORE + "Name", "modavis"),
    _structural("place-provider-binding", EVIDENCE + "EvidenceRelation", "modavis", "modavis"),
    _structural("place-route", CORE + "PlaceResolution", "modavis", "modavis"),
    _structural("project", ARCO + "Project", "pon", "pon"),
    _owner_resource("related-entity", CORE + "Entity", "modavis"),
    _owner_resource("represented-instrument", ORGAN + "PipeOrgan", "modavis", "cidoc"),
    _owner_resource("represented-instrument-place", CORE + "Place", "modavis"),
    _family(
        "role", "release_scheme_term", "pon", PON_CORE + "Role",
        "release_scheme", "release_scheme_slug_v1", "release_scheme", "pon",
    ),
    _structural("source-fragment", EVIDENCE + "SourceFragment", "modavis", "modavis", "pon"),
    _family(
        "source-record", "first_class_resource", "modavis", EVIDENCE + "SourceResource",
        "release", "base64url_source_key_v1", "release_source_record",
        "modavis", "edm", "pon",
    ),
    _family(
        "technical-fact-property", "release_schema_term", "modavis", RDF + "Property",
        "release_schema", "release_schema_slug_v1", "release_schema", "modavis", "pon",
    ),
    _structural("time-span", CORE + "TimeSpan", "modavis", "modavis", "pon"),
    _owner_resource("virtual-instrument", VMI + "VirtualMusicalInstrument", "modavis", "pon"),
    _structural("virtual-instrument-availability", VMI + "Availability", "modavis", "modavis"),
    _family(
        "virtual-instrument-platform", "release_scheme_term", "modavis", VMI + "SoftwarePlatform",
        "release_scheme", "release_scheme_slug_v1", "release_scheme", "modavis",
    ),
    _owner_resource("virtual-instrument-producer", CORE + "Organization", "modavis", "cidoc"),
    _owner_resource("virtual-instrument-relation", VMI + "InstrumentRelation", "modavis"),
    _structural(
        "virtual-instrument-source-property", SCHEMA + "PropertyValue", "modavis", "modavis"
    ),
)


def build_resource_family_registry(
    entries: Iterable[ResourceFamily],
) -> Mapping[str, ResourceFamily]:
    registry: dict[str, ResourceFamily] = {}
    for entry in entries:
        if entry.name in registry:
            raise ValueError(f"duplicate resource family: {entry.name}")
        registry[entry.name] = entry
    return MappingProxyType(registry)


RESOURCE_FAMILIES = build_resource_family_registry(_RESOURCE_FAMILY_ENTRIES)


def require_resource_family(name: str) -> ResourceFamily:
    key = str(name or "").strip()
    try:
        return RESOURCE_FAMILIES[key]
    except KeyError as exc:
        raise UnregisteredResourceFamilyError(
            f"release-local resource family is not registered: {key or '<empty>'}"
        ) from exc


def registry_document() -> dict[str, object]:
    return {
        "contract": "modavis.release-resource-family-registry/v2",
        "familyCount": len(RESOURCE_FAMILIES),
        "families": [RESOURCE_FAMILIES[key].as_dict() for key in sorted(RESOURCE_FAMILIES)],
    }
