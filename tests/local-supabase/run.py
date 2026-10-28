import subprocess,os,json,pathlib,urllib.request,urllib.error,secrets,time,uuid
cli=os.environ['SOLQ_CLI'];work=os.environ['SOLQ_STACK_DIR'];net=os.environ['SOLQ_STACK_NETWORK']
def cmd(args,input=None):return subprocess.run(args,input=input,text=True,capture_output=True,check=True).stdout.strip()
# status contains local disposable keys; capture in memory and never print/write it.
status=json.loads(subprocess.run([cli,'--network-id',net,'status','-o','json'],cwd=work,text=True,capture_output=True,check=True).stdout)
base=status['API_URL'];assert base in ['http://127.0.0.1:54321','http://localhost:54321'];anon=status['ANON_KEY']
network=json.loads(cmd(['docker','network','inspect',net]))[0];assert network['Internal'] is True
containers=json.loads(cmd(['docker','inspect',*cmd(['docker','ps','-q','--filter','network='+net]).splitlines()]))
for c in containers:
 assert list(c['NetworkSettings']['Networks'])==[net]
 for ports in c['NetworkSettings']['Ports'].values():
  for port in ports or []:assert port['HostIp'] in ['127.0.0.1','::1']
def sql(q):return cmd(['docker','exec','-i','supabase_db_solq-local-ci','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q)
sql(pathlib.Path('candidates/local-supabase/schema.sql').read_text())
def http(path,method='GET',body=None,token=None):
 assert path.startswith(('/auth/v1/','/rest/v1/','/functions/v1/'))
 headers={'apikey':anon,'content-type':'application/json'}
 if token:headers['authorization']='Bearer '+token
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
 checks.append({'name':name,'status':'PASS'})
users=[]
for n in range(2):
 password=secrets.token_urlsafe(30);email=f'solq-synthetic-{uuid.uuid4().hex}@example.invalid'
 code,d=http('/auth/v1/signup','POST',{'email':email,'password':password,'data':{'is_admin':True,'role':'admin'}})
 check('real local Auth signup '+str(n+1),code==200 and 'access_token'in d)
 code,login=http('/auth/v1/token?grant_type=password','POST',{'email':email,'password':password})
 password=None
 check('real local password authentication '+str(n+1),code==200 and 'access_token'in login)
 users.append((login['user']['id'],login['access_token']))
admin,token=users[0];other,nonadmin=users[1]
# Assign membership only in new local fixture through its local DB administrator.
sql("insert into solq_local_admins values('%s');insert into solq_local_applications values('aaaaaaaa-0000-4000-8000-000000000001',true),('aaaaaaaa-0000-4000-8000-000000000002',false);notify pgrst,'reload schema';"%admin)
time.sleep(2)
app='aaaaaaaa-0000-4000-8000-000000000001';pending='aaaaaaaa-0000-4000-8000-000000000002'
code,d=http('/rest/v1/solq_local_applications?select=id',token=token);check('actual PostgREST admin RLS sees synthetic applications',code==200 and len(d)==2)
for name,t in [('anonymous',None),('nonadmin with forged user_metadata',nonadmin)]:
 code,d=http('/rest/v1/solq_local_applications?select=id',token=t);check('actual RLS hides applications from '+name,code==200 and d==[])
 code,d=http('/rest/v1/rpc/solq_local_generate','POST',{'p_application':app},t);check('actual RPC denies '+name,code>=400)
# Deno runtime startup readiness only; never generate in a retry loop.
for i in range(40):
 try:
  code,_=http('/functions/v1/solq-local-plan','POST',{},nonadmin)
  if code==403:break
 except Exception:pass
 time.sleep(.5)
else:raise RuntimeError('LOCAL_EDGE_NOT_READY')
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
for _,t in users:http('/auth/v1/logout','POST',{},t)
report={'timestampUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'environment':'ephemeral GitHub runner local Supabase CLI 2.122.0; internal Docker network; loopback published ports only','pass':len(checks),'fail':0,'checks':checks,'realLocalSupabaseAuth':True,'realLocalDenoEdge':True,'realPostgrestRls':True,'realPostgresStorage':True,'syntheticAuthUsers':2,'productionIdentityUsed':False,'operatingProjectAccessed':False,'providerCalls':0,'actualApiUsd':0,'priorTestsRerun':False,'hostedDeployment':False}
pathlib.Path('tests/local-supabase/results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
