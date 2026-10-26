-- RECOVERY CANDIDATE ONLY: restores precisely the six original grants.
-- Requires separate approval; this reintroduces unnecessary capabilities.
-- Use as table owner postgres, after comparing current ACL with the approved snapshot.
-- Never run automatically because a frontend deployment failed.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
grant truncate,references,trigger on table public.admin_users to anon,authenticated;
do $$begin
 if (select count(*) from (values ('anon'),('authenticated')) r(role_name)
 cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_name)
 where has_table_privilege(r.role_name,'public.admin_users',p.privilege_name))<>6 then
  raise exception 'six original privileges not restored; rollback';
 end if;
 if not has_table_privilege('authenticated','public.admin_users','SELECT') then
  raise exception 'administrator SELECT unavailable; rollback';
 end if;
 if not exists(select 1 from pg_class where oid='public.admin_users'::regclass and relrowsecurity) then
  raise exception 'RLS unavailable; rollback';
 end if;
end$$;
commit;
