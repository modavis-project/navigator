"""Description-scoped reads for the additive public specification projection."""
from __future__ import annotations

from collections import OrderedDict
import json
import re
from typing import Any

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
        'source': {'id': row['source_record_id'], 'source': row['source_key'], 'url': row['source_url']},
    }


def chronology(conn, descriptions):
    if not descriptions: return descriptions
    rows = conn.execute(f"select * from {SCHEMA}.configuration_evidence where description_id=ANY(%(ids)s)", {"ids":[d["id"] for d in descriptions]}).fetchall()
    evidence = {r["description_id"]:parsed(r["evidence_json"], {}) for r in rows}
    return [{**d, "chronology":evidence.get(d["id"])} for d in descriptions]


def index(conn, organ_id: str, *, history=False):
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
    result = [summary(row) for row in rows]
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
        fact_rows = conn.execute(f'''select fact_id,family,label,display_value,normalized_number,source_path,evidence_sha256
            from {SCHEMA}.technical_fact where organ_mdvs_id=%(organ)s and source_record_id=%(source)s
            order by family,fact_id''',{'organ':organ_id,'source':row['source_record_id']}).fetchall()
        facts = [{'id':f['fact_id'],'family':f['family'],'label':f['label'],'value':f['display_value'] or str(f['normalized_number'] if f['normalized_number'] is not None else ''),'sourcePath':f['source_path'],'revision':f['evidence_sha256']} for f in fact_rows]
        if quality:
            from .public_aggregate_quality import qualify_public_fact
            evidence={x['fact_id']:parsed(x['evidence_json'],{}) for x in conn.execute(f"select e.* from {SCHEMA}.technical_fact_evidence e join {SCHEMA}.technical_fact f using(fact_id) where f.organ_mdvs_id=%(organ)s and f.source_record_id=%(source)s",{'organ':organ_id,'source':row['source_record_id']}).fetchall()}
            facts=[qualify_public_fact({**f,'summaryEvidence':evidence.get(f['id'])}) for f in facts]
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
    result.update(groups=sorted(groups.values(),key=group_order),technicalFacts=facts,otherComponents=other)
    return result
