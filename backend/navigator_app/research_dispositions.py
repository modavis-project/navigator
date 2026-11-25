"""Find captured stop combinations within retained specification accounts."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from itertools import groupby
from pathlib import Path
from urllib.parse import urlencode

from .organological_research import organ_url
from .public_query_identity import semantic_query_identity


CONTRACT = "modavis.disposition-finder/v1"
QUERY_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
PAGE_SIZE = 50
MAX_MATCH_ROWS = 100_000
MAX_EXPORT_RECORDS = 50_000
METHOD = (
    "All criteria require distinct captured stop rows in the same retained source account. "
    "The named division scope also requires the same documented division grouping. "
    "Labels match after case and spacing normalization. A terminal pitch may be separated when it agrees with the recorded pitch field. "
    "Pitch matching accepts equivalent foot marks and fraction typography. "
    "Results describe captured evidence, including explicitly identified recovered rows. "
    "They establish neither current condition nor the absence of uncaptured stops."
)
_UNNAMED = {
    "", "unspecified", "unspecified division", "unassigned", "unknown", "unknown division",
    "not specified", "not recorded", "division unspecified", "unlabeled", "unlabelled",
}
_NESTED_DIVISION = re.compile(r"^(.+\.\w+\[\d+\])\.stops\[\d+\]$")
_ROW_POSITION = re.compile(r"\[(\d+)\]$")
_VULGAR = "¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"


def label_key(value: str) -> str:
    return " ".join(value.casefold().split())


def pitch_key(value: str | None) -> str:
    text = re.sub(rf"(?<=\d)(?=[{_VULGAR}])", " ", value or "")
    text = unicodedata.normalize("NFKC", text).replace("⁄", "/")
    return " ".join(text.rstrip(" '’′").casefold().split())


def _label_matches(label: str, pitch: str | None, wanted: str) -> bool:
    label = label_key(label)
    if label == wanted:
        return True
    prefix = wanted + " "
    return label.startswith(prefix) and bool(pitch_key(pitch)) and pitch_key(label[len(prefix):]) == pitch_key(pitch)


def validate_disposition_stops(operands: list[str]) -> list[dict]:
    if not 2 <= len(operands) <= 4:
        raise ValueError("Supply two to four stop criteria")
    criteria = []
    for operand in operands:
        label, _, pitch = operand.partition("|")
        label, pitch = label.strip(), pitch.strip()
        if (not label or len(label) > 100 or len(pitch) > 24 or "|" in pitch
                or re.search(r"[\x00-\x1f\x7f]", operand) or (pitch and not pitch_key(pitch))):
            raise ValueError("Each stop needs a label of 1–100 characters and an optional pitch of up to 24 characters")
        criteria.append({"label": label, "pitch": pitch or None})
    return criteria


def _source_json(value, default):
    return json.loads(value) if value else default


def _main_division_path(path: str, detail: dict) -> tuple[str, int | None]:
    fragment = detail.get("sourceFragment") or {}
    heading = detail.get("sourceHeading") or {}
    if fragment.get("sourcePath") and isinstance(heading.get("start"), int):
        return f"{fragment['sourcePath']}#heading={heading['start']}", None
    if match := _NESTED_DIVISION.fullmatch(path):
        return match[1], int(_ROW_POSITION.search(match[1])[1])
    return "named", None


def _row_evidence(row) -> tuple[tuple, dict, dict]:
    detail = _source_json(row["detail_json"], {})
    division = row["division_label"] or None
    if row["description_kind"] == "main":
        path = row["component_source_path"]
        locator, division_position = _main_division_path(path, detail)
        division_key = (locator, division)
        position = _ROW_POSITION.search(path)
        position = int(position[1]) if position else (detail.get("sourceRowSpan") or {}).get("start")
        wording = detail.get("sourceRowWording") or detail.get("raw_str") or row["component_label"]
        source_paths = [path]
    else:
        division_position = row["division_position"]
        division_key = (division_position, division)
        position = row["position"]
        wording = row["source_wording"]
        source_paths = _source_json(row["component_source_paths_json"], [])
    recovered = bool(detail.get("recoveredFromHeading")) or detail.get("contract") == "modavis.annotated-stop-row-recovery/v1"
    evidence = {
        "id": row["component_id"], "position": position, "divisionPosition": division_position,
        "division": division, "label": row["component_label"], "pitch": row["pitch_label"],
        "sourceWording": wording, "sourcePaths": source_paths,
        "evidenceKind": "recovered" if recovered else "retained",
    }
    return division_key, {"position": division_position, "label": division}, evidence


def _assign_rows(matches: list[dict]) -> dict[int, str] | None:
    """Find distinct witnesses even when criteria have overlapping candidate rows."""
    assigned: dict[str, int] = {}

    def assign(index: int, seen: set[str]) -> bool:
        for row_id in matches[index]:
            if row_id in seen:
                continue
            seen.add(row_id)
            if row_id not in assigned or assign(assigned[row_id], seen):
                assigned[row_id] = index
                return True
        return False

    for index in sorted(range(len(matches)), key=lambda i: len(matches[i])):
        if not assign(index, set()):
            return None
    return {index: row_id for row_id, index in assigned.items()}


def _matching_rows(connection, criteria, scope):
    connection.create_function("disposition_pitch", 1, pitch_key, deterministic=True)
    connection.create_function("disposition_label_matches", 3, _label_matches, deterministic=True)
    normalized = [(label_key(criterion["label"]), pitch_key(criterion["pitch"])) for criterion in criteria]

    def mask(label, pitch):
        key = label_key(label)
        candidates = [(index, wanted_pitch) for index, (wanted, wanted_pitch) in enumerate(normalized)
                      if key == wanted or (key.startswith(wanted + " ") and _label_matches(key, pitch, wanted))]
        if not candidates:
            return 0
        captured_pitch = pitch_key(pitch)
        return sum(1 << index for index, wanted_pitch in candidates if not wanted_pitch or wanted_pitch == captured_pitch)

    connection.create_function("disposition_stop_mask", 2, mask, deterministic=True)
    selections = []
    operands = []
    for index, (label, pitch) in enumerate(normalized):
        selections.append(
            f"""select {index} as criterion, id, description, organ, source, 'main' as lane,
                       division, source_path, null as division_position
                from term_occurrence indexed by term_kind_name
                where kind='stops' and search>=? and search<? and description is not null
                  and disposition_label_matches(search,pitch,?)
                  {"and disposition_pitch(pitch)=?" if pitch else ""}"""
        )
        # The next codepoint after an ASCII space bounds the exact name and
        # any appended, separately recorded pitch, without a wildcard scan.
        operands.extend((label, label + "!", label))
        if pitch:
            operands.append(pitch)
    union = " union all ".join(selections)
    alternative_operands = list(range(len(criteria)))
    recovered_fields = """
        case when match.lane='main' and match.source_path like '%.raw_spec#%' then (
            select json_object('start',json_extract(recovered.detail_json,'$.sourceHeading.start'),
                               'path',json_extract(recovered.detail_json,'$.sourceFragment.sourcePath'))
            from core.specification_component recovered
            where recovered.component_id=match.id and recovered.organ_mdvs_id=match.organ
                and recovered.source_record_id=match.source
        ) end as recovered_heading
    """ if scope == "division" else "null as recovered_heading"
    return connection.execute(f"""
        with criteria(criterion) as (values {','.join('(?)' for _ in criteria)}),
        alternative_candidates as materialized (
            select component_id, description_id, division_label, division_position,
                   disposition_stop_mask(label,pitch_label) as mask
            from core.specification_description_component
            where component_type='stop' and disposition_stop_mask(label,pitch_label)>0
        ),
        matches as materialized (
            {union}
            union all
            select criteria.criterion, component.component_id, component.description_id,
                   d.organ_mdvs_id, d.source_record_id, 'alternative',
                   component.division_label, null, component.division_position
            from alternative_candidates component
            join criteria on component.mask & (1 << criteria.criterion) <> 0
            join core.specification_description d on d.description_id=component.description_id
            where d.description_kind='alternative'
        ),
        accounts as (
            select description from matches group by description
            having count(distinct criterion)=?
        )
        select match.*, {recovered_fields}
        from accounts
        join matches match on match.description=accounts.description
        join core.specification_description d on d.description_id=match.description
            and d.organ_mdvs_id=match.organ and d.source_record_id=match.source and d.description_kind=match.lane
        order by match.organ, d.sort_year is null, d.sort_year, match.description, match.criterion, match.id
        limit ?
    """, [*alternative_operands, *operands, len(criteria), MAX_MATCH_ROWS + 1])


def _membership_evidence(row):
    division = row["division"] or None
    if row["lane"] == "main":
        heading = _source_json(row["recovered_heading"], {})
        locator, position = _main_division_path(row["source_path"] or "", {
            "sourceHeading": {"start": heading.get("start")},
            "sourceFragment": {"sourcePath": heading.get("path")},
        })
        key = (locator, division)
    else:
        position = row["division_position"]
        key = (position, division)
    return key, {"position": position, "label": division}, {
        "id": row["id"], "description": row["description"],
    }


def _selected_rows(connection, selections):
    keys = sorted({(row["description"], row["id"])
                   for _, _, matches in selections for match in matches for row in match["rows"]})
    if not keys:
        return {}
    rows = connection.execute("""
        with selected as (
            select json_extract(value,'$[0]') as description, json_extract(value,'$[1]') as id
            from json_each(?)
        )
        select d.*, organ.label as organ_label, member.source_key, member.source_url,
               coalesce(main.component_id, alternative.component_id) as component_id,
               coalesce(main.label, alternative.label) as component_label,
               coalesce(main.division_label, alternative.division_label) as division_label,
               coalesce(main.pitch_label, alternative.pitch_label) as pitch_label,
               coalesce(main.detail_json, alternative.detail_json) as detail_json,
               main.source_path as component_source_path,
               alternative.source_paths_json as component_source_paths_json,
               alternative.division_position, alternative.position, alternative.source_wording
        from selected
        join core.specification_description d on d.description_id=selected.description
        join core.organ organ on organ.mdvs_id=d.organ_mdvs_id
        join core.source_membership member on member.source_record_id=d.source_record_id
        left join core.specification_component main
            on d.description_kind='main' and main.component_id=selected.id
            and main.source_record_id=d.source_record_id and main.organ_mdvs_id=d.organ_mdvs_id
            and main.component_type='stop' and main.label_disclosure_state not like 'excluded_%'
        left join core.specification_description_component alternative
            on d.description_kind='alternative' and alternative.component_id=selected.id
            and alternative.description_id=d.description_id and alternative.component_type='stop'
        where main.component_id is not null or alternative.component_id is not null
    """, (json.dumps(keys),))
    result = {(row["description_id"], row["component_id"]): row for row in rows}
    if len(result) != len(keys):
        raise RuntimeError("The disposition index and retained account evidence differ for this snapshot")
    return result


def _groups(rows, criteria_count: int, scope: str):
    divisions = {}
    for row in rows:
        division_key, division, evidence = _membership_evidence(row)
        if scope == "division" and label_key(division["label"] or "") in _UNNAMED:
            continue
        key = division_key if scope == "division" else ()
        if key not in divisions:
            divisions[key] = (division if key else None, [{} for _ in range(criteria_count)])
        divisions[key][1][row["criterion"]][evidence["id"]] = evidence
    for key, (division, matches) in sorted(divisions.items(), key=lambda group: str(group[0])):
        if (witnesses := _assign_rows(matches)) is not None:
            yield key, division, [
                {"predicateIndex": index, "witnessRowId": witnesses[index], "rows": list(candidates.values())}
                for index, candidates in enumerate(matches)
            ]


def _result(row, key: tuple, division, matches):
    description = row["description_id"]
    revision = row["description_revision"]
    organ = organ_url(row["organ_mdvs_id"])
    account = organ + "?" + urlencode({"tab": "specification", "description": description, "descriptionRevision": revision})
    division_suffix = ":" + hashlib.sha256(json.dumps(key, ensure_ascii=False).encode()).hexdigest() if key else ""
    return {
        "id": description + division_suffix, "organId": row["organ_mdvs_id"], "organLabel": row["organ_label"],
        "organHref": organ, "accountHref": account, "descriptionId": description,
        "descriptionRevision": revision, "descriptionKind": row["description_kind"],
        "sourceRevision": row["source_revision"], "sourceRecordId": row["source_record_id"],
        "source": row["source_key"], "sourceUrl": row["source_url"], "sourceHeading": row["source_heading"],
        "sourcePaths": _source_json(row["source_paths_json"], []), "periodLabel": row["period_label"],
        "timeKind": row["time_kind"], "timeRelation": row["time_relation"], "sortYear": row["sort_year"],
        "coverage": row["coverage"], "capturedStopRows": row["stop_count"],
        "capturedComponentRows": row["component_count"],
        "subjectKind": row["subject_kind"], "realization": row["realization"],
        "division": division, "matches": matches,
    }


def _include_chronology(connection, items):
    ids = sorted({item["descriptionId"] for item in items})
    if not ids:
        return
    chronology = {
        row["id"]: _source_json(row["chronology"], None)
        for row in connection.execute(
            """select id, json_extract(payload, '$.chronology') as chronology
               from work_configuration where id in (select value from json_each(?))""",
            (json.dumps(ids),),
        )
    }
    for item in items:
        item["chronology"] = chronology.get(item["descriptionId"])


def _hydrate_selections(connection, selections):
    raw = _selected_rows(connection, selections)
    items = []
    for key, division, matches in selections:
        first = None
        for match in matches:
            rows = []
            for row in match["rows"]:
                source = raw[(row["description"], row["id"])]
                first = first or source
                division_key, _, evidence = _row_evidence(source)
                if key and division_key != key:
                    raise RuntimeError("The disposition index and retained division evidence differ for this snapshot")
                rows.append(evidence)
            match["rows"] = rows
        items.append(_result(first, key, division, matches))
    _include_chronology(connection, items)
    return items


def find_dispositions(connection, values, binding, *, export: bool = False):
    scope, criteria = values["scope"], values["stop"]
    offset = 0 if export else int(values.get("page") or 0) * PAGE_SIZE
    filters = {"scope": scope, "stop": criteria}
    normalized = sorted((label_key(item["label"]), pitch_key(item["pitch"])) for item in criteria)
    semantic = semantic_query_identity(
        "dispositions", {"scope": scope, "stop": normalized},
        bindings={key: binding[key] for key in ("publicCoreSha256", "workbenchIndexSha256") if key in binding}
                 | {"dispositionQuerySha256": QUERY_SHA256},
        method=CONTRACT,
    )
    selections, organs, accounts = [], set(), set()
    total = read_rows = export_records = 0
    rows = _matching_rows(connection, criteria, scope)
    for _, account_rows in groupby(rows, lambda row: row["description"]):
        account_rows = list(account_rows)
        read_rows += len(account_rows)
        if read_rows > MAX_MATCH_ROWS:
            raise OverflowError("The disposition search exceeds its matching-row budget. Add a pitch or use more specific labels.")
        first = account_rows[0]
        for key, division, matches in _groups(account_rows, len(criteria), scope):
            organs.add(first["organ"])
            accounts.add(first["description"])
            if export:
                export_records += 1 + sum(len(match["rows"]) for match in matches)
                if export_records > MAX_EXPORT_RECORDS:
                    raise OverflowError("The disposition export exceeds its evidence-record budget. Narrow the selection.")
            if export or offset <= total < offset + PAGE_SIZE:
                selections.append((key, division, matches))
            total += 1
    items = _hydrate_selections(connection, selections)
    return {
        **binding, "dispositionContract": CONTRACT, "dispositionQuerySha256": QUERY_SHA256,
        "selectionSha256": semantic["sha256"], "semanticQuery": semantic,
        "filters": filters, "appliedFilters": filters,
        "navigationState": {"page": values["page"]} if "page" in values and not export else {},
        "method": METHOD, "unit": "named divisions" if scope == "division" else "configuration accounts",
        "total": total, "accountCount": len(accounts), "organCount": len(organs),
        "offset": offset, "limit": PAGE_SIZE, "completeSelection": export,
        "hasMore": not export and offset + len(items) < total, "items": items,
    }
