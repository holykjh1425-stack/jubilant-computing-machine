"""Build a disabled local overlay from verified Sites source. Never push/deploy.
Existing account information stays in the local source; no values are embedded here.
"""
import argparse, hashlib, json, re, shutil, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE_SHA = '3ad6da253713e9d52d96cb410d2803fcd47784f2'
HASHES = {
 'api.js':'bcf05e35e5ed7f615615f51c7561c6ba3624091838885b83176171525980f68f',
 'app.js':'f1ebd6f0bee54ff5f632266b82b94d017097e90c089c160fcdeef1f20a0dcfe4',
 'admin.js':'5fdae518b830d451210da66d342bed0741f3a4353743949d70eb3ea01f1d1cd4',
 'index.html':'c6fcd3602977fbbd6b455c459485c1a0d5663cd46e4c7df89c601a42f63de98c',
 'deposit.html':'8c29ffca7932358fd49cd5d08b73e14c66a84d420051fdb24b1404c8b4246b04',
 'deposit.js':'8bad4c634a83790d205837e6a8cd3efef6d005e0a0d729d63e58c543dda33ecf',
 'admin.html':'a8967e5303ecb7593af81d885991ef30899d4f8e4bfe71ebe1d486279fd14af9'
}
def once(text, old, new):
 assert text.count(old)==1, 'Source anchor changed; re-review required'
 return text.replace(old,new,1)

def assemble(source, output):
 source,output=source.resolve(),output.resolve()
 assert not output.exists(), 'Use a fresh, empty local output path'
 assert source not in output.parents and HERE.parent.parent not in output.parents
 sha=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
 assert sha==BASE_SHA, 'Sites source changed; re-review required'
 for name,expected in HASHES.items():
  assert hashlib.sha256((source/'dist'/name).read_bytes()).hexdigest()==expected, name+' baseline mismatch'
 shutil.copytree(source/'dist',output)
 def edit(name, old, new):
  p=output/name;p.write_text(once(p.read_text(),old,new))
 for name in ['client.js','admin-panel.js']:
  shutil.copyfile(HERE/name,output/('notification-'+name))
 edit('api.js','  async function submit(payload) {', '''  async function submit(payload) {
    if(window.SOLQ_NOTIFICATIONS){
      try{return await window.SOLQ_NOTIFICATIONS.submit({id:payload.id,receipt_number:payload.receipt_number,customer_name:payload.customer_name,contact:payload.contact,service_type:payload.service_type,description:payload.description,privacy_consent:true,transfer_consent:true});}
      catch(_){throw Object.assign(new Error('UNCERTAIN'),{code:'UNCERTAIN'});}
    }''')
 edit('index.html','<script src="api.js" defer></script>', '<script src="notification-client.js" defer></script><script src="api.js" defer></script>')
 p=output/'deposit.html';text=p.read_text()
 text,n=re.subn(r'(<script\b[^>]*src="deposit.js"[^>]*></script>)',r'<script src="config.js" defer></script><script src="notification-client.js" defer></script>\1',text)
 assert n==1;p.write_text(text)
 # Keep the existing bank value byte-for-byte; observe only successful account copies.
 p=output/'deposit.js';text=p.read_text()
 text=once(text,'async function copy(value){','async function copy(value,account=false){')
 text=once(text,'await navigator.clipboard.writeText(value);','await navigator.clipboard.writeText(value);if(account)void window.SOLQ_NOTIFICATIONS?.account("account_copied").catch(()=>{});')
 text,n=re.subn(r"(\$\('#copy-account'\)\.addEventListener\('click',\(\)=>copy\()('[^']*')(\)\);)",r'\1\2,true\3',text)
 assert n==1;p.write_text(text)
 edit('admin.js',"  form.querySelector('[type=submit]').disabled=false;", "  window.NEXUS_ADMIN_DB=db;\n  form.querySelector('[type=submit]').disabled=false;")
 edit('admin.js','function clearDashboard(){','function clearDashboard(){document.dispatchEvent(new Event("nexus-admin-session"));')
 edit('admin.html','<script src="admin.js" defer></script>', '<script src="notification-client.js" defer></script><script src="admin.js" defer></script><script src="notification-admin-panel.js" defer></script>')
 changed=[p.name for p in output.iterdir() if p.is_file() and (not (source/'dist'/p.name).exists() or p.read_bytes()!=(source/'dist'/p.name).read_bytes())]
 assert set(changed)=={'api.js','index.html','deposit.html','deposit.js','admin.js','admin.html','notification-client.js','notification-admin-panel.js'}
 # Production guard, quote, free-plan and configuration sources must remain identical.
 for name in ['config.js','free-workflow.js','plan-view.js','app.js']:
  assert (source/'dist'/name).read_bytes()==(output/name).read_bytes()
 result={'sourceCommit':sha,'enabled':False,'productionWrites':0,'changedFiles':sorted(changed),'hashes':{n:hashlib.sha256((output/n).read_bytes()).hexdigest() for n in changed}}
 print(json.dumps(result,indent=2))
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();assemble(a.source,a.output)
