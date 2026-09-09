#!/usr/bin/env python3
"""Download the pinned POD release after its public Zenodo record is available."""
import argparse
import json
from pathlib import Path
import shutil
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import urlopen
from prepare import ROOT, verify


def download(output):
    manifest=json.loads((ROOT/'releases/pod-1.6.0.json').read_text())
    try:
        with urlopen('https://zenodo.org/api/records/'+manifest['recordId'],timeout=60) as response:record=json.load(response)
    except HTTPError as error:
        if error.code==404:raise SystemExit('POD 1.6.0 is not publicly available yet; use the verified local package or try after publication.') from error
        raise
    if record.get('metadata',{}).get('version')!=manifest['version']:
        raise ValueError('The Zenodo record has a different dataset version')
    output.mkdir(parents=True,exist_ok=True)
    for entry in manifest['files']:
        name=entry['name'];target=output/name
        if target.exists():verify(target,entry);continue
        matches=[f for f in record['files'] if f['key']==name or f['key'].endswith('__'+name)]
        if len(matches)!=1:raise ValueError(f'Expected exactly one published file for {name}')
        url=matches[0]['links']['self'];parts=urlsplit(url)
        if parts.scheme!='https' or parts.hostname!='zenodo.org':raise ValueError('Unexpected download origin')
        partial=output/(name+'.partial')
        if partial.exists():raise ValueError(f'Preserve or remove the incomplete download before retrying: {partial}')
        print('Downloading',name,flush=True)
        with urlopen(url,timeout=120) as response,partial.open('xb') as stream:shutil.copyfileobj(response,stream,1024*1024)
        verify(partial,entry);partial.rename(target)
    print('Verified POD',manifest['version'])


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);download(p.parse_args().output)
