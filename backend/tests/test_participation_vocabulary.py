from contextlib import contextmanager
from types import SimpleNamespace

from navigator_app import public_repository
from navigator_app.participation_vocabulary import participation_role_reference, recorded_participation_roles
from navigator_app.public_repository import PublicReleaseRepository


def test_role_links_use_only_known_explicit_roles():
    restorer = participation_role_reference(" Restorer ")
    assert restorer == {
        "recordedCode": "restorer",
        "code": "activity_role.restorer",
        "labels": {"en": "Restorer", "de": "Restauratorin oder Restaurator"},
        "href": "/vocab/editions/modavis/person-terms/activity-role.restorer",
    }
    assert participation_role_reference("builder")["href"] == "/vocab/person-terms/activity-role.builder"
    assert participation_role_reference("custody_transferor")["code"] != participation_role_reference("custody_recipient")["code"]
    assert "restorer" in recorded_participation_roles()
    for value in (None, "restoration", "builder_of", "organist", "transfer/relocate", "participant", {"name": "restorer"}):
        assert participation_role_reference(value) is None


def test_event_detail_preserves_activity_and_links_role_independently(monkeypatch):
    participants = [
        {"name": "Workshop", "role": "restorer", "activities": ["documented intervention"]},
        {"name": "Different workshop", "role": "participant", "activities": ["restorer"]},
        {"name": "Unspecified", "role": "restoration", "activities": ["restoration"]},
    ]
    event = {
        "event_id": "event:fixture", "source_record_id": "source:fixture", "source_key": "fixture",
        "organ_mdvs_id": "MDVS:ENTY:TEST-0001-A", "participants": participants,
        "controlled_event_type": "restoration", "date_values_json": [],
    }

    @contextmanager
    def connect(_):
        def execute(sql, _):
            row = {"label": "Example organ"} if "select label from" in sql else event
            return SimpleNamespace(fetchone=lambda: row)

        yield SimpleNamespace(execute=execute)

    monkeypatch.setattr(public_repository, "connect", connect)
    repo = object.__new__(PublicReleaseRepository)
    repo.settings = None
    repo._event_context = lambda rows: rows
    entries = repo.get_event(event["event_id"])["participants"]
    assert entries[0]["role"] == {"name": "documented intervention"}
    assert entries[0]["participationRole"]["code"] == "activity_role.restorer"
    assert entries[1]["role"] == {"name": "restorer"}
    assert "participationRole" not in entries[1]
    assert "participationRole" not in entries[2]
    assert "participationRole" not in repo._event_summary(event)["participants"][0]
