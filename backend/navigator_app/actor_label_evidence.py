"""Retain exact source labels beside conservative organization display normalization."""
import json
CONTRACT = "modavis.source-quality-closure/v1"

def read_evidence(rows, identifiers):
    if not identifiers or rows("select value from metadata where key=?", ("actor_label_interpretation_contract",)) != [{"value": CONTRACT}]:
        return {}
    records = rows("select * from actor_label_interpretation where actor_mdvs_id in (" + ",".join("?" for _ in identifiers) + ") order by actor_mdvs_id", identifiers)
    return {r["actor_mdvs_id"]: json.loads(r["evidence_json"]) for r in records}

def read_public(conn, identifiers):
    def rows(sql, params):
        for table in ("actor_label_interpretation", "metadata"):
            sql = sql.replace("from " + table, "from release_1_5_public." + table)
        return conn.execute(sql.replace("?", "%s"), tuple(params)).fetchall()
    return read_evidence(rows, identifiers)
