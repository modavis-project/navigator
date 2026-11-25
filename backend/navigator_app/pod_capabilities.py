"""Public POD discovery over explicit publication-safe readers and tables.

Counts describe retained records, never inferred physical objects. No source
payloads, local asset paths, credentials or operator tables enter this surface.
"""
from __future__ import annotations

from copy import deepcopy
from threading import Lock
from pathlib import Path
from urllib.parse import quote
import re
import os

from flask import jsonify, request
from .db import connect

SCHEMA = 'release_1_5_public'
CONTRACT = 'modavis.pod-explorer/v1'

# These are product tasks, not one card per implementation table.
FAMILIES = [
    ('organs', 'Organs', 'organ', 'organ records', 'Find an instrument and follow its separately attributed accounts.', '/organs', '/api/organs', 'Source coverage is not a worldwide census.'),
    ('actors', 'People & organizations', 'actor_directory_entry', 'directory entries', 'Explore identified actors and unresolved source mentions.', '/persons', '/api/persons', 'Directory entries include source mentions; they are not all distinct identified people.'),
    ('places', 'Places', 'place_detail', 'place records', 'Browse recorded venues, settlements and their geographic evidence.', '/pod-explorer?collection=places', '/api/pod/places', 'Place identifiers and source assertions remain distinct; approximate coordinates do not locate an organ.'),
    ('maps', 'Maps & movement', 'coordinate_assertion', 'coordinate assertions', 'Explore recorded geography, coordinate precision and qualified relocations.', '/map', '/api/map/summary.json', 'Current source locations, approximate localities and evidenced historical movements are distinct.'),
    ('events', 'Documented history', 'documented_event', 'event assertions', 'Follow interventions, participants and qualified dates.', '/events', '/api/events', 'Several sources may describe the same intervention; assertions are not unique historical events.'),
    ('accounts', 'Configuration accounts', 'specification_description', 'source accounts', 'Select dated or undated descriptions and compare captured stoplists.', '/use-cases/research-workbench?view=selection&section=configurations', '/api/workbench/selection', 'Account dates, physical states and source publication dates have separate meanings.'),
    ('components', 'Stops & pipework', 'specification_component', 'captured specification entries', 'Inspect stops, divisions, couplers and functional pipe positions in an organ account.', '/use-cases/research-workbench?view=terms&mode=stops', '/api/workbench/terms', 'Captured entries and calculated functional pipe positions are not counts of observed physical pipes.'),
    ('media', 'Images & media', 'public_media_reference', 'external media references', 'Find media-bearing organs and inspect source credits and rights.', '/organs?media_state=available', '/api/organs', 'Media are external references; original source media are not redistributed by this projection.'),
    ('sources', 'Sources & provenance', 'source_membership', 'source records', 'Browse source records and inspect the facts retained from each.', '/pod-explorer?collection=sources', '/api/pod/sources', 'Source membership establishes provenance, not independence between sources.'),
    ('literature', 'Literature', 'literature_publication', 'publication records', 'Search bibliographic records, digitized access and source citations.', '/literature', '/api/literature', 'A publication in the collection is not automatically associated with an organ.'),
    ('scores', 'Digital scores', 'digital_score', 'score records', 'Find source-backed editions, score assets and precomputed pitch ranges.', '/scores', '/api/scores', 'A computed musical range does not establish compatibility with, or projection onto, an organ.'),
    ('temperaments', 'Temperaments', 'tuning_system', 'tuning systems', 'Inspect cent vectors, source commentary and separately qualified organ wording.', '/temperaments', '/api/temperaments', 'Related family wording does not establish one exact tuning variant.'),
    ('virtual-instruments', 'Virtual instruments', 'virtual_instrument', 'virtual instruments', 'Explore documented sample sets and retained organ relationships.', '/virtual-instruments', '/api/virtual-instruments', 'Instrument binaries are not included; unresolved or probable relationships remain qualified.'),
    ('vocabulary', 'Vocabulary & terminology', 'vocabulary_concept', 'core concepts', 'Follow controlled concepts, source wording and contextual usage.', '/vocab', '/api/vocab/overview', 'The core concept count excludes separately versioned vocabulary resources and unnormalized source terms.'),
    ('research', 'Research workbench', None, None, 'Build selections, compare accounts and retain complete evidence packages.', '/use-cases/research-workbench', '/api/workbench/context', 'Snapshot, assessment and account revision pins identify the evidence behind a result.'),
    ('data-access', 'Data access & releases', None, None, 'Query a pinned snapshot and reuse entity, semantic and bulk exports.', '/pod-explorer?collection=data-access', '/api/graphql', 'Queries are read-only and bounded. Historical releases remain independently versioned.'),
]


def query_values(args, allowed):
    repeated = sorted(key for key, values in args.lists() if len(values) != 1)
    if repeated:
        raise ValueError('Repeated parameter: ' + ', '.join(repeated))
    unknown = sorted(set(args) - allowed)
    if unknown:
        raise ValueError('Unsupported parameter: ' + ', '.join(unknown))
    values = dict(args)
    if any(len(value) > 256 for value in values.values()):
        raise ValueError('Parameter exceeds 256 characters')
    for name, default, maximum in [('limit', 20, 50), ('offset', 0, 10000)]:
        raw = values.get(name, str(default))
        if not re.fullmatch(r'[0-9]+', raw) or not (1 if name == 'limit' else 0) <= int(raw) <= maximum:
            raise ValueError('Invalid ' + name)
        values[name] = int(raw)
    return values


def literal(value):
    return '%' + value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'


class PodCapabilities:
    def __init__(self, app, repository):
        self.app, self.repo = app, repository
        self._inventory = None
        self._lock = Lock()

    def inventory(self):
        # This repository is an immutable release. Cache only this instance,
        # which cannot be shared with another historical release repository.
        with self._lock:
            if self._inventory is not None:
                return deepcopy(self._inventory)
            with connect(self.repo.settings) as conn:
                tables = {row['table_name'] for row in conn.execute(
                    "select table_name from information_schema.tables where table_schema=%s and table_type='BASE TABLE'", (SCHEMA,)).fetchall()}
                primary = {item[2] for item in FAMILIES if item[2]} & tables
                if 'actor_directory_entry' not in tables and 'actor' in tables:
                    primary.add('actor')
                counts = {}
                if primary:
                    sql = ' union all '.join(f"select '{table}' as name,count(*) as count from {SCHEMA}.{table}" for table in sorted(primary))
                    counts = {row['name']: row['count'] for row in conn.execute(sql).fetchall()}
                sources = conn.execute(f'select source_key,source_record_count,canonical_organ_count from {SCHEMA}.source_collection order by source_key').fetchall() if 'source_collection' in tables else []
                exclusions = conn.execute(f'select category,rationale from {SCHEMA}.rights_exclusion where excluded_from_public=1 order by category').fetchall() if 'rights_exclusion' in tables else []
                place_kinds = [row['place_kind'] for row in conn.execute(f'select distinct place_kind from {SCHEMA}.place_detail where place_kind is not null order by place_kind').fetchall()] if 'place_detail' in tables else []
            self._inventory = {'tables': sorted(tables), 'counts': counts, 'sources': sources, 'exclusions': exclusions, 'placeKinds': place_kinds}
            return deepcopy(self._inventory)

    def document(self):
        inventory = self.inventory()
        work = self.app.extensions.get('research_workbench')
        health = self.app.extensions.get('capability_health')
        if health and not all(health.resource_state(key)['available'] for key in ('workbench', 'researchIndex')):
            work = None
        binding = {}
        if work:
            try:
                work.assert_binding()
                binding = work.binding()
            except (OSError, ValueError, RuntimeError):
                work = None
        # Retain only public snapshot identities, never paths or configuration.
        snapshot = binding.get('publicCoreSha256')
        families = []
        for key, title, table, unit, description, url, api, boundary in FAMILIES:
            if key == 'actors' and table not in inventory['tables']:
                table, unit = 'actor', 'identified actor records'
            available = table in inventory['tables'] if table else bool(work) if key == 'research' else True
            if key in {'accounts', 'components'}:
                available = available and bool(work)
            families.append({'id': key, 'title': title, 'description': description,
                             'count': inventory['counts'].get(table), 'unit': unit,
                             'available': available, 'url': url, 'api': api, 'boundary': boundary})
        release = self.repo.policy.release_version
        semantic_available = (health.resource_state('semanticDistributions')['available'] if health else
            bool(getattr(self.repo.settings, 'dataset_distribution_manifest_path', None)) and Path(self.repo.settings.dataset_distribution_manifest_path).is_file())
        reference_available = health.resource_state('vocabularyReference')['available'] if health else bool(os.getenv('NAVIGATOR_OMARO_MANIFEST'))
        return {'contract': CONTRACT, 'release': release, 'readOnly': True,
                'snapshot': snapshot, 'assessment': binding.get('occurrenceAssessmentSha256'),
                'families': families, 'sources': inventory['sources'], 'exclusions': inventory['exclusions'], 'placeKinds': inventory['placeKinds'],
                'countScope': 'Exact rows in this public release; cached for its immutable repository instance.',
                'baseTableCount': len(inventory['tables']),
                'dataAccess': {'graphqlAvailable': bool(work) and 'public_graphql' in self.app.view_functions,
                    'graphqlEndpoint': '/api/graphql', 'entityKinds': ['organ', 'person', 'organization', 'place', 'name', 'virtual_instrument'],
                    'profiles': ['modavis', 'cidoc', 'pon', 'edm'],
                    'semanticDistributionsAvailable': semantic_available,
                    'vocabularyReferenceAvailable': reference_available,
                    'distributionManifest': f'/dataset/pod/version/{quote(release, safe="")}/distribution-manifest.json',
                    'releaseContext': '/api/release-context', 'researchPackages': bool(work) and bool(self.app.config.get('RESEARCH_PACKAGE_LICENSE') or os.getenv('NAVIGATOR_RESEARCH_PACKAGE_LICENSE'))}}

    def readiness(self):
        inventory = self.inventory()
        return {'available': True, 'contract': CONTRACT, 'baseTableCount': len(inventory['tables']),
                'readOnly': True, 'countScope': 'immutable release repository'}

    def sources(self, values):
        clauses, parameters = [], {'limit': values['limit'], 'offset': values['offset']}
        if values.get('source'):
            clauses.append('s.source_key=%(source)s'); parameters['source'] = values['source']
        if values.get('q'):
            clauses.append("(s.native_identifier ilike %(q)s escape '\\' or s.source_key ilike %(q)s escape '\\' or o.label ilike %(q)s escape '\\')")
            parameters['q'] = literal(values['q'])
        relation = f'{SCHEMA}.source_membership s join {SCHEMA}.organ o on o.mdvs_id=s.organ_mdvs_id'
        where = ' where ' + ' and '.join(clauses) if clauses else ''
        with connect(self.repo.settings) as conn:
            total = conn.execute(f'select count(*) as n from {relation}{where}', parameters).fetchone()['n']
            rows = conn.execute(f'''select s.source_record_id,s.source_key,s.native_identifier,s.organ_mdvs_id,o.label
                from {relation}{where} order by s.source_key,s.source_record_id limit %(limit)s offset %(offset)s''', parameters).fetchall()
        return {'total': total, 'items': [{'id': row['source_record_id'], 'title': row['source_key'] + ': ' + (row['native_identifier'] or row['source_record_id']),
            'description': row['label'], 'source': row['source_key'], 'url': '/source/' + quote(row['source_record_id'], safe=''),
            'organUrl': '/organs/' + quote(row['organ_mdvs_id'].removeprefix('MDVS:ENTY:'), safe='')} for row in rows],
            'limit': values['limit'], 'offset': values['offset'], 'unit': 'source records', 'readOnly': True}

    def places(self, values):
        if values.get('kind') and values['kind'] not in self.inventory()['placeKinds']:
            raise ValueError('Unknown place kind')
        clauses, parameters = [], {'limit': values['limit'], 'offset': values['offset']}
        if values.get('q'):
            clauses.append("(preferred_name ilike %(q)s escape '\\' or mdvs_id=%(id)s)")
            parameters.update(q=literal(values['q']), id=values['q'])
        if values.get('kind'):
            clauses.append('place_kind=%(kind)s'); parameters['kind'] = values['kind']
        where = ' where ' + ' and '.join(clauses) if clauses else ''
        with connect(self.repo.settings) as conn:
            total = conn.execute(f'select count(*) as n from {SCHEMA}.place_detail{where}', parameters).fetchone()['n']
            rows = conn.execute(f'''select mdvs_id,preferred_name,place_kind,coordinate_state
                from {SCHEMA}.place_detail{where} order by preferred_name,mdvs_id limit %(limit)s offset %(offset)s''', parameters).fetchall()
        return {'total': total, 'items': [{'id': row['mdvs_id'], 'title': row['preferred_name'], 'description': row['place_kind'],
            'qualification': row['coordinate_state'], 'url': '/places/' + quote(row['mdvs_id'].removeprefix('MDVS:LOCN:'), safe='')} for row in rows],
            'limit': values['limit'], 'offset': values['offset'], 'unit': 'place records', 'readOnly': True}


def register_pod_capabilities(app, repository):
    catalog = PodCapabilities(app, repository)
    app.extensions['pod_capabilities'] = catalog

    @app.get('/api/pod/capabilities')
    def pod_capabilities():
        if request.args:
            return jsonify({'error': 'This endpoint accepts no query parameters'}), 400
        response = jsonify(catalog.document())
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/api/pod/sources')
    def pod_sources():
        try:
            return jsonify(catalog.sources(query_values(request.args, {'q', 'source', 'limit', 'offset'})))
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400

    @app.get('/api/pod/places')
    def pod_places():
        try:
            return jsonify(catalog.places(query_values(request.args, {'q', 'kind', 'limit', 'offset'})))
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400

    from .pod_related_resources import register_pod_related_resources
    register_pod_related_resources(app, repository)
    return catalog
