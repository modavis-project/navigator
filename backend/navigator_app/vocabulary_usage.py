"""Read-only, snapshot-bound source wording navigation; no concept promotion."""
import hashlib
import json
import sqlite3
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode, quote
from flask import jsonify, request, Response
from .research_workbench import norm, canonical, EXPORT_LIMIT
from .organological_research import organ_url
from .exploration_policy import bucket_sql

FAMILIES = {'activities': 'Events and activities', 'stops': 'Stops', 'divisions': 'Divisions'}
METHOD = 'Case and whitespace normalize lookup keys only. Original labels, punctuation, pitches and source accounts remain distinct evidence. Text matches do not establish synonymy or physical identity.'
PAGE = 30


def usage(work, family, args, export=False):
    if family not in FAMILIES:
        raise LookupError('Unknown terminology collection')
    allowed = {'q', 'term', 'match', 'page', 'section', 'snapshot', 'sort', 'source', 'dimension', 'bucket', 'organ_q'}
    if set(args) - allowed:
        raise ValueError('Unsupported terminology filter')
    if any(len(v) > 500 for v in args.values()):
        raise ValueError('Terminology parameter too long')
    if args.get('snapshot') and args['snapshot'] != work.manifest['core']['sha256']:
        raise RuntimeError('Requested terminology snapshot is unavailable')
    page = int(args.get('page', '0'))
    section = args.get('section', 'occurrences')
    match = args.get('match', 'exact')
    if page < 0 or page > 100000 or section not in {'occurrences', 'organs'} or match not in {'exact', 'contains'}:
        raise ValueError('Invalid page, section or match mode')
    sort = args.get('sort', 'frequency')
    if sort not in {'frequency','alphabetical'}:raise ValueError('Invalid wording order')
    term = args.get('term')
    if term is not None and not norm(term):
        raise ValueError('A nonempty term is required')
    if term is not None and args.get('q'):
        raise ValueError('Use a term or a collection search, not both')
    organ_query = norm(args.get('organ_q', ''))
    if organ_query and term is None:
        raise ValueError('Select a term before searching related organs')
    if export and term is None:
        raise ValueError('Choose a term before exporting evidence')
    binding = {'publicCoreSha256': work.manifest['core']['sha256'], 'researchIndexSha256': work.manifest['index']['sha256'], 'methodSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'groupingPolicySha256': hashlib.sha256(Path(__file__).with_name('exploration_policy.py').read_bytes()).hexdigest()}
    def href(word, mode='exact'):
        return '/vocab/usage/' + family + '?' + urlencode({'term': word, 'match': mode, 'snapshot': binding['publicCoreSha256'], **({'source':args['source']} if args.get('source') else {}), **({'organ_q':args['organ_q']} if organ_query else {}), **({k:args[k] for k in ('dimension','bucket')} if args.get('dimension') else {})})
    where = 'kind=?'
    values = [family]
    lookup = term if term is not None else args.get('q', '')
    if lookup:
        if term is not None and match == 'exact':
            where += ' and search=?'; values.append(norm(lookup))
        else:
            where += " and search like ? escape '\\'"; values.append('%' + norm(lookup).replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%')
    unscoped_where, unscoped_values = where, list(values)
    if args.get('source'):
        where += ' and source_key=?'; values.append(args['source'])
    if bool(args.get('dimension')) != ('bucket' in args):raise ValueError('Choose both a distribution dimension and bucket')
    if args.get('dimension'):
        if term is None:raise ValueError('Select a term before a distribution group')
        if args['dimension'] not in ('source','country','period','pitch','division'):raise ValueError('Invalid distribution dimension')
        where += ' and '+bucket_sql(args['dimension'])+'=?';values.append(args['bucket'])
        unscoped_where += ' and '+bucket_sql(args['dimension'])+'=?';unscoped_values.append(args['bucket'])
    offset = page * PAGE
    with work.connect(20 if export else 10) as c:
        if term is None:
            total = c.execute('select count(distinct search) from term_occurrence where ' + where, values).fetchone()[0]
            order = 'count(*) desc,search' if sort == 'frequency' else 'search'
            ordering_values = []
            if lookup:
                order = 'case when search=? then 0 else 1 end,' + order
                ordering_values = [norm(lookup)]
            keys = list(c.execute('select search,count(*) occurrences from term_occurrence where ' + where + ' group by search order by ' + order + ' limit ? offset ?', values + ordering_values + [PAGE, offset]))
            items = []
            for key in keys:
                row = c.execute('select label from term_occurrence where kind=? and search=?'+(' and source_key=?' if args.get('source') else '')+' order by id limit 1', [family,key['search']]+([args['source']] if args.get('source') else [])).fetchone()
                items.append({'label':row['label'],'key':key['search'],'occurrences':key['occurrences'],'href':href(row['label'])})
            candidates = [json.loads(r[0]) for r in c.execute('select payload from seed_concept order by id')] if work.manifest.get('terminologySeedSha256') else []
            candidates = [x for x in candidates if any(m['family'] == family for m in x['mappings'])]
            return {**binding, 'sort': sort, 'candidateConcepts': candidates, 'family': family, 'title': FAMILIES[family], 'query': args.get('q', ''), 'items': items, 'total': total, 'offset': offset, 'limit': PAGE, 'hasMore': offset + len(items) < total, 'countUnit': 'distinct case/spacing-normalized source wordings', 'method': METHOD}
        # Materialize matching rows once: repeated LIKE scans can choose a pitch
        # index and exceed the budget on a cold VPS despite a small result set.
        columns = ['id','kind','organ','source','source_key','description','label','search','pitch','division','country','year','date_kind','concept','source_path']
        row_json = "json_object(" + ','.join("'"+k+"',"+k for k in columns) + ")"
        page_limit = str(EXPORT_LIMIT) if export else str(PAGE)
        if export:
            offset = 0
            page_limit = '(case when (select count(*) from selected)>'+str(EXPORT_LIMIT)+' then 0 else '+str(EXPORT_LIMIT)+' end)'
        if section == 'organs' and not export:
            page_sql = "select json_group_array(json_object('organ',organ,'occurrences',occurrences)) from (select organ,count(*) occurrences from selected group by organ order by organ limit "+page_limit+" offset ?)"
        else:
            page_sql = 'select json_group_array('+row_json+') from (select * from selected order by search,id,source,description limit '+page_limit+' offset ?)'
        selected_filters = ['source_key=?'] if args.get('source') else []
        selected_values = [args['source']] if args.get('source') else []
        if organ_query:
            # Filter only the materialized term cohort, with literal Unicode
            # substring matching. No corpus-wide index or data changes.
            c.create_function('usage_normalize', 1, norm, deterministic=True)
            selected_filters.append('(instr(usage_normalize(organ),?)>0 or exists(select 1 from research.organ o where o.id=matched.organ and instr(usage_normalize(o.label),?)>0))')
            selected_values += [organ_query, organ_query]
        sql = """with matched as materialized (
            select * from term_occurrence indexed by term_kind_name where """+unscoped_where+"""),
            selected as materialized (select * from matched"""+(' where '+' and '.join(selected_filters) if selected_filters else '')+""")
            select
            (select json_object('occurrences',count(*),'organs',count(distinct organ),'sourceRecords',count(distinct source),'accounts',count(distinct description),'wordings',count(distinct label)) from selected),
            (select json_group_array(json_object('label',label,'occurrences',occurrences)) from (select label,count(*) occurrences from selected group by label order by label limit 30)),
            (select json_group_array(json_object('concept',concept,'occurrences',occurrences)) from (select concept,count(*) occurrences from selected group by concept order by concept)),
            (select json_group_array(json_object('source_key',source_key,'occurrences',occurrences)) from (select source_key,count(*) occurrences from matched group by source_key order by source_key)),
            ("""+page_sql+')'
        result = c.execute(sql, unscoped_values+selected_values+[offset]).fetchone()
        counts, variants, mapping_rows, sources, page_items = [json.loads(v) for v in result]
        if not counts['occurrences'] and not organ_query:
            raise LookupError('No recorded occurrences match this term and match mode')
        if export and counts['occurrences'] > EXPORT_LIMIT:
            raise OverflowError('This selection exceeds the 50,000-occurrence export budget. Choose exact wording or a source; no partial export was produced.')
        for v in variants:v['href'] = href(v['label'])
        mappings = []
        for r in mapping_rows:
            x = dict(r); code = r['concept']; concept = c.execute('select payload_json,scheme_code,concept_code from core.vocabulary_concept where concept_code=? or mdvs_id=?', (code, code)).fetchone() if code else None
            seed = c.execute('select payload from seed_concept where id=?', (code,)).fetchone() if code and work.manifest.get('terminologySeedSha256') else None
            x.update(status='controlled' if concept else 'candidate' if seed else 'unmapped', definition=json.loads(concept[0]) if concept else json.loads(seed[0]) if seed else None, href='/vocab/'+quote(concept[1],safe='')+'/concepts/'+quote(concept[2],safe='') if concept else None)
            mappings.append(x)
        if section == 'organs' and not export:
            rows = page_items
            items = []
            for r in rows:
                label = c.execute('select label from research.organ where id=?', (r['organ'],)).fetchone()
                items.append({**dict(r), 'label': label[0] if label else r['organ'], 'href': organ_url(r['organ'])})
            total = counts['organs']
        else:
            total = counts['occurrences']
            if export:offset = 0
            items = page_items
            for x in items:
                label = c.execute('select label from research.organ where id=?', (x['organ'],)).fetchone()
                x['organLabel'] = label[0] if label else x['organ']; x['organHref'] = organ_url(x['organ'])
                x['href'] = '/events/'+quote(x['id'],safe='') if family=='activities' else x['organHref']+'?'+urlencode({'tab':'specification','description':x['description'] or ''})
                member = c.execute('select source_url,source_revision_sha256,native_identifier from core.source_membership where source_record_id=?', (x['source'],)).fetchone()
                x['sourceEvidence'] = dict(member) if member else None
        selection = {'family':family,'term':norm(term),'match':match,'source':args.get('source',''),**({'organQuery':organ_query} if organ_query else {}),**({k:args[k] for k in ('dimension','bucket')} if args.get('dimension') else {})}
        return {**binding,'organQuery':args.get('organ_q',''),'sourceOptions':sources,'family':family,'term':term,'match':match,'status':'source_wording','canonicalConceptInferred':False,'method':METHOD,'counts':counts,'variants':variants,'variantsTruncated':len(variants)<counts['wordings'],'mappings':mappings,'items':items,'section':section,'total':total,'offset':offset,'limit':EXPORT_LIMIT if export else PAGE,'hasMore':False if export else offset+len(items)<total,'completeSelection':export,'href':href(term,match),'selectionSha256':hashlib.sha256(canonical({'binding':binding,'selection':selection}).encode()).hexdigest()}


def register_vocabulary_usage(app):
    @lru_cache(maxsize=96)
    def cached(family, args):
        return canonical(usage(app.extensions['research_workbench'], family, dict(args)))

    @app.get('/api/vocab/usage/<family>')
    @app.get('/api/vocab/usage/<family>/export')
    def route(family):
        work = app.extensions.get('research_workbench')
        if work is None:return jsonify({'error':'Source terminology is unavailable for this snapshot'}),503
        try:
            work.assert_binding()
            args = dict(request.args)
            export = request.path.endswith('/export')
            content = canonical(usage(work,family,args,True)) if export else cached(family,tuple(sorted(args.items())))
            response = Response(content+'\n',mimetype='application/json')
            response.headers['Cache-Control'] = 'private, max-age=60'
            if export:response.headers['Content-Disposition']='attachment; filename="modavis-source-terminology.json"'
            return response
        except LookupError as e:return jsonify({'error':str(e)}),404
        except RuntimeError as e:return jsonify({'error':str(e)}),409
        except OverflowError as e:return jsonify({'error':str(e)}),422
        except (ValueError,TypeError) as e:return jsonify({'error':str(e)}),400
        except sqlite3.OperationalError:return jsonify({'error':'Terminology query exceeded its budget. Narrow the search; no partial results were returned.'}),503
