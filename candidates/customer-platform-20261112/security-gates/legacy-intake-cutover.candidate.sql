-- MANUAL REVIEW CANDIDATE ONLY. NOT EXECUTED OR TESTED. Not an automatic migration.
-- Existing operating anonymous intake MUST remain until verified replacement is live,
-- isolated Auth/REST E2E succeeds, client call paths are switched and rollback approved.
-- This only addresses submit_application role exposure, not the four support RPC WARNs.
BEGIN;
DO $approval_gate$
BEGIN
 IF current_setting('solq.reviewed_legacy_intake_cutover',true) IS DISTINCT FROM 'approved'
 THEN RAISE EXCEPTION 'NO-GO: explicit cutover approval and reviewed evidence required'; END IF;
 IF to_regprocedure('public.solq_submit_verified_application(uuid,uuid,text,uuid,jsonb,timestamptz)') IS NULL
 OR to_regclass('solq_verified_intake.outbox') IS NULL
 THEN RAISE EXCEPTION 'NO-GO: verified replacement absent'; END IF;
 -- Existence checks are accident guards, not evidence of a working deployment or approval.
 -- The reviewer must verify current ACL/owner/callers, backup and exact rollback separately.
END;
$approval_gate$;
REVOKE EXECUTE ON FUNCTION public.submit_application(text,text,text,text,boolean)
 FROM PUBLIC,anon,authenticated;
-- No new grants, function replacement, customer DML, support RPC or Auth changes.
COMMIT;
