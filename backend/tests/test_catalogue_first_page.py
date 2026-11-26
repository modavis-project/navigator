from navigator_app.catalogue_first_page import catalogue_snapshot


def test_catalogue_snapshot_requires_fixity_and_tracks_dataset_identity():
    binding = {
        "sourceReleaseVersion": "1.6.0",
        "publicCoreSha256": "1" * 64,
        "publicManifestSha256": "2" * 64,
        "identifierLedgerSha256": "3" * 64,
        "uriPolicyVersion": "2",
    }
    snapshot = catalogue_snapshot(binding)
    assert snapshot and len(snapshot) == 64
    assert catalogue_snapshot(dict(reversed(tuple(binding.items())))) == snapshot
    assert catalogue_snapshot({**binding, "publicCoreSha256": "4" * 64}) != snapshot
    assert catalogue_snapshot({**binding, "publicManifestSha256": None}) is None
