-- Isolated development candidate ONLY. No operating DDL, triggers, or legacy RPC changes.
-- Requires earlier customer-schema, enrollment-proof, session-hardening candidates.
BEGIN;
CREATE SCHEMA solq_verified_intake;
REVOKE ALL ON SCHEMA solq_verified_intake FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA solq_verified_intake TO service_role;
CREATE TABLE solq_verified_intake.submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL, fingerprint text NOT NULL,
 application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id),case_id uuid NOT NULL REFERENCES public.solq_customer_cases(id),
 consent_version text NOT NULL CHECK(consent_version='intake-email-v1'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(account_id,request_id)
);
CREATE TABLE solq_verified_intake.outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL UNIQUE REFERENCES solq_verified_intake.submissions(id),
 account_id uuid NOT NULL REFERENCES auth.users(id), recipient text NOT NULL, receipt_number text NOT NULL,
 classification text NOT NULL DEFAULT 'transactional_receipt' CHECK(classification='transactional_receipt'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','accepted','failed','unknown','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease uuid,lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), provider_reference text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE solq_verified_intake.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,outbox_id uuid NOT NULL REFERENCES solq_verified_intake.outbox(id),event text NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE solq_verified_intake.auth_attempts(email_key text NOT NULL,network_key text NOT NULL,operation text NOT NULL CHECK(operation IN ('send','verify')),at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX auth_attempts_email ON solq_verified_intake.auth_attempts(email_key,operation,at);
CREATE INDEX auth_attempts_network ON solq_verified_intake.auth_attempts(network_key,operation,at);
ALTER TABLE solq_verified_intake.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE solq_verified_intake.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE solq_verified_intake.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE solq_verified_intake.auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA solq_verified_intake FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA solq_verified_intake FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA solq_verified_intake TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA solq_verified_intake TO service_role;
-- Restricted helper avoids granting access to Auth tables; existing Auth grants untouched.
CREATE FUNCTION solq_verified_intake.verified_email(p_uid uuid,p_session uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result text;
BEGIN
 SELECT lower(btrim(u.email)) INTO result FROM auth.users u WHERE u.id=p_uid AND u.email_confirmed_at IS NOT NULL
 AND coalesce(u.is_anonymous,false)=false AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) FOR SHARE;
 IF p_session IS NOT NULL AND NOT solq_customer_security.lock_verified_session(p_uid,p_session) THEN RETURN NULL; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION solq_verified_intake.verified_email(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION solq_verified_intake.verified_email(uuid,uuid) TO service_role;
CREATE FUNCTION public.solq_reserve_email_auth(p_email_key text,p_network_key text,p_operation text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE since_at timestamptz;
BEGIN
 IF p_email_key IS NULL OR p_network_key IS NULL OR p_email_key!~'^[a-f0-9]{64}$' OR p_network_key!~'^[a-f0-9]{64}$' OR p_operation IS NULL OR p_operation NOT IN ('send','verify') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('otp-email:'||p_email_key||p_operation,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('otp-network:'||p_network_key||p_operation,0));
 since_at:=clock_timestamp()-CASE WHEN p_operation='send' THEN interval '1 hour' ELSE interval '10 minutes' END;
 IF (SELECT count(*) FROM solq_verified_intake.auth_attempts WHERE email_key=p_email_key AND operation=p_operation AND at>since_at)>=(CASE WHEN p_operation='send' THEN 3 ELSE 5 END)
 OR (SELECT count(*) FROM solq_verified_intake.auth_attempts WHERE network_key=p_network_key AND operation=p_operation AND at>since_at)>=(CASE WHEN p_operation='send' THEN 10 ELSE 20 END)
 OR p_operation='send' AND EXISTS(SELECT 1 FROM solq_verified_intake.auth_attempts WHERE email_key=p_email_key AND operation='send' AND at>clock_timestamp()-interval '60 seconds') THEN RETURN false; END IF;
 INSERT INTO solq_verified_intake.auth_attempts(email_key,network_key,operation) VALUES(p_email_key,p_network_key,p_operation);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.solq_reserve_email_auth(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_reserve_email_auth(text,text,text) TO service_role;
CREATE FUNCTION public.solq_submit_verified_application(p_account uuid,p_session uuid,p_email text,p_request uuid,p_payload jsonb,p_auth_expires timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE email text; fp text; old solq_verified_intake.submissions; app public.applications; c public.solq_customer_cases; sub solq_verified_intake.submissions; mail solq_verified_intake.outbox;
BEGIN
 IF p_auth_expires IS NULL OR p_auth_expires<=clock_timestamp() OR p_account IS NULL OR p_session IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'verified_email_required' USING ERRCODE='42501'; END IF;
 email:=solq_verified_intake.verified_email(p_account,p_session);
 IF email IS NULL OR email IS DISTINCT FROM lower(btrim(p_email)) THEN RAISE EXCEPTION 'verified_email_required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR (p_payload-ARRAY['customer_name','service_type','description','privacy_consent','transfer_consent','consent_version'])<>'{}'::jsonb
 OR jsonb_typeof(p_payload->'customer_name') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'description') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'service_type') IS DISTINCT FROM 'string'
 OR coalesce(length(btrim(p_payload->>'customer_name')),0) NOT BETWEEN 1 AND 100
 OR coalesce(length(btrim(p_payload->>'description')),0) NOT BETWEEN 1 AND 5000
 OR (p_payload->>'service_type') IS NULL OR p_payload->>'service_type' NOT IN ('website','ai_automation','custom_system','consulting')
 OR p_payload->'privacy_consent' IS DISTINCT FROM 'true'::jsonb OR p_payload->'transfer_consent' IS DISTINCT FROM 'true'::jsonb
 OR (p_payload->>'consent_version') IS DISTINCT FROM 'intake-email-v1' THEN RAISE EXCEPTION 'invalid_intake' USING ERRCODE='22023'; END IF;
 fp:=encode(sha256(convert_to(p_payload::text||email,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||p_request::text,0));
 IF p_auth_expires<=clock_timestamp() THEN RAISE EXCEPTION 'auth_expired' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM solq_verified_intake.submissions WHERE account_id=p_account AND request_id=p_request;
 IF FOUND THEN
  IF old.fingerprint<>fp THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023'; END IF;
  SELECT * INTO app FROM public.applications WHERE id=old.application_id;
  SELECT * INTO mail FROM solq_verified_intake.outbox WHERE submission_id=old.id;
  RETURN jsonb_build_object('receiptNumber',app.receipt_number,'caseId',old.case_id,'applicationSaved',true,'mailState',mail.state,'duplicate',true);
 END IF;
 -- Uses existing row defaults, status received; no free plan/job/approval mutation.
 INSERT INTO public.applications(customer_name,contact,service_type,description,privacy_consent,status,internal_note)
 VALUES(btrim(p_payload->>'customer_name'),email,p_payload->>'service_type',btrim(p_payload->>'description'),true,'received',NULL) RETURNING * INTO app;
 INSERT INTO public.solq_customer_cases(application_id,account_id,verification_reference,created_by)
 VALUES(app.id,p_account,'verified-email-intake-v1',p_account) RETURNING * INTO c;
 INSERT INTO solq_verified_intake.submissions(account_id,request_id,fingerprint,application_id,case_id,consent_version)
 VALUES(p_account,p_request,fp,app.id,c.id,'intake-email-v1') RETURNING * INTO sub;
 INSERT INTO solq_verified_intake.outbox(submission_id,account_id,recipient,receipt_number) VALUES(sub.id,p_account,email,app.receipt_number) RETURNING * INTO mail;
 INSERT INTO solq_verified_intake.audit(outbox_id,event) VALUES(mail.id,'receipt_queued');
 RETURN jsonb_build_object('receiptNumber',app.receipt_number,'caseId',c.id,'applicationSaved',true,'mailState','pending','duplicate',false);
END $$;
CREATE FUNCTION public.solq_verified_receipt_status(p_account uuid,p_session uuid,p_request uuid,p_auth_expires timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_auth_expires IS NULL OR p_auth_expires<=clock_timestamp() OR p_session IS NULL OR solq_verified_intake.verified_email(p_account,p_session) IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('applicationSaved',true,'receiptNumber',a.receipt_number,'caseId',s.case_id,'mailState',o.state)
 INTO result FROM solq_verified_intake.submissions s JOIN public.applications a ON a.id=s.application_id JOIN solq_verified_intake.outbox o ON o.submission_id=s.id WHERE s.account_id=p_account AND s.request_id=p_request;
 RETURN result;
END $$;
CREATE FUNCTION public.solq_claim_receipt() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m solq_verified_intake.outbox; current_email text;
BEGIN
 -- Uncertain transport or lost lease is reconciled manually; never automatically resend.
 WITH stale AS (UPDATE solq_verified_intake.outbox SET state='unknown',lease=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE state='processing' AND lease_until<=clock_timestamp() RETURNING id)
 INSERT INTO solq_verified_intake.audit(outbox_id,event) SELECT id,'lease_uncertain' FROM stale;
 SELECT * INTO m FROM solq_verified_intake.outbox WHERE state IN ('pending','failed') AND attempts<3 AND next_attempt_at<=clock_timestamp() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 current_email:=solq_verified_intake.verified_email(m.account_id);
 IF current_email IS DISTINCT FROM m.recipient THEN
 UPDATE solq_verified_intake.outbox SET state='cancelled',updated_at=clock_timestamp() WHERE id=m.id;
 INSERT INTO solq_verified_intake.audit(outbox_id,event) VALUES(m.id,'recipient_changed');RETURN NULL; END IF;
 UPDATE solq_verified_intake.outbox SET state='processing',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
 INSERT INTO solq_verified_intake.audit(outbox_id,event) VALUES(m.id,'attempt_claimed');
 RETURN jsonb_build_object('id',m.id,'lease',m.lease,'recipient',m.recipient,'receiptNumber',m.receipt_number,'attempt',m.attempts);
END $$;
CREATE FUNCTION public.solq_finish_receipt(p_id uuid,p_lease uuid,p_result text,p_reference text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m solq_verified_intake.outbox;
BEGIN
 SELECT * INTO m FROM solq_verified_intake.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR m.state<>'processing' OR m.lease IS DISTINCT FROM p_lease OR m.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'stale_lease' USING ERRCODE='42501'; END IF;
 IF p_result NOT IN ('accepted','failed','unknown') OR p_result IS NULL THEN RAISE EXCEPTION 'invalid_result'; END IF;
 UPDATE solq_verified_intake.outbox SET state=p_result,lease=NULL,lease_until=NULL,provider_reference=left(p_reference,200),next_attempt_at=clock_timestamp()+make_interval(secs=>60*power(5,m.attempts-1)::int),updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO solq_verified_intake.audit(outbox_id,event) VALUES(p_id,p_result);
 RETURN p_result;
END $$;
CREATE FUNCTION public.solq_confirm_receipt_destination(p_id uuid,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m solq_verified_intake.outbox;
BEGIN
 SELECT * INTO m FROM solq_verified_intake.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR m.state<>'processing' OR m.lease IS DISTINCT FROM p_lease OR m.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF solq_verified_intake.verified_email(m.account_id) IS DISTINCT FROM m.recipient THEN
 UPDATE solq_verified_intake.outbox SET state='cancelled',lease=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=m.id;
 INSERT INTO solq_verified_intake.audit(outbox_id,event) VALUES(m.id,'recipient_changed'); RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.solq_confirm_receipt_destination(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_confirm_receipt_destination(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.solq_submit_verified_application(uuid,uuid,text,uuid,jsonb,timestamptz),public.solq_verified_receipt_status(uuid,uuid,uuid,timestamptz),public.solq_claim_receipt(),public.solq_finish_receipt(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_submit_verified_application(uuid,uuid,text,uuid,jsonb,timestamptz),public.solq_verified_receipt_status(uuid,uuid,uuid,timestamptz),public.solq_claim_receipt(),public.solq_finish_receipt(uuid,uuid,text,text) TO service_role;
COMMIT;
