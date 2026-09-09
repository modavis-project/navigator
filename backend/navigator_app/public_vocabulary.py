"""Deterministic downloads of the bounded vocabulary bundled with the public core."""
from __future__ import annotations

import csv
import hashlib
import io
import json


def snapshot(concepts, scheme):
    values = sorted((c for c in concepts if c['scheme']['code'] == scheme), key=lambda c: c['code'])
    if not values:
        return None
    content = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return {'kind': 'bundled_vocabulary_snapshot', 'formalRelease': False,
            'scheme': values[0]['scheme'], 'conceptCount': len(values),
            'contentSha256': hashlib.sha256(content.encode()).hexdigest(),
            'citation': f"MODAVIS. {values[0]['scheme'].get('name') or scheme}, recorded vocabulary version {values[0]['scheme'].get('version') or 'unspecified'}. Local bundled public-core snapshot. Content SHA-256: {hashlib.sha256(content.encode()).hexdigest()}.",
            'provenance': {'datasetBinding': sorted({str(c.get('datasetVersion') or 'not supplied') for c in values}),
                           'labelLanguageAuthority': 'Initiator core.language registry, projected with each recorded label',
                           'registryMappings': 'Only exact retained occurrences in selected public source records; unlinked historical registry evidence excluded',
                           'eventMappings': 'Current public documented_event processing assertions, independently scoped and qualified'},
            'scope': 'Vocabulary records included in the selected public core. This local download is not a separately published vocabulary release.',
            'concepts': values}


def serialize(snapshot, format, canonical_base):
    if format == 'json':
        return json.dumps(snapshot, ensure_ascii=False, sort_keys=True, indent=2) + '\n', 'application/json'
    if format == 'csv':
        out = io.StringIO(newline='')
        writer = csv.writer(out, lineterminator='\n')
        writer.writerow(['concept_code', 'mdvs_id', 'scheme_code', 'scheme_version', 'label', 'language_code', 'language_name', 'language_endonym', 'language_mdvs_id', 'label_type_id', 'definition', 'public_source_mapping_evidence_json', 'public_event_usage_json'])
        for concept in snapshot['concepts']:
            for label in concept.get('labels') or [{}]:
                writer.writerow([concept['code'], concept.get('mdvsId'), concept['scheme']['code'], concept['scheme'].get('version'), label.get('label'), label.get('languageCode'), label.get('languageName'), label.get('languageEndonym'), label.get('languageMdvsId'), label.get('labelTypeId'), concept.get('definition'), json.dumps(concept.get('sourceTermMappings'), ensure_ascii=False, sort_keys=True), json.dumps(concept.get('publicEventUsage'), ensure_ascii=False, sort_keys=True)])
        return out.getvalue(), 'text/csv; charset=utf-8'
    from rdflib import BNode, Graph, Literal, RDF, RDFS, URIRef
    from rdflib.namespace import DCTERMS, SKOS
    graph = Graph()
    graph.bind('skos', SKOS)
    graph.bind('dcterms', DCTERMS)
    scheme = BNode('bundled-scheme')
    graph.add((scheme, RDF.type, SKOS.ConceptScheme))
    graph.add((scheme, DCTERMS.title, Literal(snapshot['scheme'].get('name') or snapshot['scheme']['code'])))
    graph.add((scheme, DCTERMS.description, Literal(snapshot['scope'])))
    graph.add((scheme, DCTERMS.identifier, Literal(snapshot['contentSha256'])))
    for index, concept in enumerate(snapshot['concepts']):
        # Only activity codes already have a governed public term URI contract.
        # Other retained concepts remain blank nodes carrying their exact MDVS
        # identifier: this download does not mint or guess canonical URIs.
        node = URIRef(f"{canonical_base}/vocab/event-type/{concept['code']}") if concept['scheme']['code'] == 'modavis_activity_types' else BNode(f'concept-{index}')
        graph.add((node, RDF.type, SKOS.Concept))
        graph.add((node, SKOS.inScheme, scheme))
        graph.add((node, SKOS.notation, Literal(concept['code'])))
        if concept.get('mdvsId'):
            graph.add((node, DCTERMS.identifier, Literal(concept['mdvsId'])))
        if concept.get('definition'):
            graph.add((node, SKOS.definition, Literal(concept['definition'])))
        for label in concept.get('labels', []):
            if label.get('label'):
                # types.name row 4 is nametype:full, not preferred status.
                # Only the exact retained preferredLabel establishes preference.
                predicate = SKOS.prefLabel if label['label'] == concept.get('preferredLabel') else RDFS.label
                graph.add((node, predicate, Literal(label['label'], lang=label.get('languageCode') or None)))
        graph.add((node, DCTERMS.source, Literal(json.dumps({'recordedLabels': concept.get('labels', [])}, ensure_ascii=False, sort_keys=True))))
        if concept.get('mappingEvidenceScope'):
            graph.add((node, SKOS.scopeNote, Literal(concept['mappingEvidenceScope'])))
        for mapping in concept.get('sourceTermMappings', []):
            graph.add((node, DCTERMS.source, Literal(json.dumps(mapping, ensure_ascii=False, sort_keys=True))))
        if concept.get('publicEventUsage'):
            graph.add((node, DCTERMS.source, Literal(json.dumps({'publicEventUsage': concept['publicEventUsage']}, ensure_ascii=False, sort_keys=True))))
    if format == 'jsonld':
        def ordered(value):
            if isinstance(value, list):
                return sorted((ordered(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True))
            if isinstance(value, dict):
                return {key: ordered(item) for key,item in sorted(value.items())}
            return value
        return json.dumps(ordered(json.loads(graph.serialize(format='json-ld'))), ensure_ascii=False, sort_keys=True, indent=2) + '\n', 'application/ld+json'
    if format in {'ttl', 'skos'}:
        # Sorted N-Triples is a deterministic subset of Turtle/SKOS syntax.
        return '\n'.join(sorted(graph.serialize(format='nt').splitlines())) + '\n', 'text/turtle; charset=utf-8'
    raise ValueError('unsupported vocabulary format')
