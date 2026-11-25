"""Build Navigator's compact administrative boundary overlay from local source files."""

import argparse
from collections import defaultdict
import gzip
import json
from pathlib import Path
import re

from shapely import get_parts, make_valid
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union


COUNTRY_ALIASES = {
    "ARM": ["Հայաստան"],
    "BEL": ["België / Belgique / Belgien"],
    "BGR": ["Бългaрия"],
    "BHS": ["The Bahamas"],
    "CHE": ["Schweiz/Suisse/Svizzera/Svizra"],
    "CHN": ["中国"],
    "DZA": ["Algérie / ⵍⵣⵣⴰⵢⴻⵔ / الجزائر"],
    "EST": ["Eesti"],
    "FIN": ["Suomi"],
    "HRV": ["Hrvatska"],
    "IRL": ["Éire / Ireland"],
    "ISL": ["Ísland"],
    "LTU": ["Lietuva"],
    "LUX": ["Lëtzebuerg"],
    "LVA": ["Latvija"],
    "MAR": ["Maroc ⵍⵎⵖⵔⵉⴱ المغرب"],
    "NZL": ["New Zealand / Aotearoa"],
    "ROU": ["România"],
    "SRB": ["Србија"],
    "SVK": ["Slovensko"],
    "SVN": ["Slovenija"],
}

# Statistics Denmark's names attached to the five corresponding Natural Earth IDs.
DANISH_REGIONS = {
    "DNK-3416": "Region Midtjylland",
    "DNK-3417": "Region Syddanmark",
    "DNK-3418": "Region Nordjylland",
    "DNK-3419": "Region Hovedstaden",
    "DNK-3420": "Region Sjælland",
}

NAME_FIELDS = {"name", "name_long", "name_ciawf", "name_local"}
MUNICIPALITY = ("municipality", "town")
INDEPENDENT_CITIES = {"Kreisfreie Stadt", "Stadtkreis"}
GERMANY = ("Deutschland",)


def features(directory, name):
    return json.loads((directory / f"{name}.json").read_bytes())["features"]


def distinct(names):
    return sorted({str(value).strip() for value in names if value and value != "-99" and str(value).strip()})


def names_from(feature):
    return distinct(value for key, value in feature.items() if key in NAME_FIELDS
                    or re.fullmatch(r"name_[a-z]{2,3}", key))


def polygonal(geometry):
    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        return geometry
    if geometry.geom_type == "GeometryCollection":
        return unary_union([polygonal(part) for part in geometry.geoms])
    return MultiPolygon()


def rounded(coordinates):
    if isinstance(coordinates, (tuple, list)):
        return [rounded(item) for item in coordinates]
    return round(coordinates, 5) or 0


def boundary(records, *, key, source, rank, names, roles, parents=(), tolerance):
    raw = unary_union([polygonal(make_valid(shape(item["geometry"]))) for item in records if item["geometry"]])
    geometry = polygonal(make_valid(raw.simplify(tolerance, preserve_topology=True)))
    if geometry.is_empty:
        return None
    anchor = max(get_parts(geometry), key=lambda part: part.area).representative_point()
    return {
        "key": key,
        "source": source,
        "rank": rank,
        "roles": roles,
        "names": distinct(names),
        "parents": parents,
        "label": rounded((anchor.x, anchor.y)),
        "geometry": {"type": geometry.geom_type, "coordinates": rounded(mapping(geometry)["coordinates"])},
    }


def by_code(items):
    groups = defaultdict(list)
    for item in items:
        properties = item["properties"]
        # BKG distinguishes land territory from separate maritime areas.
        if properties["gf"] == 4:
            groups[properties["ags"]].append(item)
    return groups


def county_names(properties):
    name, kind = properties["gen"], properties["bez"]
    if kind in {"Landkreis", "Kreis", "Regionalverband", "Städteregion"} and not name.startswith(kind + " "):
        return distinct([name, f"{kind} {name}"])
    return [name]


def state_names(properties):
    name, kind = properties["gen"], properties["bez"]
    if kind in {"Freistaat", "Freie Hansestadt", "Freie und Hansestadt"}:
        return [name, f"{kind} {name}"]
    return [name]


def build(data):
    countries = {}
    output = []
    for item in features(data, "countries"):
        p = {k.lower(): v for k, v in item["properties"].items()}
        code = p["adm0_a3"]
        names = distinct([*names_from(p), *COUNTRY_ALIASES.get(code, ())])
        countries[code] = names
        output.append(boundary([item], key=code, source="natural-earth", rank=0, names=names,
                               roles=("country",), tolerance=.05))
    for item in features(data, "subdivisions"):
        p = item["properties"]
        code = p["adm0_a3"]
        if code == "DEU" or code not in countries:
            continue
        names = names_from(p)
        if p.get("name_alt"):
            names.extend(re.split(r"\s*[|;]\s*", p["name_alt"]))
        if code == "USA" and p.get("postal"):
            names.append(p["postal"])
        if p["adm1_code"] in DANISH_REGIONS:
            names.append(DANISH_REGIONS[p["adm1_code"]])
        output.append(boundary([item], key=p["adm1_code"], source="natural-earth", rank=1, names=names,
                               roles=("region",), parents=[countries[code]], tolerance=.017))

    states = by_code(features(data, "states"))
    counties = by_code(features(data, "counties"))
    for code, items in states.items():
        # Hamburg and Berlin's municipal and Land boundaries coincide.
        roles = ("region", *MUNICIPALITY) if code in {"02", "11"} else ("region",)
        output.append(boundary(items, key=code, source="bkg", rank=1, names=state_names(items[0]["properties"]), roles=roles,
                               parents=[GERMANY], tolerance=.009))
    for code, items in counties.items():
        if code in {"02000", "11000"}:
            continue  # Berlin and Hamburg are already offered at state scale.
        p = items[0]["properties"]
        land = states[p["sn_l"]][0]["properties"]
        roles = MUNICIPALITY if p["bez"] in INDEPENDENT_CITIES else ("county",)
        names = [p["gen"]] if roles == MUNICIPALITY else county_names(p)
        parents = [state_names(land), GERMANY]
        output.append(boundary(items, key=code, source="bkg", rank=2, names=names, roles=roles,
                               parents=parents, tolerance=.003))
    for code, items in by_code(features(data, "municipalities")).items():
        p = items[0]["properties"]
        county_code = p["sn_l"] + p["sn_r"] + p["sn_k"]
        county = counties.get(county_code)
        if not county:
            continue
        parent = county[0]["properties"]
        if parent["bez"] in INDEPENDENT_CITIES:
            continue  # Already offered at county scale.
        land = states[p["sn_l"]][0]["properties"]
        output.append(boundary(items, key=code, source="bkg", rank=3, names=[p["gen"]], roles=MUNICIPALITY,
                               parents=[county_names(parent), state_names(land), GERMANY], tolerance=.0007))
    for item in features(data, "neighbourhoods"):
        p = item["properties"]
        output.append(boundary([item], key=p["stadtteil_schluessel"], source="hamburg-lgv", rank=4,
                               names=[p["stadtteil_name"]], roles=("district", "locality"),
                               parents=[["Hamburg"], GERMANY], tolerance=.00013))
    return [item for item in output if item and item["names"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path, help="directory containing the six source GeoJSON documents")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    boundaries = build(args.sources)
    payload = json.dumps(boundaries, ensure_ascii=False, separators=(",", ":")).encode()
    args.output.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    print(f"{len(boundaries)} boundaries, {args.output.stat().st_size:,} compressed bytes")


if __name__ == "__main__":
    main()
