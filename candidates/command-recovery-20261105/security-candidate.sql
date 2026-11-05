-- NON-PRODUCTION CANDIDATE ONLY. Requires reviewed production approval and backup/restore PASS.
-- Catalog-confirmed ancillary rights; intake INSERT and admin SELECT/UPDATE stay intact.
revoke truncate,references,trigger,maintain on public.admin_users from anon,authenticated;
revoke maintain on public.applications from anon,authenticated;
create role solq_public_rpc_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
-- The database operator must be able to transfer function ownership without SUPERUSER.
grant solq_public_rpc_owner to postgres with set true;
create schema solq_rpc_private;
revoke all on schema solq_rpc_private from public;
grant usage on schema solq_rpc_private to anon,authenticated,solq_public_rpc_owner;
grant create on schema solq_rpc_private to solq_public_rpc_owner;
grant usage on schema public,auth to solq_public_rpc_owner;
grant execute on function auth.uid(),auth.role(),auth.jwt() to solq_public_rpc_owner;
grant insert(customer_name,contact,service_type,description,privacy_consent,status,internal_note),select(receipt_number) on public.applications to solq_public_rpc_owner;
create policy solq_rpc_owner_insert_application on public.applications for insert to solq_public_rpc_owner with check(privacy_consent=true and status='received' and internal_note is null);
create policy solq_rpc_owner_receipt on public.applications for select to solq_public_rpc_owner using(true);
grant insert(access_hash,question,language),select(id,access_hash,question,language,answer,created_at,answered_at) on public.support_inquiries to solq_public_rpc_owner;
create policy solq_rpc_owner_insert_support on public.support_inquiries for insert to solq_public_rpc_owner with check(true);
create policy solq_rpc_owner_read_support on public.support_inquiries for select to solq_public_rpc_owner using(true);
CREATE OR REPLACE FUNCTION solq_rpc_private.submit_application(p_customer_name text, p_contact text, p_service_type text, p_description text, p_privacy_consent boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_receipt text;
begin
 if coalesce(auth.role(),'') not in ('anon','authenticated') then raise exception 'Unauthorized' using errcode='42501'; end if;
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
alter function solq_rpc_private.submit_application(p_customer_name text, p_contact text, p_service_type text, p_description text, p_privacy_consent boolean) owner to solq_public_rpc_owner;
revoke all on function solq_rpc_private.submit_application(p_customer_name text, p_contact text, p_service_type text, p_description text, p_privacy_consent boolean) from public;
grant execute on function solq_rpc_private.submit_application(p_customer_name text, p_contact text, p_service_type text, p_description text, p_privacy_consent boolean) to anon,authenticated;
CREATE OR REPLACE FUNCTION solq_rpc_private.submit_support_inquiry(p_question text, p_language text, p_access_token text, p_consent boolean, p_transfer_consent boolean)
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
alter function solq_rpc_private.submit_support_inquiry(p_question text, p_language text, p_access_token text, p_consent boolean, p_transfer_consent boolean) owner to solq_public_rpc_owner;
revoke all on function solq_rpc_private.submit_support_inquiry(p_question text, p_language text, p_access_token text, p_consent boolean, p_transfer_consent boolean) from public;
grant execute on function solq_rpc_private.submit_support_inquiry(p_question text, p_language text, p_access_token text, p_consent boolean, p_transfer_consent boolean) to anon,authenticated;
CREATE OR REPLACE FUNCTION solq_rpc_private.read_support_inquiry(p_id uuid, p_access_token text)
 RETURNS TABLE(question text, language text, answer text, created_at timestamp with time zone, answered_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select s.question,s.language,s.answer,s.created_at,s.answered_at from public.support_inquiries s
 where s.id=p_id and p_access_token ~ '^[a-f0-9]{64}$'
 and s.access_hash=encode(sha256(convert_to(p_access_token,'UTF8')),'hex');
$function$
;
alter function solq_rpc_private.read_support_inquiry(p_id uuid, p_access_token text) owner to solq_public_rpc_owner;
revoke all on function solq_rpc_private.read_support_inquiry(p_id uuid, p_access_token text) from public;
grant execute on function solq_rpc_private.read_support_inquiry(p_id uuid, p_access_token text) to anon,authenticated;
create or replace function public.submit_application(p_customer_name text,p_contact text,p_service_type text,p_description text,p_privacy_consent boolean) returns text language sql security invoker set search_path='' as $$select solq_rpc_private.submit_application(p_customer_name,p_contact,p_service_type,p_description,p_privacy_consent)$$;
create or replace function public.submit_support_inquiry(p_question text,p_language text,p_access_token text,p_consent boolean,p_transfer_consent boolean) returns uuid language sql security invoker set search_path='' as $$select solq_rpc_private.submit_support_inquiry(p_question,p_language,p_access_token,p_consent,p_transfer_consent)$$;
create or replace function public.read_support_inquiry(p_id uuid,p_access_token text) returns table(question text,language text,answer text,created_at timestamptz,answered_at timestamptz) language sql stable security invoker set search_path='' as $$select * from solq_rpc_private.read_support_inquiry(p_id,p_access_token)$$;
revoke create on schema solq_rpc_private from solq_public_rpc_owner;

