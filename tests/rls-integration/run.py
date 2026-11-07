"""PostgreSQL enforcement of existing source policies; synthetic SQL identity only."""
import json,os,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
container=os.environ['SOLQ_TEST_CONTAINER'];assert re.fullmatch(r'solq-rls-[0-9]+-[0-9]+',container)
def sql(q,check=True):
 return subprocess.run(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_rls'],input=q,text=True,capture_output=True,check=check,timeout=30)
def value(q):return sql(q).stdout.strip()
inspect=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
assert inspect['HostConfig']['NetworkMode']=='none' and not inspect['HostConfig'].get('PortBindings')
assert not any(m['Type']=='bind' for m in inspect['Mounts'])
fixture=(root/'tests/duplicate-fix-db.test.mjs').read_text()
sql(re.search(r'await db.exec\(`([\s\S]*?)`\);',fixture).group(1).replace('${admin}','11111111-1111-4111-8111-111111111111'))
for source in ['supabase-schema.sql','supabase/migrations/20261021121716_nexus_ai_server.sql','supabase/migrations/20261021124631_central_orchestrator.sql']:
 text=(root/source).read_text()
 for policy in re.findall(r'create policy[\s\S]*?;',text,flags=re.I):
  if re.search(r'\bon public\.(admin_users|applications|ai_work_plans|orchestrator_jobs|orchestrator_tasks|orchestrator_events)\b',policy,re.I):sql(policy)
for table in ['admin_users','applications','ai_work_plans','orchestrator_jobs','orchestrator_tasks','orchestrator_events']:
 sql(f'alter table public.{table} enable row level security; grant select on public.{table} to authenticated;')
sql('grant update,insert on public.applications to authenticated; grant insert on public.applications to anon;')
a=value("insert into applications(customer_name,privacy_consent,status) values('SYNTHETIC',true,'received') returning id")
p=value(f"insert into ai_work_plans(application_id,created_by,plan) values('{a}','11111111-1111-4111-8111-111111111111','{{}}') returning id")
j=value(f"insert into orchestrator_jobs(created_by,status) values('11111111-1111-4111-8111-111111111111','awaiting_approval') returning id")
admin='11111111-1111-4111-8111-111111111111';other='99999999-9999-4999-8999-999999999999'
def identity(uid):return f"set role authenticated; set request.jwt.claims='{json.dumps({'sub':uid})}';"
for table in ['applications','ai_work_plans','orchestrator_jobs','admin_users']:
 assert value(identity(admin)+f'select count(*) from {table}')=='1'
 assert value(identity(other)+f'select count(*) from {table}')=='0'
assert value(identity(admin)+f"update applications set status='reviewing' where id='{a}'; select status from applications where id='{a}'")=='reviewing'
assert value(identity(other)+f"with changed as(update applications set status='cancelled' where id='{a}' returning id) select count(*) from changed")=='0'
r=sql(identity(other)+f"insert into ai_work_plans(application_id,created_by,plan) values('{a}','{other}','{{}}')",False);assert r.returncode and 'permission denied' in r.stderr
r=sql("set role anon; insert into applications(privacy_consent,status) values(true,'in_progress')",False);assert r.returncode and 'row-level security' in r.stderr
r=sql('set role anon; select * from applications',False);assert r.returncode and 'permission denied' in r.stderr
sql("set role anon; insert into applications(privacy_consent,status) values(true,'received')")
print('SOLQ_RLS_RESULT='+json.dumps({'postgres_version':value('show server_version'),'real_sql_roles_and_policies':True,'synthetic_identity_not_real_jwt':True,'admin_reads':True,'nonadmin_hidden_rows':True,'admin_explicit_update':True,'nonadmin_update_rows':0,'nonadmin_plan_insert_denied':True,'anon_select_denied':True,'anon_invalid_insert_denied':True,'anon_valid_insert':True,'production_policy_changes':0}))
