#!/usr/bin/env python3
"""Verify and prepare POD artifacts without modifying the downloaded package."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def verify(path, entry):
    if not path.is_file() or path.stat().st_size != entry['bytes'] or digest(path) != entry['sha256']:
        raise ValueError(f'Artifact missing or different: {path.name}')


def unpack(path, target):
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(path) as archive:
        for member in archive.getmembers():
            name = Path(member.name)
            if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):
                raise ValueError(f'Unsafe archive member: {member.name}')
        archive.extractall(target, filter='data')


def prepare(package, resources, output):
    package, resources, output = package.resolve(), resources.resolve(), output.resolve()
    if (ROOT/'.env').exists():
        raise ValueError('.env already exists; preserve it before preparing a separate installation')
    if output.exists():
        raise ValueError('Output already exists; use a new directory to preserve prior state')
    manifest = json.loads((ROOT/'releases/pod-1.6.0.json').read_text())
    for entry in manifest['files']:
        verify(package/entry['name'], entry)
    verify(resources, json.loads((ROOT/'resources/archive.json').read_text()))
    output.parent.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(output.parent).free < 50 * 2**30:
        raise ValueError('At least 50 GiB free is required for extracted artifacts (database space is additional)')
    output.mkdir()
    artifacts = output/'artifacts'
    artifacts.mkdir()
    for entry in manifest['files']:
        name = entry['name']; src = package/name
        if name.endswith('.sqlite.gz'):
            target = artifacts/name[:-3]
            with gzip.open(src, 'rb') as source, target.open('xb') as dest:
                shutil.copyfileobj(source, dest, 1024*1024)
            if digest(target) != entry['decodedSha256']:
                raise ValueError(f'Decoded bytes differ: {name}')
        elif name.endswith('research-runtime.tar.gz'):
            unpack(src, artifacts)
        elif name.endswith('-ntriples.tar'):
            unpack(src, artifacts/'semantic')
        else:
            shutil.copy2(src, artifacts/name)
    unpack(resources, output/'resources')
    resource_manifest = json.loads((ROOT/'resources/manifest.json').read_text())
    for name, entry in resource_manifest['files'].items():
        verify(output/'resources'/name, entry)
    # Distribution entries define their family; do not infer it from filenames.
    files = {p.name:p for p in (artifacts/'semantic').rglob('*') if p.is_file()}
    for family in ['organs', 'entities']:
        (artifacts/family).mkdir()
    # Both roots can resolve a part name; manifest validation retains family and hash checks.
    for name, src in files.items():
        for family in ['organs','entities']:
            os.link(src, artifacts/family/name)
    configure(output)
    (output/'prepared.json').write_text(json.dumps({'navigator':'1.0.0','pod':'1.6.0','verifiedFiles':len(manifest['files']),'resourceArchiveSha256':digest(resources)},indent=2)+'\n')
    print('Prepared', output)


def configure(output):
    """Write private runtime bindings; existing credentials are never overwritten."""
    output = Path(output).resolve()
    def quote(value):
        if any(c in str(value) for c in ['\n','\r',"'"]): raise ValueError('Unsupported character in configuration path')
        return "'"+str(value)+"'"
    env = ROOT/'.env'
    if env.exists(): raise ValueError('.env exists; preserve or move it before configuring a new instance')
    env.write_text('\n'.join([
        'NAVIGATOR_RUNTIME='+quote(output),
        'POSTGRES_PASSWORD='+secrets.token_hex(24),
        'NAVIGATOR_READ_PASSWORD='+secrets.token_hex(24),
        'NAVIGATOR_PORT=8080',
        'NAVIGATOR_PUBLIC_URL=http://localhost:8080',
    ])+'\n');env.chmod(0o600)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True, help='Directory of POD 1.6.0 Zenodo files')
    parser.add_argument('--resources', type=Path, required=True, help='Navigator resources release attachment')
    parser.add_argument('--output', type=Path, required=True, help='New extracted runtime directory')
    args=parser.parse_args();prepare(args.package,args.resources,args.output)
