"""Only token validation, zero-row GETs and auth-denied Edge requests. No mutations."""
import concurrent.futures,json,re,urllib.request,urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[2]
config=(root/'config.js').read_text()
base=re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)",config).group(1)
key=re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)",config).group(1)
assert base=='https://elfacqmvygnwjlklqhiz.supabase.co' and key.startswith('sb_publishable_')
checks=[
 ('auth_missing_token','GET','/auth/v1/user',{},None),
 ('auth_invalid_token','GET','/auth/v1/user',{'Authorization':'Bearer SYNTHETIC_INVALID_TOKEN'},None),
 ('anon_applications_zero_rows','GET','/rest/v1/applications?select=id&limit=0',{},None),
 ('anon_plans_zero_rows','GET','/rest/v1/ai_work_plans?select=id&limit=0',{},None),
 ('anon_admins_zero_rows','GET','/rest/v1/admin_users?select=user_id&limit=0',{},None),
 ('orchestrator_missing_token','POST','/functions/v1/nexus-orchestrator',{'Origin':'https://solqtech.com'},b'{"action":"capabilities"}'),
 ('orchestrator_invalid_token','POST','/functions/v1/nexus-orchestrator',{'Origin':'https://solqtech.com','Authorization':'Bearer SYNTHETIC_INVALID_TOKEN'},b'{"action":"capabilities"}'),
 ('orchestrator_preflight','OPTIONS','/functions/v1/nexus-orchestrator',{'Origin':'https://solqtech.com','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'},None),
 ('machine_worker_browser_denied','POST','/functions/v1/nexus-agent-worker',{'Origin':'https://solqtech.com'},b'{}'),
 ('production_snapshot_missing_token','POST','/functions/v1/nexus-production',{},b'{"action":"snapshot"}')]
def check(item):
 name,method,path,extra,data=item
 req=urllib.request.Request(base+path,data=data,method=method,headers={'apikey':key,'Content-Type':'application/json',**extra})
 try:r=urllib.request.urlopen(req,timeout=20)
 except urllib.error.HTTPError as e:r=e
 except Exception as e:return {'name':name,'transport_error':type(e).__name__}
 status=r.code;raw=r.read();headers=r.headers
 try:body=json.loads(raw or b'null')
 except:body=None
 # Never persist response bodies or tokens; retain status and generic error code only.
 code=body.get('code',body.get('error')) if isinstance(body,dict) else None
 if not isinstance(code,(str,int,type(None))):code=None
 expected=(200<=status<300) if method=='OPTIONS' else status in (401,403)
 return {'name':name,'status':status,'error_code':code,'pass':expected,'allow_origin':headers.get('Access-Control-Allow-Origin'),'cache_control':headers.get('Cache-Control')}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(check,checks))
out={'scope':'Live authentication rejection and zero-row permission checks only','real_admin_session_tested':False,'business_write_actions_sent':0,'results':results}
(root/'ops/residual-validation/live-auth-results.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out))
