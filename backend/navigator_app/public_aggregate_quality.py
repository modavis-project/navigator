"""One qualification projection for aggregate facts in HTTP and corpus delivery."""
CONTRACT='modavis.aggregate-quality/v1'
def qualify_public_fact(fact):
    evidence=fact.get('summaryEvidence') or {}
    q=evidence.get('aggregateQualification') or {}
    if q.get('contract')!=CONTRACT:return fact
    result={**fact,'aggregateQualification':q,'normalizedNumber':q.get('normalizedNumber')}
    state=q['status']
    if state!='source_reported':
        value=str(fact.get('displayValue') or fact.get('value') or q.get('originalDisplayValue') or '')
        suffix={'suspect_source_total':'questionable source value','derived_component_count':'original captured component rows',
                'qualified_source_total':'qualified source value','unverified_transfer_total':'unverified transfer value'}[state]
        result['displayValue']=value+' ('+suffix+')';result['value']=result['displayValue']
    result['qualificationGuidance']=q['guidance']
    return result

def stop_total_expression(qualified):
    if not qualified:return 'max(normalized_number)::int'
    # Every account must be numeric and agree. Unknown/qualified accounts and
    # conflicting values cannot silently become one largest organ total.
    return 'case when count(*)=count(normalized_number) and count(distinct normalized_number)=1 then min(normalized_number)::int end'
