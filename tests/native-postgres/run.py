"""Disposable Docker PostgreSQL only. Never accepts a database URL or host."""
import concurrent.futures as futures
import hashlib,json,os,re,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
CONTAINER=os.environ['SOLQ_TEST_CONTAINER']
assert re.fullmatch(r'solq-isolated-[0-9]+-[0-9]+',CONTAINER), 'Unexpected container name'
def command(args,input=None,check=True,timeout=90):
 return subprocess.run(args,input=input,text=True,capture_output=True,check=check,timeout=timeout)
def sql(query,db='solq_isolated',check=True):
 return command(['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],query,check)
def scalar(query): return sql(query).stdout.strip()
def script(file): sql((ROOT/file).read_text())
def app(): return scalar("insert into applications(service_type,description,status) values('ai_automation','SYNTHETIC classification request only','received') returning id;")
def counts(a): return json.loads(scalar(f"select json_build_object('plans',(select count(*) from ai_work_plans where application_id='{a}'),'jobs',(select count(*) from orchestrator_jobs where application_id='{a}'),'tasks',(select count(*) from orchestrator_tasks t join orchestrator_jobs j on j.id=t.job_id where j.application_id='{a}'))"))
def wave(query):
 # One controller holds an exclusive gate until ALL 100 independent sessions wait.
 gate=78126026
 controller=subprocess.Popen(['docker','exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_isolated'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 controller.stdin.write(f'select pg_advisory_lock({gate});\n\\echo READY\n');controller.stdin.flush()
 while controller.stdout.readline().strip()!='READY':
  if controller.poll() is not None: raise RuntimeError('Gate controller exited')
 def request(_): return sql(f"begin; set local statement_timeout='60s'; select json_build_object('pid',pg_backend_pid()); select pg_advisory_xact_lock_shared({gate}); {query}; commit;").stdout
 with futures.ThreadPoolExecutor(max_workers=100) as pool:
  pending=[pool.submit(request,i) for i in range(100)]
  try:
   deadline=time.monotonic()+50
   while time.monotonic()<deadline:
    waiting=int(scalar("select count(*) from pg_stat_activity where datname='solq_isolated' and wait_event='advisory'"))
    if waiting==100:break
    if any(p.done() and p.exception() for p in pending): raise RuntimeError('Client failed before barrier')
    time.sleep(.2)
   else: raise RuntimeError(f'Only {waiting}/100 independent sessions at barrier')
  finally:
   controller.stdin.write(f'select pg_advisory_unlock({gate});\n\\q\n');controller.stdin.flush();controller.wait(timeout=10)
  output=[p.result() for p in pending]
 pids=[json.loads(next(line for line in out.splitlines() if '"pid"' in line))['pid'] for out in output]
 assert len(set(pids))==100
 return {'independent_backend_pids':len(set(pids)),'simultaneously_waiting':waiting}
inspect=json.loads(command(['docker','inspect',CONTAINER]).stdout)[0]
assert inspect['HostConfig']['NetworkMode']=='none'
assert not inspect['HostConfig'].get('PortBindings')
assert all(m['Type']!='bind' for m in inspect['Mounts'])
assert inspect['Config']['Labels']['solq.test-only']=='true'
assert scalar('select current_database()')=='solq_isolated'
assert scalar('show server_version').startswith('17.')
assert scalar("select count(*) from information_schema.tables where table_schema='public'")=='0'
results={'isolation':{'network':'none','published_ports':0,'host_bind_mounts':0,'initial_public_tables':0,'github_run_id':os.getenv('GITHUB_RUN_ID'),'synthetic_only':True},'server_version':scalar('show server_version'),'waves':{}}
fixture=(ROOT/'tests/duplicate-fix-db.test.mjs').read_text()
bootstrap=re.search(r'await db.exec\(`([\s\S]*?)`\);',fixture).group(1).replace('${admin}','11111111-1111-4111-8111-111111111111')
sql(bootstrap)
script('supabase/migrations/20261021213341_production_core.sql')
sql('create table nexus_production_private.security_backups(backup_key text primary key,payload jsonb); alter table public.production_jobs add column production_approved_by uuid,add column production_approved_at timestamptz;')
baseline=(ROOT/'ops/free-plan-automation/baseline-functions.sql').read_text()
for fn in re.findall(r'CREATE OR REPLACE FUNCTION nexus_production_private\.[\s\S]*?\$function\$\s*;',baseline):sql(fn)
sql('create trigger approval_guard before insert or update on public.production_jobs for each row execute function nexus_production_private.guard_job(); create trigger application_guard before update of status on public.applications for each row execute function nexus_production_private.guard_application();')
script('ops/free-plan-automation/automation.sql');script('ops/free-plan-automation/production-gates.sql')
legacy=app();plan=scalar(f"insert into ai_work_plans(application_id,plan) values('{legacy}','{{}}') returning id")
sql(f"insert into orchestrator_jobs(idempotency_key,status) values('{plan}','awaiting_approval'),(gen_random_uuid(),'awaiting_approval'),(gen_random_uuid(),'awaiting_approval'),(gen_random_uuid(),'awaiting_approval'); insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,status) values('{legacy}','{legacy}','{plan}','awaiting_approval');")
legacy_query=f"select jsonb_agg(to_jsonb(j) order by id) from orchestrator_jobs j where application_id='{legacy}' or application_id is null"
legacy_before=scalar(legacy_query)
sql('begin;'+(ROOT/'ops/admin-integration-candidate/link-guard.sql').read_text()+'commit;')
a=app();results['waves']['worker']=wave('select nexus_production_private.free_cycle()');assert counts(a)=={'plans':1,'jobs':1,'tasks':6}
results['waves']['worker']['counts']=counts(a)
p=scalar(f"select id from ai_work_plans where application_id='{a}'")
assert scalar(f"select jsonb_array_length(plan->'details') from ai_work_plans where id='{p}'")=='6'
b=app();bp=scalar(f"insert into ai_work_plans(application_id,plan) values('{b}','{{}}') returning id")
results['waves']['registration']=wave(f"insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,status) values('{b}','{b}','{bp}','awaiting_approval') on conflict(application_id) where free_plan_id is not null do nothing")
assert counts(b)=={'plans':1,'jobs':1,'tasks':0};results['waves']['registration']['counts']=counts(b)
for key in [a,p]:
 r=sql(f"insert into orchestrator_jobs(idempotency_key,status) values('{key}','queued')",check=False);assert r.returncode!=0 and 'server worker' in r.stderr
r=sql(f"insert into orchestrator_jobs(idempotency_key,application_id,free_plan_id,status) values(gen_random_uuid(),'{b}','{p}','awaiting_approval')",check=False);assert r.returncode!=0 and 'link mismatch' in r.stderr
# A forced failure happens after plan/job insert, inside the worker's subtransaction.
c=app()
sql("create function public.synthetic_failure() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC injected failure' using errcode='XX000';end$$; create trigger synthetic_failure before insert on orchestrator_tasks for each row execute function public.synthetic_failure();")
sql('select nexus_production_private.free_cycle()')
assert counts(c)=={'plans':0,'jobs':0,'tasks':0}
assert scalar(f"select status from solq_free_plan_runs where application_id='{c}'")=='retry_wait'
sql(f"drop trigger synthetic_failure on orchestrator_tasks; drop function public.synthetic_failure(); update solq_free_plan_runs set next_attempt_at=now() where application_id='{c}'; select nexus_production_private.free_cycle();")
assert counts(c)=={'plans':1,'jobs':1,'tasks':6}
results['failure_recovery']={'partial_rows_after_failure':0,'state':'retry_wait','after_retry':counts(c)}
assert scalar(legacy_query)==legacy_before
assert scalar('select count(*) from production_attempts')=='0'
results['legacy_rows_preserved']=5;results['production_attempts']=0
# Real pg_dump -> new database -> psql restore, entirely synthetic.
before=scalar("select jsonb_build_object('applications',(select count(*) from applications),'plans',(select count(*) from ai_work_plans),'jobs',(select count(*) from orchestrator_jobs),'guard',(select count(*) from pg_trigger where tgname='solq_customer_link_guard'))")
dump=command(['docker','exec',CONTAINER,'pg_dump','-U','postgres','-d','solq_isolated','--no-owner']).stdout
sql('create database solq_restore',db='postgres');sql(dump,db='solq_restore')
after=sql("select jsonb_build_object('applications',(select count(*) from applications),'plans',(select count(*) from ai_work_plans),'jobs',(select count(*) from orchestrator_jobs),'guard',(select count(*) from pg_trigger where tgname='solq_customer_link_guard'))",db='solq_restore').stdout.strip()
assert json.loads(before)==json.loads(after)
results['synthetic_backup_restore']={'match':True,'sha256':hashlib.sha256(dump.encode()).hexdigest(),'counts':json.loads(after),'production_backup_verified':False}
print('SOLQ_NATIVE_RESULT='+json.dumps(results,sort_keys=True))
