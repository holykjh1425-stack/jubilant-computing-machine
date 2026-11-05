import os,json,pathlib,subprocess,urllib.request,urllib.error,time,uuid,hashlib,re,base64,hmac,threading
from concurrent.futures import ThreadPoolExecutor
root=pathlib.Path('candidates/native-platform-20261105');source=pathlib.Path('candidates/command-recovery-20261105')
cli=os.environ['SOLQ_CLI'];work=os.environ['SOLQ_STACK_DIR'];net=os.environ['SOLQ_STACK_NETWORK']
os.environ.update(SUPABASE_SERVICES_HOSTNAME='solq-ci-db.invalid',SUPABASE_DB_PORT='5432',SUPABASE_API_EXTERNAL_URL='http://solq-ci-api.invalid:8000')
os.environ['NO_PROXY']=os.environ.get('NO_PROXY','')+',solq-ci-api.invalid,solq-ci-db.invalid'
report={'sourceCommit':os.environ.get('GITHUB_SHA'),'startedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'checks':[],'migrations':[],'productionAccess':False,'productionWrites':0,'paidApiCalls':0,'operatingBackupCreated':False,'operatingBackupRestored':False,'previous100ChecksRerun':False,'testAdaptersUsed':False,'realPlatform':{},'remaining':[]}
report['candidateSha256']={str(path):hashlib.sha256(path.read_bytes()).hexdigest()for path in [source/'security-candidate.sql',source/'security-rollback.sql',pathlib.Path('supabase/functions/solq-quote-evidence/handler.mjs'),root/'run.py',root/'setup.py']}
stage='preflight';users=[];status=None
def command(args,input=None,timeout=60):
 r=subprocess.run(args,input=input,text=True,capture_output=True,timeout=timeout)
 if r.returncode:
  # Commands may contain local credentials in captured responses. Never print them.
  match=re.search(r'(?:ERROR|FATAL):\s+([A-Z0-9]{5})\b',r.stderr)
  raise RuntimeError('local_command_failed_'+pathlib.Path(args[0]).name+('_SQLSTATE_'+match.group(1)if match else''))
 return r.stdout.strip()
def sql(q):return command(['docker','exec','-i','supabase_db_solq-local-ci','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','postgres','-d','postgres'],q)
def adminsql(q):return command(['docker','exec','-i','supabase_db_solq-local-ci','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','supabase_admin','-d','postgres'],q)
def check(name,ok):
 if not ok:raise RuntimeError('check_failed_'+name)
 report['checks'].append({'name':name,'status':'PASS'});print('PASS '+name,flush=True)
def qi(s):return '"'+s.replace('"','""')+'"'
def scalar_json(q):return json.loads(sql(q))
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):raise RuntimeError('redirect_forbidden')
opener=urllib.request.build_opener(NoRedirect())
def http(path,method='POST',body=None,token=None,admin=False,origin='https://solqtech.com',profile=None):
 assert path.startswith(('/auth/v1/','/rest/v1/','/functions/v1/'))
 headers={'apikey':anon,'content-type':'application/json','origin':origin}
 if profile:headers['Accept-Profile' if method=='GET' else 'Content-Profile']=profile
 if token:headers['authorization']='Bearer '+token
 elif path.startswith('/rest/v1/'):headers['authorization']='Bearer '+anon
 if admin:headers.update(apikey=local_admin,authorization='Bearer '+local_admin)
 req=urllib.request.Request(base+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
 try:
  with opener.open(req,timeout=20)as response:return response.status,json.loads(response.read()or b'{}')
 except urllib.error.HTTPError as error:
  try:data=json.load(error)
  except Exception:data={}
  return error.code,data
def acl_statement(schema,name,acl,kind='table',args=''):
 object_name=qi(schema)+'.'+qi(name)+(('('+args+')')if kind=='function'else'')
 roles=['public','anon','authenticated','service_role']
 result=['revoke all on '+kind+' '+object_name+' from '+','.join(roles)+';']
 mapping={'r':'select','a':'insert','w':'update','d':'delete','D':'truncate','x':'references','t':'trigger','m':'maintain','X':'execute'}
 for entry in acl or []:
  role,rights=entry.split('=',1);rights=rights.split('/')[0]
  if role=='postgres':continue
  if '*' in rights:raise RuntimeError('grant_option_requires_review')
  privileges=[mapping[c]for c in rights if c in mapping]
  if privileges:result.append('grant '+','.join(privileges)+' on '+kind+' '+object_name+' to '+(qi(role)if role else'public')+';')
 return '\n'.join(result)
try:
 assert os.environ.get('GITHUB_ACTIONS')=='true'
 assert not os.environ.get('SUPABASE_ACCESS_TOKEN')
 network=json.loads(command(['docker','network','inspect',net]))[0];check('docker network has no external routing',network['Internal']is True)
 status=json.loads(subprocess.run([cli,'--network-id',net,'status','-o','json'],cwd=work,text=True,capture_output=True,check=True).stdout)
 base=status['API_URL'];assert base=='http://solq-ci-api.invalid:8000'
 anon=status['ANON_KEY'];local_admin=status['SERVICE_ROLE_KEY']
 version=sql('show server_version;');check('native PostgreSQL major version 17',int(sql('show server_version_num;'))//10000==17)
 report['realPlatform']['postgresVersion']=version
 # Genuine pg_cron remains installed but never launches customer/provider jobs in CI.
 report['localDatabaseRole']=sql("select current_user||':'||rolsuper::text from pg_roles where rolname=current_user;")
 check('local Supabase administrative role exists',sql("select count(*) from pg_roles where rolname='supabase_admin' and rolsuper;")=='1')
 adminsql("alter system set cron.launch_active_jobs='off';")
 adminsql('select pg_reload_conf();')
 time.sleep(.3)
 check('scheduler launch disabled before historical SQL replay',sql('show cron.launch_active_jobs;')=='off')
 stage='schema_replay'
 manifest=json.loads(source.joinpath('source-manifest.json').read_text())
 for item in manifest['files']:
  check('history integrity '+item['file'],hashlib.sha256(source.joinpath('history',item['file']).read_bytes()).hexdigest()==item['sha256'])
 sql(source.joinpath('00-initial-schema.sql').read_text())
 for file in sorted(source.joinpath('history').glob('*.sql')):
  stage='schema_'+file.name
  if file.name.startswith('20261026'):sql(source.joinpath('10-untracked-approval-prerequisites.sql').read_text())
  sql('begin;'+file.read_text()+'commit;');report['migrations'].append({'file':file.name,'status':'PASS','adapted':False})
 check('eleven unmodified historical SQL files applied using genuine extensions',len(report['migrations'])==11)
 stage='schema_compare'
 catalog=json.loads(source.joinpath('production-catalog.json').read_text())
 access=json.loads(source.joinpath('access-metadata.json').read_text())
 # Reproduce captured live table/column/function ACLs only inside this empty native target.
 for table in catalog['tables']:sql(acl_statement(table['schema'],table['table'],table['acl']))
 for fn in catalog['functions']:
  if fn['name']=='rls_auto_enable':continue # managed-platform helper, recorded difference
  sql(acl_statement(fn['schema'],fn['name'],fn['acl'],'function',fn['args']))
 for col in access['column_grants']:
  for entry in col['acl']:
   role,rights=entry.split('=',1);rights=rights.split('/')[0]
   if role=='postgres':continue
   for letter,priv in [('r','select'),('a','insert'),('w','update')]:
    if letter in rights:sql('grant '+priv+'('+qi(col['column'])+') on public.'+qi(col['table'])+' to '+qi(role)+';')
 check('captured functional role grants restored',sql("select has_table_privilege('anon','public.admin_users','TRUNCATE');")=='t')
 actual_columns=scalar_json("select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('public','nexus_ai_private','nexus_orchestrator_private','nexus_production_private') and c.relkind='r' and a.attnum>0 and not a.attisdropped;")
 normalize=lambda x:json.dumps({k:v for k,v in x.items()if k!='ordinal'},sort_keys=True,separators=(',',':'))
 expected={normalize(x)for x in catalog['columns']};actual={normalize(x)for x in actual_columns}
 report['columnDiff']={'missing':len(expected-actual),'extra':len(actual-expected)}
 check('native columns match production application catalog',expected==actual)
 schemas="('public','nexus_ai_private','nexus_orchestrator_private','nexus_production_private')"
 queries={
  'constraints':"select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid))) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in "+schemas,
  'indexes':"select json_agg(to_jsonb(i)) from pg_indexes i where schemaname in "+schemas,
  'policies':"select json_agg(to_jsonb(p)) from pg_policies p where schemaname in "+schemas,
  'triggers':"select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in "+schemas,
  'tables':"select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in "+schemas,
  'functions':"select json_agg(json_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname in "+schemas+" and p.proname<>'rls_auto_enable'"}
 keys={'constraints':['schema','table','name','type','definition'],'indexes':['schemaname','tablename','indexname','indexdef'],'policies':['schemaname','tablename','policyname','roles','permissive','cmd','qual','with_check'],'triggers':['schema','table','name','definition','enabled'],'tables':['schema','table','rls','force_rls','owner','acl'],'functions':['schema','name','args','definition','owner','acl']}
 report['structureDiff']={}
 def normalized(item,names):
  item={k:item.get(k)for k in names}
  if item.get('acl')is not None:item['acl']=sorted(item['acl'])
  return json.dumps(item,sort_keys=True,separators=(',',':'))
 for kind,query in queries.items():
  wanted=[x for x in catalog[kind]if x.get('name')!='rls_auto_enable']
  found=scalar_json(query)or[]
  want={normalized(x,keys[kind])for x in wanted};got={normalized(x,keys[kind])for x in found}
  report['structureDiff'][kind]={'missing':len(want-got),'extra':len(got-want)}
  # Keep exact differences visible; continue to functional checks rather than hiding platform drift.
  print('STRUCTURE_COMPARE '+kind+' '+json.dumps(report['structureDiff'][kind]),flush=True)
 for file in ['ops/free-plan-automation/quote-evidence.sql','ops/admin-integration-candidate/quote-deposit-guard.sql']:
  stage='candidate_'+pathlib.Path(file).stem
  sql('begin;'+pathlib.Path(file).read_text()+'commit;')
 sql("notify pgrst,'reload schema';")
 time.sleep(2)
 stage='real_auth'
 for ordinal in range(2):
  email='solq-native-'+uuid.uuid4().hex+'@example.invalid'
  code,user=http('/auth/v1/admin/users',body={'email':email,'email_confirm':True,'user_metadata':{'role':'admin'}},admin=True);check('local Auth user created '+str(ordinal),code==200)
  code,link=http('/auth/v1/admin/generate_link',body={'type':'magiclink','email':email},admin=True);assert code==200
  code,login=http('/auth/v1/verify',body={'type':'magiclink','token_hash':link['hashed_token']});check('local Auth sign-in '+str(ordinal),code==200 and bool(login.get('access_token')))
  users.append((login['user']['id'],login['access_token']));link=None;login=None
 actor,token=users[0];other,nonadmin=users[1]
 sql("insert into public.admin_users(user_id) values('"+actor+"');")
 check('actual Auth server verifies admin identity',http('/auth/v1/user',method='GET',token=token)[0]==200)
 parts=token.split('.');parts[2]=('A'if parts[2][0]!='A'else'B')+parts[2][1:]
 invalid_status,invalid_body=http('/auth/v1/user',method='GET',token='.'.join(parts))
 report['tamperedJwtResult']={'httpStatus':invalid_status,'providerCode':invalid_body.get('code')if isinstance(invalid_body,dict)else None}
 check('tampered JWT signature rejected',invalid_status in(401,403))
 header=json.loads(base64.urlsafe_b64decode(token.split('.')[0]+'=='))
 if header.get('alg')=='HS256' and status.get('JWT_SECRET'):
  payload=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'=='));payload['exp']=int(time.time())-120
  encode=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
  unsigned=token.split('.')[0]+'.'+encode(json.dumps(payload,separators=(',',':')).encode())
  expired=unsigned+'.'+encode(hmac.new(status['JWT_SECRET'].encode(),unsigned.encode(),hashlib.sha256).digest())
  expired_status,_=http('/auth/v1/user',method='GET',token=expired);report['expiredJwtHttpStatus']=expired_status
  check('correctly signed expired local JWT rejected',expired_status in(401,403))
 else:report['remaining'].append('expiry-specific signed JWT case unavailable; not simulated')
 status=None
 check('forged user metadata does not grant admin access',http('/rest/v1/admin_users?select=user_id',method='GET',token=nonadmin)==(200,[]))
 stage='intake_and_free_plan'
 code,data=http('/rest/v1/rpc/submit_application',body={'p_customer_name':'Synthetic native','p_contact':'000-test','p_service_type':'ai_automation','p_description':'문의 문구를 규칙으로 분류하고 표로 정리하는 합성 검증 요청입니다.','p_privacy_consent':True})
 report['intakeHttpStatus']=code
 if isinstance(data,dict):
  report['intakeProviderCode']=data.get('code')
  message=data.get('message','')
  if re.fullmatch(r'(?:permission denied for (?:table|schema|function) [a-zA-Z_ ."]+|Unauthorized)',message):report['intakeSafeError']=message
 check('public RPC returns real receipt after DB insert',code==200 and bool(re.fullmatch(r'NX-\d{8}-[A-F0-9]{8}',data or'')))
 receipt=data
 code,items=http('/rest/v1/applications?select=id,receipt_number&receipt_number=eq.'+receipt,method='GET',token=token);check('real admin JWT reads matching receipt',code==200 and len(items)==1)
 app=items[0]['id']
 check('ordinary user cannot read customer row',http('/rest/v1/applications?select=id',method='GET',token=nonadmin)==(200,[]))
 barrier=threading.Barrier(8)
 def simultaneous_connection(_):
  barrier.wait(timeout=10)
  return scalar_json("set application_name='solq_native_concurrency';select json_build_object('pid',pg_backend_pid(),'overlap',(select count(*) from pg_stat_activity where application_name='solq_native_concurrency' and state='active' and pid<>pg_backend_pid())) from pg_sleep(.3);")
 with ThreadPoolExecutor(max_workers=8)as pool:pids=list(pool.map(simultaneous_connection,range(8)))
 report['concurrentConnections']={'distinctBackends':len({p['pid']for p in pids}),'maxOtherActive':max(p['overlap']for p in pids)}
 check('concurrency uses independent overlapping PostgreSQL connections',len({p['pid']for p in pids})==8 and max(p['overlap']for p in pids)>0)
 with ThreadPoolExecutor(max_workers=8)as pool:list(pool.map(lambda _:sql('select nexus_production_private.free_cycle();'),range(8)))
 check('parallel free cycles create one plan and one job',sql('select (select count(*) from ai_work_plans)::text||\',\'||(select count(*) from orchestrator_jobs)::text;')=='1,1')
 check('six real persisted stages retain approval wait',sql("select jsonb_array_length(plan->'steps') from ai_work_plans;")=='6' and sql('select status from orchestrator_jobs;')=='awaiting_approval')
 sql('select nexus_production_private.tick();')
 stage='real_edge_quote_flow'
 edge='/functions/v1/solq-local-plan'
 def call(action,extra=None,t=token):return http(edge,body={'action':action,'application_id':app,**(extra or{})},token=t)
 def approve(t=token):return http('/rest/v1/rpc/solq_approve_production',body={'p_application':app},token=t)
 check('real Edge rejects missing authentication',call('list',t=None)[0]==401)
 check('real Edge denies nonadmin identity',call('list',t=nonadmin)[0]==403)
 check('real Edge read-only list succeeds',call('list')[0]==200)
 check('missing payment and consent blocks separate approval',approve()[0]>=400)
 code,quote=call('issue_quote',{'quote_reference':'SYNTHETIC-NATIVE-Q1','amount_krw':100000,'expires_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()+3600))});check('Edge stores authoritative quote',code==200)
 acceptance={'quote_reference':quote['quote_reference'],'quote_version':str(quote['version']),'amount_krw':100000,'accepted':True,'evidence_verified':True,'accepted_at':sql('select clock_timestamp()::text;'),'evidence_reference':'synthetic/consent'}
 sql("create function public.solq_native_fault() returns trigger language plpgsql as $$begin if new.quote_acceptance_id is not null then raise exception 'synthetic_atomic_fault';end if;return new;end$$;create trigger solq_native_fault before update on production_jobs for each row execute function public.solq_native_fault();")
 check('Edge storage failure rolls back both evidence and linkage',call('record',acceptance)[0]>=400 and sql('select count(*) from solq_quote_acceptances;')=='0')
 sql('drop trigger solq_native_fault on production_jobs;drop function public.solq_native_fault();')
 with ThreadPoolExecutor(max_workers=4)as pool:out=list(pool.map(lambda _:call('record',acceptance),range(4)))
 check('parallel authenticated Edge requests save one acceptance',sum(code==200 for code,_ in out)==1 and sql('select count(*) from solq_quote_acceptances;')=='1')
 code,deposit=call('record_deposit',{'quote_id':quote['id'],'amount_krw':30000,'paid_at':sql('select clock_timestamp()::text;'),'transaction_reference':'SYNTHETIC-NATIVE-BANK','evidence_reference':'synthetic/bank'});check('deposit notice stored without approval',code==200 and approve()[0]>=400)
 code,_=call('confirm_deposit',{'quote_id':quote['id'],'deposit_id':deposit['id'],'bank_verified':True});check('manual ledger confirmation stays separate from production approval',code==200 and sql('select status from production_jobs;')=='awaiting_deposit')
 code,_=http('/rest/v1/applications?id=eq.'+app,method='PATCH',body={'status':'deposit_confirmed'},token=token);check('real admin PostgREST records manual payment state',code in(200,204))
 code,approved=approve();check('separate approval succeeds after all prerequisites',code==200 and approved.get('approved')is True)
 code,reused=approve();check('repeat approval reuses same job without execution',code==200 and reused.get('duplicate')is True and reused['job_id']==approved['job_id'] and sql('select count(*) from production_attempts;')=='0')
 stage='security'
 sql('begin;'+source.joinpath('security-candidate.sql').read_text()+'commit;')
 report['restrictedOwnerPrivileges']=scalar_json("select json_build_object('authSchema',has_schema_privilege('solq_public_rpc_owner','auth','USAGE'),'authRoleExecute',has_function_privilege('solq_public_rpc_owner','auth.role()','EXECUTE'),'applicationInsertName',has_column_privilege('solq_public_rpc_owner','public.applications','customer_name','INSERT'),'applicationReceiptRead',has_column_privilege('solq_public_rpc_owner','public.applications','receipt_number','SELECT'),'privateSchemaCreate',has_schema_privilege('solq_public_rpc_owner','solq_rpc_private','CREATE'));")
 sql("notify pgrst,'reload schema';");time.sleep(1)
 code,security_receipt=http('/rest/v1/rpc/submit_application',body={'p_customer_name':'Synthetic security','p_contact':'000-test','p_service_type':'consulting','p_description':'synthetic security intake','p_privacy_consent':True})
 report['securityIntakeHttpStatus']=code
 if isinstance(security_receipt,dict):
  report['securityIntakeProviderCode']=security_receipt.get('code')
  message=security_receipt.get('message','')
  if re.fullmatch(r'(?:permission denied for (?:table|schema|function|sequence) [a-zA-Z_ ."]+|Unauthorized|new row violates row-level security policy for table "[a-zA-Z_]+")',message):report['securityIntakeSafeError']=message
 check('native security candidate preserves public intake',code==200 and isinstance(security_receipt,str))
 check('public RPCs no longer use SECURITY DEFINER',sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('submit_application','submit_support_inquiry','read_support_inquiry') and p.prosecdef;")=='0')
 check('management rights removed without intake regression',sql("select not has_table_privilege('anon','public.admin_users','TRUNCATE');")=='t')
 test_access='a'*64
 code,inquiry=http('/rest/v1/rpc/submit_support_inquiry',body={'p_question':'synthetic native question','p_language':'ko','p_access_token':test_access,'p_consent':True,'p_transfer_consent':True});check('native public support submission remains available',code==200 and isinstance(inquiry,str))
 code,answer=http('/rest/v1/rpc/read_support_inquiry',body={'p_id':inquiry,'p_access_token':'b'*64});check('native support rejects mismatched access token',code==200 and answer==[])
 code,answer=http('/rest/v1/rpc/read_support_inquiry',body={'p_id':inquiry,'p_access_token':test_access});check('native support returns only token-matched synthetic inquiry',code==200 and len(answer)==1)
 private_code,private_data=http('/rest/v1/',method='GET',token=token,profile='solq_rpc_private')
 check('private schema is not a PostgREST exposed profile',private_code==406 and private_data.get('code')=='PGRST106')
 # Genuine server-issued JWT expiry; no private signing key extraction is needed.
 user_payload=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'=='))
 seconds_left=user_payload['exp']-time.time()+65
 if seconds_left<=125:
  time.sleep(max(0,seconds_left))
  expired_status,_=http('/auth/v1/user',method='GET',token=token)
  report['realIssuedJwtExpiryStatus']=expired_status
  report['expiryObservedSecondsAfterExp']=int(time.time()-user_payload['exp'])
  check('genuine Auth-issued short-lived JWT expires',expired_status in(401,403))
  report['remaining']=[x for x in report['remaining']if x!='expiry-specific signed JWT case unavailable; not simulated']
 else:report['remaining'].append('actual configured JWT lifetime exceeded expiry test window')
 report['realPlatform'].update(auth=True,jwtSignature=True,postgrest=True,edge=True,independentConnections=True,fullHistoricalReplay=True)
 report['remaining']+=['production backup and actual restored data not used','provider Advisor and leaked-password configuration not changed','default ACL and managed helper differences require final review','final PC/mobile browser regression not performed']
 report['pass']=len(report['checks']);report['fail']=0
except Exception as exc:
 report['fail']=1;report['pass']=len(report['checks']);report['failedStage']=stage;report['failureType']=type(exc).__name__
 # Only allow deliberately constructed diagnostic strings into public artifacts.
 message=str(exc)
 report['failureReason']=message if re.fullmatch(r'[A-Za-z0-9_ .-]{1,180}',message)else'redacted_runtime_failure'
 print('NATIVE_FAILURE '+json.dumps({k:report[k]for k in ['failedStage','failureType','failureReason']}),flush=True)
finally:
 if users:
  for _,value in users:
   try:http('/auth/v1/logout',body={},token=value)
   except Exception:pass
 report['finishedUtc']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());root.joinpath('results.json').write_text(json.dumps(report,indent=2)+'\n')
 print('NATIVE_RESULT '+json.dumps(report),flush=True)
if report.get('fail'):raise SystemExit(1)
