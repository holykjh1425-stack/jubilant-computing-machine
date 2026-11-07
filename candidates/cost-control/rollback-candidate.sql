-- CANDIDATE ONLY, owner-reviewed separate approval required. Does not erase ledger/history.
begin;
update solq_cost_private.policy set healthy=false where id=true;
revoke execute on function solq_cost_private.approve(text,text,integer,integer,integer,bigint,timestamptz,boolean) from authenticated;
revoke execute on function solq_cost_private.reserve(text,integer,text,integer,integer) from service_role;
revoke execute on function solq_cost_private.settle(text,integer,uuid,integer,integer,boolean,boolean) from service_role;
-- Remove any future candidate UI/dispatcher entry points separately.
-- Never drop existing customers, plans, jobs, approvals or budget reservations to reset spend.
commit;
