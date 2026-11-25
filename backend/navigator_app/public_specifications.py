"""Description-scoped reads for the additive public specification projection."""
from __future__ import annotations

from collections import OrderedDict
import json
import re
from typing import Any
from .public_specification_comparisons import compare_technical_facts, coverage_summary

SCHEMA = 'release_1_5_public'
CONTRACT = 'modavis.specification-description/v1'


def parsed(value, default):
    if isinstance(value, (dict, list)): return value
    try: return json.loads(value) if value else default
    except (TypeError, ValueError): return default


def summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': row['description_id'], 'kind': row['description_kind'],
        'periodLabel': row['period_label'], 'sourceHeading': row['source_heading'],
        'timeKind': row['time_kind'], 'timeRelation': row['time_relation'],
        'sortYear': row['sort_year'], 'subjectKind': row['subject_kind'],
        'realization': row['realization'], 'coverage': row['coverage'],
        'stateId': row['state_ref'], 'revision': row['description_revision'],
        'sourceRevision': row['source_revision'],
        'sourcePaths': parsed(row['source_paths_json'], []),
        'normalizationProfile': row['normalization_profile'],
        'stopCount': row['stop_count'], 'componentCount': row['component_count'],
        'stopListAvailability': 'captured_stop_rows' if row['stop_count'] > 0 else 'no_captured_stop_rows',
        'coverageSummary': coverage_summary(row['stop_count'], row['component_count']),
        'source': {'id': row['source_record_id'], 'source': row['source_key'], 'url': row['source_url']},
    }


def technical_facts(conn, organ_id, *, quality=False):
    """Bounded organ read shared by summary matrices and account details."""
    rows = conn.execute(f'''select f.*,m.source_key,m.source_url
        from {SCHEMA}.technical_fact f
        left join {SCHEMA}.source_membership m using(source_record_id)
        where f.organ_mdvs_id=%(organ)s order by f.family,f.fact_id''', {'organ':organ_id}).fetchall()
    evidence = {}
    if quality:
        evidence = {r['fact_id']:parsed(r['evidence_json'],{}) for r in conn.execute(
            f'''select e.* from {SCHEMA}.technical_fact_evidence e
                join {SCHEMA}.technical_fact f using(fact_id) where f.organ_mdvs_id=%(organ)s''',
            {'organ':organ_id}).fetchall()}
    facts = [{
        'id': f['fact_id'], 'family': f['family'], 'label': f['label'],
        'value': f['display_value'] if f['display_value'] not in (None, '') else str(f['normalized_number'] if f['normalized_number'] is not None else ''),
        'normalizedNumber': f['normalized_number'], 'sourcePath': f['source_path'], 'revision': f['evidence_sha256'],
        'sourceWording': '\n'.join(e['wording'] for e in evidence.get(f['fact_id'], {}).get('evidence', [])) or f['display_value'] or f['label'],
        'sourceRecordId': f['source_record_id'], 'source': f.get('source_key'), 'sourceUrl': f.get('source_url'),
        'conflictState': f.get('conflict_state'), 'sourceConflictState': f.get('conflict_state'), 'summaryEvidence': evidence.get(f['fact_id']),
    } for f in rows]
    if quality:
        from .public_aggregate_quality import qualify_public_fact
        facts = [qualify_public_fact(f) for f in facts]
    return compare_technical_facts(facts)[0]


def attach_facts(descriptions, facts):
    by_source = {}
    for fact in facts:
        by_source.setdefault(fact['sourceRecordId'], []).append(fact)
    for description in descriptions:
        # Main source-record assertions are never inherited by dated alternative
        # accounts just because their publisher/source record is the same.
        account_facts = by_source.get(description['source']['id'], []) if description['kind'] == 'main' else []
        account_facts = [{**f} for f in account_facts]
        for fact in account_facts:
            captured = description['stopCount'] if fact['family'] == 'stop_total' else None
            reported = fact.get('normalizedNumber')
            # Zero captured rows describes an unavailable capture, not a
            # contradictory source assertion of zero stops.
            if captured and reported is not None and reported != captured:
                fact.update(comparisonKind='source_summary_vs_captured_rows', capturedComponentCount=captured)
        description['technicalFacts'] = account_facts
        description['coverageSummary'] = coverage_summary(description['stopCount'], description['componentCount'], account_facts)
    return descriptions


def chronology(conn, descriptions):
    if not descriptions: return descriptions
    rows = conn.execute(f"select * from {SCHEMA}.configuration_evidence where description_id=ANY(%(ids)s)", {"ids":[d["id"] for d in descriptions]}).fetchall()
    evidence = {r["description_id"]:parsed(r["evidence_json"], {}) for r in rows}
    return [{**d, "chronology":evidence.get(d["id"])} for d in descriptions]


def index(conn, organ_id: str, *, history=False, quality=False):
    rows = conn.execute(f'''select d.*,m.source_key,m.source_url
        from {SCHEMA}.specification_description d
        join {SCHEMA}.source_membership m using(source_record_id)
        where d.organ_mdvs_id=%(id)s
        order by case when d.coverage='retained_source_transfer' then 4
                      when d.description_kind='main' and d.stop_count>0 then 0
                      when d.realization='reported' and d.stop_count>0 then 1
                      when d.stop_count>0 then 2 else 3 end,
                 case when d.source_record_id like 'sr:orgbase:%%' then 0 else 1 end,
                 d.sort_year desc nulls last,d.description_id''', {'id':organ_id}).fetchall()
    result = attach_facts([summary(row) for row in rows], technical_facts(conn, organ_id, quality=quality)) if rows else []
    return chronology(conn, result) if history else result


def detail(conn, organ_id: str, description_id: str, *, history=False, quality=False):
    row = conn.execute(f'''select d.*,m.source_key,m.source_url
        from {SCHEMA}.specification_description d
        join {SCHEMA}.source_membership m using(source_record_id)
        where d.organ_mdvs_id=%(organ)s and d.description_id=%(description)s''',
        {'organ':organ_id,'description':description_id}).fetchone()
    if not row: return None
    result = chronology(conn, [summary(row)])[0] if history else summary(row)
    groups = OrderedDict(); facts = []; other = []
    if row['description_kind'] == 'main':
        components = conn.execute(f'''select * from {SCHEMA}.specification_component
            where organ_mdvs_id=%(organ)s and source_record_id=%(source)s
              and label_disclosure_state not like 'excluded_%%'
            order by coalesce(division_label,''),source_path,component_id''',
            {'organ':organ_id,'source':row['source_record_id']}).fetchall()
        def position(c):
            match = re.search(r'\[(\d+)\]$',c['source_path'])
            return int(match[1]) if match else 0
        components.sort(key=lambda c: (c.get('division_label') or '', position(c),c['component_id']))
        for c in components:
            if c['component_type'] not in {'stop','coupler','accessory'}:
                other.append({'id':c['component_id'],'kind':c['component_type'],'label':c['label'],'detail':parsed(c.get('detail_json'),{}),'sourcePaths':[c['source_path']]})
                continue
            division = c['division_label'] or 'Unspecified division'
            group = groups.setdefault(division, {'label':division,'compass':None,'entries':[]})
            value = parsed(c.get('detail_json'), {})
            pitch = c.get('pitch_label')
            label = c['label']
            if pitch and row['source_key'] == 'orgbase':
                label = re.sub(r'\s+'+re.escape(pitch)+r"\s*['′]?\s*[-–—]?\s*$",'',label)
            mixture = value.get('mixture')
            if mixture and str(mixture).lower() not in {'true','false'} and not re.search(r'\b(?:[IVX]+|fach|ranks|sterk)\b',label):
                label += ' · ' + str(mixture) + ' ranks'
            group['entries'].append({'id':c['component_id'],'kind':c['component_type'],'label':label,'pitch':pitch,
                'wording':value.get('raw_str') or c['label'], 'detail':value,
                'wordingKind':'structured_component_label','sourcePaths':[c['source_path']],
                'dates':value.get('dates',[]),'recoveredFromHeading':False})
        facts = [f for f in technical_facts(conn, organ_id, quality=quality) if f['sourceRecordId'] == row['source_record_id']]
    else:
        components = conn.execute(f'''select * from {SCHEMA}.specification_description_component
            where description_id=%(id)s order by division_position,position,component_id''',{'id':description_id}).fetchall()
        for c in components:
            key = c['division_position']
            group = groups.setdefault(key,{'label':c['division_label'],'compass':c['division_compass'],'entries':[]})
            value=parsed(c['detail_json'],{})
            group['entries'].append({'id':c['component_id'],'kind':c['component_type'],'label':c['label'],'pitch':c['pitch_label'],
                'wording':c['source_wording'],'detail':value,'wordingKind':'source_entry','sourcePaths':parsed(c['source_paths_json'],[]),
                'dates':value.get('dates',[]),'recoveredFromHeading':value.get('recoveredFromHeading',False)})
    def group_order(g):
        name=g['label'].casefold()
        return (0 if re.match(r'^(hoofdwerk|hauptwerk|manual|manuaal|grand)',name) else 2 if re.match(r'^(pedal|pedaal|pédale)',name) else 1,name)
    result.update(groups=sorted(groups.values(),key=group_order),otherComponents=other)
    # Reuse index scoping and capture semantics in the selected account.
    attach_facts([result], facts)
    return result
