"""Regression only for six observed admin_users grants; no previous suites run."""
import json,os,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
c=os.environ['SOLQ_TEST_CONTAINER'];assert re.fullmatch(r'solq-grants-[0-9]+-[0-9]+',c)
def sql(q,check=True):return subprocess.run(['docker','exec','-i',c,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','solq_grants'],input=q,text=True,capture_output=True,timeout=30,check=check)
def val(q):return sql(q).stdout.strip()
inspect=json.loads(subprocess.check_output(['docker','inspect',c],text=True))[0]
assert inspect['HostConfig']['NetworkMode']=='none' and not any(m['Type']=='bind' for m in inspect['Mounts'])
assert not inspect['HostConfig'].get('PortBindings')
sql("create role anon;create role authenticated;create schema auth;grant usage on schema auth to public;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('synthetic.uid',true),'')::uuid$$;create table public.admin_users(user_id uuid primary key);insert into admin_users values('11111111-1111-4111-8111-111111111111');alter table admin_users enable row level security;grant select on admin_users to authenticated;grant truncate,references,trigger on admin_users to anon,authenticated;create policy own_admin on admin_users for select to authenticated using(user_id=(select auth.uid()));")
privileges="select count(*) from (values ('anon'),('authenticated')) r(role) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) where has_table_privilege(r.role,'public.admin_users',p.privilege)"
assert val(privileges)=='6'
before=val('select jsonb_agg(to_jsonb(a) order by user_id) from admin_users a')
# Demonstrate revoked capability in a disposable transaction, without losing rows.
sql('begin;set local role anon;truncate admin_users;rollback;')
patch=(root/'ops/residual-validation/admin-users-grants-candidate.sql').read_text()
sql(patch)
assert val(privileges)=='0'
assert val("set role authenticated;set synthetic.uid='11111111-1111-4111-8111-111111111111';select count(*) from admin_users")=='1'
assert val("set role authenticated;set synthetic.uid='99999999-9999-4999-8999-999999999999';select count(*) from admin_users")=='0'
r=sql('begin;set local role anon;truncate admin_users;rollback;',False);assert r.returncode!=0 and 'permission denied' in r.stderr
assert val('select jsonb_agg(to_jsonb(a) order by user_id) from admin_users a')==before
sql(patch);assert val(privileges)=='0'
# Verify failure is atomic if effective privilege survives via role inheritance.
sql('create role synthetic_inherited;grant synthetic_inherited to anon;grant truncate on admin_users to synthetic_inherited;grant truncate,references,trigger on admin_users to anon,authenticated;')
r=sql(patch,False);assert r.returncode!=0 and 'effective unwanted privilege remains' in r.stderr
assert val(privileges)=='6'
print('SOLQ_GRANTS_RESULT='+json.dumps({'observed_unwanted_grants_before':6,'candidate_unwanted_grants_after':0,'admin_lookup_kept':True,'nonadmin_visible_rows':0,'anon_truncate_denied':True,'row_content_preserved':True,'repeat_installation':True,'inherited_privilege_failure_atomic':True,'production_changes':0}))
