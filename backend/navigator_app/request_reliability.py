"""Whole-request preparation/query budgets and safe public failure responses."""
from __future__ import annotations

import sqlite3
import time

from flask import g, jsonify, request
from psycopg import OperationalError
from psycopg.errors import QueryCanceled
from psycopg_pool import PoolTimeout

from .db import query_deadline
from .public_query_identity import SnapshotBindingChanged
from .research_package import supports_research_package

CONTRACT = "modavis.public-request-budget/v1"
DEFAULT_PUBLIC_QUERY_BUDGET_SECONDS = 10.0
DISPOSITION_REQUEST_BUDGETS = {
    "/api/workbench/dispositions": 25.0,
    "/api/workbench/dispositions/export": 30.0,
}


def register_request_reliability(app, repository=None):
    app.config.setdefault("PUBLIC_QUERY_BUDGET_SECONDS", DEFAULT_PUBLIC_QUERY_BUDGET_SECONDS)
    app.config.setdefault("PUBLIC_EXPORT_BUDGET_SECONDS", 25.0)
    app.config.setdefault("PUBLIC_HEALTH_BUDGET_SECONDS", 3.0)
    app.extensions["request_reliability"] = {"contract": CONTRACT, "scope": "request_preparation_and_database_queries",
                                             "clientDisconnect": "transport cancellation; server work remains bounded by the request deadline"}

    def failure(code, message, status=504, retryable=True):
        response = jsonify({"error": code, "message": message, "retryable": retryable, "contract": CONTRACT})
        response.status_code = status
        response.headers["Cache-Control"] = "no-store"
        if retryable:
            response.headers["Retry-After"] = "1"
        return response

    @app.before_request
    def begin_budget():
        # Includes public representation routes; streaming file transfer after
        # headers remains a transport concern, not an uninterruptible SQL job.
        if request.path.startswith("/api/health/"):
            seconds = app.config["PUBLIC_HEALTH_BUDGET_SECONDS"]
        elif request.endpoint == "public_area":
            # A cold national view can build the area index and aggregate the whole country.
            seconds = 18.0
        elif request.path in DISPOSITION_REQUEST_BUDGETS:
            seconds = DISPOSITION_REQUEST_BUDGETS[request.path]
        elif request.path.endswith("/export") or (
            request.args.get("format") == "ro-crate" and supports_research_package(request.path)
        ):
            seconds = app.config["PUBLIC_EXPORT_BUDGET_SECONDS"]
        else:
            seconds = app.config["PUBLIC_QUERY_BUDGET_SECONDS"]
        seconds = max(0.05, min(float(seconds), 30.0))
        supplied = request.headers.get("X-Request-Timeout-Ms")
        if supplied is not None:
            if len(supplied) > 8 or not supplied.isascii() or not supplied.isdigit() or int(supplied) < 1:
                return failure("invalid_request_budget", "Request timeout must be a positive number of milliseconds.", 400, False)
            # A caller may shorten a read, never increase the server's allowance.
            seconds = min(seconds, max(0.001, int(supplied) / 1000.0))
        started = time.monotonic()
        deadline = started + seconds
        inherited = query_deadline.get()
        if inherited is not None:
            deadline = min(deadline, inherited)
        g.public_query_started = started
        g.public_query_deadline = deadline
        g.public_query_token = query_deadline.set(deadline)
        if request.path.startswith("/api/"):
            if any("\0" in key or any("\0" in value for value in values) for key, values in request.args.lists()):
                return failure("invalid_query_text", "Query parameters cannot contain a NUL character.", 400, False)
            if repository is not None and not request.path.startswith("/api/health/"):
                binding = getattr(repository, "snapshot_binding", None)
                if binding is not None:
                    binding()

    @app.after_request
    def finish_budget(response):
        deadline = getattr(g, "public_query_deadline", None)
        now = time.monotonic()
        if deadline is not None and now >= deadline and response.status_code < 400:
            response = failure("query_timeout", "This read exceeded its time budget. Narrow the query or retry.")
        if deadline is not None:
            response.headers["X-MODAVIS-Query-Budget-Ms"] = str(max(0, round((deadline - g.public_query_started) * 1000)))
            response.headers.add("Server-Timing", f"navigator;dur={(now - g.public_query_started) * 1000:.1f}")
        return response

    @app.teardown_request
    def clear_budget(_error):
        token = getattr(g, "public_query_token", None)
        if token is not None:
            del g.public_query_token
            query_deadline.reset(token)

    @app.errorhandler(TimeoutError)
    @app.errorhandler(QueryCanceled)
    def timed_out(_error):
        return failure("query_timeout", "This read exceeded its time budget. Narrow the query or retry.")

    @app.errorhandler(PoolTimeout)
    def pool_unavailable(_error):
        if query_deadline.get() is not None and time.monotonic() >= query_deadline.get():
            return timed_out(_error)
        return failure("read_capacity_unavailable", "Read capacity is temporarily unavailable. Retry shortly.", 503)

    @app.errorhandler(OperationalError)
    def database_unavailable(error):
        # Never expose a connection string, hostname, SQL or source parameters.
        app.logger.warning("Public database read failed (%s)", type(error).__name__)
        return failure("database_unavailable", "The public database is temporarily unavailable.", 503)

    @app.errorhandler(sqlite3.OperationalError)
    def sqlite_unavailable(error):
        if "interrupted" in str(error).lower():
            return timed_out(error)
        app.logger.warning("Public research read failed (%s)", type(error).__name__)
        return failure("research_data_unavailable", "The selected research resource is unavailable.", 503)

    @app.errorhandler(SnapshotBindingChanged)
    def snapshot_changed(_error):
        return failure("snapshot_binding_changed", "The selected public snapshot is unavailable or changed. A verified runtime is required.", 409, False)
