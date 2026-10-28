"""New budget RPC only; synthetic Docker DB, network none, no host mounts/URLs."""
import concurrent.futures as cf
import json, os, re, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
C=os.environ['SOLQ_COST_CONTAINER']
assert re.fullmatch(r'solq-cost-[0-9]+-[0-9]+',C)
def cmd(args,input=None,check=True):return subprocess.run(args,input=input,text=True,capture_output=True,timeout=90,check=check)
def sql(q,check=True):return cmd(['docker','exec','-i',C,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_cost_synthetic'],q,check)
def scalar(q):return sql(q).stdout.strip()
def role(q,which='service_role',admin=True):
 uid='aaaaaaaa-0000-4000-8000-00000000000'+('1' if admin else '2')
 return f"begin;set local role {which};select set_config('request.jwt.claim.role','{which}',true);select set_config('request.jwt.claim.sub','{uid}',true);{q};commit;"
def approve(h,model='claude-haiku-5-5',upgrade=False,calls=1):return "select solq_cost_private.approve('%s','%s',1000,200,%d,20000000,clock_timestamp()+interval '10 minutes',%s)"%(h,model,calls,str(upgrade).lower())
def reserve(h,attempt=1):return "select solq_cost_private.reserve('%s',%d,'claude-haiku-5-5',1000,200)"%(h,attempt)
def bad(q,needle):
 r=sql(q,False);assert r.returncode and needle in r.stderr,(needle,r.stderr[-300:])
def wave(queries):
 gate=99261028;n=len(queries)
 ctl=subprocess.Popen(['docker','exec','-i',C,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_cost_synthetic'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 ctl.stdin.write(f'select pg_advisory_lock({gate});\n\\echo READY\n');ctl.stdin.flush()
 while ctl.stdout.readline().strip()!='READY':
  if ctl.poll() is not None:raise RuntimeError('barrier failure')
 def send(q):
  payload="select json_build_object('pid',pg_backend_pid());select pg_advisory_xact_lock_shared(%d);%s"%(gate,q)
  return sql(role(payload),False)
 with cf.ThreadPoolExecutor(max_workers=n) as pool:
  pending=[pool.submit(send,q) for q in queries]
  try:
   deadline=time.monotonic()+40
   while time.monotonic()<deadline:
    waiting=int(scalar("select count(*) from pg_stat_activity where datname='solq_cost_synthetic' and wait_event='advisory'"))
    if waiting==n:break
    time.sleep(.15)
   else:raise RuntimeError('not all independent sessions reached barrier')
  finally:
   ctl.stdin.write(f'select pg_advisory_unlock({gate});\n\\q\n');ctl.stdin.flush();ctl.wait(timeout=10)
  responses=[p.result() for p in pending]
 pids={json.loads(next(s for s in r.stdout.splitlines() if s.startswith('{')))['pid'] for r in responses}
 assert len(pids)==n
 return responses,{'independent_backend_pids':n,'simultaneous_waiters':waiting}
i=json.loads(cmd(['docker','inspect',C]).stdout)[0]
assert i['HostConfig']['NetworkMode']=='none' and not i['HostConfig'].get('PortBindings')
assert all(m['Type']!='bind' for m in i['Mounts'])
assert i['Config']['Labels']['solq.test-only']=='true'
assert scalar('select current_database()')=='solq_cost_synthetic'
assert scalar("select count(*) from information_schema.tables where table_schema='public'")=='0'
version=scalar('show server_version');assert version.startswith('17.')
sql((ROOT/'tests/free-generation/fixture.sql').read_text())
sql("create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$; grant usage on schema auth to service_role;")
fingerprint="select md5(jsonb_build_object('applications',(select jsonb_agg(to_jsonb(a) order by id) from applications a),'plans',(select jsonb_agg(to_jsonb(p) order by id) from ai_work_plans p),'jobs',(select jsonb_agg(to_jsonb(j) order by id) from orchestrator_jobs j),'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'))::text)"
before=scalar(fingerprint)
sql((ROOT/'candidates/cost-control/budget-candidate.sql').read_text())
checks=[]
h=lambda n:format(n,'064x')
bad(role(approve(h(1)),'authenticated',False),'admin_required');checks.append('non-admin approval denied with fixture identity')
bad(role(reserve(h(1))),'approval_scope');checks.append('missing approval denied')
bad(role(approve(h(2),'claude-sonnet-5-5'),'authenticated'),'upgrade_required');checks.append('model upgrade approval required')
for n in range(1,33):sql(role(approve(h(n)),'authenticated'))
sql('update solq_cost_private.policy set daily_nano=1000000;')
responses,daily=wave([reserve(h(n)) for n in range(1,33)])
assert sum(r.returncode==0 for r in responses)==5
assert all('daily_budget' in r.stderr for r in responses if r.returncode)
assert scalar('select sum(charged_nano) from solq_cost_private.reservations')=='1000000'
daily['admitted']=5;daily['blocked']=27;checks.append('32 independent connections never exceed daily reserved budget')
sql('truncate solq_cost_private.reservations;update solq_cost_private.policy set daily_nano=500000000;')
responses,dedupe=wave([reserve(h(1))]*32)
assert sum(r.returncode==0 for r in responses)==1
assert all('duplicate_attempt' in r.stderr for r in responses if r.returncode)
assert scalar('select count(*) from solq_cost_private.reservations')=='1'
dedupe['admitted']=1;dedupe['blocked']=31;checks.append('32 independent duplicate requests reserve exactly once')
lease=scalar("select lease from solq_cost_private.reservations where job_hash='%s'"%h(1))
settle="select solq_cost_private.settle('%s',1,'%s',100,50)"%(h(1),lease)
sql(role(settle));assert scalar('select sum(charged_nano) from solq_cost_private.reservations')=='35000'
sql(role(settle));assert scalar('select sum(charged_nano) from solq_cost_private.reservations')=='35000'
checks.append('exact cost and idempotent settlement')
bad(role(reserve(h(1),2)),'attempt_limit');checks.append('unapproved retry denied')
sql('truncate solq_cost_private.reservations;update solq_cost_private.policy set monthly_nano=100000;')
bad(role(reserve(h(2))),'monthly_budget');checks.append('monthly budget denied before reservation')
sql('update solq_cost_private.policy set monthly_nano=5000000000;')
sql(role(reserve(h(2))))
lease=scalar("select lease from solq_cost_private.reservations where job_hash='%s'"%h(2))
sql(role("select solq_cost_private.settle('%s',1,'%s',null,null)"%(h(2),lease)))
assert scalar('select healthy from solq_cost_private.policy')=='f'
assert scalar('select sum(charged_nano) from solq_cost_private.reservations')=='200000'
bad(role(reserve(h(3))),'accounting_unhealthy');checks.append('unknown usage retains hold and freezes new requests')
bad(role('select * from solq_cost_private.approvals','authenticated'),'permission denied');checks.append('authenticated cannot read private ledger')
bad(role(reserve(h(3)),'authenticated'),'permission denied');checks.append('authenticated cannot reserve paid work')
bad('update solq_cost_private.policy set live_enabled=true','check constraint');checks.append('live execution cannot be enabled by policy update')
assert scalar(fingerprint)==before;checks.append('synthetic original 9 applications 6 plans 7 jobs and public policies unchanged')
assert scalar('select count(*) from applications')=='9'
assert scalar('select count(*) from ai_work_plans')=='6'
assert scalar('select count(*) from orchestrator_jobs')=='7'
report={'environment':'disposable network-none PostgreSQL, synthetic data and auth.uid/role fixtures only','postgres_version':version,'pass':len(checks),'checks':checks,'daily_contention':daily,'duplicate_contention':dedupe,'preservation_before':before,'preservation_after':scalar(fingerprint),'production_auth_tested':False,'production_data_accessed':False,'real_provider_calls':0,'actual_usd':0}
(ROOT/'tests/cost-control/native-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
