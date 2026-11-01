import subprocess,os,json,pathlib,urllib.request,urllib.error,secrets,time,uuid
cli=os.environ['SOLQ_CLI'];work=os.environ['SOLQ_STACK_DIR'];net=os.environ['SOLQ_STACK_NETWORK']
os.environ.update(SUPABASE_SERVICES_HOSTNAME='solq-ci-db.invalid',SUPABASE_DB_PORT='5432',SUPABASE_API_EXTERNAL_URL='http://solq-ci-api.invalid:8000')
os.environ['NO_PROXY']=os.environ.get('NO_PROXY','')+',solq-ci-api.invalid,solq-ci-db.invalid'
def cmd(args,input=None):return subprocess.run(args,input=input,text=True,capture_output=True,check=True).stdout.strip()
# status contains local disposable keys; capture in memory and never print/write it.
status=json.loads(subprocess.run([cli,'--network-id',net,'status','-o','json'],cwd=work,text=True,capture_output=True,check=True).stdout)
base=status['API_URL'];assert base=='http://solq-ci-api.invalid:8000';anon=status['ANON_KEY'];local_admin_key=status['SERVICE_ROLE_KEY']
network=json.loads(cmd(['docker','network','inspect',net]))[0];assert network['Internal'] is True
containers=json.loads(cmd(['docker','inspect',*cmd(['docker','ps','-q','--filter','network='+net]).splitlines()]))
for c in containers:
 assert list(c['NetworkSettings']['Networks'])==[net]
 for ports in c['NetworkSettings']['Ports'].values():
  for port in ports or []:assert port['HostIp'] in ['127.0.0.1','::1']
def sql(q):return cmd(['docker','exec','-i','supabase_db_solq-local-ci','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q)
sql(pathlib.Path('candidates/local-supabase/schema.sql').read_text().replace('solq_local_admins','admin_users'))
def http(path,method='GET',body=None,token=None,admin=False):
 assert path.startswith(('/auth/v1/','/rest/v1/','/functions/v1/'))
 headers={'apikey':anon,'content-type':'application/json'}
 if token:headers['authorization']='Bearer '+token
 if admin:headers.update(apikey=local_admin_key,authorization='Bearer '+local_admin_key)
 req=urllib.request.Request(base+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
 try:
  with urllib.request.urlopen(req,timeout=20)as r:
   payload=r.read();return r.status,json.loads(payload)if payload else {}
 except urllib.error.HTTPError as e:
  # Never record auth bodies, passwords or tokens, even on failure.
  try:d=json.load(e)
  except:d={}
  return e.code,d
checks=[]
def check(name,condition):
 if not condition:raise RuntimeError('CHECK_FAILED: '+name)
 checks.append({'name':name,'status':'PASS'});print('CHECK_PASS '+name,flush=True)
users=[]
for n in range(2):
 email=f'solq-synthetic-{uuid.uuid4().hex}@example.invalid'
 code,created=http('/auth/v1/admin/users','POST',{'email':email,'email_confirm':True,'user_metadata':{'is_admin':True,'role':'admin'}},admin=True)
 check('local passwordless fixture user creation '+str(n+1),code==200 and 'id' in created)
 code,link=http('/auth/v1/admin/generate_link','POST',{'type':'magiclink','email':email},admin=True)
 check('official local one-time sign-in link '+str(n+1),code==200 and isinstance(link.get('hashed_token'),str))
 code,login=http('/auth/v1/verify','POST',{'type':'magiclink','token_hash':link['hashed_token']})
 link=None
 check('actual local Auth passwordless JWT session '+str(n+1),code==200 and isinstance(login.get('access_token'),str))
 uid=login['user']['id'];assert str(uuid.UUID(uid))==uid
 code,verified=http('/auth/v1/user',token=login['access_token'])
 check('Auth server validates issued user session '+str(n+1),code==200 and verified.get('id')==uid)
 users.append((uid,login['access_token']))
admin,token=users[0];other,nonadmin=users[1]
# Assign membership only in new local fixture through its local DB administrator.
sql("insert into admin_users values('%s');insert into solq_local_applications values('aaaaaaaa-0000-4000-8000-000000000001',true),('aaaaaaaa-0000-4000-8000-000000000002',false);notify pgrst,'reload schema';"%admin)
time.sleep(2)
app='aaaaaaaa-0000-4000-8000-000000000001';pending='aaaaaaaa-0000-4000-8000-000000000002'
code,d=http('/rest/v1/admin_users?select=user_id&user_id=eq.'+admin,token=token);check('actual JWT scoped admin_users membership',code==200 and len(d)==1 and d[0]['user_id']==admin)
code,d=http('/rest/v1/admin_users?select=user_id',token=nonadmin);check('forged user_metadata grants no administrator membership',code==200 and d==[])
code,_=http('/functions/v1/solq-local-plan','POST',{'applicationId':app},'synthetic-invalid-token');check('Edge rejects invalid JWT',code==401)
code,d=http('/rest/v1/solq_local_applications?select=id',token=token);check('actual PostgREST admin RLS sees synthetic applications',code==200 and len(d)==2)
for name,t in [('anonymous',None),('nonadmin with forged user_metadata',nonadmin)]:
 code,d=http('/rest/v1/solq_local_applications?select=id',token=t);check('actual RLS hides applications from '+name,code==200 and d==[])
 code,d=http('/rest/v1/rpc/solq_local_generate','POST',{'p_application':app},t);check('actual RPC denies '+name,code>=400)
code,_=http('/functions/v1/solq-local-plan','POST',{},nonadmin)
check('real Edge rejects authenticated nonadmin',code==403)
code,_=http('/functions/v1/solq-local-plan','POST',{'applicationId':app});check('real Edge rejects missing user session',code==401)
code,_=http('/functions/v1/solq-local-plan','POST',{'applicationId':pending},token);check('real Edge plus RPC rejects missing plan approval',code==409)
code,d=http('/functions/v1/solq-local-plan','POST',{'applicationId':app},token);check('real Deno Edge Auth PostgREST DB creation',code==200 and d.get('actualProviderCalls')==0 and d.get('productionStarted')is False)
ids=(d['planId'],d['jobId']);code,again=http('/functions/v1/solq-local-plan','POST',{'applicationId':app},token);check('real Edge reuses persisted plan/job without regeneration',code==200 and again['reused']and (again['planId'],again['jobId'])==ids)
code,plans=http('/rest/v1/solq_local_plans?select=id,steps',token=token);check('actual stored six rule phases match Edge result',code==200 and len(plans)==1 and plans[0]['id']==ids[0]and plans[0]['steps']==['requirements','scope','implementation','validation','human_review','delivery'])
code,jobs=http('/rest/v1/solq_local_jobs?select=id,status,plan_id',token=token);check('persisted job awaits separate production approval',code==200 and len(jobs)==1 and jobs[0]['id']==ids[1]and jobs[0]['status']=='awaiting_approval'and jobs[0]['plan_id']==ids[0])
code,notes=http('/rest/v1/solq_local_annotations?select=source,plan_id',token=token);check('mock Claude annotation separate from rules plan',code==200 and len(notes)==1 and notes[0]['source']=='claude_mock'and notes[0]['plan_id']==ids[0])
for table in ['solq_local_plans','solq_local_jobs','solq_local_annotations']:
 code,d=http('/rest/v1/'+table+'?select=*',token=nonadmin);check('actual nonadmin RLS hides '+table,code==200 and d==[])
# New checks at this previously unexecuted real Auth/Edge boundary, not old PG fixture reruns.
sql("update solq_local_applications set approved=true where id='"+pending+"';create function public.solq_fixture_fail_job() returns trigger language plpgsql as $$begin raise exception 'synthetic_fault';end$$;create trigger solq_fixture_fault before insert on public.solq_local_jobs for each row execute function public.solq_fixture_fail_job();")
code,_=http('/functions/v1/solq-local-plan','POST',{'applicationId':pending},token)
check('actual Edge forced job insert failure returns no success',code==409)
left=sql("select (select count(*) from solq_local_plans where application_id='"+pending+"')+(select count(*) from solq_local_jobs where application_id='"+pending+"');")
check('actual PostgreSQL plan insert rolled back with failed job',left=='0')
sql('drop trigger solq_fixture_fault on public.solq_local_jobs;drop function public.solq_fixture_fail_job();')
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=8) as pool:
 responses=list(pool.map(lambda _:http('/functions/v1/solq-local-plan','POST',{'applicationId':pending},token),range(8)))
check('8 authenticated concurrent Edge requests create one linked pair after rollback',all(c==200 for c,_ in responses) and len({(d['planId'],d['jobId']) for _,d in responses})==1 and sum(not d['reused'] for _,d in responses)==1)
check('PostgreSQL final two applications have two unique linked pairs',sql("select (select count(*) from solq_local_plans)::text||','||(select count(*) from solq_local_jobs)::text;")=='2,2')
for n,(_,t) in enumerate(users):
 code,_=http('/auth/v1/logout','POST',{},t);check('local Auth session logout request '+str(n+1),code in (200,204))
report={'sourceCommit':os.environ.get('GITHUB_SHA'),'timestampUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':'ephemeral GitHub runner local Supabase CLI 2.122.0; internal Docker network; direct internal service routes; no published ports','pass':len(checks),'fail':0,'checks':checks,'realLocalSupabaseAuth':True,'realLocalDenoEdge':True,'realPostgrestRls':True,'realPostgresStorage':True,'syntheticAuthUsers':2,'productionIdentityUsed':False,'newPasswordsCreatedByTest':0,'newApiKeysCreatedByTest':0,'authenticationMethod':'official local passwordless magiclink; not operating admin login','operatingProjectAccessed':False,'providerCalls':0,'actualApiUsd':0,'priorTestsRerun':False,'hostedDeployment':False}
pathlib.Path('tests/local-supabase/results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
