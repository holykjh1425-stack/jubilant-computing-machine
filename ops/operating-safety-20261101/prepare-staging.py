"""Build an offline admin-only candidate over an unchanged Sites 28 export."""
from pathlib import Path
import argparse,hashlib,json,re,shutil
BASE_COMMIT='ab4d34c830669e69b57f0689588eb6a24b41f91e'
OVERLAY=['admin.html','admin.js','admin-base.css','admin-review.css','free-workflow.js','free-generation.js','plan-view.js','quote-flow.js','quote-panel.js','icons/nexus-192.png']
def git_blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--candidate',required=True);ap.add_argument('--baseline-dist',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
 source=Path(a.candidate).resolve();base=Path(a.baseline_dist).resolve();dest=Path(a.output).resolve()
 if dest.exists() or dest==source or dest==base or base in dest.parents or source in dest.parents:raise SystemExit('Output must be a new separate staging directory')
 manifest=json.loads(Path(__file__).with_name('release-manifest.json').read_text())
 if digest(base/'index.html')!=manifest['sites28_index_sha256']:raise SystemExit('Sites 28 baseline mismatch')
 for row in manifest['files']:
  rel=Path(row['path'])
  if rel.is_absolute() or '..' in rel.parts:raise SystemExit('Invalid candidate path')
  p=source/rel
  if p.is_symlink() or not p.is_file() or git_blob(p.read_bytes())!=row['git_blob']:raise SystemExit('Candidate mismatch: '+str(rel))
 for name in ['config.js','vendor/supabase-2.118.0.js']:
  if (base/name).read_bytes().rstrip(b'\r\n')!=(source/name).read_bytes().rstrip(b'\r\n'):raise SystemExit('Shared dependency differs beyond trailing line endings: '+name)
 shutil.copytree(base,dest,symlinks=False)
 for name in OVERLAY:
  p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,p)
 changed=[]
 for p in base.rglob('*'):
  if p.is_file() and p.read_bytes()!=(dest/p.relative_to(base)).read_bytes():changed.append(p.relative_to(base).as_posix())
 if set(changed)-set(OVERLAY):raise SystemExit('Out-of-scope file changed')
 for name in ['index.html','website.html','ai-automation.html','custom-system.html','solq-design.css','solq-design.js','app.js','api.js','privacy.html','refund.html']:
  if (base/name).read_bytes()!=(dest/name).read_bytes():raise SystemExit('Protected content changed: '+name)
 for path in re.findall(r'<(?:script|link)\b[^>]*?(?:src|href)="([^"#]+)"',(dest/'admin.html').read_text()):
  if path.startswith(('http:','https:')):raise SystemExit('Unexpected external admin asset')
  if not (dest/path).is_file():raise SystemExit('Missing admin dependency: '+path)
 admin=(dest/'admin.js').read_text();workflow=(dest/'free-workflow.js').read_text()
 if any(x in admin for x in ['processNew','free.plan(','free.assign(']):raise SystemExit('Automatic client generation remains')
 if any(x in workflow for x in ['.insert(','.update(','.rpc(','tick','submit']):raise SystemExit('Read-only workflow mismatch')
 result={'candidate_commit':manifest['candidate_commit'],'sites_baseline_commit':BASE_COMMIT,'offline_staging_only':True,'verified_files':len(manifest['files']),'changed_existing_files':changed,'protected_frontend_equal':True,'admin_dependencies_complete':True,'generation_auto_paths_absent':True,'real_auth':False,'real_edge_integration':False,'operating_backup_restore':False,'production_rollout_allowed':False}
 Path(__file__).with_name('staging-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
