"""Versioned metadata and file resolution for complete dataset distributions."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any, Mapping
from urllib.parse import quote
import xml.etree.ElementTree as ET

from .uri_policy import UriPolicy


CONTRACT = "modavis.dataset-distributions/v1"
PROFILES = ("modavis", "cidoc", "pon", "edm")
PROFILE_LABELS = {
    "modavis": "MODAVIS Ontology Network",
    "cidoc": "CIDOC CRM 7.1.3",
    "pon": "Polifonia Organs Ontology 1.0",
    "edm": "Europeana Data Model",
}
RDF_XML_MEDIA_TYPE = "application/rdf+xml"
JSON_LD_MEDIA_TYPE = "application/ld+json"
NTRIPLES_MEDIA_TYPE = "application/n-triples"
GZIP_MEDIA_TYPE = "application/gzip"
NTRIPLES_MEDIA_TYPE_URI = (
    "https://www.iana.org/assignments/media-types/application/n-triples"
)
GZIP_MEDIA_TYPE_URI = "https://www.iana.org/assignments/media-types/application/gzip"
HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class DatasetDistributionError(RuntimeError):
    """Raised when the configured distribution inventory is unsafe or inconsistent."""


@dataclass(frozen=True)
class DistributionFile:
    artifact_set: str
    domain: str
    profile: str
    filename: str
    download_path: str
    bytes: int
    sha256: str
    statement_count: int


@dataclass(frozen=True)
class DatasetDistributionCatalog:
    manifest_path: Path
    manifest: Mapping[str, Any]
    roots: Mapping[str, Path]

    @classmethod
    def load(
        cls,
        manifest_path: str | Path,
        *,
        roots: Mapping[str, str | Path | None] | None = None,
    ) -> "DatasetDistributionCatalog":
        path = Path(manifest_path).expanduser().resolve()
        if not path.is_file():
            raise DatasetDistributionError(
                f"dataset distribution manifest is missing: {path}"
            )
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise DatasetDistributionError(
                f"dataset distribution manifest is invalid: {path}"
            ) from exc
        validate_manifest(manifest)
        clean_roots = {
            key: Path(value).expanduser().resolve()
            for key, value in (roots or {}).items()
            if value
        }
        return cls(path, manifest, clean_roots)

    @property
    def release_version(self) -> str:
        return str(self.manifest["releaseVersion"])

    def supports(self, release_version: str, profile: str | None = None) -> bool:
        if str(release_version) != self.release_version:
            return False
        return profile is None or profile in self.manifest["profiles"]

    def profile(self, release_version: str, profile: str) -> Mapping[str, Any] | None:
        if not self.supports(release_version, profile):
            return None
        value = self.manifest["profiles"].get(profile)
        return value if isinstance(value, Mapping) else None

    def files(self, release_version: str, profile: str) -> list[DistributionFile]:
        profile_data = self.profile(release_version, profile)
        if profile_data is None:
            return []
        return [_distribution_file(profile, item) for item in profile_data["distributions"]]

    def public_manifest(self, policy: UriPolicy) -> dict[str, Any] | None:
        if not self.supports(policy.release_version):
            return None
        output = json.loads(json.dumps(self.manifest))
        output["datasetUri"] = policy.dataset_version_uri
        output["landingPage"] = f"{policy.human_base}/about/release"
        output["manifestUrl"] = dataset_manifest_uri(policy)
        for profile_data in output["profiles"].values():
            for item in profile_data["distributions"]:
                item["downloadUrl"] = f'{policy.data_base}{item["downloadPath"]}'
        return output

    def availability(self, release_version: str) -> dict[str, Any]:
        if not self.supports(release_version):
            return {"prepared": False, "available": False, "partCount": 0}
        files = [
            item
            for profile in PROFILES
            for item in self.files(release_version, profile)
        ]
        required_sets = {item.artifact_set for item in files}
        missing_roots = sorted(required_sets - set(self.roots))
        missing_files = []
        size_mismatches = []
        for item in files:
            root = self.roots.get(item.artifact_set)
            if root is None:
                continue
            path = (root / item.filename).resolve()
            if not path.is_file():
                missing_files.append(f"{item.artifact_set}/{item.filename}")
            elif path.stat().st_size != item.bytes:
                size_mismatches.append(f"{item.artifact_set}/{item.filename}")
        return {
            "prepared": True,
            "available": not (missing_roots or missing_files or size_mismatches),
            "partCount": len(files),
            "missingRoots": missing_roots,
            "missingFileCount": len(missing_files),
            "sizeMismatchCount": len(size_mismatches),
        }

    def assert_available(self, release_version: str) -> dict[str, Any]:
        result = self.availability(release_version)
        if not result["prepared"]:
            raise DatasetDistributionError(
                f"dataset distributions are not prepared for Release {release_version}"
            )
        if not result["available"]:
            raise DatasetDistributionError(
                "dataset distributions are incomplete: "
                f"missing roots={result['missingRoots']}, "
                f"missing files={result['missingFileCount']}, "
                f"size mismatches={result['sizeMismatchCount']}"
            )
        return result

    def resolve_file(
        self,
        release_version: str,
        artifact_set: str,
        filename: str,
    ) -> tuple[Path, DistributionFile] | None:
        if not self.supports(release_version):
            return None
        matches = [
            item
            for profile in PROFILES
            for item in self.files(release_version, profile)
            if item.artifact_set == artifact_set and item.filename == filename
        ]
        if len(matches) != 1:
            return None
        root = self.roots.get(artifact_set)
        if root is None:
            raise DatasetDistributionError(
                f"dataset distribution root is not configured: {artifact_set}"
            )
        target = (root / filename).resolve()
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise DatasetDistributionError("unsafe dataset distribution path") from exc
        if not target.is_file():
            raise DatasetDistributionError(
                f"dataset distribution file is missing: {artifact_set}/{filename}"
            )
        if target.stat().st_size != matches[0].bytes:
            raise DatasetDistributionError(
                f"dataset distribution file size differs: {artifact_set}/{filename}"
            )
        return target, matches[0]


def validate_manifest(manifest: Mapping[str, Any]) -> None:
    if manifest.get("contract") != CONTRACT:
        raise DatasetDistributionError("unexpected dataset distribution contract")
    if manifest.get("status") != "complete_local_candidate":
        raise DatasetDistributionError("dataset distribution inventory is not complete")
    release = str(manifest.get("releaseVersion") or "")
    numbered = bool(re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,2}", release))
    binding = manifest.get("uriPolicy")
    if not numbered:
        if (not re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]{0,63}", release)
                or binding != UriPolicy.for_release(release, policy_version="2").as_dict()
                or not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,2}", str(manifest.get("sourceReleaseVersion") or ""))):
            raise DatasetDistributionError("invalid dataset distribution release version or candidate binding")
    elif binding is not None:
        if not isinstance(binding, Mapping) or binding != UriPolicy.for_release(
            release, policy_version=str(binding.get("policyVersion") or "auto")
        ).as_dict():
            raise DatasetDistributionError("dataset distribution URI policy differs")
    source = manifest.get("sourcePublicCore")
    if not isinstance(source, Mapping) or not HEX_SHA256.fullmatch(
        str(source.get("sha256") or "")
    ):
        raise DatasetDistributionError("invalid source public-core identity")
    if manifest.get("publication") != {"deployments": 0, "zenodoUploads": 0}:
        raise DatasetDistributionError("dataset distribution publication boundary differs")
    source_sets = manifest.get("sourceArtifactSets")
    if (
        not isinstance(source_sets, list)
        or any(not isinstance(item, Mapping) for item in source_sets)
        or {
            str(item.get("key") or "")
            for item in source_sets
        } != {"organs", "entities"}
    ):
        raise DatasetDistributionError("source artifact-set inventory is incomplete")
    for item in source_sets:
        if not HEX_SHA256.fullmatch(str(item.get("manifestSha256") or "")):
            raise DatasetDistributionError("invalid source artifact-set SHA-256")
    scope = manifest.get("datasetScope")
    domains_scope = scope.get("domains") if isinstance(scope, Mapping) else None
    if not isinstance(domains_scope, Mapping) or set(domains_scope) != {
        "organs",
        "actors",
        "names",
        "places",
        "virtual_instruments",
    }:
        raise DatasetDistributionError("dataset domain scope is incomplete")
    if int(scope.get("entityCount") or 0) != sum(
        int(value) for value in domains_scope.values()
    ):
        raise DatasetDistributionError("dataset entity count differs")
    profiles = manifest.get("profiles")
    if not isinstance(profiles, Mapping) or set(profiles) != set(PROFILES):
        raise DatasetDistributionError("dataset distribution profiles are incomplete")
    seen_paths: set[str] = set()
    for profile in PROFILES:
        value = profiles[profile]
        if not isinstance(value, Mapping):
            raise DatasetDistributionError(f"invalid profile metadata: {profile}")
        distributions = value.get("distributions")
        if not isinstance(distributions, list) or not distributions:
            raise DatasetDistributionError(f"profile has no distributions: {profile}")
        bytes_total = 0
        statements_total = 0
        domains: set[str] = set()
        for item in distributions:
            if not isinstance(item, Mapping) or item.get("profile") != profile:
                raise DatasetDistributionError(f"invalid distribution profile: {profile}")
            artifact_set = str(item.get("artifactSet") or "")
            domain = str(item.get("domain") or "")
            filename = str(item.get("filename") or "")
            path = str(item.get("downloadPath") or "")
            expected_path = (
                f"/dataset/pod/version/{quote(release, safe='.-')}/distributions/"
                f"{quote(artifact_set, safe='-')}/{quote(filename, safe='-._~')}"
            )
            if artifact_set not in {"organs", "entities"} or not domain:
                raise DatasetDistributionError("invalid distribution scope")
            if (artifact_set == "organs") != (domain == "organs"):
                raise DatasetDistributionError("distribution uses the wrong artifact set")
            if Path(filename).name != filename or not filename.endswith(".nt.gz"):
                raise DatasetDistributionError("invalid distribution filename")
            if path != expected_path or path in seen_paths:
                raise DatasetDistributionError("invalid or duplicate distribution path")
            if item.get("mediaType") != NTRIPLES_MEDIA_TYPE:
                raise DatasetDistributionError("unexpected distribution media type")
            if item.get("compressFormat") != GZIP_MEDIA_TYPE:
                raise DatasetDistributionError("unexpected distribution compression format")
            if not HEX_SHA256.fullmatch(str(item.get("sha256") or "")):
                raise DatasetDistributionError("invalid distribution SHA-256")
            size = int(item.get("bytes") or 0)
            statements = int(item.get("statementCount") or 0)
            if size <= 0 or statements <= 0:
                raise DatasetDistributionError("empty dataset distribution")
            bytes_total += size
            statements_total += statements
            domains.add(domain)
            seen_paths.add(path)
        if bytes_total != int(value.get("compressedBytes") or 0):
            raise DatasetDistributionError(f"profile byte total differs: {profile}")
        if statements_total != int(value.get("statementCount") or 0):
            raise DatasetDistributionError(f"profile statement total differs: {profile}")
        if sorted(domains) != sorted(value.get("domains") or []):
            raise DatasetDistributionError(f"profile domain inventory differs: {profile}")
        if int(value.get("partCount") or 0) != len(distributions):
            raise DatasetDistributionError(f"profile part count differs: {profile}")
        if int(value.get("entityCount") or 0) != sum(
            int(domains_scope[domain]) for domain in domains
        ):
            raise DatasetDistributionError(f"profile entity count differs: {profile}")
    if set(manifest["profiles"]["pon"]["domains"]) != {"organs"}:
        raise DatasetDistributionError("PON distribution must remain organ-scoped")


def _distribution_file(profile: str, item: Mapping[str, Any]) -> DistributionFile:
    return DistributionFile(
        artifact_set=str(item["artifactSet"]),
        domain=str(item["domain"]),
        profile=profile,
        filename=str(item["filename"]),
        download_path=str(item["downloadPath"]),
        bytes=int(item["bytes"]),
        sha256=str(item["sha256"]),
        statement_count=int(item["statementCount"]),
    )


def dataset_manifest_uri(policy: UriPolicy) -> str:
    release = quote(policy.release_version, safe=".-")
    return f"{policy.data_base}/dataset/pod/version/{release}/distribution-manifest.json"


def dataset_resolution_data(
    policy: UriPolicy,
    *,
    versioned: bool,
    catalog: DatasetDistributionCatalog | None = None,
) -> dict[str, Any]:
    canonical_uri = policy.dataset_version_uri if versioned else policy.dataset_uri
    representations = []
    for profile in PROFILES:
        representations.append(
            {
                "profile": profile,
                "profileUri": policy.profile_uri(profile),
                "mediaType": (
                    RDF_XML_MEDIA_TYPE if profile == "edm" else JSON_LD_MEDIA_TYPE
                ),
                "uri": policy.dataset_representation_uri(
                    profile=profile, versioned=versioned
                ),
                "state": policy.publication_state,
                "completeDistribution": bool(
                    catalog and catalog.supports(policy.release_version, profile)
                ),
            }
        )
    return {
        "canonicalUri": canonical_uri,
        "canonicalRoute": "/about/release",
        "publicationState": policy.publication_state,
        "representations": representations,
    }


def dataset_jsonld(
    policy: UriPolicy,
    *,
    profile: str,
    versioned: bool,
    catalog: DatasetDistributionCatalog | None = None,
) -> dict[str, Any]:
    if profile not in PROFILES or profile == "edm":
        raise DatasetDistributionError("JSON-LD dataset profile is not available")
    canonical_uri = policy.dataset_version_uri if versioned else policy.dataset_uri
    profile_data = catalog.profile(policy.release_version, profile) if catalog else None
    distributions = [
        _distribution_jsonld(policy, item)
        for item in (profile_data or {}).get("distributions", [])
    ]
    document: dict[str, Any] = {
        "@context": {
            "schema": "https://schema.org/",
            "dcat": "http://www.w3.org/ns/dcat#",
            "dcterms": "http://purl.org/dc/terms/",
            "void": "http://rdfs.org/ns/void#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "spdx": "http://spdx.org/rdf/terms#",
            "xsd": "http://www.w3.org/2001/XMLSchema#",
        },
        "@id": canonical_uri,
        "@type": (
            ["schema:Dataset", "dcat:Dataset", "void:Dataset"]
            if versioned
            else ["schema:Dataset", "dcat:DatasetSeries"]
        ),
        "dcterms:title": {"@value": "MODAVIS Pipe Organ Dataset", "@language": "en"},
        "schema:version": policy.release_version,
        "dcterms:conformsTo": {"@id": policy.profile_uri(profile)},
        "dcat:landingPage": {"@id": f"{policy.human_base}/about/release"},
        "dcterms:identifier": canonical_uri,
        "schema:isAccessibleForFree": True,
        "schema:conditionsOfAccess": "Public read-only structured dataset",
        "schema:additionalProperty": {
            "@type": "schema:PropertyValue",
            "schema:name": "publicationState",
            "schema:value": policy.publication_state,
        },
    }
    if catalog and catalog.supports(policy.release_version):
        document["rdfs:seeAlso"] = {"@id": dataset_manifest_uri(policy)}
    if versioned and profile_data:
        document["dcterms:isVersionOf"] = {"@id": policy.dataset_uri}
        document["dcterms:issued"] = catalog.manifest.get("createdAt")
        document["void:triples"] = int(profile_data["statementCount"])
        document["dcat:distribution"] = distributions
    elif not versioned:
        document["dcterms:hasVersion"] = {"@id": policy.dataset_version_uri}
    return document


def _distribution_jsonld(
    policy: UriPolicy, item: Mapping[str, Any]
) -> dict[str, Any]:
    download_url = f'{policy.data_base}{item["downloadPath"]}'
    return {
        "@id": f"{download_url}#distribution",
        "@type": ["dcat:Distribution", "schema:DataDownload"],
        "dcterms:title": (
            f'{PROFILE_LABELS[str(item["profile"])]} — '
            f'{str(item["domain"]).replace("_", " ")} — {item["filename"]}'
        ),
        "dcterms:conformsTo": {"@id": policy.profile_uri(str(item["profile"]))},
        "dcterms:format": "N-Triples 1.1, gzip-compressed",
        "dcat:downloadURL": {"@id": download_url},
        "dcat:accessURL": {"@id": download_url},
        "dcat:mediaType": {"@id": NTRIPLES_MEDIA_TYPE_URI},
        "dcat:compressFormat": {"@id": GZIP_MEDIA_TYPE_URI},
        "dcat:byteSize": int(item["bytes"]),
        "void:triples": int(item["statementCount"]),
        "schema:contentUrl": {"@id": download_url},
        "schema:encodingFormat": NTRIPLES_MEDIA_TYPE,
        "spdx:checksum": {
            "@id": f"{download_url}#sha256",
            "@type": "spdx:Checksum",
            "spdx:algorithm": {
                "@id": "http://spdx.org/rdf/terms#checksumAlgorithm_sha256"
            },
            "spdx:checksumValue": item["sha256"],
        },
    }


def dataset_edm_rdfxml(
    policy: UriPolicy,
    *,
    versioned: bool,
    catalog: DatasetDistributionCatalog | None = None,
) -> bytes:
    namespaces = {
        "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "dcat": "http://www.w3.org/ns/dcat#",
        "dcterms": "http://purl.org/dc/terms/",
        "void": "http://rdfs.org/ns/void#",
        "schema": "https://schema.org/",
        "spdx": "http://spdx.org/rdf/terms#",
        "xsd": "http://www.w3.org/2001/XMLSchema#",
    }
    for prefix, uri in namespaces.items():
        ET.register_namespace(prefix, uri)
    rdf = namespaces["rdf"]
    root = ET.Element(f"{{{rdf}}}RDF")
    canonical_uri = policy.dataset_version_uri if versioned else policy.dataset_uri
    dataset_class = "Dataset" if versioned else "DatasetSeries"
    dataset = ET.SubElement(
        root,
        f'{{{namespaces["dcat"]}}}{dataset_class}',
        {f"{{{rdf}}}about": canonical_uri},
    )
    _xml_resource(dataset, namespaces, "rdf", "type", "https://schema.org/Dataset")
    if versioned:
        _xml_resource(
            dataset, namespaces, "rdf", "type", "http://rdfs.org/ns/void#Dataset"
        )
    _xml_literal(
        dataset,
        namespaces,
        "dcterms",
        "title",
        "MODAVIS Pipe Organ Dataset",
        language="en",
    )
    _xml_literal(dataset, namespaces, "schema", "version", policy.release_version)
    _xml_resource(
        dataset, namespaces, "dcterms", "conformsTo", policy.profile_uri("edm")
    )
    _xml_resource(
        dataset,
        namespaces,
        "dcat",
        "landingPage",
        f"{policy.human_base}/about/release",
    )
    _xml_literal(dataset, namespaces, "dcterms", "identifier", canonical_uri)
    profile_data = catalog.profile(policy.release_version, "edm") if catalog else None
    if versioned and profile_data:
        _xml_resource(
            dataset, namespaces, "dcterms", "isVersionOf", policy.dataset_uri
        )
        _xml_literal(
            dataset,
            namespaces,
            "dcterms",
            "issued",
            str(catalog.manifest["createdAt"]),
        )
        _xml_literal(
            dataset,
            namespaces,
            "void",
            "triples",
            str(profile_data["statementCount"]),
            datatype=f'{namespaces["xsd"]}integer',
        )
        _xml_resource(
            dataset,
            namespaces,
            "dcterms",
            "relation",
            dataset_manifest_uri(policy),
        )
        for item in profile_data["distributions"]:
            download_url = f'{policy.data_base}{item["downloadPath"]}'
            distribution_uri = f"{download_url}#distribution"
            _xml_resource(
                dataset, namespaces, "dcat", "distribution", distribution_uri
            )
            distribution = ET.SubElement(
                root,
                f'{{{namespaces["dcat"]}}}Distribution',
                {f"{{{rdf}}}about": distribution_uri},
            )
            _xml_literal(
                distribution,
                namespaces,
                "dcterms",
                "title",
                f'{PROFILE_LABELS["edm"]} — '
                f'{str(item["domain"]).replace("_", " ")} — '
                f'{item["filename"]}',
                language="en",
            )
            _xml_resource(
                distribution,
                namespaces,
                "dcterms",
                "conformsTo",
                policy.profile_uri("edm"),
            )
            _xml_literal(
                distribution,
                namespaces,
                "dcterms",
                "format",
                "N-Triples 1.1, gzip-compressed",
            )
            _xml_resource(distribution, namespaces, "dcat", "downloadURL", download_url)
            _xml_resource(distribution, namespaces, "dcat", "accessURL", download_url)
            _xml_resource(distribution, namespaces, "dcat", "mediaType", NTRIPLES_MEDIA_TYPE_URI)
            _xml_resource(distribution, namespaces, "dcat", "compressFormat", GZIP_MEDIA_TYPE_URI)
            _xml_literal(
                distribution,
                namespaces,
                "dcat",
                "byteSize",
                str(item["bytes"]),
                datatype=f'{namespaces["xsd"]}decimal',
            )
            _xml_literal(
                distribution,
                namespaces,
                "void",
                "triples",
                str(item["statementCount"]),
                datatype=f'{namespaces["xsd"]}integer',
            )
            checksum_uri = f"{download_url}#sha256"
            _xml_resource(distribution, namespaces, "spdx", "checksum", checksum_uri)
            checksum = ET.SubElement(
                root,
                f'{{{namespaces["spdx"]}}}Checksum',
                {f"{{{rdf}}}about": checksum_uri},
            )
            _xml_resource(
                checksum,
                namespaces,
                "spdx",
                "algorithm",
                "http://spdx.org/rdf/terms#checksumAlgorithm_sha256",
            )
            _xml_literal(
                checksum,
                namespaces,
                "spdx",
                "checksumValue",
                str(item["sha256"]),
                datatype=f'{namespaces["xsd"]}hexBinary',
            )
    elif not versioned:
        _xml_resource(dataset, namespaces, "dcterms", "hasVersion", policy.dataset_version_uri)
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True) + b"\n"


def _xml_resource(
    parent: ET.Element,
    namespaces: Mapping[str, str],
    prefix: str,
    local_name: str,
    resource: str,
) -> None:
    ET.SubElement(
        parent,
        f"{{{namespaces[prefix]}}}{local_name}",
        {f'{{{namespaces["rdf"]}}}resource': resource},
    )


def _xml_literal(
    parent: ET.Element,
    namespaces: Mapping[str, str],
    prefix: str,
    local_name: str,
    value: str,
    *,
    language: str | None = None,
    datatype: str | None = None,
) -> None:
    attributes = {}
    if language:
        attributes["{http://www.w3.org/XML/1998/namespace}lang"] = language
    if datatype:
        attributes[f'{{{namespaces["rdf"]}}}datatype'] = datatype
    element = ET.SubElement(
        parent, f"{{{namespaces[prefix]}}}{local_name}", attributes
    )
    element.text = value
