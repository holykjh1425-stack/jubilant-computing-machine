create or replace function public.submit_application(p_customer_name text,p_contact text,p_service_type text,p_description text,p_privacy_consent boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_receipt text;
begin
 if auth.role() not in ('anon','authenticated') then raise exception 'Unauthorized' using errcode='42501'; end if;
 if p_privacy_consent is distinct from true
 or char_length(btrim(coalesce(p_customer_name,''))) not between 1 and 100
 or char_length(btrim(coalesce(p_contact,''))) not between 3 and 200
 or p_service_type not in ('website','ai_automation','custom_system','consulting')
 or char_length(btrim(coalesce(p_description,''))) not between 1 and 5000 then
   raise exception 'Invalid application' using errcode='22023';
 end if;
 insert into public.applications(customer_name,contact,service_type,description,privacy_consent,status,internal_note)
 values(btrim(p_customer_name),btrim(p_contact),p_service_type,btrim(p_description),true,'received',null)
 returning receipt_number into v_receipt;
 return v_receipt;
end; $$;
revoke all on function public.submit_application(text,text,text,text,boolean) from public;
grant execute on function public.submit_application(text,text,text,text,boolean) to anon,authenticated;
