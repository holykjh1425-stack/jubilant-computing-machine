"""New recovery/worker impact checks only; never imports prior test execution."""
import json,os,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2];c=os.environ['SOLQ_TEST_CONTAINER']
assert re.fullmatch(r'solq-recovery-[0-9]+-[0-9]+',c)
def sql(q):return subprocess.run(['docker','exec','-i',c,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_recovery'],input=q,text=True,capture_output=True,check=True,timeout=30)
def val(q):return sql(q).stdout.strip()
def script(p):sql((root/p).read_text())
info=json.loads(subprocess.check_output(['docker','inspect',c],text=True))[0]
assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig'].get('PortBindings')
assert all(m['Type']!='bind' for m in info['Mounts'])
fixture=(root/'tests/duplicate-fix-db.test.mjs').read_text()
sql(re.search(r'await db.exec\(`([\s\S]*?)`\);',fixture).group(1).replace('${admin}','11111111-1111-4111-8111-111111111111'))
script('supabase/migrations/20261021213341_production_core.sql')
sql('create table nexus_production_private.security_backups(backup_key text primary key,payload jsonb);alter table public.production_jobs add column production_approved_by uuid,add column production_approved_at timestamptz;')
for fn in re.findall(r'CREATE OR REPLACE FUNCTION nexus_production_private\.[\s\S]*?\$function\$\s*;',(root/'ops/free-plan-automation/baseline-functions.sql').read_text()):sql(fn)
sql('create trigger approval_guard before insert or update on public.production_jobs for each row execute function nexus_production_private.guard_job();create trigger application_guard before update of status on public.applications for each row execute function nexus_production_private.guard_application();')
script('ops/free-plan-automation/automation.sql');script('ops/free-plan-automation/production-gates.sql')
sql('begin;'+(root/'ops/admin-integration-candidate/link-guard.sql').read_text()+'commit;')
sql('alter table admin_users enable row level security;create policy own_admin on admin_users for select to authenticated using(user_id=(select auth.uid()));grant truncate,references,trigger on admin_users to anon,authenticated;grant select on admin_users to service_role;')
policy_query="select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p"
row_query="select jsonb_agg(to_jsonb(a) order by user_id) from admin_users a"
acl_query="select relacl::text from pg_class where oid='public.admin_users'::regclass"
count_query="select count(*) from (values ('anon'),('authenticated')) r(role_name) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_name) where has_table_privilege(r.role_name,'public.admin_users',p.privilege_name)"
before={'rows':val(row_query),'policies':val(policy_query),'acl':val(acl_query)}
# One historical synthetic customer is immutable across apply/recovery.
history=val("insert into applications(service_type,description,status) values('ai_automation','SYNTHETIC historical preservation request','received') returning id")
sql('select nexus_production_private.free_cycle()')
history_query=f"select jsonb_build_object('app',(select to_jsonb(a) from applications a where id='{history}'),'plan',(select to_jsonb(p) from ai_work_plans p where application_id='{history}'),'job',(select to_jsonb(j) from orchestrator_jobs j where application_id='{history}'))"
historical=val(history_query)
def checks():
 assert val(policy_query)==before['policies'] and val(row_query)==before['rows']
 assert val(history_query)==historical
 assert val("set role authenticated;set request.jwt.claims='{\"sub\":\"11111111-1111-4111-8111-111111111111\"}';select count(*) from admin_users")=='1'
 assert val('set role service_role;select count(*) from admin_users')=='1'
 assert val("select count(*) from production_attempts")=='0'
def new_worker_request():
 a=val("insert into applications(service_type,description,status) values('ai_automation','SYNTHETIC new independent worker request','received') returning id")
 sql('select nexus_production_private.free_cycle()')
 result=json.loads(val(f"select json_build_object('plans',(select count(*) from ai_work_plans where application_id='{a}'),'jobs',(select count(*) from orchestrator_jobs where application_id='{a}'),'tasks',(select count(*) from orchestrator_tasks t join orchestrator_jobs j on j.id=t.job_id where j.application_id='{a}'))"))
 assert result=={'plans':1,'jobs':1,'tasks':6};return result
script('ops/residual-validation/admin-users-grants-candidate.sql');assert val(count_query)=='0';checks()
worker_after_apply=new_worker_request()
script('ops/residual-validation/admin-users-grants-recovery.sql');assert val(count_query)=='6';checks()
# ACL is an unordered set: compare textual entries sorted, not array order.
assert sorted(val(acl_query).strip('{}').split(','))==sorted(before['acl'].strip('{}').split(','))
worker_after_recovery=new_worker_request()
print('SOLQ_RECOVERY_RESULT='+json.dumps({'six_grants_restored_exactly':True,'acl_restored':True,'admin_lookup_and_service_role_kept':True,'rls_policies_unchanged':True,'historical_rows_unchanged':True,'worker_after_apply':worker_after_apply,'worker_after_recovery':worker_after_recovery,'production_attempts':0,'production_changes':0}))
