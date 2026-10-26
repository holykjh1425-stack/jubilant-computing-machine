-- CANDIDATE ONLY. Requires separate approval before any production execution.
-- No customer rows, role membership, schema USAGE or RLS policy changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
revoke truncate,references,trigger on table public.admin_users from anon,authenticated;
do $$begin
 if has_table_privilege('anon','public.admin_users','TRUNCATE')
 or has_table_privilege('anon','public.admin_users','REFERENCES')
 or has_table_privilege('anon','public.admin_users','TRIGGER')
 or has_table_privilege('authenticated','public.admin_users','TRUNCATE')
 or has_table_privilege('authenticated','public.admin_users','REFERENCES')
 or has_table_privilege('authenticated','public.admin_users','TRIGGER') then
  raise exception 'effective unwanted privilege remains: inspect inherited grants; rollback';
 end if;
 if not has_table_privilege('authenticated','public.admin_users','SELECT') then
  raise exception 'required administrator lookup privilege missing; rollback';
 end if;
 if not exists(select 1 from pg_class where oid='public.admin_users'::regclass and relrowsecurity) then
  raise exception 'RLS missing; rollback';
 end if;
end$$;
commit;
