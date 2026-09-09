#!/usr/bin/env python3
"""Build a small, disposable coverage index; never writes source/core artifacts."""
import argparse,hashlib,json,sqlite3,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from navigator_app.exploration_policy import bucket_sql,COUNTS,FAMILIES,POLICY

def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def build(manifest,out):
    m=json.loads(manifest.read_text());index=(manifest.parent/m['index']['path']).resolve()
    assert sha(index)==m['index']['sha256'],'Workbench index differs'
    out.mkdir(parents=True,exist_ok=False)
    c=sqlite3.connect(index.as_uri()+'?mode=ro&immutable=1',uri=True);c.execute('pragma query_only=on');c.execute('pragma temp_store=MEMORY')
    d=sqlite3.connect(out/'coverage.sqlite');d.execute('create table coverage(family text,scope text,dimension text,bucket text,occurrences integer,organs integer,sourceRecords integer,accounts integer,records integer,primary key(family,scope,dimension,bucket)) without rowid')
    counts={}
    for family in FAMILIES:
        for dimension in ['all','source','country','period','pitch','division']:
            if family=='activities' and dimension in ['pitch','division']:continue
            t=time.monotonic();expression=bucket_sql(dimension)
            for scoped in [False,True]:
                scope="coalesce(source_key,'')" if scoped else "'*'"
                sql='select '+scope+','+expression+','+COUNTS+' from term_occurrence where kind=? group by 1,2 order by 1,2'
                rows=list(c.execute(sql,(family,)))
                d.executemany('insert into coverage values (?,?,?,?,?,?,?,?,?)',[(family,r[0],dimension,*r[1:]) for r in rows])
            d.commit();counts[family+':'+dimension]=d.execute('select count(*) from coverage where family=? and dimension=?',(family,dimension)).fetchone()[0]
            print(family,dimension,counts[family+':'+dimension],round(time.monotonic()-t,2),flush=True)
    assert d.execute('pragma integrity_check').fetchone()[0]=='ok';d.close();c.close()
    policy=Path(__file__).resolve().parents[1]/'navigator_app/exploration_policy.py'
    result={'contract':'modavis.navigator-research-exploration/v1','coreSha256':m['core']['sha256'],'workbenchIndexSha256':m['index']['sha256'],'generatorSha256':sha(__file__),'policySha256':sha(policy),'policy':POLICY,'coverage':{'path':'coverage.sqlite','sha256':sha(out/'coverage.sqlite')},'rowCounts':counts}
    (out/'manifest.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print('COMPLETE',sha(out/'manifest.json'),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();build(a.manifest.resolve(),a.output.resolve())
