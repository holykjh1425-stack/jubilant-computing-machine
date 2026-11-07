-- Non-production tested rollback candidate. Only after reviewed backup and production approval.
CREATE OR REPLACE FUNCTION public.read_support_inquiry(p_id uuid, p_access_token text)
 RETURNS TABLE(question text, language text, answer text, created_at timestamp with time zone, answered_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select s.question,s.language,s.answer,s.created_at,s.answered_at from public.support_inquiries s
 where s.id=p_id and length(p_access_token)=64
 and s.access_hash=encode(sha256(convert_to(p_access_token,'UTF8')),'hex');
$function$
;
CREATE OR REPLACE FUNCTION public.submit_application(p_customer_name text, p_contact text, p_service_type text, p_description text, p_privacy_consent boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.submit_support_inquiry(p_question text, p_language text, p_access_token text, p_consent boolean, p_transfer_consent boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result_id uuid; token_hash text;
begin
 if p_consent is distinct from true or p_transfer_consent is distinct from true
 or coalesce(length(btrim(p_question)),0) not between 5 and 4000
 or coalesce(length(btrim(p_language)),0) not between 1 and 40
 or p_access_token is null or p_access_token !~ '^[a-f0-9]{64}$' then
 raise exception 'Invalid inquiry'; end if;
 token_hash:=encode(sha256(convert_to(p_access_token,'UTF8')),'hex');
 insert into public.support_inquiries(access_hash,question,language)
 values(token_hash,btrim(p_question),btrim(p_language))
 on conflict(access_hash) do nothing returning id into result_id;
 if result_id is null then select id into result_id from public.support_inquiries where access_hash=token_hash; end if;
 return result_id;
end; $function$
;
drop function solq_rpc_private.submit_application(text,text,text,text,boolean);
drop function solq_rpc_private.submit_support_inquiry(text,text,text,boolean,boolean);
drop function solq_rpc_private.read_support_inquiry(uuid,text);
drop policy solq_rpc_owner_insert_application on public.applications;
drop policy solq_rpc_owner_receipt on public.applications;
drop policy solq_rpc_owner_insert_support on public.support_inquiries;
drop policy solq_rpc_owner_read_support on public.support_inquiries;
revoke all on public.applications,public.support_inquiries from solq_public_rpc_owner;
revoke all on schema public,solq_rpc_private from solq_public_rpc_owner;
drop schema solq_rpc_private;
drop role solq_public_rpc_owner;
-- Restores the exact confirmed ancillary rights; reviewed rollback only, not recommended final security state.
grant truncate,references,trigger,maintain on public.admin_users to anon,authenticated;
grant maintain on public.applications to anon,authenticated;

