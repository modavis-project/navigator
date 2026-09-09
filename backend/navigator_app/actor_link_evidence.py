"""Shared evidence read for contextual canonical links."""
import json
CONTRACT='modavis.contextual-actor-link/v1'

def read_evidence(rows,assertions):
    if not assertions or rows('select value from metadata where key=?',('contextual_actor_link_contract',)) != [{'value':CONTRACT}]:return {}
    ids=[a['assertion_id'] for a in assertions]
    return {r['assertion_id']:json.loads(r['evidence_json']) for r in rows('select * from builder_assertion_evidence where assertion_id in ('+','.join('?' for _ in ids)+')',ids)}
