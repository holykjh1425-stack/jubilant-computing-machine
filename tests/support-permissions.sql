begin;
create temporary table support_test_state(id uuid,admin_id uuid) on commit drop;
insert into support_test_state(admin_id) select user_id from public.admin_users limit 1;
grant all on support_test_state to anon,authenticated;
set local role anon;
do $$ declare v_id uuid; n int; begin
 select public.submit_support_inquiry('QA support permissions test','English',repeat('a',64),true,true) into v_id;
 update support_test_state set id=v_id;
 if public.submit_support_inquiry('QA support permissions test','English',repeat('a',64),true,true)<>v_id then raise exception 'duplicate'; end if;
 select count(*) into n from public.read_support_inquiry(v_id,repeat('b',64)); if n<>0 then raise exception 'key isolation'; end if;
 select count(*) into n from public.read_support_inquiry(v_id,repeat('a',64)); if n<>1 then raise exception 'own read'; end if;
 begin perform id from public.support_inquiries; raise exception 'anon exposed'; exception when insufficient_privilege then null; end;
 begin perform public.submit_support_inquiry('valid question','en',repeat('c',64),false,true); raise exception 'consent bypass'; exception when raise_exception then if sqlerrm='consent bypass' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true) is not null as nonadmin_claim_set;
do $$ declare n int; begin
 select count(*) into n from public.support_inquiries; if n<>0 then raise exception 'nonadmin exposed'; end if;
 update public.support_inquiries set answer='unauthorized' where id=(select id from support_test_state);
 get diagnostics n=row_count; if n<>0 then raise exception 'nonadmin write'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select admin_id::text from support_test_state),true) is not null as admin_claim_set;
do $$ declare n int; begin
 update public.support_inquiries set answer='QA administrator response',answered_at=now() where id=(select id from support_test_state);
 get diagnostics n=row_count; if n<>1 then raise exception 'admin update'; end if;
end $$;
reset role;
set local role anon;
do $$ declare result text; begin
 select answer into result from public.read_support_inquiry((select id from support_test_state),repeat('a',64));
 if result<>'QA administrator response' then raise exception 'answer read'; end if;
end $$;
reset role;
rollback;
select 'PASS: key isolation, consent, duplicate prevention, anon/nonadmin denial, administrator reply and customer read. Rolled back.' as result;
