"""New approval RPC contention only. Disposable Docker DB; no connection URLs."""
import concurrent.futures as futures
import json,os,re,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
C=os.environ['SOLQ_TEST_CONTAINER']
assert re.fullmatch(r'solq-approval-[0-9]+-[0-9]+',C)
ADMIN='aaaaaaaa-0000-4000-8000-000000000001'
APP='10000000-0000-4000-8000-000000000007'
def command(args,input=None,check=True):
 return subprocess.run(args,input=input,text=True,capture_output=True,check=check,timeout=90)
def sql(q,check=True):
 return command(['docker','exec','-i',C,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_isolated'],q,check)
def scalar(q):return sql(q).stdout.strip()
def rpc(action,app=APP,h='null'):
 return f"select public.solq_free_generation('{action}','{app}',{h})"
def authed(q):return f"begin;set local role authenticated;select set_config('request.jwt.claim.sub','{ADMIN}',true);{q};commit;"
def counts():
 return json.loads(scalar("select json_build_object('plans',(select count(*) from ai_work_plans),'jobs',(select count(*) from orchestrator_jobs),'tasks',(select count(*) from orchestrator_tasks))"))
def wave(q):
 gate=91261027;n=32
 controller=subprocess.Popen(['docker','exec','-i',C,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_isolated'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 controller.stdin.write(f'select pg_advisory_lock({gate});\n\\echo READY\n');controller.stdin.flush()
 while controller.stdout.readline().strip()!='READY':
  if controller.poll() is not None:raise RuntimeError('barrier controller exited')
 def request(_):
  out=sql(f"begin;set local statement_timeout='60s';set local role authenticated;select set_config('request.jwt.claim.sub','{ADMIN}',true);select json_build_object('pid',pg_backend_pid());select pg_advisory_xact_lock_shared({gate});{q};commit;").stdout
  lines=[json.loads(s) for s in out.splitlines() if s.startswith('{')]
  return lines
 with futures.ThreadPoolExecutor(max_workers=n) as pool:
  pending=[pool.submit(request,i) for i in range(n)]
  try:
   deadline=time.monotonic()+40
   while time.monotonic()<deadline:
    waiting=int(scalar("select count(*) from pg_stat_activity where datname='solq_isolated' and wait_event='advisory'"))
    if waiting==n:break
    if any(p.done() and p.exception() for p in pending):raise RuntimeError('request failed before barrier')
    time.sleep(.2)
   else:raise RuntimeError(f'only {waiting}/{n} sessions at barrier')
  finally:
   controller.stdin.write(f'select pg_advisory_unlock({gate});\n\\q\n');controller.stdin.flush();controller.wait(timeout=10)
  rows=[p.result() for p in pending]
 assert len({x[0]['pid'] for x in rows})==n
 return {'independent_backend_pids':n,'simultaneous_waiters':waiting,'responses':[x[-1] for x in rows]}
i=json.loads(command(['docker','inspect',C]).stdout)[0]
assert i['HostConfig']['NetworkMode']=='none' and not i['HostConfig'].get('PortBindings')
assert all(m['Type']!='bind' for m in i['Mounts']) and i['Config']['Labels']['solq.test-only']=='true'
assert scalar('select current_database()')=='solq_isolated'
assert scalar('show server_version').startswith('17.')
assert scalar("select count(*) from information_schema.tables where table_schema='public'")=='0'
for path in ['tests/free-generation/fixture.sql','tests/free-generation/baseline-free-plan.sql','ops/admin-integration-candidate/link-guard.sql','ops/free-generation-approval/approval-gate.sql']:
 sql((ROOT/path).read_text())
history="select md5(jsonb_build_object('a',(select jsonb_agg(to_jsonb(a) order by id) from applications a),'p',(select jsonb_agg(to_jsonb(p) order by id) from ai_work_plans p where application_id<'10000000-0000-4000-8000-000000000007'),'j',(select jsonb_agg(to_jsonb(j) order by id) from orchestrator_jobs j where id::text like '30000000%'))::text)"
before=scalar(history)
h=json.loads(scalar(authed(rpc('inspect'))).splitlines()[-1])['request_hash'];hq="'"+h+"'"
assert counts()=={'plans':6,'jobs':7,'tasks':0}
r=sql(authed(rpc('generate',h=hq)),False);assert r.returncode and 'approval_required' in r.stderr
approve=wave(rpc('approve',h=hq))
assert len({x['approval_id'] for x in approve.pop('responses')})==1
assert scalar('select count(*) from nexus_ai_private.free_generation_approvals')=='1'
assert counts()=={'plans':6,'jobs':7,'tasks':0}
generate=wave(rpc('generate',h=hq));responses=generate.pop('responses')
assert len({x['plan_id'] for x in responses})==len({x['job_id'] for x in responses})==1
assert sum(not x['reused'] for x in responses)==1
assert all(x['status']=='awaiting_approval' and x['paid_calls']==0 and not x['execution_started'] for x in responses)
assert counts()=={'plans':7,'jobs':8,'tasks':6}
assert scalar("select count(*) from orchestrator_tasks where ordinal=6 and status='awaiting_approval' and not verified")=='1'
assert scalar('select nexus_production_private.free_cycle()')=='0'
assert scalar(history)==before
# A second request must roll back every generated row if stage creation fails.
a8='10000000-0000-4000-8000-000000000008'
h8=json.loads(scalar(authed(rpc('inspect',a8))).splitlines()[-1])['request_hash'];h8q="'"+h8+"'"
sql(authed(rpc('approve',a8,h8q)))
sql("create function public.qa_failure() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_STAGE_FAILURE';end$$;create trigger qa_failure before insert on orchestrator_tasks for each row execute function public.qa_failure()")
r=sql(authed(rpc('generate',a8,h8q)),False);assert r.returncode and 'SYNTHETIC_STAGE_FAILURE' in r.stderr
assert counts()=={'plans':7,'jobs':8,'tasks':6}
assert scalar(history)==before
result={'commit':os.environ.get('GITHUB_SHA'),'run_id':os.environ.get('GITHUB_RUN_ID'),'time_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'postgres':scalar('show server_version'),'isolation':{'network':'none','ports':0,'host_bind_mounts':0,'synthetic_only':True},'approve_wave':approve,'generate_wave':generate,'new_plan_count':1,'new_job_count':1,'stage_count':6,'human_review':'awaiting_approval','paid_calls':0,'execution_started':False,'preapproval_rejected':True,'partial_failure_rows':0,'historic_rows_preserved':True,'real_supabase_auth':False,'production_backup_verified':False,'verdict':'PASS'}
path=ROOT/'tests/free-generation/native-results.json';path.write_text(json.dumps(result,indent=2)+'\n')
print('SOLQ_APPROVAL_NATIVE_RESULT='+json.dumps(result,sort_keys=True))
