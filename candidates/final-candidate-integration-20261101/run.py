import subprocess,os,json,pathlib,urllib.request,urllib.error,time,uuid,hashlib
from concurrent.futures import ThreadPoolExecutor
root=pathlib.Path('candidates/final-candidate-integration-20261101')
cli=os.environ['SOLQ_CLI'];work=os.environ['SOLQ_STACK_DIR'];net=os.environ['SOLQ_STACK_NETWORK']
os.environ.update(SUPABASE_SERVICES_HOSTNAME='solq-ci-db.invalid',SUPABASE_DB_PORT='5432',SUPABASE_API_EXTERNAL_URL='http://solq-ci-api.invalid:8000')
os.environ['NO_PROXY']=os.environ.get('NO_PROXY','')+',solq-ci-api.invalid,solq-ci-db.invalid'
def cmd(args,input=None):
 r=subprocess.run(args,input=input,text=True,capture_output=True)
 if r.returncode:raise RuntimeError('LOCAL_COMMAND_FAILED '+args[0]+' '+r.stderr[-600:])
 return r.stdout.strip()
def sql(q):return cmd(['docker','exec','-i','supabase_db_solq-local-ci','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q)
network=json.loads(cmd(['docker','network','inspect',net]))[0];assert network['Internal'] is True
status=json.loads(subprocess.run([cli,'--network-id',net,'status','-o','json'],cwd=work,text=True,capture_output=True,check=True).stdout)
base=status['API_URL'];assert base=='http://solq-ci-api.invalid:8000'
anon=status['ANON_KEY'];local_admin=status['SERVICE_ROLE_KEY'];status=None
def http(path,method='POST',body=None,token=None,admin=False,origin='https://solqtech.com'):
 assert path.startswith(('/auth/v1/','/rest/v1/','/functions/v1/'))
 headers={'apikey':anon,'content-type':'application/json','origin':origin}
 if token:headers['authorization']='Bearer '+token
 if admin:headers.update(apikey=local_admin,authorization='Bearer '+local_admin)
 req=urllib.request.Request(base+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
 try:
  with urllib.request.urlopen(req,timeout=20)as r:return r.status,json.loads(r.read()or b'{}')
 except urllib.error.HTTPError as e:
  try:d=json.load(e)
  except:d={}
  return e.code,d
checks=[]
def check(name,ok):
 if not ok:raise RuntimeError('CHECK_FAILED '+name)
 checks.append({'name':name,'status':'PASS'});print('CHECK_PASS '+name,flush=True)
# Auth startup is a prerequisite; the former 33 tests are not invoked/recounted.
users=[]
for n in range(2):
 email='solq-quote-synthetic-'+uuid.uuid4().hex+'@example.invalid'
 code,u=http('/auth/v1/admin/users',body={'email':email,'email_confirm':True,'user_metadata':{'role':'admin'}},admin=True);assert code==200
 code,link=http('/auth/v1/admin/generate_link',body={'type':'magiclink','email':email},admin=True);assert code==200
 code,login=http('/auth/v1/verify',body={'type':'magiclink','token_hash':link['hashed_token']});assert code==200
 users.append((login['user']['id'],login['access_token']));link=None;login=None
actor,token=users[0];_,other=users[1]
sql(root.joinpath('fixture.sql').read_text())
core=pathlib.Path('supabase/migrations/20261021213341_production_core.sql').read_text()
# Only unchanged base table/policy definitions are required. Do not install schedules,
# provider commands, access links, workers, or execute production functions.
sql(core.split('create function nexus_production_private.plan(')[0])
automation=pathlib.Path('ops/free-plan-automation/automation.sql').read_text()
quote_ddl=automation[automation.index('create table public.solq_quote_acceptances ('):automation.index('create function nexus_production_private.free_plan(')]
sql(quote_ddl)
sql('alter table public.production_jobs add column production_approved_at timestamptz,add column production_approved_by uuid references public.admin_users(user_id);')
# Exact existing candidate SQL bytes; no function stub is used for record/ledger/guard/approve.
for path in ['ops/free-plan-automation/quote-evidence.sql','ops/admin-integration-candidate/quote-deposit-guard.sql','ops/free-plan-automation/production-gates.sql']:
 sql(pathlib.Path(path).read_text())
sql("grant execute on function nexus_production_private.approve(uuid) to authenticated;create function public.solq_test_approve(p_application uuid) returns jsonb language sql security invoker set search_path='' as $$select nexus_production_private.approve(p_application)$$;revoke all on function public.solq_test_approve(uuid) from public,anon,service_role;grant execute on function public.solq_test_approve(uuid) to authenticated;")
app='aaaaaaaa-1111-4111-8111-000000000001';app2='aaaaaaaa-1111-4111-8111-000000000002'
sql("insert into admin_users values('"+actor+"');insert into applications(id,receipt_number,service_type,description) values('"+app+"','NX-20261101-A0000001','ai_automation','synthetic quote flow'),('"+app2+"','NX-20261101-A0000002','ai_automation','synthetic rollback');insert into production_jobs(application_id,receipt_number,service_type,provider,plan) select id,receipt_number,service_type,'codex','{}'::jsonb from applications;notify pgrst,'reload schema';")
time.sleep(2)
edge='/functions/v1/solq-local-plan'
def call(action,extra=None,t=token,application=app):return http(edge,body={'action':action,'application_id':application,**(extra or {})},token=t)
def approve(application=app,t=token):return http('/rest/v1/rpc/solq_test_approve',body={'p_application':application},token=t)
def idle(application=app):return sql("select status||':'||(production_approved_at is null)::text||':'||attempt_count::text from production_jobs where application_id='"+application+"';")=='awaiting_deposit:true:0'
check('candidate Edge rejects authenticated nonadmin list',call('list',t=other)[0]==403)
check('candidate Edge rejects missing session',call('list',t=None)[0]==401)
check('candidate Edge rejects unapproved origin',http(edge,body={'action':'list','application_id':app},token=token,origin='https://unapproved.invalid')[0]==403)
check('candidate quote list is read only before records',call('list')[0]==200 and idle())
check('separate approval denies missing quote and deposit',approve()[0]>=400 and idle())
future=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()+3600))
code,q=call('issue_quote',{'quote_reference':'SYNTHETIC-Q1','amount_krw':100000,'expires_at':future})
check('actual candidate Edge Auth RPC persists issued quote',code==200 and q.get('amount_krw')==100000)
qid=q['id'];version=q['version']
accept={'quote_reference':'SYNTHETIC-Q1','quote_version':str(version),'amount_krw':100000,'accepted':True,'evidence_verified':True,'accepted_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()+1)),'evidence_reference':'synthetic/external-consent'}
# Use database-issued time to avoid client second truncation preceding issued_at.
accept['accepted_at']=sql("select clock_timestamp()::text;")
check('candidate rejects mismatched quotation evidence',call('record',{**accept,'amount_krw':99999})[0]>=400 and idle())
sql("create function public.solq_quote_fault() returns trigger language plpgsql as $$begin if new.quote_acceptance_id is not null then raise exception 'synthetic_atomic_fault';end if;return new;end$$;create trigger solq_quote_fault before update on public.production_jobs for each row execute function public.solq_quote_fault();")
code,_=call('record',accept)
check('candidate record failure rolls back evidence and job linkage',code>=400 and sql('select count(*) from solq_quote_acceptances;')=='0' and idle())
sql('drop trigger solq_quote_fault on production_jobs;drop function public.solq_quote_fault();')
with ThreadPoolExecutor(max_workers=4)as pool:responses=list(pool.map(lambda _:call('record',accept),range(4)))
check('four real candidate Edge evidence requests persist one acceptance',sum(c==200 for c,_ in responses)==1 and sql('select count(*) from solq_quote_acceptances;')=='1')
check('accepted evidence is linked to correct production job',sql("select count(*) from production_jobs j join solq_quote_acceptances a on a.id=j.quote_acceptance_id and a.application_id=j.application_id where j.application_id='"+app+"';")=='1' and idle())
check('acceptance alone cannot approve production',approve()[0]>=400 and idle())
paid_at=sql('select clock_timestamp()::text;')
code,dep=call('record_deposit',{'quote_id':qid,'amount_krw':30000,'paid_at':paid_at,'transaction_reference':'SYNTHETIC-BANK-1','evidence_reference':'synthetic/bank-notice'})
check('deposit notice persists independently without approval',code==200 and idle())
check('deposit notice does not count as bank confirmation',approve()[0]>=400 and sql('select count(*) from solq_deposit_confirmations;')=='0' and idle())
check('manual confirmation requires explicit bank review',call('confirm_deposit',{'quote_id':qid,'deposit_id':dep['id'],'bank_verified':False})[0]>=400)
code,confirm=call('confirm_deposit',{'quote_id':qid,'deposit_id':dep['id'],'bank_verified':True})
check('manual confirmation persists separately and still does not approve',code==200 and idle())
check('candidate exposes manual-confirmed versus application-status prerequisite',approve()[0]>=400 and idle())
# Existing application manual status operation is a separate fixture prerequisite.
# The current confirmation candidate does not set applications.status itself.
sql("update applications set status='deposit_confirmed' where id='"+app+"';")
code,approved=approve()
check('separate approval after all evidence and manual status succeeds',code==200 and approved.get('approved')is True and approved.get('duplicate')is False)
code,again=approve()
check('repeat separate approval reuses same queued job',code==200 and again.get('duplicate')is True and again['job_id']==approved['job_id'])
check('approval queues without starting provider or consuming attempts',sql("select status||':'||attempt_count::text from production_jobs where application_id='"+app+"';")=='queued:0' and sql('select count(*) from production_attempts;')=='0')
check('quote replacement denied after approval',call('issue_quote',{'quote_reference':'SYNTHETIC-Q2','amount_krw':100000,'expires_at':future})[0]>=400)
code,d=call('list');check('candidate combined evidence list matches persisted records',code==200 and d.get('accepted')is True and len(d['quotes'])==len(d['deposits'])==len(d['confirmations'])==len(d['evidence'])==1)
for table in ['solq_quote_acceptances','solq_issued_quotes','solq_deposit_evidence','solq_deposit_confirmations','production_jobs']:
 code,d=http('/rest/v1/'+table+'?select=*',method='GET',token=other)
 check('actual candidate RLS hides '+table+' from nonadmin',code==200 and d==[])
check('candidate direct authenticated ledger write is denied',http('/rest/v1/solq_deposit_confirmations',body={'deposit_id':dep['id'],'confirmed_by':actor},token=token)[0]>=400)
check('unrelated synthetic application remains unapproved',idle(app2))
for _,t in users:http('/auth/v1/logout',body={},token=t)
report={'sourceCommit':os.environ.get('GITHUB_SHA'),'timestampUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'pass':len(checks),'fail':0,'checks':checks,'environment':'real local Supabase Auth Deno Edge PostgREST PostgreSQL; synthetic base dependency fixture','reusedPrior33':True,'operatingBackupRestored':False,'operatingIdentityUsed':False,'providerCalls':0,'actualApiUsd':0,'productionWrites':0,'candidateSqlHashes':{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in ['ops/free-plan-automation/quote-evidence.sql','ops/admin-integration-candidate/quote-deposit-guard.sql','ops/free-plan-automation/production-gates.sql','supabase/functions/solq-quote-evidence/handler.mjs']},'remaining':['full encrypted operating backup and isolated restore','coordinator durable production adapter','full current operating schema compatibility','manual bank confirmation must be followed by existing application deposit_confirmed status operation; current candidate confirmation alone does not set it']}
root.joinpath('results.json').write_text(json.dumps(report,indent=2)+'\n');print('CANDIDATE_RESULT '+json.dumps(report))
