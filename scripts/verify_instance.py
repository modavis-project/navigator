#!/usr/bin/env python3
"""Check core research capabilities on a running Navigator instance."""
import argparse
import json
from urllib.request import urlopen


def verify(base):
    checks=[]
    def get(path):
        with urlopen(base.rstrip('/')+path,timeout=120) as response:
            if response.status!=200:raise ValueError(path)
            return json.load(response)
    ready=get('/api/health/ready');assert ready['ok'];checks.append('Readiness')
    release=get('/api/release-context');assert release['releaseVersion']=='1.6.0' and release['sourceReleaseVersion']=='1.6.0';checks.append('POD source/export bindings')
    for path in ['/api/organs/FFH7-Z9KV-V','/api/organs/GPZT-DW3W-W','/api/omaro/concepts','/api/map/summary.json','/api/workbench/context','/api/research/actors','/api/vocab/usage/stops?term=Vox+Humana&match=exact','/api/research-exploration/terms/stops?term=Vox+Humana&match=exact&dimension=country']:
        value=get(path);assert isinstance(value,dict) and value;checks.append(path)
    return {'status':'passed','checks':checks}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--base-url',default='http://localhost:8080');args=p.parse_args();print(json.dumps(verify(args.base_url),indent=2))
