"""Navigate published relationships without making new collection associations."""
from urllib.parse import quote
from flask import jsonify, request
from .db import connect

SCHEMA = 'release_1_5_public'


def organ_resources(repository, identifier, tables):
    resolved = repository._resolve_organ_mdvs_id(identifier)
    if not resolved:
        return None
    organ_id = resolved[0]
    url = '/organs/' + quote(organ_id.removeprefix('MDVS:ENTY:'), safe='')
    api = '/api/organs/' + quote(organ_id, safe='')
    sections = [
        ('accounts', 'Configuration accounts', 'specification_description', 'source accounts', 'specification'),
        ('events', 'Documented history', 'documented_event', 'event assertions', 'history'),
        ('media', 'Media references', 'public_media_reference', 'external references', 'media'),
        ('sources', 'Source records', 'source_membership', 'source records', 'identifiers'),
        ('builders', 'Builder attributions', 'organ_builder_assertion', 'source assertions', 'related'),
        ('places', 'Place attributions', 'place_assertion', 'place assertions', 'related'),
        ('virtual-instruments', 'Virtual instruments', 'organ_virtual_instrument', 'retained relationships', 'related'),
        ('temperaments', 'Temperament wording', 'organ_temperament_assertion', 'source assertions', 'related'),
    ]
    with connect(repository.settings) as conn:
        organ = conn.execute(f'select label from {SCHEMA}.organ where mdvs_id=%s', (organ_id,)).fetchone()
        counts = {}
        for key, _title, table, _unit, _tab in sections:
            counts[key] = conn.execute(f'select count(*) as n from {SCHEMA}.{table} where organ_mdvs_id=%s', (organ_id,)).fetchone()['n'] if table in tables else None
        instruments = conn.execute(f'''select v.mdvs_id,v.canonical_title,r.resolution_state,r.confidence,r.row_hash
            from {SCHEMA}.organ_virtual_instrument r join {SCHEMA}.virtual_instrument v on v.mdvs_id=r.vmi_mdvs_id
            where r.organ_mdvs_id=%s order by v.canonical_title,r.relation_id limit 20''', (organ_id,)).fetchall() if {'organ_virtual_instrument', 'virtual_instrument'} <= set(tables) else []
        tuning = conn.execute(f'''select assertion_id,source_value,source_record_id,source_key,row_sha256
            from {SCHEMA}.organ_temperament_assertion where organ_mdvs_id=%s
            order by source_key,assertion_id limit 20''', (organ_id,)).fetchall() if 'organ_temperament_assertion' in tables else []
    return {'contract': 'modavis.pod-related-resources/v1', 'readOnly': True,
        'organ': {'id': organ_id, 'title': organ['label'], 'url': url},
        'collections': [{'id': key, 'title': title, 'count': counts[key], 'unit': unit, 'available': table in tables,
                         'url': url + '?tab=' + tab} for key, title, table, unit, tab in sections],
        'virtualInstruments': [{'id': row['mdvs_id'], 'title': row['canonical_title'],
            'url': '/virtual-instruments/' + quote(row['mdvs_id'].removeprefix('MDVS:VMIN:'), safe=''),
            'relationshipState': row['resolution_state'], 'confidence': row['confidence'], 'evidenceSha256': row['row_hash']}
            for row in instruments],
        'temperamentAssertions': [{'id': row['assertion_id'], 'wording': row['source_value'], 'source': row['source_key'],
            'sourceUrl': '/source/' + quote(row['source_record_id'], safe=''), 'evidenceSha256': row['row_sha256'],
            'lookupUrl': repository._tuning_occurrence_matcher.catalog_url(
                row['source_value'], row['source_key'], row['source_record_id']) if 'tuning_system' in tables else None}
            for row in tuning],
        'relationshipBoundary': 'These are retained public links and source assertions. Shared names or collection membership do not create new organ associations.',
        'temperamentBoundary': 'Source wording is retained verbatim. Catalogue links identify matching wording. The cent vectors come from the catalogue.',
        'unavailableRelationships': [
            {'id': 'scores', 'title': 'Scores for this organ', 'state': 'relationship_unavailable',
             'reason': 'This public snapshot contains scores, but no accepted organ-to-score relation.', 'browseUrl': '/pod-explorer?collection=scores'},
            {'id': 'literature', 'title': 'Literature about this organ', 'state': 'relationship_unavailable',
             'reason': 'This public snapshot contains bibliographic records, but no accepted organ-to-publication relation.', 'browseUrl': '/pod-explorer?collection=literature'}],
        'evidenceUrl': api + '/related', 'resourceEvidenceUrl': '/api/pod/organs/' + quote(organ_id, safe='') + '/resources',
        'exportManifestUrl': '/api/exports/organ/' + quote(organ_id, safe=''), 'itemLimit': 20}


def register_pod_related_resources(app, repository):
    @app.get('/api/pod/organs/<path:organ_id>/resources')
    def pod_organ_resources(organ_id):
        if request.args or len(organ_id) > 256:
            return jsonify({'error': 'This resource accepts one organ identifier and no query parameters'}), 400
        tables = app.extensions['pod_capabilities'].inventory()['tables']
        result = organ_resources(repository, organ_id, tables)
        return jsonify(result) if result is not None else (jsonify({'error': 'organ_not_found'}), 404)
