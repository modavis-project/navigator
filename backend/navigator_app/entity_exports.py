"""Complete, version-bound RDF representations of public Navigator entities."""

from __future__ import annotations

from collections.abc import Mapping
import hashlib
from io import BytesIO
import json
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

from rdflib import Graph, Literal, Namespace, RDF, RDFS, URIRef
from rdflib.namespace import DC, DCTERMS, OWL, PROV, SKOS, XSD
from rdflib.plugins.serializers.turtle import TurtleSerializer

from .lod import MODAVIS_0153_PROFILE, PROFILES
from .resource_families import require_resource_family
from .uri_policy import ResourceUriFactory, UriPolicy, canonical_resource_digest


CORE = Namespace("https://w3id.org/modavis/ontology/core#")
INST = Namespace("https://w3id.org/modavis/ontology/instrument#")
ORGAN = Namespace("https://w3id.org/modavis/ontology/organ#")
EVENT = Namespace("https://w3id.org/modavis/ontology/events#")
MEDIA = Namespace("https://w3id.org/modavis/ontology/media#")
EVIDENCE = Namespace("https://w3id.org/modavis/ontology/evidence#")
ASSERTION = Namespace("https://w3id.org/modavis/ontology/assertion#")
VMI = Namespace("https://w3id.org/modavis/ontology/virtual-instrument#")
SCHEMA = Namespace("https://schema.org/")
CRM = Namespace("http://www.cidoc-crm.org/cidoc-crm/")
EDM = Namespace("http://www.europeana.eu/schemas/edm/")
ORE = Namespace("http://www.openarchives.org/ore/terms/")
WGS84 = Namespace("http://www.w3.org/2003/01/geo/wgs84_pos#")
GEO = Namespace("http://www.opengis.net/ont/geosparql#")
PON_ORGAN = Namespace("https://w3id.org/polifonia/ontology/organs/")
PON_CORE = Namespace("https://w3id.org/polifonia/ontology/core/")
ARCO = Namespace("https://w3id.org/arco/ontology/core/")

FORMAT_MEDIA_TYPES = {
    "jsonld": "application/ld+json",
    "ttl": "text/turtle",
    "nt": "application/n-triples",
    "rdf": "application/rdf+xml",
    "xml": "application/rdf+xml",
}
_CONTEXT = {
    "modavis": str(CORE), "modinst": str(INST), "modorgan": str(ORGAN),
    "modevent": str(EVENT), "modmedia": str(MEDIA), "modevidence": str(EVIDENCE),
    "modassert": str(ASSERTION), "modvmi": str(VMI), "schema": str(SCHEMA),
    "dcterms": str(DCTERMS), "dc": str(DC), "prov": str(PROV),
    "skos": str(SKOS), "rdfs": str(RDFS), "owl": str(OWL),
    "crm": str(CRM), "edm": str(EDM), "ore": str(ORE), "wgs84": str(WGS84),
    "geo": str(GEO),
    "ponorgan": str(PON_ORGAN), "poncore": str(PON_CORE), "arco": str(ARCO),
}

UriContext = UriPolicy | ResourceUriFactory
EVIDENCE_RESOURCE_FAMILIES = frozenset({"interpretation-evidence", "evidence-property", "participation-assertion", "cidoc-participation-assertion", "edm-participation-assertion"})


def _items(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _map(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _first(record: Mapping[str, Any], *keys: str) -> Any:
    return next((record[key] for key in keys if record.get(key) not in (None, "")), None)


def _entity_id(record: Mapping[str, Any]) -> str:
    return str(_first(record, "mdvsId", "id") or "")


def _entity_uri(record: Mapping[str, Any], policy: UriContext) -> URIRef:
    explicit = _first(record, "canonicalUri", "identifierUri")
    if explicit:
        return URIRef(str(explicit))
    if isinstance(policy, ResourceUriFactory):
        return URIRef(policy.canonical_uri())
    return URIRef(policy.identity_uri(_entity_id(record)))


def _human_url(kind: str, record: Mapping[str, Any], policy: UriContext) -> URIRef:
    route = _first(record, "canonicalUrl", "pageUrl")
    value = f"{policy.human_base}{route}" if route and str(route).startswith("/") else route
    return URIRef(str(value or policy.human_uri(kind, _entity_id(record))))


def _node(
    policy: UriContext,
    category: str,
    value: Any,
    *,
    source_path: Any = None,
    label: Any = None,
    raw_value: Any = None,
) -> URIRef:
    require_resource_family(category)
    if isinstance(policy, ResourceUriFactory):
        return URIRef(
            policy.resource_uri(
                category,
                stable_key=value,
                source_path=source_path,
                label=label,
                raw_value=raw_value,
            )
        )
    if policy.policy_version == "2":
        raise ValueError("URI policy v2 requires an owner-bound resource factory")
    return URIRef(
        f"{policy.dataset_version_uri}/{category}/"
        f"{quote(str(value or 'unknown'), safe='-._~')}"
    )


def legacy_evidence_resource_uri(policy: ResourceUriFactory, label: str, profile: str = "modavis") -> URIRef:
    """Map a retained legacy evidence label to its registered owner/profile URI.

    Constructors retain their original stable keys. This also permits exact
    substitution in preserved exports once each statement's owner is proven.
    Factory annotations add the old key as dcterms:identifier; evidence payloads
    and canonical actor identifiers are unchanged.
    """
    if not isinstance(policy, ResourceUriFactory) or not policy.owner_uri:
        raise ValueError("Evidence resources require an owner-bound URI factory")
    if profile not in {"modavis", "cidoc", "edm", "pon"}:
        raise ValueError("Unknown evidence export profile")
    import re
    match = re.fullmatch(r"(chronology|componentDetail|functionalQuantity|relocation|representation|technical|participation|labelinterpretation)([0-9a-f]{64})", label)
    if not match:
        raise ValueError("Unknown legacy evidence node label")
    prefix = match[1]
    if prefix == "participation":
        family = {"modavis": "participation-assertion", "pon": "participation-assertion",
                  "cidoc": "cidoc-participation-assertion", "edm": "edm-participation-assertion"}[profile]
    else:
        family = "evidence-property" if prefix in {"functionalQuantity", "technical"} else "interpretation-evidence"
    return _node(policy, family, label)


def _resource_factory(
    kind: str,
    record: Mapping[str, Any],
    policy: UriContext,
) -> ResourceUriFactory:
    if isinstance(policy, ResourceUriFactory):
        return policy
    return ResourceUriFactory.for_owner(
        policy,
        owner_kind=kind,
        owner_identifier=_entity_id(record),
        owner_uri=_first(record, "canonicalUri", "identifierUri"),
    )


def _apply_resource_annotations(
    graph: Graph,
    factory: ResourceUriFactory,
) -> Graph:
    if not factory.uses_scoped_identifiers:
        return graph
    for annotation in factory.annotations():
        subject = URIRef(annotation.uri)
        if (subject, None, None) not in graph:
            continue
        if annotation.source_key is not None:
            graph.add((subject, DCTERMS.identifier, Literal(annotation.source_key)))
        if annotation.source_path is not None and annotation.family == "source-fragment":
            graph.add((subject, EVIDENCE.selectorValue, Literal(annotation.source_path)))
        if annotation.label is not None:
            graph.add((subject, RDFS.label, Literal(annotation.label)))
        if annotation.raw_value is not None and annotation.family in {
            "assertion",
            "coordinate-assertion",
            "place-hierarchy-assertion",
        }:
            graph.add((subject, ASSERTION.rawValue, Literal(annotation.raw_value)))
    return graph


def _external(value: Any) -> URIRef | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parts = urlsplit(value.strip())
    except ValueError:
        return None
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None
    path = quote(parts.path, safe="/%:@-._~!$&'()*+,;=")
    return URIRef(urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment)))


def _literal(graph: Graph, subject: URIRef, predicate: URIRef, value: Any, datatype: URIRef | None = None) -> None:
    if value not in (None, "", [], {}):
        graph.add((subject, predicate, Literal(value, datatype=datatype)))


def _label(graph: Graph, subject: URIRef, value: Any) -> None:
    _literal(graph, subject, RDFS.label, value)


def _digest(value: Any, policy: UriContext) -> str:
    if isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers:
        return canonical_resource_digest(value)
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:24]


def _date_time(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip().replace(" ", "T", 1)
    if len(text) >= 3 and text[-3] in {"+", "-"} and text[-2:].isdigit():
        text += ":00"
    return text


def _identity_uri(value: Any, policy: UriContext, explicit: Any = None) -> URIRef | None:
    uri = _external(explicit)
    if uri:
        return uri
    if not value:
        return None
    try:
        return URIRef(policy.identity_uri(str(value)))
    except ValueError:
        return None


def _structured_properties(
    graph: Graph,
    policy: UriContext,
    subject: URIRef,
    value: Any,
    *,
    category: str,
    path: str = "",
) -> None:
    """Preserve every populated source-JSON leaf as a schema:PropertyValue."""
    if isinstance(value, Mapping):
        for key in sorted(value):
            escaped = str(key).replace("~", "~0").replace("/", "~1")
            _structured_properties(
                graph, policy, subject, value[key], category=category,
                path=f"{path}/{escaped}",
            )
        return
    if isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            _structured_properties(
                graph, policy, subject, item, category=category,
                path=f"{path}/{index}",
            )
        return
    if value is None:
        return
    node = _node(policy, category, f"{subject}:{path}:{_digest(value, policy)}")
    graph.add((subject, SCHEMA.additionalProperty, node))
    graph.add((node, RDF.type, SCHEMA.PropertyValue))
    _literal(graph, node, SCHEMA.propertyID, path or "/")
    _literal(graph, node, SCHEMA.value, value)


def _bind(graph: Graph) -> None:
    for prefix, uri in _CONTEXT.items():
        graph.bind(prefix, Namespace(uri))


def _class(kind: str) -> URIRef:
    return URIRef({
        "organ": ORGAN.PipeOrgan, "person": CORE.Person, "organization": CORE.Organization,
        "place": CORE.Place, "virtual_instrument": VMI.VirtualMusicalInstrument, "name": CORE.Name,
    }.get(kind, CORE.Entity))


def _source_uri(policy: UriContext, source: Mapping[str, Any]) -> URIRef:
    return _node(policy, "source-record", source.get("id") or source.get("sourceRecordId"))


def _add_source(graph: Graph, policy: UriContext, source: Mapping[str, Any]) -> URIRef:
    uri = _source_uri(policy, source)
    graph.add((uri, RDF.type, EVIDENCE.SourceResource))
    _label(graph, uri, source.get("title") or source.get("source") or source.get("sourceKey") or source.get("id"))
    _literal(graph, uri, DCTERMS.identifier, source.get("id") or source.get("sourceRecordId"))
    link = _external(source.get("url") or source.get("sourceUrl"))
    if link:
        _literal(graph, uri, EVIDENCE.sourceUri, str(link), XSD.anyURI)
        graph.add((uri, SCHEMA.url, link))
    return uri


def _sources(record: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    values = [item for item in _items(record.get("sources")) if isinstance(item, Mapping)]
    return {str(item.get("id") or item.get("sourceRecordId")): item for item in values}


def _add_identifiers(graph: Graph, subject: URIRef, record: Mapping[str, Any], policy: UriContext) -> None:
    values = [item for item in _items(record.get("identifiers")) if isinstance(item, Mapping)]
    values += [item for item in _items(_map(record.get("profile")).get("identifiers")) if isinstance(item, Mapping)]
    identifier = _entity_id(record)
    if identifier and not any(str(item.get("value")) == identifier for item in values):
        values.insert(0, {"scheme": "MODAVIS", "value": identifier})
    seen: set[tuple[str, str]] = set()
    for index, item in enumerate(values):
        value = str(item.get("value") or item.get("identifier") or "").strip()
        scheme = str(item.get("scheme") or item.get("schemeLabel") or "identifier")
        if not value or (scheme, value) in seen:
            continue
        seen.add((scheme, value))
        uri = _node(policy, "identifier", item.get("id") or f"{identifier}:{scheme}:{value}:{index}")
        graph.add((subject, CORE.hasIdentifier, uri))
        graph.add((uri, RDF.type, CORE.Identifier))
        _literal(graph, uri, CORE.identifierValue, value)
        _literal(graph, uri, DCTERMS.type, scheme)
        _label(graph, uri, value)
        link = _external(item.get("url"))
        if link:
            graph.add((uri, SCHEMA.url, link))


def _actor_uri(item: Mapping[str, Any], policy: UriContext, fallback: str) -> URIRef:
    value = item.get("mdvsId") or item.get("id") or item.get("relatedMdvsId")
    if value and str(value).startswith("MDVS:"):
        try:
            return URIRef(policy.identity_uri(str(value)))
        except ValueError:
            pass
    page = item.get("pageUrl") or item.get("entityPageUrl") or item.get("relatedUrl")
    if page:
        return URIRef(f"{policy.human_base}{page}" if str(page).startswith("/") else str(page))
    return _node(policy, "actor", fallback)


def _add_evidence(
    graph: Graph, policy: UriContext, assertion: URIRef, source: Mapping[str, Any] | None,
    source_path: Any, raw_value: Any,
) -> None:
    _literal(graph, assertion, ASSERTION.rawValue, raw_value)
    if not source:
        return
    source_uri = _add_source(graph, policy, source)
    graph.add((assertion, DCTERMS.source, source_uri))
    if not source_path:
        return
    digest = hashlib.sha256(f"{assertion}\0{source_uri}\0{source_path}".encode()).hexdigest()[:24]
    if isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers:
        digest = canonical_resource_digest({
            "assertion": str(assertion), "source": str(source_uri), "path": source_path,
        })
    fragment = _node(
        policy,
        "source-fragment",
        digest,
        source_path=source_path,
    )
    graph.add((fragment, RDF.type, EVIDENCE.SourceFragment))
    graph.add((fragment, EVIDENCE.fragmentOf, source_uri))
    _literal(graph, fragment, EVIDENCE.selectorValue, source_path)
    relation = _node(policy, "evidence-relation", digest)
    graph.add((relation, RDF.type, EVIDENCE.EvidenceRelation))
    graph.add((relation, EVIDENCE.evaluates, assertion))
    graph.add((relation, EVIDENCE.usesFragment, fragment))
    graph.add((assertion, ASSERTION.hasEvidenceRelation, relation))


def _component_class(kind: Any) -> URIRef:
    key = str(kind or "component").casefold().replace("-", "_")
    return URIRef({
        "stop": ORGAN.OrganStop, "compound_stop": ORGAN.OrganStop,
        "division": ORGAN.OrganDivision, "keyboard": ORGAN.OrganKeyboard,
        "manual": ORGAN.OrganKeyboard, "pedal": ORGAN.OrganKeyboard,
        "coupler": ORGAN.OrganCoupler, "accessory": ORGAN.OrganAccessory,
        "rank": ORGAN.OrganRank, "pipe": ORGAN.OrganPipe,
        "wind_system": ORGAN.WindSystem, "console": ORGAN.Console,
    }.get(key, ORGAN.OrganComponent))


def _add_component(
    graph: Graph, policy: UriContext, organ: URIRef, item: Mapping[str, Any],
    configuration: URIRef, state: URIRef | None, source: Mapping[str, Any] | None,
    source_path: Any, division: URIRef | None = None,
) -> URIRef:
    component_id = item.get("id") or item.get("mdvsId") or hashlib.sha256(
        json.dumps(dict(item), sort_keys=True, default=str).encode()
    ).hexdigest()[:24]
    if (isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers
            and not (item.get("id") or item.get("mdvsId"))):
        component_id = canonical_resource_digest(dict(item))
    component = _node(policy, "organ-component", component_id)
    detail = _map(item.get("detail"))
    for evidence_key in ("quantityQualification", "quantityFieldEvidence", "sourceFragment", "sourceComponentQualification"):
        if detail.get(evidence_key):
            _literal(graph, component, PROV.value, json.dumps({evidence_key:detail[evidence_key]},ensure_ascii=False,sort_keys=True))
    if detail.get("contract") == "modavis.terminology-quality/v1":
        recovery = {key: detail[key] for key in (
            "contract", "sourcePayloadSha256", "sourceResourceSha256", "sourceLine",
            "sourceLineWording", "sourceRowWording", "sourceParserFields",
        ) if key in detail}
        _literal(graph, component, PROV.value, json.dumps({"sourceAccountRecovery": recovery}, ensure_ascii=False, sort_keys=True))
    if item.get("kind") == "source_note":
        graph.add((component, RDF.type, PROV.Entity))
        graph.add((organ, PROV.wasDerivedFrom, component))
        _literal(graph, component, RDF.value, item.get("wording") or item.get("label"))
        _add_evidence(graph, policy, component, source, source_path, item.get("label"))
        return component
    graph.add((component, RDF.type, _component_class(item.get("kind"))))
    graph.add((organ, INST.hasComponent, component))
    graph.add((component, INST.componentOf, organ))
    _label(graph, component, item.get("label") or item.get("wording") or component_id)
    _literal(graph, component, ORGAN.hasNominalPitchDesignation, item.get("pitch") or _map(item.get("detail")).get("pitch"))
    membership = _node(policy, "component-membership", f"{component_id}:{configuration}")
    graph.add((membership, RDF.type, INST.ComponentMembership))
    graph.add((organ, INST.hasMembership, membership))
    graph.add((membership, INST.membershipInstrument, organ))
    graph.add((membership, INST.childComponent, component))
    graph.add((membership, INST.appliesInConfiguration, configuration))
    if state:
        graph.add((membership, INST.appliesInState, state))
    if division:
        graph.add((membership, INST.parentComponent, division))
        graph.add((division, INST.hasMembership, membership))
    assertion = _node(
        policy,
        "assertion",
        f"component:{component_id}:{source_path}",
        source_path=source_path,
        label=item.get("label"),
        raw_value=item.get("wording") or item.get("sourceWording") or item.get("label"),
    )
    graph.add((assertion, RDF.type, ASSERTION.Assertion))
    graph.add((assertion, ASSERTION.assertsSubject, organ))
    graph.add((assertion, ASSERTION.assertsPredicate, INST.hasComponent))
    graph.add((assertion, ASSERTION.assertsObject, component))
    _literal(graph, assertion, ASSERTION.normalizedValue, item.get("label"))
    _add_evidence(graph, policy, assertion, source, source_path, item.get("wording") or item.get("sourceWording") or item.get("label"))
    return component


def _add_specifications(graph: Graph, policy: UriContext, organ: URIRef, record: Mapping[str, Any]) -> None:
    source_index = _sources(record)
    described: set[str] = set()
    for description in _items(record.get("specificationDescriptionDetails")):
        if not isinstance(description, Mapping):
            continue
        description_id = description.get("id") or hashlib.sha256(
            json.dumps(dict(description), sort_keys=True, default=str).encode()
        ).hexdigest()[:24]
        if (isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers
                and not description.get("id")):
            description_id = canonical_resource_digest(dict(description))
        state = _node(policy, "instrument-state", description.get("stateId") or description_id)
        configuration = _node(policy, "instrument-configuration", description_id)
        chronology = _map(description.get("chronology"))
        if chronology:
            evidence = legacy_evidence_resource_uri(policy, "chronology" + hashlib.sha256(str(description_id).encode()).hexdigest())
            graph.add((configuration, PROV.wasDerivedFrom, evidence))
            graph.add((evidence, RDF.type, PROV.Entity))
            _literal(graph, evidence, RDF.value, json.dumps(chronology, ensure_ascii=False, sort_keys=True))
            _literal(graph, configuration, DCTERMS.description, "Source-described configuration; present condition and physical state identity are not established.")
            for association in _items(chronology.get("eventAssociations")):
                graph.add((configuration, DCTERMS.relation, _node(policy, "event", association["eventId"])))
        graph.add((organ, INST.hasState, state))
        graph.add((state, RDF.type, INST.InstrumentState))
        graph.add((state, INST.stateOf, organ))
        graph.add((state, INST.hasConfiguration, configuration))
        graph.add((configuration, RDF.type, INST.InstrumentConfiguration))
        graph.add((configuration, INST.configurationOf, organ))
        _label(graph, state, description.get("periodLabel") or description.get("sourceHeading"))
        _label(graph, configuration, description.get("sourceHeading") or description.get("periodLabel"))
        _literal(graph, state, CORE.rawTemporalExpression, description.get("periodLabel"))
        source = _map(description.get("source"))
        if source:
            graph.add((configuration, DCTERMS.source, _add_source(graph, policy, source)))
        for group_index, group in enumerate(_items(description.get("groups"))):
            if not isinstance(group, Mapping):
                continue
            division = _node(policy, "organ-division", f"{description_id}:{group.get('label') or group_index}")
            graph.add((division, RDF.type, ORGAN.OrganDivision))
            graph.add((organ, INST.hasComponent, division))
            graph.add((division, INST.componentOf, organ))
            _label(graph, division, group.get("label") or "Unspecified division")
            _literal(graph, division, DCTERMS.description, group.get("compass"))
            for item in _items(group.get("entries")):
                if not isinstance(item, Mapping):
                    continue
                described.add(str(item.get("id") or ""))
                paths = _items(item.get("sourcePaths"))
                _add_component(graph, policy, organ, item, configuration, state, source or None, paths[0] if paths else None, division)
        for item in _items(description.get("otherComponents")):
            if isinstance(item, Mapping):
                described.add(str(item.get("id") or ""))
                paths = _items(item.get("sourcePaths"))
                _add_component(graph, policy, organ, item, configuration, state, source or None, paths[0] if paths else None)

    fallback = _node(policy, "instrument-configuration", f"{_entity_id(record)}:public-projection")
    fallback_used = False
    fallback_divisions: dict[str, URIRef] = {}
    hierarchies: list[tuple[list[Any], Mapping[str, Any] | None]] = []
    for source_spec in _items(record.get("sourceSpecifications")):
        if isinstance(source_spec, Mapping):
            hierarchies.append((_items(source_spec.get("componentHierarchy")), _map(source_spec.get("source")) or None))
    if not hierarchies:
        hierarchies.append((_items(record.get("componentHierarchy")), None))
    for hierarchy, default_source in hierarchies:
        for group in hierarchy:
            if not isinstance(group, Mapping):
                continue
            for item in _items(group.get("items")):
                if not isinstance(item, Mapping) or str(item.get("id") or "") in described:
                    continue
                fallback_used = True
                division_label = _map(item.get("detail")).get("division")
                division = None
                if division_label:
                    division = fallback_divisions.get(str(division_label))
                    if division is None:
                        division = _node(
                            policy,
                            "organ-division",
                            f"{_entity_id(record)}:public-projection:{division_label}",
                        )
                        fallback_divisions[str(division_label)] = division
                        graph.add((division, RDF.type, ORGAN.OrganDivision))
                        graph.add((organ, INST.hasComponent, division))
                        graph.add((division, INST.componentOf, organ))
                        _label(graph, division, division_label)
                _add_component(
                    graph, policy, organ, item, fallback, None,
                    _map(item.get("source")) or default_source, item.get("sourcePath"),
                    division,
                )
    if fallback_used:
        graph.add((fallback, RDF.type, INST.InstrumentConfiguration))
        graph.add((fallback, INST.configurationOf, organ))
        graph.add((organ, INST.hasConfiguration, fallback))

    _add_technical_facts(graph, policy, organ, record)


def _configuration_evidence(graph, policy, organ, record):
    for description in _items(record.get("specificationDescriptionDetails")):
        chronology = _map(description.get("chronology"))
        if not chronology: continue
        identifier = str(description["id"])
        configuration = _node(policy, "instrument-configuration", identifier)
        evidence = legacy_evidence_resource_uri(policy, "chronology" + hashlib.sha256(identifier.encode()).hexdigest())
        graph.add((organ, DCTERMS.hasPart, configuration))
        graph.add((configuration, PROV.wasDerivedFrom, evidence))
        graph.add((evidence, RDF.type, PROV.Entity))
        _literal(graph, evidence, RDF.value, json.dumps(chronology, ensure_ascii=False, sort_keys=True))
        _literal(graph, configuration, DCTERMS.description, "Source-described configuration; present condition and physical state identity are not established.")
        for association in _items(chronology.get("eventAssociations")):
            graph.add((configuration, DCTERMS.relation, _node(policy, "event", association["eventId"])))


def _restored_component_evidence(graph, policy, record, organ):
    items = {}
    for group in _items(record.get("componentHierarchy")):
        for item in _items(group.get("items")):items[item.get("id")]=item
    for description in _items(record.get("specificationDescriptionDetails")):
        for group in _items(description.get("groups")):
            for item in _items(group.get("entries")):items[item.get("id")]=item
        for item in _items(description.get("otherComponents")):items[item.get("id")]=item
    for item in items.values():
        if not item.get("id") or not _map(item.get("detail")).get("sourcePayloadSha256"):continue
        component_id = item["id"]
        component = _node(policy, "organ-component", component_id)
        detail = _map(item.get("detail"))
        if item.get("kind") == "source_note":
            graph.add((component, RDF.type, PROV.Entity))
            graph.add((organ, PROV.wasDerivedFrom, component))
            _literal(graph, component, RDF.value, item.get("wording") or item.get("label"))
        if detail.get("sourcePayloadSha256"):
            evidence = legacy_evidence_resource_uri(policy, "componentDetail" + hashlib.sha256(str(component_id).encode()).hexdigest())
            graph.add((component, PROV.wasDerivedFrom, evidence))
            graph.add((evidence, RDF.type, PROV.Entity))
            _literal(graph, evidence, RDF.value, json.dumps(detail, ensure_ascii=False, sort_keys=True))
            if item.get("kind") == "stop":
                from .pipework import apply_register_pipe_quantities
                _, hierarchy = apply_register_pipe_quantities(None, [{"id":"stops","items":[dict(item)]}])
                quantity = hierarchy[0]["items"][0].get("pipeQuantity")
                if quantity:
                    property_node = legacy_evidence_resource_uri(policy, "functionalQuantity" + hashlib.sha256(str(component_id).encode()).hexdigest())
                    graph.add((component, SCHEMA.additionalProperty, property_node))
                    graph.add((property_node, RDF.type, SCHEMA.PropertyValue))
                    _literal(graph, property_node, SCHEMA.name, "Qualified functional position quantity")
                    _literal(graph, property_node, SCHEMA.value, json.dumps(quantity, ensure_ascii=False, sort_keys=True))


def _add_technical_facts(graph, policy, organ, record):
    _restored_component_evidence(graph, policy, record, organ)
    _configuration_evidence(graph, policy, organ, record)
    for event in _items(record.get("events")) or _items(record.get("activities")):
        for movement in _items(_map(event.get("movement")).get("movements")):
            node = _node(policy, "event", event["id"])
            evidence = legacy_evidence_resource_uri(policy, "relocation" + hashlib.sha256(movement["retainedActivityId"].encode()).hexdigest())
            graph.add((organ, DCTERMS.relation, node))
            graph.add((node, PROV.wasDerivedFrom, evidence))
            graph.add((evidence, RDF.type, PROV.Entity))
            _literal(graph, evidence, RDF.value, json.dumps(movement, ensure_ascii=False, sort_keys=True))
    source_index = _sources(record)
    by_family: dict[str, list[URIRef]] = {}
    for fact in _items(_map(record.get("technicalEvidence")).get("facts")):
        if not isinstance(fact, Mapping):
            continue
        fact_id = fact.get("id") or hashlib.sha256(
            json.dumps(dict(fact), sort_keys=True, default=str).encode()
        ).hexdigest()[:24]
        if (isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers
                and not fact.get("id")):
            fact_id = canonical_resource_digest(dict(fact))
        assertion = _node(
            policy,
            "assertion",
            fact_id,
            source_path=fact.get("sourcePath"),
            label=fact.get("label"),
            raw_value=fact.get("sourceWording"),
        )
        graph.add((assertion, RDF.type, ASSERTION.Assertion))
        graph.add((assertion, ASSERTION.assertsSubject, organ))
        family = str(fact.get("family") or "technical-fact")
        fact_property = _node(policy, "technical-fact-property", family)
        graph.add((fact_property, RDF.type, RDF.Property))
        _label(graph, fact_property, family.replace("_", " ").title())
        graph.add((assertion, ASSERTION.assertsPredicate, fact_property))
        _literal(graph, assertion, ASSERTION.assertsLiteral, fact.get("displayValue"))
        _literal(graph, assertion, ASSERTION.normalizedValue, fact.get("normalizedNumber"))
        _literal(graph, assertion, DCTERMS.type, fact.get("family"))
        _label(graph, assertion, fact.get("label"))
        source_id = str(fact.get("sourceRecordId") or "")
        source = source_index.get(source_id) or (
            {"id": source_id, "source": fact.get("source"), "url": fact.get("sourceUrl")} if source_id else None
        )
        _add_evidence(graph, policy, assertion, source, fact.get("sourcePath"), fact.get("sourceWording"))
        if fact.get("captureComparison"):
            _literal(graph, assertion, RDF.value, json.dumps(fact["captureComparison"], ensure_ascii=False, sort_keys=True))
        qualification = fact.get("aggregateQualification")
        if qualification:
            _literal(graph, assertion, DCTERMS.description, qualification.get("guidance"))
            _literal(graph, assertion, DCTERMS.type, qualification.get("status"))
        summary = fact.get("summaryEvidence")
        if summary:
            _literal(graph, assertion, DCTERMS.description, "Source-reported aggregate; no component identities or present-condition claim." if family != "stoplist_availability" else "Source statement about detailed stoplist availability.")
            _literal(graph, assertion, DCTERMS.type, summary.get("interpretation"))
            _literal(graph, assertion, PROV.value, json.dumps(summary, ensure_ascii=False, sort_keys=True))
        by_family.setdefault(family, []).append(assertion)
        if fact.get("conflictState") == "material_technical_disagreement":
            conflict = _node(policy, "conflict-set", f"{_entity_id(record)}:{family}")
            graph.add((conflict, RDF.type, ASSERTION.ConflictSet))
            graph.add((conflict, ASSERTION.hasConflictMember, assertion))
            _label(graph, conflict, f"Conflicting {fact.get('label') or family} assertions")
    for family, assertions in by_family.items():
        conflict = _node(policy, "conflict-set", f"{_entity_id(record)}:{family}")
        if (conflict, RDF.type, ASSERTION.ConflictSet) in graph:
            for assertion in assertions:
                graph.add((conflict, ASSERTION.hasConflictMember, assertion))


def _event_interpretation_evidence(graph, policy, event, item):
    for value in _items(item.get("retainedRepresentations")):
        node = legacy_evidence_resource_uri(policy, "representation" + hashlib.sha256(str(value.get("representationId")).encode()).hexdigest())
        graph.add((event, PROV.wasDerivedFrom, node))
        graph.add((node, RDF.type, PROV.Entity))
        _literal(graph, node, DCTERMS.identifier, value.get("representationId"))
        _literal(graph, node, RDF.value, json.dumps(value, ensure_ascii=False, sort_keys=True))
    for value in _items(item.get("dateValues")):
        _literal(graph, event, CORE.rawTemporalExpression, value.get("expression"))
    _literal(graph, event, DCTERMS.description, item.get("description"))
    for index, fact in enumerate(_items(item.get("technicalFacts"))):
        node = legacy_evidence_resource_uri(policy, "technical" + hashlib.sha256(f"{event}:{index}".encode()).hexdigest())
        graph.add((event, SCHEMA.additionalProperty, node))
        graph.add((node, RDF.type, SCHEMA.PropertyValue))
        _literal(graph, node, SCHEMA.name, "Documented event manual/stop count")
        _literal(graph, node, RDF.value, json.dumps(fact, ensure_ascii=False, sort_keys=True))
    for index, value in enumerate(_items(item.get("unresolvedAttributions"))):
        _literal(graph, event, DCTERMS.description,
                 "Unresolved source attribution: " + str(value.get("wording") or value.get("reason") or ""))


def _participant_evidence(graph, policy, event, predicate, actor, participant, index):
    if not participant.get("resolutionState") and not participant.get("sourceNativeEvidence"):
        if predicate == EVENT.hasParticipant:
            _literal(graph, actor, DCTERMS.type, participant.get("role"))
        return
    # Roles and exact source wording qualify participation, never actor identity.
    profile = {EVENT.hasParticipant: "modavis", CRM["P14_carried_out_by"]: "cidoc", DCTERMS.contributor: "edm"}[predicate]
    node = legacy_evidence_resource_uri(policy, "participation" + hashlib.sha256(f"{event}:{predicate}:{index}".encode()).hexdigest(), profile)
    graph.add((node, RDF.type, RDF.Statement))
    graph.add((node, RDF.subject, event))
    graph.add((node, RDF.predicate, predicate))
    graph.add((node, RDF.object, actor))
    _literal(graph, node, DCTERMS.type, participant.get("role"))
    _literal(graph, node, RDF.value, participant.get("sourceWording") or participant.get("wording"))
    _literal(graph, node, DCTERMS.description, participant.get("resolutionState"))
    _literal(graph, node, DCTERMS.source, participant.get("evidencePath"))
    _literal(graph, node, DCTERMS.identifier, participant.get("evidenceSha256"))
    for key in ("identityEvidence", "evidenceSpans", "sourceNativeEvidence"):
        if participant.get(key):
            _literal(graph, node, PROV.value, json.dumps({key: participant[key]}, ensure_ascii=False, sort_keys=True))


def _add_events(graph: Graph, policy: UriContext, subject: URIRef, record: Mapping[str, Any]) -> None:
    seen: set[str] = set()
    for item in _items(record.get("activities") or record.get("timeline")):
        if not isinstance(item, Mapping):
            continue
        event_id = str(item.get("id") or item.get("mdvsId") or "")
        if not event_id or event_id in seen:
            continue
        seen.add(event_id)
        event = _node(policy, "event", event_id)
        graph.add((event, RDF.type, EVENT.Activity))
        graph.add((event, EVENT.affectedEntity, subject))
        _event_interpretation_evidence(graph, policy, event, item)
        _label(graph, event, item.get("title") or item.get("label") or item.get("eventType"))
        event_type = _map(item.get("type"))
        code = event_type.get("code") or item.get("eventType")
        if code:
            resolved_code = event_type.get("canonicalCode") or code
            scoped = isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers
            if scoped and not str(resolved_code).startswith("activitype:"):
                concept = _node(policy, "source-event-type", resolved_code)
            else:
                concept = _node(policy, "event-type", resolved_code if scoped else code)
            graph.add((concept, RDF.type, SKOS.Concept))
            _literal(graph, concept, SKOS.notation, code)
            _literal(graph, concept, SKOS.prefLabel, event_type.get("displayName") or item.get("label") or code)
            graph.add((event, EVENT.eventType, concept))
        when = _map(item.get("when"))
        if when:
            span = _node(policy, "time-span", event_id)
            graph.add((span, RDF.type, CORE.TimeSpan))
            graph.add((event, EVENT.hasTimeSpan, span))
            _literal(graph, span, CORE.rawTemporalExpression, when.get("rawExpression"))
            _literal(graph, span, CORE.startDate, when.get("start"))
            _literal(graph, span, CORE.endDate, when.get("end"))
        for index, participant in enumerate(_items(item.get("participants"))):
            if isinstance(participant, Mapping):
                actor = _actor_uri(participant, policy, f"{event_id}:participant:{index}")
                graph.add((event, EVENT.hasParticipant, actor))
                graph.add((actor, RDF.type, CORE.Agent))
                _label(graph, actor, participant.get("label") or participant.get("name"))
                _participant_evidence(graph, policy, event, EVENT.hasParticipant, actor, participant, index)
        for index, place_item in enumerate(_items(item.get("places"))):
            if not isinstance(place_item, Mapping):
                continue
            place_id = place_item.get("mdvsId") or place_item.get("id")
            try:
                place = URIRef(policy.identity_uri(str(place_id))) if place_id else _node(
                    policy, "event-place", f"{event_id}:{index}"
                )
            except ValueError:
                place = _node(policy, "event-place", place_id or f"{event_id}:{index}")
            graph.add((place, RDF.type, CORE.Place))
            graph.add((event, DCTERMS.spatial, place))
            _label(graph, place, place_item.get("label") or place_item.get("name") or place_item.get("wording"))
            _literal(graph, place, DCTERMS.type, place_item.get("role"))
        source = _map(item.get("source"))
        if source:
            graph.add((event, EVENT.hasSource, _add_source(graph, policy, source)))


def _add_media(graph: Graph, policy: UriContext, subject: URIRef, record: Mapping[str, Any]) -> list[tuple[URIRef, Mapping[str, Any]]]:
    result: list[tuple[URIRef, Mapping[str, Any]]] = []
    for index, item in enumerate(_items(record.get("media"))):
        if not isinstance(item, Mapping):
            continue
        media = _node(policy, "media-reference", item.get("id") or item.get("mediaReferenceId") or f"{_entity_id(record)}:{index}")
        result.append((media, item))
        graph.add((subject, MEDIA.hasRepresentation, media))
        graph.add((media, RDF.type, MEDIA.DigitalRepresentation))
        graph.add((media, MEDIA.representationOf, subject))
        _label(graph, media, item.get("title") or item.get("filename") or f"{item.get('kind') or 'Media'} reference")
        _literal(graph, media, DCTERMS.type, item.get("kind"))
        _literal(graph, media, DCTERMS.rights, item.get("copyrightNotice"))
        _literal(graph, media, DCTERMS.provenance, item.get("sourceCredit"))
        status = item.get("status")
        if status:
            status_concept = _node(policy, "media-status", status)
            graph.add((status_concept, RDF.type, SKOS.Concept))
            _literal(graph, status_concept, SKOS.notation, status)
            _label(graph, status_concept, str(status).replace("_", " ").title())
            graph.add((media, MEDIA.representationStatus, status_concept))
        link = _external(item.get("url"))
        if link:
            _literal(graph, media, MEDIA.contentUrl, str(link), XSD.anyURI)
            graph.add((media, SCHEMA.contentUrl, link))
        if item.get("sourceRecordId"):
            source = {"id": item["sourceRecordId"], "source": item.get("source"), "url": item.get("sourceUrl")}
            graph.add((media, DCTERMS.source, _add_source(graph, policy, source)))
    return result


def _add_organ(graph: Graph, subject: URIRef, record: Mapping[str, Any], policy: UriContext) -> None:
    coordinates = _map(record.get("coordinates"))
    place_id = record.get("placeMdvsId")
    place_label = record.get("location") or record.get("placeLabel")
    if place_id or record.get("placeUrl") or place_label:
        try:
            place = URIRef(policy.identity_uri(str(place_id))) if place_id else _node(policy, "place", place_label)
        except ValueError:
            place = _node(policy, "place", place_id or place_label)
        graph.add((subject, CORE.locatedAt, place))
        graph.add((place, RDF.type, CORE.Place))
        _label(graph, place, place_label or place_id)
        _literal(graph, place, SCHEMA.latitude, coordinates.get("lat"), XSD.double)
        _literal(graph, place, SCHEMA.longitude, coordinates.get("lon"), XSD.double)
    builders: list[Mapping[str, Any]] = []
    if record.get("builder"):
        builders.append({"label": record.get("builder"), "mdvsId": record.get("builderMdvsId"), "pageUrl": record.get("builderUrl")})
    for item in _items(record.get("relatedEntities") or record.get("related")):
        if isinstance(item, Mapping):
            relation = " ".join(str(item.get(key) or "") for key in ("kind", "relationship", "relationType")).casefold()
            if any(word in relation for word in ("builder", "maker", "construction")):
                builders.append(item)
    seen: set[str] = set()
    for index, item in enumerate(builders):
        actor = _actor_uri(item, policy, f"builder:{index}")
        if str(actor) in seen:
            continue
        seen.add(str(actor))
        graph.add((subject, INST.hasBuilder, actor))
        graph.add((actor, RDF.type, CORE.Organization if "/organizations/" in str(item.get("pageUrl") or item.get("entityPageUrl") or "") else CORE.Agent))
        _label(graph, actor, item.get("label") or item.get("name"))
    source_index = _sources(record)
    for item in _items(record.get("builderAssertions")):
        if not isinstance(item, Mapping):
            continue
        assertion_id = item.get("id") or item.get("assertionId")
        assertion = _node(policy, "assertion", f"builder:{assertion_id}")
        _literal(graph, assertion, CORE.resolutionState, item.get("resolutionState"))
        _literal(graph, assertion, DCTERMS.type, item.get("relationRole"))
        if item.get("identityEvidence"):
            _literal(graph, assertion, PROV.value, json.dumps(item["identityEvidence"],ensure_ascii=False,sort_keys=True))
        actor = _actor_uri(item, policy, f"builder-assertion:{assertion_id}")
        graph.add((assertion, RDF.type, ASSERTION.Assertion))
        graph.add((assertion, ASSERTION.assertsSubject, subject))
        graph.add((assertion, ASSERTION.assertsPredicate, INST.hasBuilder))
        graph.add((assertion, ASSERTION.assertsObject, actor))
        graph.add((actor, RDF.type, CORE.Agent))
        _label(graph, actor, item.get("label") or item.get("sourceWording"))
        _literal(graph, assertion, ASSERTION.normalizedValue, item.get("label"))
        source_id = str(item.get("sourceRecordId") or "")
        _add_evidence(
            graph,
            policy,
            assertion,
            source_index.get(source_id),
            item.get("sourcePath") or "builders",
            item.get("sourceWording") or item.get("label"),
        )
    for item in _items(record.get("placeAssertions")):
        if not isinstance(item, Mapping):
            continue
        assertion_id = item.get("id") or item.get("assertionId")
        place_id = item.get("mdvsId") or item.get("placeMdvsId")
        try:
            asserted_place = URIRef(policy.identity_uri(str(place_id))) if place_id else _node(
                policy, "place-assertion", assertion_id
            )
        except ValueError:
            asserted_place = _node(policy, "place-assertion", place_id or assertion_id)
        graph.add((asserted_place, RDF.type, CORE.Place))
        _label(graph, asserted_place, item.get("label") or item.get("preferredLabel"))
        graph.add((subject, CORE.locatedAt, asserted_place))
        assertion = _node(policy, "assertion", f"place:{assertion_id}")
        graph.add((assertion, RDF.type, ASSERTION.Assertion))
        graph.add((assertion, ASSERTION.assertsSubject, subject))
        graph.add((assertion, ASSERTION.assertsPredicate, CORE.locatedAt))
        graph.add((assertion, ASSERTION.assertsObject, asserted_place))
        _literal(graph, assertion, DCTERMS.type, item.get("temporalScope") or item.get("relationRole"))
        source_id = str(item.get("sourceRecordId") or "")
        _add_evidence(
            graph,
            policy,
            assertion,
            source_index.get(source_id),
            item.get("sourcePath") or "locations",
            item.get("label") or item.get("preferredLabel"),
        )
    for item in _items(record.get("coordinateAssertions")):
        if not isinstance(item, Mapping):
            continue
        assertion_id = item.get("id") or item.get("sourceOrganMdvsId")
        assertion = _node(policy, "coordinate-assertion", assertion_id)
        graph.add((assertion, RDF.type, ASSERTION.Assertion))
        graph.add((assertion, ASSERTION.assertsSubject, subject))
        graph.add((assertion, ASSERTION.assertsPredicate, SCHEMA.geo))
        _literal(graph, assertion, SCHEMA.latitude, item.get("latitude"), XSD.double)
        _literal(graph, assertion, SCHEMA.longitude, item.get("longitude"), XSD.double)
        _literal(graph, assertion, CORE.coordinatePrecision, item.get("precision"))
        _coordinate_evidence(graph, assertion, item.get("evidence"))
        _literal(graph, assertion, DCTERMS.type, item.get("coordinateState"))
        _literal(graph, assertion, DCTERMS.provenance, item.get("source"))
    _add_specifications(graph, policy, subject, record)
    _add_events(graph, policy, subject, record)
    _add_media(graph, policy, subject, record)
    for item in _items(_map(record.get("virtualInstruments")).get("items")):
        if isinstance(item, Mapping) and item.get("id"):
            virtual = _identity_uri(item.get("id"), policy, item.get("canonicalUri")) or _node(
                policy, "virtual-instrument", item["id"]
            )
            graph.add((virtual, VMI.realizesInstrument, subject))
            graph.add((virtual, RDF.type, VMI.VirtualMusicalInstrument))
            _label(graph, virtual, item.get("title"))


def _add_actor(graph: Graph, subject: URIRef, record: Mapping[str, Any], policy: UriContext) -> None:
    profile = _map(record.get("profile"))
    for index, item in enumerate(_items(profile.get("names"))):
        if not isinstance(item, Mapping):
            continue
        name_id = item.get("mdvsId") or item.get("id") or f"{_entity_id(record)}:{index}"
        try:
            name = URIRef(policy.identity_uri(str(name_id)))
        except ValueError:
            name = _node(policy, "name", name_id)
        graph.add((subject, CORE.hasName, name))
        graph.add((name, RDF.type, CORE.Name))
        _literal(graph, name, CORE.nameValue, item.get("value") or item.get("displayName"))
        _label(graph, name, item.get("value") or item.get("displayName"))
        _literal(graph, name, SCHEMA.givenName, item.get("givenName"))
        _literal(graph, name, SCHEMA.additionalName, item.get("middleNames"))
        _literal(graph, name, SCHEMA.familyName, item.get("familyName"))
        _literal(graph, name, SCHEMA.honorificPrefix, item.get("prefix"))
        _literal(graph, name, SCHEMA.honorificSuffix, item.get("suffix"))
        _literal(graph, name, SCHEMA.alternateName, item.get("abbreviation"))
        _literal(graph, name, CORE.romanization, item.get("romanization"))
        _literal(graph, name, CORE.transliteration, item.get("transliteration"))
        _literal(graph, name, CORE.nameParticle, item.get("particle"))
        _literal(graph, name, CORE.isNativeName, item.get("isNative"), XSD.boolean)
        _literal(graph, name, CORE.verificationScore, item.get("verificationScore"), XSD.double)
    for index, item in enumerate(_items(profile.get("dates"))):
        if isinstance(item, Mapping):
            span = _node(policy, "time-span", item.get("id") or f"{_entity_id(record)}:{index}")
            graph.add((span, RDF.type, CORE.TimeSpan))
            graph.add((subject, CORE.validDuring, span))
            _literal(graph, span, CORE.startDate, item.get("start") or item.get("startYear"))
            _literal(graph, span, CORE.endDate, item.get("end") or item.get("endYear"))
            _literal(graph, span, CORE.rawTemporalExpression, item.get("display"))
            _literal(graph, span, DCTERMS.type, item.get("kind"))
            _literal(graph, span, SKOS.prefLabel, item.get("label"))
    for relation in _items(record.get("relationships")):
        if isinstance(relation, Mapping) and relation.get("mdvsId"):
            try:
                related = URIRef(policy.identity_uri(str(relation["mdvsId"])))
            except ValueError:
                related = _node(policy, "related-entity", relation["mdvsId"])
            graph.add((related, RDF.type, ORGAN.PipeOrgan))
            graph.add((related, INST.hasBuilder, subject))
            _label(graph, related, relation.get("label") or relation.get("relatedLabel"))
    for alias in _items(record.get("identityAliases")):
        if not isinstance(alias, Mapping):
            continue
        alias_uri = _identity_uri(alias.get("mdvsId"), policy, alias.get("aliasUri"))
        if not alias_uri:
            continue
        graph.add((alias_uri, OWL.sameAs, subject))
        _label(graph, alias_uri, alias.get("label"))
        _literal(graph, alias_uri, DCTERMS.identifier, alias.get("mdvsId"))
        _literal(graph, alias_uri, PROV.value, alias.get("evidenceSha256"))
        _literal(graph, alias_uri, DCTERMS.provenance, alias.get("projectionId"))
    for suppression in _items(record.get("identitySuppressions")):
        if not isinstance(suppression, Mapping):
            continue
        source_uri = _identity_uri(suppression.get("mdvsId"), policy)
        if not source_uri:
            continue
        graph.add((source_uri, OWL.sameAs, subject))
        _literal(graph, source_uri, CORE.resolutionState, suppression.get("outcome"))
        _literal(graph, source_uri, DCTERMS.provenance, suppression.get("projectionId"))
        _literal(graph, source_uri, PROV.value, suppression.get("evidenceSha256"))
    source_index = _sources(record)
    for item in _items(record.get("builderAssertions")):
        if not isinstance(item, Mapping):
            continue
        assertion_id = item.get("id") or item.get("assertionId")
        assertion = _node(policy, "assertion", f"actor:{assertion_id}")
        if item.get("identityEvidence"):
            _literal(graph, assertion, PROV.value, json.dumps(item["identityEvidence"],ensure_ascii=False,sort_keys=True))
        organ = _identity_uri(item.get("organMdvsId"), policy)
        graph.add((assertion, RDF.type, ASSERTION.Assertion))
        graph.add((assertion, ASSERTION.assertsSubject, organ or subject))
        graph.add((assertion, ASSERTION.assertsPredicate, INST.hasBuilder))
        graph.add((assertion, ASSERTION.assertsObject, subject))
        _literal(graph, assertion, ASSERTION.rawValue, item.get("sourceLabel"))
        _literal(graph, assertion, ASSERTION.normalizedValue, item.get("preferredLabel"))
        _literal(graph, assertion, DCTERMS.type, item.get("relationRole"))
        _literal(graph, assertion, CORE.resolutionState, item.get("resolutionState"))
        if organ:
            graph.add((organ, INST.hasBuilder, subject))
            _label(graph, organ, item.get("organLabel"))
        source_id = str(item.get("sourceRecordId") or "")
        _add_evidence(
            graph, policy, assertion, source_index.get(source_id),
            item.get("sourcePath") or "builders", item.get("sourceLabel"),
        )
    for item in _items(record.get("organRelations")):
        if not isinstance(item, Mapping):
            continue
        organ = _identity_uri(item.get("organMdvsId"), policy)
        if not organ:
            continue
        relation = _node(policy, "actor-organ-relation", item.get("id") or _digest(item, policy))
        graph.add((relation, RDF.type, CORE.Relationship))
        graph.add((relation, CORE.relatedEntity, organ))
        graph.add((relation, CORE.relatedAgent, subject))
        graph.add((organ, INST.hasBuilder, subject))
        _literal(graph, relation, CORE.confidence, item.get("confidence"), XSD.double)
        source_id = str(item.get("sourceRecordId") or "")
        if source_id and source_id in source_index:
            graph.add((relation, DCTERMS.source, _add_source(graph, policy, source_index[source_id])))
    for item in _items(record.get("musiXploraRelations")):
        if not isinstance(item, Mapping):
            continue
        source_actor = _identity_uri(item.get("sourceActorMdvsId"), policy) or _node(
            policy, "musixplora-actor", item.get("sourceMxpId")
        )
        target_actor = _identity_uri(item.get("targetActorMdvsId"), policy) or _node(
            policy, "musixplora-actor", item.get("targetMxpId")
        )
        relation = _node(policy, "musixplora-relation", item.get("id") or _digest(item, policy))
        graph.add((relation, RDF.type, RDF.Statement))
        graph.add((relation, RDF.subject, source_actor))
        graph.add((relation, RDF.predicate, DCTERMS.relation))
        graph.add((relation, RDF.object, target_actor))
        graph.add((source_actor, DCTERMS.relation, target_actor))
        for actor, identifier in (
            (source_actor, item.get("sourceMxpId")),
            (target_actor, item.get("targetMxpId")),
        ):
            if str(actor).startswith((f"{policy.dataset_version_uri}/musixplora-actor/",
                                      f"{policy.dataset_version_uri}/resource/musixplora-actor/")):
                graph.add((actor, RDF.type, CORE.Agent))
                _literal(graph, actor, DCTERMS.identifier, identifier)
                _label(graph, actor, identifier)
        _literal(graph, relation, DCTERMS.type, item.get("canonicalRelationType"))
        _literal(graph, relation, SKOS.prefLabel, item.get("roleLabel"))
        _literal(graph, relation, CORE.generation, item.get("generation"), XSD.integer)
        _literal(graph, relation, CORE.generationLabel, item.get("generationLabel"))
        _literal(graph, relation, CORE.relationCategory, item.get("relationCategory"))
        _literal(graph, relation, CORE.decisionState, item.get("decisionState"))
        _literal(graph, relation, PROV.value, item.get("evidenceSha256"))
    for mention in _items(record.get("sourceMentions")):
        if isinstance(mention, Mapping):
            source = {"id": mention.get("sourceRecordId") or mention.get("id"), "source": mention.get("sourceFamily"), "url": mention.get("sourceUrl")}
            if source["id"]:
                graph.add((subject, DCTERMS.source, _add_source(graph, policy, source)))


def _coordinate_evidence(graph, subject, evidence):
    if not isinstance(evidence, Mapping):
        return
    # Prior coordinates remain evidence, never active geometry triples.
    _literal(graph, subject, DCTERMS.provenance, json.dumps(evidence, ensure_ascii=False, sort_keys=True))
    _literal(graph, subject, CORE.coordinatePrecision, evidence.get("precision"))
    _literal(graph, subject, CORE.coordinateSource, evidence.get("source"))
    _literal(graph, subject, CORE.coordinateSemantics, evidence.get("method"))
    for observation in evidence.get("observations", []):
        link = _external(observation.get("url"))
        if link:
            graph.add((subject, DCTERMS.source, link))


def _coordinate_profile_evidence(graph, subject, record, policy):
    _coordinate_evidence(graph, subject, record.get("coordinateEvidence"))
    for item in _items(record.get("administrativeNodes")):
        if isinstance(item, Mapping) and item.get("nodeId"):
            admin = _node(policy, "administrative-place", item["nodeId"])
            _literal(graph, admin, DCTERMS.identifier, item.get("providerIdentifier"))
            if _external(item.get("sourceUrl")):
                graph.add((admin, DCTERMS.source, _external(item["sourceUrl"])))
    for item in _items(record.get("coordinateAssertions")):
        if isinstance(item, Mapping) and item.get("evidence"):
            assertion = _node(policy, "coordinate-assertion", item.get("id"))
            graph.add((subject, DCTERMS.provenance, assertion))
            _coordinate_evidence(graph, assertion, item["evidence"])


def _add_place(graph: Graph, subject: URIRef, record: Mapping[str, Any], policy: UriContext) -> None:
    _coordinate_evidence(graph, subject, record.get("coordinateEvidence"))
    coordinate = _map(record.get("coordinate"))
    _literal(graph, subject, SCHEMA.latitude, coordinate.get("latitude"), XSD.double)
    _literal(graph, subject, SCHEMA.longitude, coordinate.get("longitude"), XSD.double)
    _literal(graph, subject, WGS84.lat, coordinate.get("latitude"), XSD.double)
    _literal(graph, subject, WGS84.long, coordinate.get("longitude"), XSD.double)
    _literal(graph, subject, CORE.coordinatePrecision, coordinate.get("precision"))
    _literal(graph, subject, CORE.coordinateSource, coordinate.get("source"))
    _literal(graph, subject, CORE.coordinateConfidence, coordinate.get("confidence"), XSD.double)
    _literal(graph, subject, DCTERMS.type, record.get("placeType") or record.get("kind"))
    _literal(graph, subject, CORE.enrichmentOutcome, record.get("enrichmentOutcome"))
    for variant in _items(record.get("nameVariants")):
        if not isinstance(variant, Mapping):
            _literal(graph, subject, SKOS.altLabel, variant)
            continue
        value = variant.get("name") or variant.get("label") or variant.get("value")
        _literal(graph, subject, SKOS.altLabel, value)
        name = _node(policy, "place-name", variant.get("nameSha256") or _digest(variant, policy))
        graph.add((subject, CORE.hasName, name))
        graph.add((name, RDF.type, CORE.Name))
        _literal(graph, name, CORE.nameValue, value)
        _literal(graph, name, DCTERMS.type, variant.get("nameKind"))
        _literal(graph, name, DCTERMS.language, variant.get("language"))
        _literal(graph, name, DCTERMS.provenance, variant.get("evidenceLayer"))
        _literal(graph, name, PROV.value, variant.get("evidenceSha256"))
    for item in _items(record.get("providerReferences")):
        if not isinstance(item, Mapping):
            continue
        binding = _node(policy, "place-provider-binding", item.get("bindingSha256") or _digest(item, policy))
        graph.add((binding, RDF.type, EVIDENCE.EvidenceRelation))
        graph.add((binding, EVIDENCE.evaluates, subject))
        _literal(graph, binding, DCTERMS.identifier, item.get("providerPlaceId") or item.get("identifier"))
        _literal(graph, binding, DCTERMS.publisher, item.get("provider"))
        _literal(graph, binding, DCTERMS.hasVersion, item.get("providerRelease"))
        _literal(graph, binding, DCTERMS.type, item.get("evidenceKind") or item.get("matchKind"))
        _literal(graph, binding, PROV.value, item.get("providerDatasetSha256"))
        link = _external(item.get("externalUrl"))
        if link:
            graph.add((subject, DCTERMS.relation, link))
            graph.add((binding, SCHEMA.url, link))
    for evidence_layer, values in (
        ("source", record.get("sourceHierarchy")),
        ("provider", record.get("providerHierarchy")),
    ):
        for item in _items(values):
            if not isinstance(item, Mapping):
                continue
            assertion = _node(
                policy, "place-hierarchy-assertion",
                item.get("assertionSha256") or _digest(item, policy),
            )
            graph.add((assertion, RDF.type, ASSERTION.Assertion))
            graph.add((assertion, ASSERTION.assertsSubject, subject))
            graph.add((assertion, ASSERTION.assertsPredicate, DCTERMS.isPartOf))
            _literal(graph, assertion, ASSERTION.assertsLiteral, item.get("value"))
            _literal(graph, assertion, DCTERMS.type, item.get("role"))
            _literal(graph, assertion, CORE.componentClass, item.get("componentClass"))
            _literal(graph, assertion, DCTERMS.language, item.get("language"))
            _literal(graph, assertion, DCTERMS.provenance, item.get("evidenceLayer") or evidence_layer)
            _literal(graph, assertion, PROV.value, item.get("evidenceSha256"))
            _literal(graph, assertion, EVIDENCE.selectorValue, item.get("sourceRef"))
    for index, item in enumerate(_items(record.get("administrativeNodes"))):
        if isinstance(item, Mapping):
            admin = _node(policy, "administrative-place", item.get("nodeId") or item.get("id") or item.get("providerId") or f"{_entity_id(record)}:{index}")
            graph.add((admin, RDF.type, CORE.Place))
            _label(graph, admin, item.get("preferredName") or item.get("name") or item.get("label") or item.get("value"))
            graph.add((subject, DCTERMS.isPartOf, admin))
            _literal(graph, admin, DCTERMS.type, item.get("role"))
            _literal(graph, admin, DCTERMS.identifier, item.get("providerIdentifier"))
            if _external(item.get("sourceUrl")):
                graph.add((admin, DCTERMS.source, _external(item["sourceUrl"])))
            _literal(graph, admin, DCTERMS.publisher, item.get("provider"))
            _literal(graph, admin, DCTERMS.hasVersion, item.get("providerRelease"))
            _literal(graph, admin, WGS84.lat, item.get("latitude"), XSD.double)
            _literal(graph, admin, WGS84.long, item.get("longitude"), XSD.double)
            _literal(graph, admin, CORE.coordinateSemantics, item.get("coordinateSemantics"))
            _literal(graph, admin, PROV.value, item.get("nodeSha256"))
            _structured_properties(
                graph, policy, admin, item.get("hierarchy"),
                category="administrative-hierarchy-property",
            )
    for item in _items(record.get("containmentRelations")):
        if not isinstance(item, Mapping):
            continue
        relation = _node(policy, "place-containment", item.get("relationSha256") or _digest(item, policy))
        child_ref = str(item.get("childRef") or "")
        child = (
            _node(policy, "administrative-place", child_ref)
            if child_ref.startswith("locadmin:") else subject
        )
        parent = _node(policy, "administrative-place", item.get("parentNodeId"))
        graph.add((relation, RDF.type, CORE.PlaceContainmentRelation))
        graph.add((relation, CORE.containedPlace, child))
        graph.add((relation, CORE.containingPlace, parent))
        graph.add((child, DCTERMS.isPartOf, parent))
        _literal(graph, relation, DCTERMS.type, item.get("relationKind"))
        _literal(graph, relation, CORE.placeRole, item.get("role"))
        _literal(graph, relation, CORE.sameAsPriorLevel, item.get("sameAsPriorLevel"), XSD.boolean)
        _literal(graph, relation, PROV.value, item.get("evidenceSha256"))
    source_index = _sources(record)
    for item in _items(record.get("placeAssertions")):
        if not isinstance(item, Mapping):
            continue
        assertion = _node(policy, "assertion", f"place:{item.get('id') or _digest(item, policy)}")
        graph.add((assertion, RDF.type, ASSERTION.Assertion))
        graph.add((assertion, ASSERTION.assertsPredicate, CORE.locatedAt))
        organ = _identity_uri(item.get("organMdvsId"), policy)
        activity = _identity_uri(item.get("activityMdvsId"), policy) or (
            _node(policy, "event", item.get("activityMdvsId"))
            if item.get("activityMdvsId") else None
        )
        if activity and item.get("activityMdvsId"):
            graph.add((activity, RDF.type, PROV.Activity))
            _literal(graph, activity, DCTERMS.identifier, item.get("activityMdvsId"))
        graph.add((assertion, ASSERTION.assertsSubject, organ or activity or subject))
        graph.add((assertion, ASSERTION.assertsObject, subject))
        _literal(graph, assertion, ASSERTION.rawValue, item.get("preferredLabel"))
        _literal(graph, assertion, DCTERMS.type, item.get("relationRole"))
        _literal(graph, assertion, CORE.temporalScope, item.get("temporalScope"))
        _literal(graph, assertion, CORE.coordinateState, item.get("coordinateState"))
        _literal(graph, assertion, CORE.routeKind, item.get("routeKind"))
        _literal(graph, assertion, CORE.canonicalStatus, item.get("canonicalStatus"))
        source_place = _identity_uri(item.get("sourceLocationMdvsId"), policy)
        canonical_place = _identity_uri(item.get("canonicalTargetMdvsId"), policy)
        if source_place:
            graph.add((source_place, RDF.type, CORE.Place))
        if canonical_place:
            graph.add((canonical_place, RDF.type, CORE.Place))
        if source_place and canonical_place and source_place != canonical_place:
            graph.add((source_place, SKOS.exactMatch, canonical_place))
            route = _node(policy, "place-route", item.get("routeId") or item.get("id"))
            graph.add((route, RDF.type, CORE.PlaceResolution))
            graph.add((route, CORE.sourcePlace, source_place))
            graph.add((route, CORE.canonicalPlace, canonical_place))
            _literal(graph, route, CORE.resolutionState, item.get("canonicalStatus"))
            _literal(graph, route, DCTERMS.type, item.get("routeKind"))
        if organ:
            graph.add((organ, CORE.locatedAt, subject))
            _label(graph, organ, item.get("organLabel"))
        source_id = str(item.get("sourceRecordId") or "")
        _add_evidence(
            graph, policy, assertion, source_index.get(source_id),
            item.get("sourcePath") or "locations", item.get("preferredLabel"),
        )


def _add_name(graph: Graph, subject: URIRef, record: Mapping[str, Any], policy: UriContext) -> None:
    forms = _map(record.get("forms"))
    _literal(graph, subject, CORE.nameValue, _first(forms, "display", "canonical") or _first(record, "title"))
    _literal(graph, subject, SCHEMA.alternateName, forms.get("abbreviation"))
    _literal(graph, subject, CORE.romanization, forms.get("romanization"))
    _literal(graph, subject, CORE.transliteration, forms.get("transliteration"))
    components = _map(record.get("nameComponents"))
    _literal(graph, subject, SCHEMA.givenName, components.get("givenName"))
    _literal(graph, subject, SCHEMA.additionalName, components.get("middleNames"))
    _literal(graph, subject, SCHEMA.familyName, components.get("familyName"))
    _literal(graph, subject, CORE.nameParticle, components.get("particle"))
    _literal(graph, subject, SCHEMA.honorificPrefix, components.get("prefix"))
    _literal(graph, subject, SCHEMA.honorificSuffix, components.get("suffix"))
    _literal(graph, subject, CORE.isNativeName, record.get("isNative"), XSD.boolean)
    _literal(graph, subject, CORE.verificationScore, record.get("verificationScore"), XSD.double)
    _literal(graph, subject, PROV.value, record.get("rowHash"))
    for item in _items(record.get("relatedEntities")):
        if not isinstance(item, Mapping):
            continue
        actor = _identity_uri(item.get("mdvsId"), policy, item.get("canonicalUri"))
        if actor:
            graph.add((actor, CORE.hasName, subject))
            graph.add((actor, RDF.type, _class(str(item.get("kind") or "person"))))
            _label(graph, actor, item.get("label"))


def _add_virtual_instrument(
    graph: Graph, subject: URIRef, record: Mapping[str, Any], policy: UriContext,
) -> None:
    canonical = _map(record.get("canonical"))
    kind = _map(record.get("kind"))
    availability = _map(record.get("availability"))
    platforms = _map(record.get("platforms"))
    physical = _map(record.get("physicalInstrument"))
    technical = _map(record.get("technical"))
    evidence = _map(record.get("evidence"))
    _literal(graph, subject, DCTERMS.type, kind.get("catalogEntityType"))
    _literal(graph, subject, VMI.recordingBasis, kind.get("recordingBasis"))
    _literal(graph, subject, VMI.granularity, kind.get("granularity"))
    _literal(graph, subject, VMI.distributionUnit, kind.get("distributionUnit"))
    _literal(graph, subject, VMI.independentlyDistributed, kind.get("independentlyDistributed"))
    _literal(graph, subject, VMI.componentOrVariantType, kind.get("componentOrVariantType"))
    _literal(graph, subject, VMI.firstObservedAt, _date_time(record.get("firstObservedAt")), XSD.dateTime)
    _literal(graph, subject, VMI.lastObservedAt, _date_time(record.get("lastObservedAt")), XSD.dateTime)
    _literal(graph, subject, CORE.confidence, record.get("relationConfidence"), XSD.double)
    _literal(graph, subject, DCTERMS.description, record.get("notes"))
    _literal(graph, subject, PROV.value, record.get("rowHash"))
    for scheme, key in (
        ("catalog", "externalIdentifier"),
        ("core entity", "coreEntityMdvsId"),
        ("package", "packageMdvsId"),
        ("package core entity", "packageCoreEntityMdvsId"),
        ("version", "versionMdvsId"),
        ("version core entity", "versionCoreEntityMdvsId"),
    ):
        value = canonical.get(key)
        if not value:
            continue
        identifier = _node(policy, "identifier", f"{_entity_id(record)}:{key}:{value}")
        graph.add((subject, CORE.hasIdentifier, identifier))
        graph.add((identifier, RDF.type, CORE.Identifier))
        _literal(graph, identifier, DCTERMS.type, scheme)
        _literal(graph, identifier, CORE.identifierValue, value)
        _label(graph, identifier, value)
    _literal(graph, subject, VMI.packageFormat, canonical.get("packageFormatCode"))
    _literal(graph, subject, VMI.packageType, canonical.get("packageTypeCode"))
    availability_node = _node(policy, "virtual-instrument-availability", _entity_id(record))
    graph.add((subject, VMI.hasAvailability, availability_node))
    graph.add((availability_node, RDF.type, VMI.Availability))
    for predicate, key in (
        (VMI.accessCategory, "accessCategory"),
        (VMI.accessModel, "accessModel"),
        (VMI.catalogStatus, "catalogStatus"),
        (VMI.licenseCategory, "licenseCategory"),
        (DCTERMS.license, "licenseClass"),
        (SCHEMA.price, "listedPrice"),
        (SCHEMA.priceCurrency, "currency"),
    ):
        _literal(graph, availability_node, predicate, availability.get(key))
    for index, platform_name in enumerate(_items(platforms.get("all"))):
        platform = _node(policy, "virtual-instrument-platform", platform_name)
        graph.add((subject, VMI.supportsPlatform, platform))
        graph.add((platform, RDF.type, VMI.SoftwarePlatform))
        _label(graph, platform, platform_name)
        if platform_name == platforms.get("native"):
            graph.add((subject, VMI.nativePlatform, platform))
    producer_name = record.get("producer")
    if producer_name:
        producer = _node(policy, "virtual-instrument-producer", producer_name)
        graph.add((producer, RDF.type, CORE.Organization))
        _label(graph, producer, producer_name)
        graph.add((subject, DCTERMS.creator, producer))
    represented = _node(policy, "represented-instrument", _entity_id(record))
    if any(value not in (None, "", [], {}) for value in physical.values()):
        graph.add((represented, RDF.type, ORGAN.PipeOrgan))
        graph.add((subject, VMI.representsInstrument, represented))
        _label(graph, represented, physical.get("name") or record.get("sampledInstrumentName"))
        _literal(graph, represented, INST.builderWording, physical.get("builder"))
        _literal(graph, represented, DCTERMS.created, physical.get("constructionYear"))
        _literal(graph, represented, ORGAN.manualCount, physical.get("manuals"))
        _literal(graph, represented, ORGAN.hasPedal, physical.get("pedal"))
        _literal(graph, represented, ORGAN.stopOrRankCount, physical.get("stopsOrRanks"))
        _literal(graph, represented, DCTERMS.type, physical.get("style"))
        location = _map(physical.get("location"))
        if location:
            location_node = _node(policy, "represented-instrument-place", _entity_id(record))
            graph.add((represented, CORE.locatedAt, location_node))
            graph.add((location_node, RDF.type, CORE.Place))
            _label(graph, location_node, location.get("originalText") or location.get("venue"))
            for predicate, key in (
                (SCHEMA.name, "venue"), (SCHEMA.addressLocality, "locality"),
                (SCHEMA.addressRegion, "admin1"), (SCHEMA.addressCountry, "country"),
                (SCHEMA.addressCountry, "countryCode"), (DCTERMS.type, "type"),
                (CORE.coordinatePrecision, "precision"), (DCTERMS.provenance, "basis"),
            ):
                _literal(graph, location_node, predicate, location.get(key))
    for relation_item in _items(_map(record.get("relationships")).get("canonicalOrganRelations")):
        if not isinstance(relation_item, Mapping):
            continue
        relation = _node(policy, "virtual-instrument-relation", relation_item.get("id") or relation_item.get("rowSha256") or _digest(relation_item, policy))
        graph.add((relation, RDF.type, VMI.InstrumentRelation))
        graph.add((relation, VMI.virtualInstrument, subject))
        target = _identity_uri(relation_item.get("targetOrganMdvsId"), policy)
        if target:
            graph.add((relation, VMI.realInstrument, target))
            graph.add((subject, VMI.realizesInstrument, target))
            graph.add((target, RDF.type, ORGAN.PipeOrgan))
            _label(graph, target, relation_item.get("targetOrganTitle"))
        else:
            graph.add((relation, VMI.realInstrument, represented))
        _literal(graph, relation, DCTERMS.type, relation_item.get("relationTypeCode") or relation_item.get("relationTypeId"))
        _literal(graph, relation, SKOS.prefLabel, relation_item.get("relationTypeName"))
        _literal(graph, relation, ASSERTION.rawValue, relation_item.get("representedOrganLabel"))
        _literal(graph, relation, CORE.confidence, relation_item.get("confidence"), XSD.double)
        _literal(graph, relation, CORE.resolutionState, relation_item.get("resolutionState"))
        _literal(graph, relation, PROV.value, relation_item.get("rowSha256"))
    for link_value in _items(evidence.get("sourceUrls")) or [evidence.get("sourceUrl")]:
        link = _external(link_value)
        if link:
            graph.add((subject, DCTERMS.source, link))
            graph.add((subject, SCHEMA.url, link))
    _literal(graph, subject, DCTERMS.provenance, evidence.get("sourceKey"))
    _literal(graph, subject, DCTERMS.date, evidence.get("researchDate"))
    _literal(graph, subject, EVIDENCE.evidenceHash, evidence.get("rowSha256"))
    for key, value in technical.items():
        if value not in (None, "", [], {}):
            _literal(graph, subject, URIRef(str(VMI) + key), value)
    _structured_properties(
        graph, policy, subject, record.get("sourcePayload"),
        category="virtual-instrument-source-property",
    )


def native_graph(kind: str, record: Mapping[str, Any], policy: UriContext) -> Graph:
    policy = _resource_factory(kind, record, policy)
    graph = Graph()
    _bind(graph)
    subject = _entity_uri(record, policy)
    graph.add((subject, RDF.type, _class(kind)))
    _label(graph, subject, _first(record, "title", "label") or _entity_id(record))
    _literal(graph, subject, CORE.mdvsIdentifier, _entity_id(record))
    graph.add((subject, DCTERMS.isPartOf, URIRef(policy.dataset_version_uri)))
    graph.add((subject, SCHEMA.url, _human_url(kind, record, policy)))
    _add_identifiers(graph, subject, record, policy)
    for source in _sources(record).values():
        graph.add((subject, DCTERMS.source, _add_source(graph, policy, source)))
    if kind == "organ":
        _add_organ(graph, subject, record, policy)
    elif kind in {"person", "organization"}:
        _add_actor(graph, subject, record, policy)
    elif kind == "place":
        _add_place(graph, subject, record, policy)
    elif kind == "virtual_instrument":
        _add_virtual_instrument(graph, subject, record, policy)
    elif kind == "name":
        _add_name(graph, subject, record, policy)
    for index, value in enumerate(_items(record.get("labelInterpretations"))):
        node = legacy_evidence_resource_uri(policy, "labelinterpretation" + hashlib.sha256(f"{_entity_id(record)}:{index}".encode()).hexdigest())
        graph.add((subject, PROV.wasDerivedFrom, node))
        graph.add((node, RDF.type, PROV.Entity))
        graph.add((node, PROV.value, Literal(json.dumps(value, ensure_ascii=False, sort_keys=True))))
        _literal(graph, node, DCTERMS.source, value.get("sourceRecordId"))
    return graph


def _retain_quality_evidence(graph, native, subject):
    """Crosswalks retain qualification receipts, including their asserted target."""
    keys={'aggregateQualification','quantityQualification','quantityFieldEvidence','sourceFragment','sourceComponentQualification','configurationDateState'}
    identity_contracts={'modavis.contextual-actor-link/v1','modavis.source-native-actor-link/v1','modavis.source-quality-closure/v1'}
    for predicate in (PROV.value,RDF.value):
        for node,value in native.subject_objects(predicate):
            try:payload=json.loads(str(value))
            except (ValueError,TypeError):continue
            if not isinstance(payload,dict) or not (keys.intersection(payload) or payload.get('contract') in identity_contracts):continue
            graph.add((subject,PROV.wasDerivedFrom,node))
            graph.add((node,RDF.type,PROV.Entity))
            for p,o in native.predicate_objects(node):
                if p in {PROV.value,RDF.value,DCTERMS.source,DCTERMS.description,DCTERMS.type,CORE.resolutionState,ASSERTION.assertsSubject,ASSERTION.assertsPredicate,ASSERTION.assertsObject,ASSERTION.rawValue,ASSERTION.normalizedValue}:
                    graph.add((node,p,o))


def cidoc_graph(
    kind: str,
    record: Mapping[str, Any],
    policy: UriContext,
    *,
    native: Graph | None = None,
) -> Graph:
    policy = _resource_factory(kind, record, policy)
    graph = Graph()
    _bind(graph)
    subject = _entity_uri(record, policy)
    _coordinate_profile_evidence(graph, subject, record, policy)
    if kind == "organ":
        _add_technical_facts(graph, policy, subject, record)
    cls = {
        "organ": CRM["E22_Human-Made_Object"], "person": CRM["E21_Person"],
        "organization": CRM["E74_Group"], "place": CRM["E53_Place"],
    }.get(kind, CRM["E1_CRM_Entity"])
    graph.add((subject, RDF.type, cls))
    _label(graph, subject, _first(record, "title", "label") or _entity_id(record))
    identifier = _node(policy, "cidoc-identifier", _entity_id(record))
    graph.add((identifier, RDF.type, CRM["E42_Identifier"]))
    _label(graph, identifier, _entity_id(record))
    graph.add((subject, CRM["P1_is_identified_by"], identifier))
    if kind == "organ":
        place_label = record.get("location")
        if record.get("placeMdvsId") or place_label:
            place = URIRef(policy.identity_uri(str(record["placeMdvsId"]))) if record.get("placeMdvsId") else _node(policy, "place", place_label)
            graph.add((subject, CRM["P53_has_former_or_current_location"], place))
            graph.add((place, RDF.type, CRM["E53_Place"]))
            _label(graph, place, place_label)
        for item in _items(record.get("activities") or record.get("timeline")):
            if not isinstance(item, Mapping):
                continue
            event = _node(policy, "event", item.get("id"))
            event_type = str(item.get("eventType") or "").casefold()
            graph.add((event, RDF.type, CRM["E12_Production"] if "construct" in event_type or "build" in event_type else CRM["E7_Activity"]))
            graph.add((event, CRM["P12_occurred_in_the_presence_of"], subject))
            _event_interpretation_evidence(graph, policy, event, item)
            _label(graph, event, item.get("label") or item.get("title"))
            for index, participant in enumerate(_items(item.get("participants"))):
                if isinstance(participant, Mapping):
                    fallback = (
                        f"{item.get('id')}:participant:{index}"
                        if isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers
                        else f"{item.get('id')}:{index}"
                    )
                    actor = _actor_uri(participant, policy, fallback)
                    graph.add((event, CRM["P14_carried_out_by"], actor))
                    _participant_evidence(graph, policy, event, CRM["P14_carried_out_by"], actor, participant, index)
                    graph.add((actor, RDF.type, CRM["E39_Actor"]))
                    _label(graph, actor, participant.get("label") or participant.get("name"))
            when = _map(item.get("when"))
            if when:
                span = _node(policy, "cidoc-time-span", item.get("id"))
                graph.add((span, RDF.type, CRM["E52_Time-Span"]))
                graph.add((event, CRM["P4_has_time-span"], span))
                _label(graph, span, when.get("rawExpression"))
        source_graph = native if native is not None else native_graph(kind, record, policy)
        for component, component_type in source_graph.subject_objects(RDF.type):
            if str(component_type).startswith(str(ORGAN)) and component != subject:
                graph.add((component, RDF.type, CRM["E22_Human-Made_Object"]))
                graph.add((subject, CRM["P46_is_composed_of"], component))
                _label(graph, component, source_graph.value(component, RDFS.label))
        for media, item in _add_media(Graph(), policy, subject, record):
            graph.add((media, RDF.type, CRM["E36_Visual_Item"]))
            graph.add((media, CRM["P138_represents"], subject))
            _label(graph, media, item.get("title") or item.get("filename"))
            link = _external(item.get("url"))
            if link:
                graph.add((media, SCHEMA.contentUrl, link))
    elif kind in {"person", "organization"}:
        for index, item in enumerate(_items(_map(record.get("profile")).get("names"))):
            if not isinstance(item, Mapping):
                continue
            name = _identity_uri(item.get("mdvsId") or item.get("id"), policy, item.get("canonicalUri")) or _node(
                policy, "cidoc-appellation", f"{_entity_id(record)}:{index}"
            )
            graph.add((name, RDF.type, CRM["E41_Appellation"]))
            graph.add((subject, CRM["P1_is_identified_by"], name))
            _literal(graph, name, CRM["P190_has_symbolic_content"], item.get("value") or item.get("displayName"))
        for item in _items(_map(record.get("profile")).get("dates")):
            if not isinstance(item, Mapping):
                continue
            assignment = _node(policy, "cidoc-attribute-assignment", item.get("id") or _digest(item, policy))
            span = _node(policy, "cidoc-time-span", item.get("id") or _digest(item, policy))
            graph.add((assignment, RDF.type, CRM["E13_Attribute_Assignment"]))
            graph.add((assignment, CRM["P140_assigned_attribute_to"], subject))
            graph.add((assignment, CRM["P141_assigned"], span))
            graph.add((span, RDF.type, CRM["E52_Time-Span"]))
            _label(graph, span, item.get("display"))
            _literal(graph, span, CRM["P82a_begin_of_the_begin"], item.get("start") or item.get("startYear"))
            _literal(graph, span, CRM["P82b_end_of_the_end"], item.get("end") or item.get("endYear"))
        for relation_item in _items(record.get("relationships")):
            if not isinstance(relation_item, Mapping) or not relation_item.get("mdvsId"):
                continue
            target = URIRef(policy.identity_uri(str(relation_item["mdvsId"])))
            production = _node(policy, "cidoc-production", relation_item.get("id") or _digest(relation_item, policy))
            graph.add((production, RDF.type, CRM["E12_Production"]))
            graph.add((production, CRM["P14_carried_out_by"], subject))
            graph.add((target, CRM["P108i_was_produced_by"], production))
            graph.add((target, RDF.type, CRM["E22_Human-Made_Object"]))
            _label(graph, target, relation_item.get("label"))
    elif kind == "place":
        coordinate = _map(record.get("coordinate"))
        geometry = _node(policy, "cidoc-space-primitive", _entity_id(record))
        if coordinate.get("latitude") is not None and coordinate.get("longitude") is not None:
            graph.add((geometry, RDF.type, CRM["E94_Space_Primitive"]))
            graph.add((subject, CRM["P168_place_is_defined_by"], geometry))
            _literal(
                graph, geometry, GEO.asWKT,
                f"POINT({coordinate['longitude']} {coordinate['latitude']})",
                GEO.wktLiteral,
            )
        for index, item in enumerate(_items(record.get("nameVariants"))):
            if not isinstance(item, Mapping):
                continue
            name = _node(policy, "cidoc-place-appellation", item.get("nameSha256") or f"{_entity_id(record)}:{index}")
            graph.add((name, RDF.type, CRM["E41_Appellation"]))
            graph.add((subject, CRM["P1_is_identified_by"], name))
            _literal(graph, name, CRM["P190_has_symbolic_content"], item.get("name"))
        admin_by_id = {
            str(item.get("nodeId")): _node(policy, "administrative-place", item.get("nodeId"))
            for item in _items(record.get("administrativeNodes")) if isinstance(item, Mapping) and item.get("nodeId")
        }
        for item in _items(record.get("administrativeNodes")):
            if not isinstance(item, Mapping) or not item.get("nodeId"):
                continue
            admin = admin_by_id[str(item["nodeId"])]
            graph.add((admin, RDF.type, CRM["E53_Place"]))
            _label(graph, admin, item.get("preferredName"))
        for item in _items(record.get("containmentRelations")):
            if not isinstance(item, Mapping):
                continue
            child_ref = str(item.get("childRef") or "")
            child = admin_by_id.get(child_ref, subject)
            parent = admin_by_id.get(str(item.get("parentNodeId")))
            if parent:
                graph.add((child, CRM["P89_falls_within"], parent))
        for item in _items(record.get("placeAssertions")):
            if not isinstance(item, Mapping):
                continue
            organ = _identity_uri(item.get("organMdvsId"), policy)
            if organ:
                graph.add((organ, CRM["P53_has_former_or_current_location"], subject))
                graph.add((organ, RDF.type, CRM["E22_Human-Made_Object"]))
    elif kind == "name":
        graph.set((subject, RDF.type, CRM["E41_Appellation"]))
        _literal(
            graph, subject, CRM["P190_has_symbolic_content"],
            _first(_map(record.get("forms")), "display", "canonical") or _first(record, "title"),
        )
        for item in _items(record.get("relatedEntities")):
            if not isinstance(item, Mapping):
                continue
            actor = _identity_uri(item.get("mdvsId"), policy, item.get("canonicalUri"))
            if actor:
                graph.add((actor, CRM["P1_is_identified_by"], subject))
                graph.add((actor, RDF.type, CRM["E74_Group"] if item.get("kind") == "organization" else CRM["E21_Person"]))
    elif kind == "virtual_instrument":
        graph.set((subject, RDF.type, CRM["E73_Information_Object"]))
        for relation_item in _items(_map(record.get("relationships")).get("canonicalOrganRelations")):
            if not isinstance(relation_item, Mapping):
                continue
            target = _identity_uri(relation_item.get("targetOrganMdvsId"), policy)
            represented = target or _node(policy, "represented-instrument", _entity_id(record))
            graph.add((represented, RDF.type, CRM["E22_Human-Made_Object"]))
            graph.add((subject, CRM["P138_represents"], represented))
            _label(graph, represented, relation_item.get("targetOrganTitle") or relation_item.get("representedOrganLabel"))
        producer = record.get("producer")
        if producer:
            creation = _node(policy, "cidoc-creation", _entity_id(record))
            producer_node = _node(policy, "virtual-instrument-producer", producer)
            graph.add((creation, RDF.type, CRM["E65_Creation"]))
            graph.add((creation, CRM["P14_carried_out_by"], producer_node))
            graph.add((subject, CRM["P94i_was_created_by"], creation))
            graph.add((producer_node, RDF.type, CRM["E39_Actor"]))
            _label(graph, producer_node, producer)
    _retain_quality_evidence(graph, native if native is not None else native_graph(kind, record, policy), subject)
    return graph


def edm_graph(
    kind: str,
    record: Mapping[str, Any],
    policy: UriContext,
    *,
    native: Graph | None = None,
) -> Graph:
    policy = _resource_factory(kind, record, policy)
    graph = Graph()
    _bind(graph)
    subject = _entity_uri(record, policy)
    _coordinate_profile_evidence(graph, subject, record, policy)
    if kind == "organ":
        _add_technical_facts(graph, policy, subject, record)
    cls = EDM.Place if kind == "place" else EDM.Agent if kind in {"person", "organization"} else EDM.ProvidedCHO
    graph.add((subject, RDF.type, cls))
    _literal(graph, subject, DC.title, _first(record, "title", "label") or _entity_id(record))
    _literal(graph, subject, DC.identifier, _entity_id(record))
    _literal(graph, subject, DC.type, "Pipe organ" if kind == "organ" else kind.replace("_", " ").title())
    for source in _sources(record).values():
        graph.add((subject, DCTERMS.source, _add_source(graph, policy, source)))
    if kind in {"person", "organization"}:
        _retain_quality_evidence(graph, native if native is not None else native_graph(kind, record, policy), subject)
        profile = _map(record.get("profile"))
        for item in _items(profile.get("names")):
            if isinstance(item, Mapping):
                _literal(graph, subject, SKOS.altLabel, item.get("value") or item.get("displayName"))
                name = _identity_uri(item.get("mdvsId"), policy, item.get("canonicalUri"))
                if name:
                    graph.add((subject, DCTERMS.alternative, name))
                    graph.add((name, RDF.type, SKOS.Concept))
                    _literal(graph, name, SKOS.prefLabel, item.get("value") or item.get("displayName"))
        for item in _items(profile.get("dates")):
            if not isinstance(item, Mapping):
                continue
            _literal(graph, subject, EDM.begin, item.get("start") or item.get("startYear"))
            _literal(graph, subject, EDM.end, item.get("end") or item.get("endYear"))
            _literal(graph, subject, DCTERMS.temporal, item.get("display"))
        for relation in _items(record.get("relationships")):
            if not isinstance(relation, Mapping) or not relation.get("mdvsId"):
                continue
            related = URIRef(policy.identity_uri(str(relation["mdvsId"])))
            graph.add((subject, EDM.isRelatedTo, related))
            graph.add((related, RDF.type, EDM.ProvidedCHO))
            _literal(graph, related, DC.title, relation.get("label") or relation.get("relatedLabel"))
        for mention in _items(record.get("sourceMentions")):
            if not isinstance(mention, Mapping):
                continue
            source = {
                "id": mention.get("sourceRecordId") or mention.get("id"),
                "source": mention.get("sourceFamily"),
                "url": mention.get("sourceUrl"),
            }
            if source["id"]:
                graph.add((subject, DCTERMS.source, _add_source(graph, policy, source)))
        return graph
    if kind == "place":
        coordinate = _map(record.get("coordinate"))
        _literal(graph, subject, WGS84.lat, coordinate.get("latitude"))
        _literal(graph, subject, WGS84.long, coordinate.get("longitude"))
        for item in _items(record.get("nameVariants")):
            value = (_map(item).get("name") or _map(item).get("label") or _map(item).get("value")) if isinstance(item, Mapping) else item
            _literal(graph, subject, SKOS.altLabel, value)
        for item in _items(record.get("providerReferences")):
            link = _external(_map(item).get("externalUrl"))
            if link:
                graph.add((subject, EDM.isRelatedTo, link))
        admin_by_id = {
            str(item.get("nodeId")): _node(policy, "administrative-place", item.get("nodeId"))
            for item in _items(record.get("administrativeNodes")) if isinstance(item, Mapping) and item.get("nodeId")
        }
        for item in _items(record.get("administrativeNodes")):
            if not isinstance(item, Mapping) or not item.get("nodeId"):
                continue
            admin = admin_by_id[str(item["nodeId"])]
            graph.add((admin, RDF.type, EDM.Place))
            _literal(graph, admin, SKOS.prefLabel, item.get("preferredName"))
        for item in _items(record.get("containmentRelations")):
            if not isinstance(item, Mapping):
                continue
            child = admin_by_id.get(str(item.get("childRef")), subject)
            parent = admin_by_id.get(str(item.get("parentNodeId")))
            if parent:
                graph.add((child, DCTERMS.isPartOf, parent))
        for item in _items(record.get("placeAssertions")):
            if not isinstance(item, Mapping):
                continue
            organ = _identity_uri(item.get("organMdvsId"), policy)
            if organ:
                graph.add((organ, DCTERMS.spatial, subject))
        return graph
    if kind == "virtual_instrument":
        aggregation = _node(policy, "edm-aggregation", _entity_id(record))
        graph.add((aggregation, RDF.type, ORE.Aggregation))
        graph.add((aggregation, EDM.aggregatedCHO, subject))
        graph.add((aggregation, EDM.isShownAt, _human_url(kind, record, policy)))
        _literal(graph, aggregation, EDM.provider, "MODAVIS")
        _literal(graph, aggregation, EDM.dataProvider, "MODAVIS Pipe Organ Dataset")
        for relation_item in _items(_map(record.get("relationships")).get("canonicalOrganRelations")):
            if not isinstance(relation_item, Mapping):
                continue
            target = _identity_uri(relation_item.get("targetOrganMdvsId"), policy)
            if target:
                graph.add((subject, EDM.isRepresentationOf, target))
                graph.add((subject, EDM.isRelatedTo, target))
                graph.add((target, RDF.type, EDM.PhysicalThing))
                _literal(graph, target, DC.title, relation_item.get("targetOrganTitle"))
        evidence = _map(record.get("evidence"))
        for link_value in _items(evidence.get("sourceUrls")) or [evidence.get("sourceUrl")]:
            link = _external(link_value)
            if not link:
                continue
            graph.add((link, RDF.type, EDM.WebResource))
            graph.add((aggregation, EDM.hasView, link))
            graph.add((aggregation, ORE.aggregates, link))
        _literal(graph, subject, DC.creator, record.get("producer"))
        _literal(graph, subject, DC.description, record.get("notes"))
        return graph
    if kind == "name":
        _retain_quality_evidence(graph, native if native is not None else native_graph(kind, record, policy), subject)
        graph.set((subject, RDF.type, SKOS.Concept))
        _literal(
            graph, subject, SKOS.prefLabel,
            _first(_map(record.get("forms")), "display", "canonical") or _first(record, "title"),
        )
        for item in _items(record.get("relatedEntities")):
            if isinstance(item, Mapping):
                actor = _identity_uri(item.get("mdvsId"), policy, item.get("canonicalUri"))
                if actor:
                    graph.add((subject, EDM.isRelatedTo, actor))
        return graph
    if kind != "organ":
        return graph
    aggregation = _node(policy, "edm-aggregation", _entity_id(record))
    graph.add((aggregation, RDF.type, ORE.Aggregation))
    graph.add((aggregation, EDM.aggregatedCHO, subject))
    graph.add((aggregation, EDM.isShownAt, _human_url(kind, record, policy)))
    _literal(graph, aggregation, EDM.provider, "MODAVIS")
    _literal(graph, aggregation, EDM.dataProvider, "MODAVIS Pipe Organ Dataset")
    for source in _sources(record).values():
        _literal(graph, aggregation, EDM.dataProvider, source.get("source") or source.get("title"))
    media_nodes: list[tuple[URIRef, Mapping[str, Any]]] = []
    for index, item in enumerate(_items(record.get("media"))):
        if not isinstance(item, Mapping):
            continue
        media_key = (
            item.get("id") or item.get("mediaReferenceId") or f"{_entity_id(record)}:{index}"
            if isinstance(policy, ResourceUriFactory) and policy.uses_scoped_identifiers
            else item.get("id") or index
        )
        reference = _node(policy, "media-reference", media_key)
        link = _external(item.get("url"))
        media = link or reference
        media_nodes.append((media, item))
        graph.add((media, RDF.type, EDM.WebResource if link else EDM.InformationResource))
        graph.add((aggregation, ORE.aggregates, media))
        graph.add((aggregation, EDM.hasView, media))
        _literal(graph, media, DC.title, item.get("title") or item.get("filename"))
        _literal(graph, media, DC.format, item.get("kind"))
        _literal(graph, media, DC.rights, item.get("copyrightNotice"))
        _literal(graph, media, DCTERMS.provenance, item.get("sourceCredit"))
        if item.get("sourceRecordId"):
            source = {"id": item["sourceRecordId"], "source": item.get("source"), "url": item.get("sourceUrl")}
            graph.add((media, DCTERMS.source, _add_source(graph, policy, source)))
    first_image = next(
        (_external(item.get("url")) for _, item in media_nodes if item.get("kind") == "image" and _external(item.get("url"))),
        None,
    )
    if first_image:
        graph.add((aggregation, EDM.isShownBy, first_image))
    for item in _items(record.get("activities") or record.get("timeline")):
        if isinstance(item, Mapping):
            event = _node(policy, "event", item.get("id"))
            graph.add((event, RDF.type, EDM.Event))
            _event_interpretation_evidence(graph, policy, event, item)
            graph.add((subject, DCTERMS.relation, event))
            _literal(graph, event, DC.title, item.get("label") or item.get("title"))
            _literal(graph, event, DC.date, _map(item.get("when")).get("rawExpression"))
            for participant_index, participant in enumerate(_items(item.get("participants"))):
                if isinstance(participant, Mapping):
                    actor = _actor_uri(
                        participant,
                        policy,
                        f"{item.get('id')}:participant:{participant_index}",
                    )
                    graph.add((event, DCTERMS.contributor, actor))
                    _participant_evidence(graph, policy, event, DCTERMS.contributor, actor, participant, participant_index)
                    graph.add((actor, RDF.type, EDM.Agent))
                    _literal(graph, actor, SKOS.prefLabel, participant.get("label") or participant.get("name"))
                    _literal(graph, actor, DC.identifier, participant.get("sourceActorMdvsId"))
    source_graph = native if native is not None else native_graph(kind, record, policy)
    for component, component_type in source_graph.subject_objects(RDF.type):
        if str(component_type).startswith(str(ORGAN)) and component != subject:
            graph.add((component, RDF.type, EDM.PhysicalThing))
            graph.add((subject, DCTERMS.hasPart, component))
            _literal(graph, component, DC.title, source_graph.value(component, RDFS.label))
            _literal(graph, component, DC.type, str(component_type).rsplit("#", 1)[-1])
    if record.get("placeMdvsId") or record.get("location"):
        place = URIRef(policy.identity_uri(str(record["placeMdvsId"]))) if record.get("placeMdvsId") else _node(policy, "place", record.get("location"))
        graph.add((place, RDF.type, EDM.Place))
        graph.add((subject, DCTERMS.spatial, place))
        _literal(graph, place, SKOS.prefLabel, record.get("location"))
        coordinates = _map(record.get("coordinates"))
        _literal(graph, place, WGS84.lat, coordinates.get("lat"))
        _literal(graph, place, WGS84.long, coordinates.get("lon"))
    _retain_quality_evidence(graph, native if native is not None else native_graph(kind, record, policy), subject)
    return graph


def pon_graph(
    kind: str,
    record: Mapping[str, Any],
    policy: UriContext,
    *,
    native: Graph | None = None,
) -> Graph:
    policy = _resource_factory(kind, record, policy)
    if kind != "organ":
        raise KeyError("pon")
    graph = Graph()
    _bind(graph)
    source_graph = native if native is not None else native_graph(kind, record, policy)
    for triple in source_graph:
        graph.add(triple)
    subject = _entity_uri(record, policy)
    graph.add((subject, RDF.type, PON_ORGAN.Organ))
    mappings = {
        ORGAN.OrganDivision: PON_ORGAN.Division, ORGAN.OrganKeyboard: PON_ORGAN.Keyboard,
        ORGAN.OrganStop: PON_ORGAN.DivisionStop, ORGAN.OrganRank: PON_ORGAN.StopRank,
        ORGAN.OrganPipe: PON_ORGAN.Pipe, ORGAN.WindSystem: PON_ORGAN.WindSystem,
        ORGAN.Console: PON_ORGAN.Console,
    }
    for native_type, pon_type in mappings.items():
        for component in graph.subjects(RDF.type, native_type):
            graph.add((component, RDF.type, pon_type))
            graph.add((subject, PON_CORE.hasPart, component))
    builders = sorted(set(source_graph.objects(subject, INST.hasBuilder)), key=str)
    if builders:
        project = _node(policy, "project", _entity_id(record))
        builder_role = _node(policy, "role", "organ-builder")
        graph.add((subject, ARCO.isDescribedBy, project))
        graph.add((project, RDF.type, ARCO.Project))
        graph.add((builder_role, RDF.type, PON_CORE.Role))
        graph.add((builder_role, DCTERMS.isPartOf, URIRef(policy.dataset_version_uri)))
        _label(graph, builder_role, "organ builder")
        for builder in builders:
            assignment = _node(policy, "agent-role", f"{_entity_id(record)}:{builder}")
            graph.add((project, PON_CORE.hasAgentRole, assignment))
            graph.add((assignment, RDF.type, PON_CORE.AgentRole))
            graph.add((assignment, ARCO.hasAgent, builder))
            graph.add((assignment, ARCO.hasRole, builder_role))
            graph.add((builder, RDF.type, ARCO.Agent))
        for place in source_graph.objects(subject, CORE.locatedAt):
            graph.add((project, ARCO.hasPlace, place))
            graph.add((place, RDF.type, ARCO.Place))
    return graph


def profile_graphs(
    kind: str, record: Mapping[str, Any], policy: UriPolicy,
) -> dict[str, Graph]:
    """Build every supported graph while sharing the complete native graph."""
    factory = _resource_factory(kind, record, policy)
    native = native_graph(kind, record, factory)
    graphs = {
        "modavis": native,
        "cidoc": cidoc_graph(kind, record, factory, native=native),
        "edm": edm_graph(kind, record, factory, native=native),
    }
    if kind == "organ":
        graphs["pon"] = pon_graph(kind, record, factory, native=native)
    return {
        profile: _apply_resource_annotations(graph, factory)
        for profile, graph in graphs.items()
    }


def _graph(kind: str, record: Mapping[str, Any], profile: str, policy: UriPolicy) -> Graph:
    factory = _resource_factory(kind, record, policy)
    if profile == "modavis":
        graph = native_graph(kind, record, factory)
    elif profile == "cidoc":
        graph = cidoc_graph(kind, record, factory)
    elif profile == "edm":
        graph = edm_graph(kind, record, factory)
    elif profile == "pon":
        graph = pon_graph(kind, record, factory)
    else:
        raise KeyError(profile)
    return _apply_resource_annotations(graph, factory)


def _stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        values = [_stable(item) for item in value]
        return sorted(values, key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True))
    return value


def _jsonld(graph: Graph) -> str:
    serialized = graph.serialize(format="json-ld", context=_CONTEXT, auto_compact=False)
    payload = json.loads(serialized.decode() if isinstance(serialized, bytes) else serialized)
    return json.dumps(_stable(payload), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


class _ExactNumericTurtleSerializer(TurtleSerializer):
    def label(self, node, position):
        # RDFLib's plain double shorthand uses six significant digits. Keep
        # the established lexical value instead of changing the coordinate.
        if isinstance(node, Literal) and node.datatype in (XSD.double, XSD.float):
            return node.n3()
        return super().label(node, position)


def exact_turtle(graph):
    stream = BytesIO()
    _ExactNumericTurtleSerializer(graph).serialize(stream)
    return stream.getvalue().decode("utf-8")


def exact_nt_lines(graph: Graph) -> list[str]:
    """Sort statements without treating literal Unicode separators as line ends."""
    serialized = graph.serialize(format="nt")
    body = serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized
    # RDFLib escapes literal CR/LF and delimits statements with LF. splitlines()
    # would also split preserved U+0085, U+2028/2029 and control characters.
    return sorted(line for line in body.split("\n") if line.strip())


def serialize_entity(
    kind: str, record: Mapping[str, Any], profile: str, extension: str, policy: UriPolicy,
) -> tuple[str, str, Mapping[str, Any]]:
    if profile not in {"modavis", "cidoc", "pon", "edm"} or extension not in FORMAT_MEDIA_TYPES:
        raise KeyError(profile if profile not in {"modavis", "cidoc", "pon", "edm"} else extension)
    graph = _graph(kind, record, profile, policy)
    if extension == "jsonld":
        body = _jsonld(graph)
    elif extension == "ttl":
        body = exact_turtle(graph)
    elif extension == "nt":
        body = "\n".join(exact_nt_lines(graph)) + "\n"
    else:
        rdf_format = {"rdf": "xml", "xml": "xml"}[extension]
        serialized = graph.serialize(format=rdf_format)
        body = serialized.decode() if isinstance(serialized, bytes) else serialized
    metadata = MODAVIS_0153_PROFILE if profile == "modavis" else PROFILES[profile]
    return body, FORMAT_MEDIA_TYPES[extension], metadata
