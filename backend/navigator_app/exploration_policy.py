"""Fixed grouping policy for read-only terminology research."""
DIMENSIONS = {'source': 'source_key', 'country': 'country', 'pitch': 'pitch', 'division': 'division'}
FAMILIES = ('activities', 'stops', 'divisions')

def bucket_sql(dimension):
    if dimension == 'all': return "'all'"
    if dimension == 'period':
        return "case when date_kind in ('year','exact') and year between 1 and 2100 then 'y:'||cast(cast(year/50 as integer)*50 as text) else 'd:'||coalesce(nullif(date_kind,''),'undated') end"
    field = DIMENSIONS[dimension]
    return "case when trim(coalesce("+field+",''))='' then 'u:' else 'v:'||"+field+" end"

def bucket_label(dimension, bucket):
    if bucket == 'u:': return 'Unrecorded'
    if bucket.startswith('y:'):
        y = int(bucket[2:]); return str(max(1,y))+'–'+str(y+49)
    if bucket.startswith('d:'): return bucket[2:].replace('_',' ')+' · no single established year'
    return bucket[2:] if bucket.startswith('v:') else bucket

COUNTS = "count(*) occurrences,count(distinct organ) organs,count(distinct source) sourceRecords,count(distinct description) accounts,count(distinct id) records"
POLICY = 'Case/spacing-normalized term lookup; literal source, listing country, pitch and division buckets. Only year/exact dates enter 50-year periods; intervals, source listings and unknown dates stay separate. Each denominator counts all recorded entries of this family before term matching, in the same source scope and bucket. Accounts and organs can occur in multiple buckets; their bucket totals are not additive. No absence, synonymy, historical location, source independence or builder identity is inferred.'
