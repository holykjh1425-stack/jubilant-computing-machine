-- Isolated candidate only; requires verified-email/intake.candidate.sql.
-- No triggers, schedules, network extension or changes to legacy data/functions.
BEGIN;
CREATE SCHEMA solq_mail_events;
REVOKE ALL ON SCHEMA solq_mail_events FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA solq_mail_events TO service_role;
GRANT SELECT ON public.solq_customer_previews TO service_role;
CREATE TABLE solq_mail_events.outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.solq_customer_cases(id),
 version integer NOT NULL CHECK(version>0),kind text NOT NULL CHECK(kind IN ('production_completed','revision_completed')),
 account_id uuid NOT NULL REFERENCES auth.users(id),recipient text NOT NULL,receipt_number text NOT NULL,
 deposit_by uuid NOT NULL REFERENCES public.admin_users(user_id),production_by uuid NOT NULL REFERENCES public.admin_users(user_id),
 contract_revision integer NOT NULL CHECK(contract_revision>0),quote_accepted boolean NOT NULL CHECK(quote_accepted),
 revision_scope boolean NOT NULL CHECK(kind<>'revision_completed' OR revision_scope),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','accepted','failed','unknown','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease uuid,lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(case_id,version,kind),FOREIGN KEY(case_id,version) REFERENCES public.solq_customer_previews(case_id,version)
);
CREATE TABLE solq_mail_events.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,outbox_id uuid NOT NULL REFERENCES solq_mail_events.outbox(id),event text NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE solq_mail_events.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE solq_mail_events.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA solq_mail_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA solq_mail_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA solq_mail_events TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA solq_mail_events TO service_role;
-- Trusted server attests current contract gates; customer/worker HTTP input must not reach this RPC.
CREATE FUNCTION public.solq_queue_completion(p_case uuid,p_version integer,p_kind text,p_deposit_by uuid,p_production_by uuid,p_contract_revision integer,p_quote_accepted boolean,p_revision_scope boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.solq_customer_cases; recipient text; receipt text; result uuid; old solq_mail_events.outbox;
BEGIN
 IF p_version IS NULL OR p_version<1 OR p_kind IS NULL OR p_kind NOT IN ('production_completed','revision_completed') OR p_contract_revision IS NULL OR p_contract_revision<1 OR p_quote_accepted IS DISTINCT FROM true OR (p_kind='revision_completed' AND p_revision_scope IS DISTINCT FROM true) THEN RAISE EXCEPTION 'completion_not_verified' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_case::text||':'||p_version||':'||p_kind,0));
 SELECT * INTO c FROM public.solq_customer_cases WHERE id=p_case;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.solq_customer_previews WHERE case_id=p_case AND version=p_version AND state='validated') OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_deposit_by) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=p_production_by) THEN RAISE EXCEPTION 'completion_not_verified' USING ERRCODE='42501'; END IF;
 recipient:=solq_verified_intake.verified_email(c.account_id);
 SELECT receipt_number INTO receipt FROM public.applications WHERE id=c.application_id;
 IF recipient IS NULL OR receipt !~ '^NX-[0-9]{8}-[A-F0-9]{8}$' OR receipt IS NULL THEN RAISE EXCEPTION 'verified_destination_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM solq_mail_events.outbox WHERE case_id=p_case AND version=p_version AND kind=p_kind;
 IF FOUND THEN
  IF old.contract_revision<>p_contract_revision OR old.deposit_by<>p_deposit_by OR old.production_by<>p_production_by THEN RAISE EXCEPTION 'event_conflict' USING ERRCODE='22023'; END IF;
  RETURN old.id;
 END IF;
 INSERT INTO solq_mail_events.outbox(case_id,version,kind,account_id,recipient,receipt_number,deposit_by,production_by,contract_revision,quote_accepted,revision_scope) VALUES(p_case,p_version,p_kind,c.account_id,recipient,receipt,p_deposit_by,p_production_by,p_contract_revision,true,coalesce(p_revision_scope,false)) RETURNING id INTO result;
 INSERT INTO solq_mail_events.audit(outbox_id,event) VALUES(result,'verified_completion_queued');RETURN result;
END $$;
CREATE FUNCTION public.solq_confirm_completion(p_id uuid,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m solq_mail_events.outbox;
BEGIN
 SELECT * INTO m FROM solq_mail_events.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR m.state<>'processing' OR m.lease IS DISTINCT FROM p_lease OR m.lease_until<=clock_timestamp() THEN RETURN false; END IF;
 IF solq_verified_intake.verified_email(m.account_id) IS DISTINCT FROM m.recipient OR NOT EXISTS(SELECT 1 FROM public.solq_customer_cases WHERE id=m.case_id AND account_id=m.account_id) OR NOT EXISTS(SELECT 1 FROM public.solq_customer_previews WHERE case_id=m.case_id AND version=m.version AND state='validated') THEN
 UPDATE solq_mail_events.outbox SET state='cancelled',lease=NULL,lease_until=NULL WHERE id=m.id;
 INSERT INTO solq_mail_events.audit(outbox_id,event) VALUES(m.id,'destination_or_preview_changed');RETURN false; END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.solq_claim_completion() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m solq_mail_events.outbox;
BEGIN
 WITH stale AS(UPDATE solq_mail_events.outbox SET state='unknown',lease=NULL,lease_until=NULL WHERE state='processing' AND lease_until<=clock_timestamp() RETURNING id)
 INSERT INTO solq_mail_events.audit(outbox_id,event) SELECT id,'lease_uncertain' FROM stale;
 SELECT * INTO m FROM solq_mail_events.outbox WHERE state IN ('pending','failed') AND attempts<3 AND next_attempt_at<=clock_timestamp() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE solq_mail_events.outbox SET state='processing',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' WHERE id=m.id RETURNING * INTO m;
 IF NOT public.solq_confirm_completion(m.id,m.lease) THEN RETURN NULL; END IF;
 INSERT INTO solq_mail_events.audit(outbox_id,event) VALUES(m.id,'claimed');
 RETURN jsonb_build_object('id',m.id,'lease',m.lease,'caseId',m.case_id,'version',m.version,'kind',m.kind,'recipient',m.recipient,'receiptNumber',m.receipt_number,'attempt',m.attempts,'contractRevision',m.contract_revision);
END $$;
CREATE FUNCTION public.solq_finish_completion(p_id uuid,p_lease uuid,p_result text) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m solq_mail_events.outbox;
BEGIN
 SELECT * INTO m FROM solq_mail_events.outbox WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR m.state<>'processing' OR m.lease IS DISTINCT FROM p_lease OR m.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'stale_lease' USING ERRCODE='42501'; END IF;
 IF p_result IS NULL OR p_result NOT IN ('accepted','failed','unknown','cancelled') THEN RAISE EXCEPTION 'invalid_result' USING ERRCODE='22023'; END IF;
 UPDATE solq_mail_events.outbox SET state=p_result,lease=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>60*power(5,m.attempts-1)::int) WHERE id=p_id;
 INSERT INTO solq_mail_events.audit(outbox_id,event) VALUES(p_id,p_result);RETURN p_result;
END $$;
REVOKE ALL ON FUNCTION public.solq_queue_completion(uuid,integer,text,uuid,uuid,integer,boolean,boolean),public.solq_claim_completion(),public.solq_confirm_completion(uuid,uuid),public.solq_finish_completion(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_queue_completion(uuid,integer,text,uuid,uuid,integer,boolean,boolean),public.solq_claim_completion(),public.solq_confirm_completion(uuid,uuid),public.solq_finish_completion(uuid,uuid,text) TO service_role;
COMMIT;
