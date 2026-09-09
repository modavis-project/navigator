"""Read-only lookups for resources whose URI does not carry an owner."""
from __future__ import annotations

import json


def decoded(value):
    return json.loads(value) if isinstance(value, str) else value or {}


class ReleaseResourceReader:
    """Use the parameterized row adapter shared by the corpus readers."""

    def __init__(self, rows):
        self.rows = rows

    def source(self, key):
        rows = self.rows('select * from public_source_record_metadata where source_record_id=?', (key,))
        if not rows:
            rows = self.rows('select * from source_membership where source_record_id=?', (key,))
        if rows:
            row = rows[0]
            return {'id': key, 'sourceKey': row['source_key'], 'url': row.get('source_url')}
        if key.startswith('vmi-source:') and ':MDVS:VMIN:' in key:
            identifier = 'MDVS:VMIN:' + key.rsplit(':MDVS:VMIN:', 1)[1]
            rows = self.rows('select payload_json from virtual_instrument_detail where vmi_mdvs_id=?', (identifier,))
            if rows:
                evidence = decoded(rows[0]['payload_json']).get('evidence') or {}
                if evidence and key == f"vmi-source:{evidence.get('sourceKey') or 'catalog'}:{identifier}":
                    return {'id': key, 'source': evidence.get('sourceKey') or 'virtual instrument catalog', 'url': evidence.get('sourceUrl')}
            return None
        # Missing metadata does not erase source references in accepted evidence.
        for table in ('organ_builder_assertion', 'organ_builder_relation', 'place_assertion',
                      'technical_fact', 'documented_event', 'specification_component',
                      'specification_description', 'public_media_reference'):
            if self.rows(f'select source_record_id from {table} where source_record_id=? limit 1', (key,)):
                return {'id': key}
        return None

    def relation(self, key):
        rows = self.rows('''select r.*,s.actor_mdvs_id as source_actor_mdvs_id,
            t.actor_mdvs_id as target_actor_mdvs_id from musixplora_relation r
            left join actor_external_identifier s on s.scheme_code='extidtype:musixplora'
                and s.identifier_value=r.source_mxp_id
            left join actor_external_identifier t on t.scheme_code='extidtype:musixplora'
                and t.identifier_value=r.target_mxp_id where r.edge_id=?''', (key,))
        if not rows:
            return None
        return [{out: row.get(column) for out, column in {
            'id':'edge_id', 'sourceMxpId':'source_mxp_id', 'targetMxpId':'target_mxp_id',
            'sourceActorMdvsId':'source_actor_mdvs_id', 'targetActorMdvsId':'target_actor_mdvs_id',
            'canonicalRelationType':'canonical_relation_type', 'roleLabel':'role_label',
            'generation':'generation', 'generationLabel':'generation_label',
            'relationCategory':'relation_category', 'decisionState':'decision_state',
            'evidenceSha256':'evidence_sha256',
        }.items()} for row in rows]

    def actor(self, key):
        if self.rows("select actor_mdvs_id from actor_external_identifier where scheme_code='extidtype:musixplora' and identifier_value=? limit 1", (key,)):
            return None
        for column in ('source_mxp_id', 'target_mxp_id'):
            if self.rows(f'select edge_id from musixplora_relation where {column}=? limit 1', (key,)):
                return key
        return None

    def terms(self, family):
        if family == 'technical-fact-property':
            return [r['value'] or 'technical-fact' for r in self.rows('select distinct family as value from technical_fact', ())]
        if family == 'media-status':
            return [r['value'] for r in self.rows('select distinct availability_state as value from public_media_reference', ()) if r['value']]
        if family == 'role':
            return ['organ-builder']
        if family == 'virtual-instrument-platform':
            return sorted({name for row in self.rows('select payload_json from virtual_instrument_detail', ())
                           for name in (decoded(row['payload_json']).get('platforms') or {}).get('all', []) if name})
        return []

    def concept(self, key):
        rows = self.rows("select payload_json from vocabulary_concept where concept_code=? and scheme_code='modavis_activity_types'", (key,))
        return decoded(rows[0]['payload_json']) if rows else None

    def legacy_owner(self, family, key):
        # Resolve persisted keys without scanning every exported graph.
        tables = {'assertion': ('technical_fact', 'fact_id'), 'event': ('documented_event', 'event_id'),
                  'organ-component': ('specification_component', 'component_id'),
                  'media-reference': ('public_media_reference', 'media_id'),
                  'builder-assertion': ('organ_builder_assertion', 'assertion_id')}
        if family not in tables:
            return None
        table, column = tables[family]
        rows = self.rows(f'select organ_mdvs_id from {table} where {column}=?', (key,))
        if not rows and family == 'event' and self.rows("select value from metadata where key='history_configuration_evidence_contract'", ()):
            rows = self.rows('select e.organ_mdvs_id from documented_event_representation r join documented_event e using(event_id) where r.representation_id=?', (key,))
        return rows[0]['organ_mdvs_id'] if rows else None

    def lookup(self, operation, key):
        functions = {'source-record': self.source, 'musixplora-relation': self.relation,
                     'musixplora-actor': self.actor, 'terms': self.terms, 'event-type': self.concept}
        if operation.startswith('legacy:'):
            return self.legacy_owner(operation.split(':', 1)[1], key)
        return functions[operation](key)
