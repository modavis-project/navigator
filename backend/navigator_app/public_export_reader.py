"""Use the complete corpus record builders for PostgreSQL HTTP exports."""

from __future__ import annotations

from typing import Any

from .bulk_lod import PublicCoreOrganReader
from .bulk_entity_lod import PublicCoreEntityReader


class _PostgresRows:
    def __init__(self, connection):
        self.connection = connection

    def _rows(self, sql, values):
        # Only internal reader SQL reaches this adapter. Escape literal percent
        # signs before translating the readers' parameter placeholders.
        query = sql.replace("%", "%%").replace("?", "%s")
        return [dict(row) for row in self.connection.execute(query, tuple(values)).fetchall()]


class PublicOrganExportReader(_PostgresRows, PublicCoreOrganReader):
    def __init__(self, connection):
        super().__init__(connection)
        self._actors: dict[str, bool] = {}

    def _is_canonical_actor(self, identifier):
        if not identifier:
            return False
        if identifier not in self._actors:
            self._actors[identifier] = bool(self._rows(
                "select mdvs_id from actor where mdvs_id=?", (identifier,),
            ))
        return self._actors[identifier]


class PublicEntityExportReader(_PostgresRows, PublicCoreEntityReader):
    pass


def complete_public_record(connection, kind: str, identifier: str) -> dict[str, Any] | None:
    """Read the same fields and ordering used by the SQLite corpus builders."""
    domains = {
        "person": ("actors", "ENTY"), "organization": ("actors", "ENTY"),
        "place": ("places", "LOCN"), "name": ("names", "NAME"),
        "virtual_instrument": ("virtual_instruments", "VMIN"),
    }
    if kind != "organ" and kind not in domains:
        return None
    family = "ENTY" if kind == "organ" else domains[kind][1]
    token = str(identifier).rsplit(":", 1)[-1]
    identifier = f"MDVS:{family}:{token}"
    with connection.transaction():
        connection.execute("SET LOCAL search_path TO release_1_5_public, pg_catalog")
        connection.execute("SET LOCAL transaction_read_only = on")
        if kind == "organ":
            reader = PublicOrganExportReader(connection)
            if not reader._rows("select mdvs_id from organ where mdvs_id=?", (identifier,)):
                return None
            return reader.record(identifier)[0]
        records, _ = PublicEntityExportReader(connection).records(domains[kind][0], [identifier])
        return records[0] if records else None
