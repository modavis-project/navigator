"""Recount restored source occurrences without rewriting preserved summary assertions."""
def restored_capture_comparison(fact,components):
    family=fact['family']
    if family not in {'manual_total','stop_total'}:return None
    rows=[c for c in components if c['source_record_id']==fact['source_record_id'] and str(c['component_id']).startswith(('component:restored:','component:segmented:'))]
    if not rows:return None
    selected=[c for c in rows if c['component_type']=='stop'] if family=='stop_total' else [c for c in rows if c['component_type']=='keyboard' and str(c.get('source_path') or '').startswith('specifications.manuals[')]
    count=len(selected)
    return {'sourceRecordId':fact['source_record_id'],'family':family,'capturedRows':count if count else None,
            'reportedTotal':fact.get('normalized_number'),'disagrees':bool(count and fact.get('normalized_number') is not None and count!=fact['normalized_number']),
            'semantics':'Captured source occurrences; not independent physical parts or a present-condition claim.'}
