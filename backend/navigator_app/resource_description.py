"""Human-readable views derived exclusively from a resolved public RDF graph."""
from __future__ import annotations

import re
from urllib.parse import urlencode, urlsplit
from rdflib import Literal, RDF, RDFS, URIRef
from rdflib.namespace import DCTERMS, PROV, SKOS
from .entity_exports import ASSERTION, EVIDENCE, SCHEMA


LABELS = {
    str(DCTERMS.identifier): 'Source identifier / key', str(DCTERMS.source): 'Source record',
    str(ASSERTION.assertsLiteral): 'Value', str(ASSERTION.rawValue): 'Source wording',
    str(ASSERTION.assertsSubject): 'Describes', str(ASSERTION.assertsPredicate): 'Property',
    str(ASSERTION.assertsObject): 'Value', str(ASSERTION.hasEvidenceRelation): 'Evidence',
    str(EVIDENCE.selectorValue): 'Location in source', str(EVIDENCE.fragmentOf): 'Source record',
    str(EVIDENCE.usesFragment): 'Source fragment', str(EVIDENCE.evaluates): 'Supported statement',
    str(SCHEMA.url): 'Original source', str(EVIDENCE.sourceUri): 'Original source',
}
PROVENANCE = {DCTERMS.source, PROV.wasDerivedFrom, ASSERTION.hasEvidenceRelation,
              EVIDENCE.usesFragment, EVIDENCE.fragmentOf}


def term_label(uri):
    if str(uri) in LABELS:
        return LABELS[str(uri)]
    tail = str(uri).rsplit('#', 1)[-1].rsplit('/', 1)[-1]
    return re.sub(r'([a-z])([A-Z])', r'\1 \2', tail).replace('_', ' ').replace('-', ' ').capitalize()


def describe_resource(graph, subject, document, profile, policy, owner=None):
    node = URIRef(subject)
    def label(value):
        labels = list(graph.objects(value, RDFS.label)) or list(graph.objects(value, SKOS.prefLabel))
        return str(sorted(labels, key=str)[0]) if labels else None
    def value(item):
        if isinstance(item, Literal):
            result = {'kind':'literal', 'text':str(item)}
            if item.language:
                result['language'] = item.language
            if item.datatype:
                result['datatype'] = str(item.datatype)
            return result
        uri = str(item)
        result = {'kind':'uri', 'uri':uri, 'text':label(item) or term_label(uri)}
        if uri.startswith(policy.canonical_id_base + '/dataset/pod/version/'):
            result['url'] = policy.human_base + '/resources?' + urlencode({'uri':uri})
        elif uri.startswith(policy.canonical_id_base + '/'):
            result['url'] = policy.human_base + '/resolve/' + uri[len(policy.canonical_id_base) + 1:]
        elif urlsplit(uri).scheme in {'http', 'https'}:
            result['url'] = uri
        return result
    predicates = sorted(set(graph.predicates(node)), key=lambda p:(term_label(p), str(p)))
    properties = [{'uri':str(p), 'label':term_label(p),
                   'values':[value(o) for o in sorted(set(graph.objects(node,p)),key=str)]}
                  for p in predicates if p not in {RDF.type, RDFS.label, SKOS.prefLabel}]
    sources = set()
    frontier, visited = {node}, set()
    for _ in range(4):
        following = set()
        for current in frontier - visited:
            visited.add(current)
            if (current, RDF.type, EVIDENCE.SourceResource) in graph:
                sources.add(current)
            for predicate in PROVENANCE:
                following.update(o for o in graph.objects(current, predicate) if isinstance(o, URIRef))
        frontier = following
    source_records = []
    for source in sorted(sources,key=str):
        entry = value(source)
        entry['identifiers'] = sorted(str(v) for v in graph.objects(source,DCTERMS.identifier))
        entry['originalUrls'] = sorted({str(v) for p in (SCHEMA.url,EVIDENCE.sourceUri)
                                       for v in graph.objects(source,p) if urlsplit(str(v)).scheme in {'http','https'}})
        source_records.append(entry)
    related = sorted({s for s,p in graph.subject_predicates(node) if s != node},key=str)
    fragments = sorted({s for s in graph.subjects() if str(s).startswith(document+'#')},key=str) if subject == document else []
    types = [{'uri':str(t), 'label':term_label(t)} for t in sorted(set(graph.objects(node,RDF.type)),key=str)]
    identifiers = sorted(str(v) for v in graph.objects(node,DCTERMS.identifier))
    data_document = document.replace(policy.canonical_id_base,policy.data_base,1)
    return {
        'contract':'modavis.public-resource-description/v1', 'uri':subject,
        'label':label(node) or (types[0]['label'] if types else 'Dataset resource'),
        'types':types, 'owner':owner, 'releaseVersion':policy.release_version,
        'profile':profile, 'documentUri':document, 'identifiers':identifiers,
        'properties':properties, 'sources':source_records,
        'related':[value(v) for v in related[:20]], 'relatedCount':len(related),
        'members':[value(v) for v in fragments[:100]], 'memberCount':len(fragments),
        'representations':[{'label':title, 'url':data_document+'.'+ext, 'mediaType':media}
                           for ext,title,media in [('jsonld','JSON-LD','application/ld+json'),
                                                  ('ttl','Turtle','text/turtle'),('rdf','RDF/XML','application/rdf+xml'),
                                                  ('nt','N-Triples','application/n-triples')]],
    }
