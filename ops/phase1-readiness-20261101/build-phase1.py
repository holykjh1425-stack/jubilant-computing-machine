"""Offline assembly only. Never contacts a database or publishes a Site."""
import argparse,hashlib,json,re,shutil
from pathlib import Path
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--sites28-dist',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
 here=Path(__file__).resolve().parent;m=json.loads((here/'phase1-files.json').read_text());source=Path(a.source).resolve();base=Path(a.sites28_dist).resolve();dest=Path(a.output).resolve()
 if dest.exists() or any(x==dest or x in dest.parents for x in [source,base,here]):raise SystemExit('NEW_SEPARATE_OUTPUT_REQUIRED')
 for name,digest in m['baseline'].items():
  if sha(base/name)!=digest:raise SystemExit('BASELINE_MISMATCH: '+name)
 for name,digest in m['candidate_inputs'].items():
  if sha(source/name)!=digest:raise SystemExit('SOURCE_MISMATCH: '+name)
 for name in m['overrides']:
  if sha(here/name)!=m['files'][name]:raise SystemExit('OVERRIDE_MISMATCH: '+name)
 shutil.copytree(base,dest)
 for name in m['overlay']:
  p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile((here if name in m['overrides'] else source)/name,p)
 protected=[n for n in m['baseline'] if n not in m['overlay']]
 if any(sha(base/n)!=sha(dest/n) for n in protected):raise SystemExit('PROTECTED_FILE_CHANGED')
 for path in re.findall(r'<(?:script|link)\b[^>]*?(?:src|href)="([^"#]+)"',(dest/'admin.html').read_text()):
  if path.startswith(('http:','https:')) or not (dest/path).is_file():raise SystemExit('ADMIN_DEPENDENCY_INVALID')
 admin=(dest/'admin.js').read_text()
 if any(x in admin for x in ['processNew','free.plan(','free.assign(','createFreeGeneration','generationApi']):raise SystemExit('AUTO_GENERATION_REMAINS')
 if 'free-generation.js' in (dest/'admin.html').read_text():raise SystemExit('MANUAL_ONLY_RPC_DEPENDENCY_REMAINS')
 result={'offline_only':True,'protected_files_equal':True,'protected_file_count':len(protected),'dependencies_complete':True,'server_worker_modified':False,'database_modified':False,'production_deployed':False}
 (here/'assembly-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
if __name__=='__main__':main()
