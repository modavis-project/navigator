"""URI policy v2 scope and graph-preservation validation."""

from __future__ import annotations

from dataclasses import dataclass
import re
from urllib.parse import urlsplit
from .resource_families import require_resource_family, AUTHORITATIVE_PROFILES
from .release_resources import ResourceError, source_key
from .uri_policy import UriPolicy


@dataclass(frozen=True)
class ResourceScope:
    family: str | None
    owner: str | None
    profile: str | None
    document: str


def resource_scope(uri: str, policy: UriPolicy) -> ResourceScope | None:
    """Reject unsafe, unknown, cross-release, and incorrectly scoped local IRIs."""
    base = policy.canonical_id_base
    if uri == policy.dataset_version_uri:
        return None
    if uri.startswith(base + "/vocab/event-type/"):
        key = uri[len(base + "/vocab/event-type/") :]
        if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z:._~-]{0,255}", key):
            raise ValueError("unsafe_governed_term")
        return ResourceScope("event-type", None, "modavis", uri)
    if not uri.startswith(base + "/dataset/pod/version/"):
        return None
    prefix = policy.dataset_version_uri + "/"
    if not uri.startswith(prefix):
        raise ValueError("wrong_release")
    parts = urlsplit(uri)
    if parts.query or "%" in uri or "\\" in uri or any(c.isspace() for c in uri):
        raise ValueError("unsafe_resource_path")
    path = uri[len(prefix) :].split("#", 1)[0].split("/")
    owner = profile = family = None
    if (
        len(path) in {4, 7}
        and path[0] in {"entity", "name", "location"}
        and path[2] == "profile"
    ):
        if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._~-]{0,255}", path[1]):
            raise ValueError("unsafe_owner")
        owner = base + "/" + "/".join(path[:2])
        profile = path[3]
        if profile not in AUTHORITATIVE_PROFILES:
            raise ValueError("unknown_profile")
        document = prefix + "/".join(path[:4])
        if len(path) == 7:
            if (
                path[4] != "resource"
                or not re.fullmatch("[0-9a-f]{64}", path[6])
                or parts.fragment
            ):
                raise ValueError("unsafe_resource_token")
            family = require_resource_family(path[5])
            expected = "owner"
        elif parts.fragment:
            match = re.fullmatch(r"([a-z][a-z0-9-]*)-([0-9a-f]{64})", parts.fragment)
            if not match:
                raise ValueError("unsafe_fragment")
            family = require_resource_family(match[1])
            expected = "owner_profile_document"
        else:
            return ResourceScope(None, owner, profile, document)
        if family.ownership_rule != expected or family.authoritative_profile != profile:
            raise ValueError("incorrect_resource_scope")
    elif (len(path) == 2 and path[0] == "source-record") or (
        len(path) == 3 and path[0] == "resource"
    ):
        family = require_resource_family(path[-2])
        if (
            family.ownership_rule != "release"
            or parts.fragment
            or (path[0] == "resource" and family.name == "source-record")
        ):
            raise ValueError("incorrect_release_scope")
        try:
            source_key(path[-1])
        except ResourceError as exc:
            raise ValueError("unsafe_source_token") from exc
        document = uri
    elif len(path) == 2 and path[0] in {"schema", "scheme"}:
        if path[0] == "schema":
            if path[1] != "release-resource-properties":
                raise ValueError("unknown_schema")
            name = "technical-fact-property"
            fragment = parts.fragment.removeprefix(name + "-")
            if parts.fragment and not parts.fragment.startswith(name + "-"):
                raise ValueError("incorrect_schema_scope")
        else:
            name, fragment = path[1], parts.fragment
        family = require_resource_family(name)
        if family.ownership_rule != "release_" + path[0]:
            raise ValueError("incorrect_term_scope")
        if parts.fragment and not re.fullmatch(
            r"[0-9A-Za-z][0-9A-Za-z._~-]*-[0-9a-f]{64}", fragment
        ):
            raise ValueError("unsafe_term_fragment")
        document = uri.split("#", 1)[0]
    else:
        raise ValueError("unknown_resource_path")
    return ResourceScope(family.name, owner, family.authoritative_profile, document)


def compare_uri_migration(kind, record, release="candidate"):
    """Compare facts after an owner-local URI rewrite, allowing factory metadata only.

    Calls to the URI factory are paired by family and occurrence. This maps
    dependent structural digests as well as persisted keys. The mapping is
    scoped to one owner so intentional separation of old cross-owner collisions
    cannot accidentally merge successor resources.
    """
    from unittest.mock import patch
    from rdflib import URIRef
    from .entity_exports import profile_graphs, _apply_resource_annotations
    from .uri_policy import ResourceUriFactory
    from rdflib import Graph

    original = ResourceUriFactory.resource_uri

    def build(version):
        calls, factories = [], []

        def traced(factory, family, **kwargs):
            uri = original(factory, family, **kwargs)
            calls.append((family, uri, kwargs.get("stable_key")))
            if not any(factory is item for item in factories):
                factories.append(factory)
            return uri

        with patch.object(ResourceUriFactory, "resource_uri", traced):
            graphs = profile_graphs(
                kind, record, UriPolicy.for_release(release, policy_version=version)
            )
        return graphs, calls, factories

    old, old_calls, _ = build("1")
    new, new_calls, factories = build("2")
    if len(old_calls) != len(new_calls) or any(
        a[0] != b[0] and (a[0], b[0]) != ("event-type", "source-event-type")
        for a, b in zip(old_calls, new_calls)
    ):
        raise ValueError("URI factory call sequence changed between policies")
    rewrite = {}
    for (family, before, _), (_, after, _) in zip(old_calls, new_calls):
        if family == "agent-role":
            continue
        if before in rewrite and rewrite[before] != after:
            raise ValueError("ambiguous owner-local URI rewrite: " + before)
        rewrite[before] = after
    # Role assignments are sorted by builder URI; hashing changes that order.
    # Match these dependent keys after rewriting the builder, not by position.
    assignments = {key: uri for family, uri, key in new_calls if family == "agent-role"}
    for family, before, key in old_calls:
        if family == "agent-role":
            mapped = str(key)
            for source, target in sorted(
                rewrite.items(), key=lambda item: len(item[0]), reverse=True
            ):
                mapped = mapped.replace(source, target)
            if mapped not in assignments:
                raise ValueError("role assignment lost its builder")
            rewrite[before] = assignments[mapped]
    results = {}
    for profile in old:
        rewritten = {
            tuple(
                (
                    URIRef(rewrite.get(str(term), str(term)))
                    if isinstance(term, URIRef)
                    else term
                )
                for term in triple
            )
            for triple in old[profile]
        }
        # The sole permitted new statements are deterministic factory annotations.
        annotated = Graph()
        for triple in rewritten:
            annotated.add(triple)
        before_annotations = set(annotated)
        for factory in factories:
            _apply_resource_annotations(annotated, factory)
        allowed = set(annotated) - before_annotations
        missing = rewritten - set(new[profile])
        extra = set(new[profile]) - rewritten - allowed
        results[profile] = {
            "originalStatements": len(old[profile]),
            "successorStatements": len(new[profile]),
            "mappedResourceCount": len(rewrite),
            "metadataAdditions": len(allowed),
            "missingStatements": len(missing),
            "unexplainedStatements": len(extra),
            "missingSamples": [list(map(str, t)) for t in sorted(missing, key=str)[:3]],
            "unexplainedSamples": [
                list(map(str, t)) for t in sorted(extra, key=str)[:3]
            ],
        }
    return new, results
