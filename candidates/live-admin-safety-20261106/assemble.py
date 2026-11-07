from pathlib import Path
import subprocess, hashlib, json
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent.parent
SITE=REPO.parent/'solq-refund-publish'
SHA='ab4d34c830669e69b57f0689588eb6a24b41f91e'
def baseline(name):
    return subprocess.check_output(['git','-C',str(SITE),'show',f'{SHA}:dist/{name}'],text=True)
base=baseline('admin.js')
start=base.index("  const autoCutoff=")
end=base.index('  function planControls(',start)
replacement="""  const free=createFreeWorkflow({db,verifyAdmin});
  const freeViews=new Map();
  setInterval(()=>{if(user&&!document.hidden)for(const update of freeViews.values())update();},30000);
"""
patched=base[:start]+replacement+base[end:]
readonly=(REPO/'ops/admin-integration-candidate/admin.js').read_text()
control=readonly[readonly.index('  function planControls('):readonly.index('  function render(application)')]
start=patched.index('  function planControls(')
end=patched.index('  function render(application)',start)
patched=patched[:start]+control+patched[end:]
assert 'processNew' not in patched and 'free.assign(' not in patched and 'free.plan(' not in patched
assert patched[patched.index('  function render(application)'):]==base[base.index('  function render(application)'):]
html=baseline('admin.html')
assert html.count('<script src="admin.js" defer></script>')==1
html=html.replace('<script src="admin.js" defer></script>','<script src="plan-view.js" defer></script><script src="admin.js" defer></script>')
dist=ROOT/'dist';dist.mkdir(exist_ok=True)
(dist/'admin.js').write_text(patched)
(dist/'admin.html').write_text(html)
for name in ['free-workflow.js','plan-view.js']:
    (dist/name).write_text((REPO/'ops/admin-integration-candidate'/name).read_text())
for name in ['styles.css','icon.svg']:
    (dist/name).write_text(baseline(name))
manifest={'baselineSitesCommit':SHA,'baseAdminSha256':hashlib.sha256(base.encode()).hexdigest(),'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dist.iterdir() if p.is_file()},'productionChanged':False}
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'baseline':SHA,'candidateFiles':4,'status':'assembled; no deployment'}))
