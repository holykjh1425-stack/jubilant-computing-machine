"""Human-run read-only SOLQ authentication check. No browser/admin.js/server/SDK.
Run on a trusted PC terminal with existing config.js. Never pass credentials as args.
Auth login creates normal Auth session metadata; no business DB write is allowed.
"""
import getpass,json,re,sys,urllib.error,urllib.request
from pathlib import Path
BASE='https://elfacqmvygnwjlklqhiz.supabase.co'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise RuntimeError('REDIRECT_BLOCKED')
def allowed(method,path,body):
 if method=='POST' and path=='/auth/v1/token?grant_type=password':
  return isinstance(body,dict) and set(body)=={'email','password'} and all(isinstance(v,str) and v for v in body.values())
 if method=='GET' and path=='/auth/v1/user':return body is None
 if method=='GET' and re.fullmatch(r'/rest/v1/admin_users\?select=user_id&user_id=eq\.[a-f0-9-]{36}&limit=2',path):return body is None
 if method=='HEAD' and path in {f'/rest/v1/{t}?select=id' for t in ['applications','ai_work_plans','orchestrator_jobs']}:return body is None
 return method=='POST' and path=='/functions/v1/nexus-orchestrator' and body=={'action':'capabilities'}
def call(method,path,key,token=None,body=None,opener=None):
 if not allowed(method,path,body):raise RuntimeError('REQUEST_NOT_ALLOWLISTED')
 headers={'apikey':key,'Content-Type':'application/json','Cache-Control':'no-store'}
 if token:headers['Authorization']='Bearer '+token
 if method=='HEAD':headers.update(Prefer='count=exact',Range='0-0')
 req=urllib.request.Request(BASE+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
 # Never log HTTP exceptions: they can include request details from custom handlers.
 try:
  with (opener or urllib.request.build_opener(NoRedirect)).open(req,timeout=15) as r:
   return (json.loads(r.read()) if method!='HEAD' else None),r.headers
 except urllib.error.HTTPError as e:raise RuntimeError('HTTP_'+str(e.code)) from None
 except (urllib.error.URLError,TimeoutError):raise RuntimeError('NETWORK_FAILURE') from None
def check(key,email,password,request=call):
 data,_=request('POST','/auth/v1/token?grant_type=password',key,body={'email':email,'password':password})
 token=data.get('access_token');password=None;data=None
 if not isinstance(token,str) or not token:raise RuntimeError('NO_SESSION')
 user,_=request('GET','/auth/v1/user',key,token);uid=user.get('id','');user=None
 if not re.fullmatch(r'[a-f0-9-]{36}',uid):raise RuntimeError('INVALID_IDENTITY')
 admins,_=request('GET','/rest/v1/admin_users?select=user_id&user_id=eq.'+uid+'&limit=2',key,token)
 if len(admins)!=1 or admins[0].get('user_id')!=uid:raise RuntimeError('NOT_REGISTERED_ADMIN')
 counts={}
 for table in ['applications','ai_work_plans','orchestrator_jobs']:
  _,headers=request('HEAD','/rest/v1/'+table+'?select=id',key,token)
  raw=headers.get('Content-Range','');match=re.fullmatch(r'(?:\d+-\d+|\*)/(\d+)',raw)
  if not match:raise RuntimeError('COUNT_NOT_CONFIRMED')
  counts[table]=int(match[1])
 edge,_=request('POST','/functions/v1/nexus-orchestrator',key,token,{'action':'capabilities'})
 if edge.get('paid_calls')!=0 or edge.get('external_execution_enabled') is not False:raise RuntimeError('UNEXPECTED_EDGE_RESPONSE')
 # Tokens and user identity are deliberately omitted. No refresh/logout/retry/write RPC.
 token=None
 return {'actual_auth':True,'registered_admin':True,'postgrest_read':True,'edge_capabilities':True,'counts':counts,'new_approval_rpc_tested':False,'business_writes':0}
def main():
 if len(sys.argv)!=1 or not sys.stdin.isatty() or not sys.stderr.isatty():raise RuntimeError('TRUSTED_INTERACTIVE_TERMINAL_REQUIRED')
 cfg=(Path(__file__).resolve().parents[2]/'config.js').read_text()
 if 'SUPABASE_URL: "'+BASE+'"' not in cfg:raise RuntimeError('PROJECT_MISMATCH')
 match=re.search(r'SUPABASE_ANON_KEY:\s*"(sb_publishable_[A-Za-z0-9_-]+)"',cfg)
 if not match:raise RuntimeError('PUBLISHABLE_KEY_NOT_FOUND')
 print('Existing SOLQ application administrator only. One login attempt; no business writes. Do not use the dashboard Owner account unless it is also the registered application administrator.')
 email=getpass.getpass('Administrator email (hidden): ').strip();password=getpass.getpass('Administrator password (hidden): ')
 result=check(match[1],email,password);email=None;password=None
 print(json.dumps(result,indent=2))
if __name__=='__main__':
 try:main()
 except (RuntimeError,KeyboardInterrupt) as e:print('STOP:',str(e) if isinstance(e,RuntimeError) else 'CANCELLED');sys.exit(1)
