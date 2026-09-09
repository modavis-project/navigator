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
