import importlib.util
import io
from pathlib import Path
import tarfile
import pytest

spec=importlib.util.spec_from_file_location('prepare',Path(__file__).parents[1]/'scripts/prepare.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)


def test_reject_different_and_missing_bytes(tmp_path):
    f=tmp_path/'input';f.write_bytes(b'preserved')
    entry={'bytes':9,'sha256':prepare.digest(f)}
    prepare.verify(f,entry)
    f.write_bytes(b'altered!!')
    with pytest.raises(ValueError):prepare.verify(f,entry)
    f.unlink()
    with pytest.raises(ValueError):prepare.verify(f,entry)


@pytest.mark.parametrize('name,kind',[('../escape',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('alias',tarfile.SYMTYPE)])
def test_reject_unsafe_archive(tmp_path,name,kind):
    src=tmp_path/'input.tar'
    with tarfile.open(src,'w') as t:
        entry=tarfile.TarInfo(name);entry.type=kind;entry.linkname='../escape';entry.size=0;t.addfile(entry)
    with pytest.raises(ValueError):prepare.unpack(src,tmp_path/'out')
    assert not (tmp_path/'escape').exists()


def test_valid_archive_retains_bytes(tmp_path):
    src=tmp_path/'input.tar'
    with tarfile.open(src,'w') as t:
        entry=tarfile.TarInfo('folder/data');entry.size=3;t.addfile(entry,io.BytesIO(b'abc'))
    prepare.unpack(src,tmp_path/'out')
    assert (tmp_path/'out/folder/data').read_bytes()==b'abc'


def test_database_readiness_waits_for_final_tcp_server():
    text=(Path(__file__).parents[1]/'compose.yaml').read_text()
    assert 'pg_isready -h 127.0.0.1' in text
    assert 'psql -h 127.0.0.1' in text


def test_preparation_records_current_software_version_without_changing_dataset(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace
    root = tmp_path / "source"
    (root / "releases").mkdir(parents=True)
    (root / "resources").mkdir()
    (root / "VERSION").write_text("1.1.0\n")
    package = tmp_path / "package"
    package.mkdir()
    archive = package / "fixture-ntriples.tar"
    with tarfile.open(archive, "w") as stream:
        member = tarfile.TarInfo("part.nt")
        member.size = 3
        stream.addfile(member, io.BytesIO(b"abc"))
    (root / "releases/pod-1.6.0.json").write_text(json.dumps({"files": [{
        "name": archive.name, "bytes": archive.stat().st_size, "sha256": prepare.digest(archive)}]}))
    resources = tmp_path / "resources.tar"
    with tarfile.open(resources, "w"):
        pass
    (root / "resources/archive.json").write_text(json.dumps({
        "bytes": resources.stat().st_size, "sha256": prepare.digest(resources)}))
    (root / "resources/manifest.json").write_text('{"files": {}}')
    monkeypatch.setattr(prepare, "ROOT", root)
    monkeypatch.setattr(prepare.shutil, "disk_usage", lambda _: SimpleNamespace(free=100 * 2**30))
    output = tmp_path / "runtime"
    prepare.prepare(package, resources, output)
    receipt = json.loads((output / "prepared.json").read_text())
    assert receipt["navigator"] == "1.1.0"
    assert receipt["pod"] == "1.6.0"
    assert (output / "artifacts/organs/part.nt").read_bytes() == b"abc"
    assert archive.exists()
    with pytest.raises(ValueError, match="already exists"):
        prepare.prepare(package, resources, output)
