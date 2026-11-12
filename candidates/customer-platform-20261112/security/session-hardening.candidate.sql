-- ISOLATED CANDIDATE ONLY. Apply after customer-schema and enrollment-proof candidates.
-- No changes to existing applications/admin_users/auth tables, grants, or policies.
BEGIN;
CREATE SCHEMA solq_customer_security;
REVOKE ALL ON SCHEMA solq_customer_security FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA solq_customer_security TO authenticated,service_role;
-- Narrow, non-exposed definer is necessary to inspect protected Auth tables without
-- granting clients SELECT on auth.users/auth.sessions. No dynamic SQL or caller-selected uid.
CREATE FUNCTION solq_customer_security.request_session_active() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb:=auth.jwt(); uid uuid:=auth.uid(); sid uuid;
BEGIN
 IF uid IS NULL OR (claims->>'role') IS DISTINCT FROM 'authenticated' OR coalesce((claims->>'is_anonymous')::boolean,true)
 OR coalesce((claims->>'exp')::numeric,0)<=extract(epoch from statement_timestamp()) THEN RETURN false; END IF;
 sid:=(claims->>'session_id')::uuid;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=sid AND s.user_id=uid AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
 AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
 AND coalesce(u.is_anonymous,false)=false AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp()));
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION solq_customer_security.request_session_active() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION solq_customer_security.request_session_active() TO authenticated;
-- Restrictive AND gate: existing ownership/admin policy cannot OR around session checks.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['solq_customer_cases','solq_customer_consent_events','solq_customer_messages','solq_customer_requests','solq_customer_previews','solq_customer_artifacts'] LOOP
 EXECUTE format('CREATE POLICY customer_active_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT solq_customer_security.request_session_active())) WITH CHECK ((SELECT solq_customer_security.request_session_active()))',t);
 END LOOP;
END $$;
-- Public invoker exposes only own boolean, never session ids or Auth records.
CREATE FUNCTION public.solq_customer_session_active() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT solq_customer_security.request_session_active()
$$;
REVOKE ALL ON FUNCTION public.solq_customer_session_active() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_customer_session_active() TO authenticated;

-- Server-only checker locks the existing session through transaction completion.
-- This serializes proof issuance/exchange with concurrent DELETE-based session revocation.
CREATE FUNCTION solq_customer_security.lock_verified_session(p_account uuid,p_session uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=p_session AND s.user_id=p_account AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
 AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
 AND coalesce(u.is_anonymous,false)=false AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) FOR SHARE OF s,u;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION solq_customer_security.lock_verified_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION solq_customer_security.lock_verified_session(uuid,uuid) TO service_role;
ALTER TABLE solq_customer_private.enrollment_proofs ADD COLUMN session_id uuid NOT NULL;
-- Disable the earlier unbound API; source remains preserved for prior evidence.
REVOKE ALL ON FUNCTION public.solq_issue_customer_enrollment(text,uuid,uuid,text,timestamptz),public.solq_exchange_customer_enrollment(text,uuid,text) FROM service_role;
CREATE FUNCTION public.solq_issue_customer_enrollment_v2(p_proof_hash text,p_application_id uuid,p_account_id uuid,p_receipt_number text,p_expires_at timestamptz,p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT solq_customer_security.lock_verified_session(p_account_id,p_session_id)
 OR p_expires_at>clock_timestamp()+interval '5 minutes'
 OR NOT EXISTS(SELECT 1 FROM public.applications WHERE id=p_application_id AND receipt_number=p_receipt_number) THEN RAISE EXCEPTION 'enrollment_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO solq_customer_private.enrollment_proofs(proof_hash,application_id,account_id,receipt_number,expires_at,session_id)
 VALUES(p_proof_hash,p_application_id,p_account_id,p_receipt_number,p_expires_at,p_session_id);
 RETURN true;
END $$;
CREATE FUNCTION public.solq_exchange_customer_enrollment_v2(p_proof_hash text,p_account_id uuid,p_receipt_number text,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE proof solq_customer_private.enrollment_proofs; bound public.solq_customer_cases;
BEGIN
 IF NOT solq_customer_security.lock_verified_session(p_account_id,p_session_id) THEN RETURN NULL; END IF;
 UPDATE solq_customer_private.enrollment_proofs SET consumed_at=clock_timestamp()
 WHERE proof_hash=p_proof_hash AND account_id=p_account_id AND receipt_number=p_receipt_number AND session_id=p_session_id
 AND purpose='solq_customer_enrollment' AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING * INTO proof;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.solq_customer_cases(application_id,account_id,verification_reference,created_by)
 VALUES(proof.application_id,proof.account_id,'verified-enrollment:v2',proof.account_id) ON CONFLICT(application_id) DO NOTHING;
 SELECT * INTO bound FROM public.solq_customer_cases WHERE application_id=proof.application_id;
 IF bound.account_id IS DISTINCT FROM p_account_id THEN RAISE EXCEPTION 'binding_not_completed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('caseId',bound.id);
END $$;
REVOKE ALL ON FUNCTION public.solq_issue_customer_enrollment_v2(text,uuid,uuid,text,timestamptz,uuid),public.solq_exchange_customer_enrollment_v2(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_issue_customer_enrollment_v2(text,uuid,uuid,text,timestamptz,uuid),public.solq_exchange_customer_enrollment_v2(text,uuid,text,uuid) TO service_role;
COMMIT;
