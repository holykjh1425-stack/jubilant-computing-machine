-- Candidate only. Apply customer-schema.candidate.sql first in isolation.
-- Only new private proof state + two restricted server RPCs + new-case grants are affected.
BEGIN;
CREATE SCHEMA solq_customer_private;
REVOKE ALL ON SCHEMA solq_customer_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA solq_customer_private TO service_role;
CREATE TABLE solq_customer_private.enrollment_proofs (
 proof_hash text PRIMARY KEY CHECK(proof_hash ~ '^[0-9a-f]{64}$'),
 application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 receipt_number text NOT NULL CHECK(length(receipt_number) BETWEEN 1 AND 100),
 purpose text NOT NULL DEFAULT 'solq_customer_enrollment' CHECK(purpose='solq_customer_enrollment'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
ALTER TABLE solq_customer_private.enrollment_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON solq_customer_private.enrollment_proofs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON solq_customer_private.enrollment_proofs TO service_role;
GRANT SELECT,INSERT ON public.solq_customer_cases TO service_role;
CREATE FUNCTION public.solq_issue_customer_enrollment(p_proof_hash text,p_application_id uuid,p_account_id uuid,p_receipt_number text,p_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.applications a WHERE a.id=p_application_id AND a.receipt_number=p_receipt_number) THEN RAISE EXCEPTION 'trusted intake result required' USING ERRCODE='42501'; END IF;
 INSERT INTO solq_customer_private.enrollment_proofs(proof_hash,application_id,account_id,receipt_number,expires_at)
 VALUES(p_proof_hash,p_application_id,p_account_id,p_receipt_number,p_expires_at);
 RETURN true;
END $$;
CREATE FUNCTION public.solq_exchange_customer_enrollment(p_proof_hash text,p_account_id uuid,p_receipt_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE proof solq_customer_private.enrollment_proofs; bound public.solq_customer_cases;
BEGIN
 UPDATE solq_customer_private.enrollment_proofs SET consumed_at=clock_timestamp()
 WHERE proof_hash=p_proof_hash AND account_id=p_account_id AND receipt_number=p_receipt_number
 AND purpose='solq_customer_enrollment' AND consumed_at IS NULL AND expires_at>clock_timestamp()
 RETURNING * INTO proof;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.solq_customer_cases(application_id,account_id,verification_reference,created_by)
 VALUES(proof.application_id,proof.account_id,'enrollment-proof:'||proof.proof_hash,proof.account_id)
 ON CONFLICT(application_id) DO NOTHING;
 SELECT * INTO bound FROM public.solq_customer_cases WHERE application_id=proof.application_id;
 IF bound.account_id IS DISTINCT FROM p_account_id THEN RAISE EXCEPTION 'binding_not_completed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('caseId',bound.id);
END $$;
REVOKE ALL ON FUNCTION public.solq_issue_customer_enrollment(text,uuid,uuid,text,timestamptz),public.solq_exchange_customer_enrollment(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solq_issue_customer_enrollment(text,uuid,uuid,text,timestamptz),public.solq_exchange_customer_enrollment(text,uuid,text) TO service_role;
COMMIT;
