"""Current capability availability without rehashing a preserved corpus."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import os

from flask import jsonify, request


def _stamp(path):
    stat = Path(path).stat()
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)


class CapabilityHealth:
    def __init__(self, app, repo, settings, startup, distributions=None):
        self.app, self.repo, self.settings = app, repo, settings
        self.startup = dict(startup)
        self.distributions = distributions
        self.files = {}
        self.configured = {}
        self._track("identityLedger", [getattr(settings, "identifier_ledger_path", None)])
        research = app.extensions.get("organological_research")
        self._track("researchIndex", ([research.root / "manifest.json", *[research.root / name for name in research.manifest["files"]]] if research else []),
                    configured=bool(os.getenv("NAVIGATOR_RESEARCH_INDEX")))
        work = app.extensions.get("research_workbench")
        work_files = []
        if work:
            work_files = [work.manifest_path, work.core, work.index]
            for key in ("identities", "occurrences"):
                value = work.manifest.get(key)
                path = value.get("path") if isinstance(value, dict) else value
                if path:
                    work_files.append((work.manifest_path.parent / path).resolve())
            if work.assessments:
                work_files.append(work.assessments["index"]["path"])
        self._track("workbench", work_files, configured=bool(os.getenv("NAVIGATOR_WORKBENCH_MANIFEST")))
        exploration = app.extensions.get("research_exploration")
        self._track("exploration", [exploration.path, exploration.db] if exploration else [],
                    configured=bool(os.getenv("NAVIGATOR_EXPLORATION_MANIFEST")))
        for key, extension, environment in (
            ("vocabularyReference", "omaro_reference", "NAVIGATOR_OMARO_MANIFEST"),
            ("legacyVocabularyReference", "omaro_legacy_reference", "NAVIGATOR_OMARO_LEGACY_MANIFEST"),
        ):
            omaro = app.extensions.get(extension)
            files = ([omaro.manifest_path, omaro.db,
                      *[omaro.root / value["file"] for value in omaro.meta["exports"].values()]] if omaro else [])
            self._track(key, files, configured=bool(os.getenv(environment)))
        if distributions:
            self._track("semanticDistributions", [distributions.manifest_path, *distributions.roots.values()])
        else:
            self._track("semanticDistributions", [], configured=bool(getattr(settings, "dataset_distribution_manifest_path", None)))

    def _track(self, key, paths, configured=None):
        paths = [Path(path) for path in paths if path]
        self.configured[key] = bool(paths) if configured is None else configured or bool(paths)
        self.files[key] = {}
        for path in paths:
            try:
                self.files[key][path] = _stamp(path)
            except OSError:
                self.files[key][path] = None

    def resource_state(self, key):
        if not self.configured.get(key):
            return {"available": False, "status": "not_configured", "reason": "optional_resource_not_configured"}
        files = self.files.get(key, {})
        if not files:
            return {"available": False, "status": "unavailable", "reason": "startup_binding_rejected"}
        for path, original in files.items():
            try:
                current = _stamp(path)
            except OSError:
                return {"available": False, "status": "unavailable", "reason": "resource_missing"}
            if original is None or current != original:
                return {"available": False, "status": "unavailable", "reason": "resource_changed"}
        return {"available": True, "status": "available", "verification": "startup_verification_and_current_file_identity"}

    def document(self):
        states = {key: self.resource_state(key) for key in self.files}
        try:
            self.repo.ping()
            snapshot = self.repo.snapshot_binding() if hasattr(self.repo, "snapshot_binding") else {}
            states["catalogue"] = {"available": True, "status": "available", "verification": "database_probe_and_selected_manifest"}
        except Exception:
            snapshot = {}
            states["catalogue"] = {"available": False, "status": "unavailable", "reason": "database_or_manifest_unavailable"}
        for key, extension in (("researchIndex", "organological_research"), ("workbench", "research_workbench")):
            if states[key]["available"]:
                try:
                    self.app.extensions[extension].assert_binding()
                except Exception:
                    states[key] = {"available": False, "status": "unavailable", "reason": "snapshot_mismatch"}
        if states["semanticDistributions"]["available"]:
            states["semanticDistributions"]["verification"] = "startup_inventory_verification_and_current_manifest_roots"
        if not states["researchIndex"]["available"] and states["workbench"]["available"]:
            states["workbench"] = {"available": False, "status": "unavailable", "reason": "research_index_unavailable"}
        # A healthy public catalogue does not require separately configured
        # research packages, vocabulary reference assets or bulk distributions.
        declared = set(self.startup.get("capabilities", []))
        states["map"] = {"available": states["catalogue"]["available"] and "map" in declared,
                         "status": "available" if states["catalogue"]["available"] and "map" in declared else "unavailable",
                         "verification": "public_projection_capability"}
        states["graphql"] = {"available": states["workbench"]["available"],
                             "status": "available" if states["workbench"]["available"] else "unavailable",
                             "dependency": "workbench"}
        required = ["catalogue"] + (["identityLedger"] if self.configured.get("identityLedger") else [])
        return {**self.startup, "ok": all(states[key]["available"] for key in required),
                "contract": "modavis.capability-health/v1", "requiredCapabilities": required,
                "capabilityStates": states, "snapshot": snapshot,
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "verificationScope": "Database probe, selected snapshot binding and resource identity checks; no repeated corpus hashing."}


def register_capability_health(app, repository, settings, startup, distributions=None):
    health = CapabilityHealth(app, repository, settings, startup, distributions)
    app.extensions["capability_health"] = health

    @app.before_request
    def protect_changed_research_inputs():
        path = request.path
        required = ([("/api/workbench/", ("researchIndex", "workbench")),
                     ("/api/research-exploration/", ("researchIndex", "workbench", "exploration")),
                     ("/api/research/", ("researchIndex",)),
                     ("/api/graphql", ("researchIndex", "workbench"))])
        for prefix, keys in required:
            if path.startswith(prefix):
                for key in keys:
                    state = health.resource_state(key)
                    if state["status"] == "unavailable":
                        return jsonify({"error": "capability_unavailable", "capability": key,
                                        "reason": state["reason"], "retryable": False}), 503
                break
        return None
    return health
