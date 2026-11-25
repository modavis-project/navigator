"""Bounded, public-only research selection archives with offline replay."""
from __future__ import annotations

from datetime import date
import hashlib
import io
import json
import os
import re
from urllib.parse import parse_qsl, urlsplit
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

from flask import Response, jsonify, request

SCHEMA = "modavis.research-selection-package/v1"
MAX_PAYLOAD_BYTES = 32 * 1024 * 1024
MAX_RECORDS = 50_000
SECRET_KEYS = {"password", "api_key", "access_token", "refresh_token", "authorization",
               "cookie", "private_key", "client_secret"}


def encoded(value) -> bytes:
    output = io.BytesIO()
    for chunk in json.JSONEncoder(ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).iterencode(value):
        output.write(chunk.encode("utf-8"))
        if output.tell() > MAX_PAYLOAD_BYTES:
            raise OverflowError("Research package exceeds its byte budget; narrow the selection")
    output.write(b"\n")
    return output.getvalue()


def _public_boundary(value, depth=0):
    if depth > 60:
        raise ValueError("Research payload nesting exceeds its budget")
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in SECRET_KEYS or (key in {"visibility", "visibility_status"} and child in {"private", "restricted"}):
                raise ValueError("Research package contains a nonpublic field")
            _public_boundary(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _public_boundary(child, depth + 1)
    elif isinstance(value, str):
        if value.startswith(("file://", "/Users/", "/Volumes/", "/work/", "/work2/")):
            raise ValueError("Research package contains a local resource reference")
        if value.startswith(("https://", "http://")):
            parsed = urlsplit(value)
            keys = {k.lower() for k, _ in parse_qsl(parsed.query)}
            if parsed.username or parsed.password or keys & (SECRET_KEYS | {"token", "signature", "sig"}) or any(k.startswith(("x-amz-", "x-goog-")) for k in keys):
                raise ValueError("Research package contains a credential-bearing URL")


REPLAY = '''"""Verify this extracted package and emit its frozen public result; no network."""
import hashlib, json, pathlib, sys
root=pathlib.Path(__file__).resolve().parent
expected={}
for line in (root/'checksums.sha256').read_text().splitlines():
    digest, separator, relative=line.partition('  ')
    path=pathlib.PurePosixPath(relative)
    if (not separator or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest)
        or not relative or path.is_absolute() or '..' in path.parts or path.as_posix()!=relative
        or ':' in relative or chr(92) in relative or relative in expected):
        raise SystemExit('Invalid checksum inventory')
    expected[relative]=digest
actual=set()
for path in root.rglob('*'):
    if path.is_symlink(): raise SystemExit('Symlink refused')
    if path.is_file(): actual.add(path.relative_to(root).as_posix())
if actual != set(expected)|{'checksums.sha256'}: raise SystemExit('Package inventory differs')
for relative,digest in expected.items():
    if hashlib.sha256((root/relative).read_bytes()).hexdigest()!=digest: raise SystemExit('Package fixity failed')
manifest=json.loads((root/'manifest.json').read_text())
if manifest.get('package_schema')!='modavis.research-selection-package/v1': raise SystemExit('Unknown package schema')
sys.stdout.buffer.write((root/'selection.json').read_bytes())
'''


def build_package(result: dict, *, endpoint: str, query: dict, snapshot: str,
                  license_name: str, issued: str) -> tuple[bytes, str]:
    if not re.fullmatch(r"[0-9a-f]{64}", snapshot or "") or result.get("publicCoreSha256") != snapshot:
        raise RuntimeError("An exact current public snapshot is required for a research package")
    if not isinstance(license_name, str) or not license_name.strip():
        raise RuntimeError("Research packages are unavailable for this snapshot")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", issued) or date.fromisoformat(issued).isoformat() != issued:
        raise ValueError("Invalid package issuance date")
    if "items" in result:
        if (not isinstance(result["items"], list) or result.get("completeSelection") is not True or result.get("hasMore") is not False
                or result.get("offset") != 0 or result.get("total") != len(result["items"])):
            raise ValueError("A complete selection is required; paginated results cannot be packaged")
        if len(result["items"]) > MAX_RECORDS:
            raise OverflowError("Research selection exceeds its record budget")
    if result.get("comparisonContract") == "modavis.organ-research-comparison/v1":
        if result.get("completeComparison") is not True or any(organ.get("accountsComplete") is not True or organ.get("assertionsComplete") is not True for organ in result.get("organs", [])):
            raise ValueError("A complete organ comparison is required; truncated evidence cannot be packaged")
    _public_boundary(result)
    normalized_query = {k: v for k, v in sorted(query.items()) if k not in {"page", "format", "view"} and v}
    _public_boundary(normalized_query)
    selection = encoded(result)
    query_bytes = encoded({"endpoint": endpoint, "parameters": normalized_query,
                           "appliedFilters": result.get("filters", result.get("selection")),
                           "method": result.get("method"), "publicCoreSha256": snapshot})
    selection_hash = hashlib.sha256(selection).hexdigest()
    package_id = "urn:modavis:research-package:" + hashlib.sha256(selection + query_bytes + issued.encode()).hexdigest()
    files = {
        "selection.json": selection, "query.json": query_bytes,
        "rights.json": encoded({"license": license_name, "scope": "Package compilation; source attribution and qualifications remain in selection.json. External media bytes are not included."}),
        "license-report.json": encoded({"compilationLicense": license_name, "sourceMediaIncluded": False}),
        "replay.py": REPLAY.encode(),
        "README.md": ("# MODAVIS research selection\n\nExtract this trusted archive into a new directory. Run `python3 replay.py` to verify\nall packaged bytes and recover the complete frozen public result offline. Retain\nthe downloaded archive SHA-256 separately as the integrity anchor.\n\nThe query, snapshot and transformation hashes are retained. This is a replay of\nthe selected result, not a rerun against the entire original corpus. Re-querying\nrequires the exact original public snapshot. Source media stays externally linked;\nno source images are copied or promised available offline. Package issuance is\nnot a public DOI deposition. Source uncertainty and attribution remain applicable.\n").encode(),
    }
    def entries():
        return [{"path": name, "byte_size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                 "media_type": "application/json" if name.endswith(".json") else "text/plain"}
                for name, data in sorted(files.items())]
    payload_entries = entries()
    # The shared Persistor projection profile is deliberately implemented without
    # a server/runtime dependency on another unreleased component.
    graph = [
        {"@id": "ro-crate-metadata.json", "@type": "CreativeWork", "about": {"@id": "./"},
         "conformsTo": {"@id": "https://w3id.org/ro/crate/1.3"}},
        {"@id": "./", "@type": "Dataset", "name": "MODAVIS research selection", "datePublished": issued,
         "description": "Complete frozen public selection with query and byte-fixity evidence; local issuance does not assert public deposition.",
         "license": {"@id": "#compilation-license"}, "identifier": {"@id": "#package-identifier"},
         "hasPart": [{"@id": entry["path"]} for entry in payload_entries]},
        {"@id": "#compilation-license", "@type": "CreativeWork", "name": license_name,
         "description": "Compilation license; source rights and attributions remain applicable."},
        {"@id": "#package-identifier", "@type": "PropertyValue", "value": package_id, "propertyID": "MODAVIS package identifier"},
        *[{"@id": entry["path"], "@type": "File", "name": entry["path"], "sha256": entry["sha256"],
           "contentSize": str(entry["byte_size"]), "encodingFormat": entry["media_type"]} for entry in payload_entries],
    ]
    files["ro-crate-metadata.json"] = encoded({"@context": "https://w3id.org/ro/crate/1.3/context", "@graph": graph})
    files["manifest.json"] = encoded({"package_schema": SCHEMA, "package_id": package_id,
        "publicCoreSha256": snapshot, "selection_sha256": selection_hash,
        "query_sha256": hashlib.sha256(query_bytes).hexdigest(), "files": entries(),
        "ro_crate": {"version": "1.3", "metadata": "ro-crate-metadata.json", "issued": issued}})
    files["checksums.sha256"] = "".join(f"{hashlib.sha256(data).hexdigest()}  {name}\n" for name, data in sorted(files.items())).encode()
    if sum(map(len, files.values())) > MAX_PAYLOAD_BYTES:
        raise OverflowError("Research package exceeds its byte budget; narrow the selection")
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED, allowZip64=True) as archive:
        for name, data in sorted(files.items()):
            info = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            with archive.open(info, "w", force_zip64=True) as member:
                member.write(data)
    content = output.getvalue()
    return content, hashlib.sha256(content).hexdigest()


def supports_research_package(path: str) -> bool:
    collection = ((path.startswith("/api/workbench/") and path.split("/")[-2] in {"selection", "terms", "occurrences"})
                  or path.startswith(("/api/research-exploration/", "/api/vocab/usage/"))) and path.endswith("/export")
    single = (path in {"/api/workbench/compare", "/api/workbench/identities", "/api/workbench/organ-comparison"}
              or path.startswith(("/api/workbench/timeline/", "/api/workbench/claims/", "/api/workbench/account/")))
    return collection or single


def register_research_packages(app):
    app.extensions['research_package_export'] = True
    @app.after_request
    def package_download(response):
        if request.args.get("format") != "ro-crate" or response.status_code != 200 or not response.is_json:
            return response
        path = request.path
        if not supports_research_package(path):
            return app.make_response((jsonify({"error": "Use the complete research export route for a package"}), 400))
        try:
            work = app.extensions.get("research_workbench")
            if work is None:
                raise RuntimeError("Research snapshot is unavailable")
            work.assert_binding()
            result = response.get_json()
            binding = work.binding() if hasattr(work, "binding") else {"publicCoreSha256": work.manifest["core"]["sha256"]}
            result = {**binding, **result}
            content, sha = build_package(
                result, endpoint=path, query=dict(request.args), snapshot=request.args.get("snapshot", ""),
                license_name=app.config.get("RESEARCH_PACKAGE_LICENSE") or os.getenv("NAVIGATOR_RESEARCH_PACKAGE_LICENSE", ""),
                issued=date.today().isoformat(),
            )
            work.assert_binding()
            return Response(content, mimetype="application/zip", headers={
                "Content-Disposition": 'attachment; filename="modavis-research-selection.zip"',
                "X-Content-SHA256": sha, "Cache-Control": "no-store",
            })
        except RuntimeError as exc:
            return app.make_response((jsonify({"error": str(exc)}), 409))
        except OverflowError as exc:
            return app.make_response((jsonify({"error": str(exc)}), 422))
        except (ValueError, TypeError) as exc:
            return app.make_response((jsonify({"error": str(exc)}), 400))
