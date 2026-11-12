-- ISOLATED SYNTHETIC DATABASE FIXTURE ONLY. Not an operating migration.
-- This mirrors server-authoritative approvals and atomic reservation invariants.
CREATE SCHEMA worker_fixture;
CREATE TABLE worker_fixture.admins(id uuid PRIMARY KEY);
CREATE TABLE worker_fixture.contracts(
 application_id text PRIMARY KEY,owner_id uuid NOT NULL,customer_id text NOT NULL,
 quote_accepted_at timestamptz,deposit_confirmed_at timestamptz,deposit_confirmed_by uuid,
 production_approved_at timestamptz,production_approved_by uuid,cancelled boolean NOT NULL DEFAULT false,
 contract_revision integer NOT NULL DEFAULT 1,scope_tags text[] NOT NULL,
 budget bigint NOT NULL CHECK(budget>=0),unit_ceiling bigint NOT NULL CHECK(unit_ceiling>0),
 spent bigint NOT NULL DEFAULT 0 CHECK(spent>=0),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),
 max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 5),CHECK(spent+reserved<=budget)
);
CREATE TABLE worker_fixture.jobs(
 id text PRIMARY KEY,application_id text NOT NULL REFERENCES worker_fixture.contracts(application_id),
 owner_id uuid NOT NULL,contract_revision integer NOT NULL,scope_tags text[] NOT NULL,
 idempotency_key text NOT NULL,fingerprint text NOT NULL,status text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0,reserved bigint NOT NULL DEFAULT 0,lease uuid,
 UNIQUE(application_id,idempotency_key)
);
CREATE TABLE worker_fixture.attempts(job_id text REFERENCES worker_fixture.jobs(id),ordinal integer,amount bigint,outcome text NOT NULL DEFAULT 'reserved',PRIMARY KEY(job_id,ordinal));
CREATE TABLE worker_fixture.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id text,event text,at timestamptz DEFAULT now());
REVOKE ALL ON ALL TABLES IN SCHEMA worker_fixture FROM PUBLIC;
CREATE FUNCTION worker_fixture.claim(p_job text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j worker_fixture.jobs; c worker_fixture.contracts;
BEGIN
 SELECT * INTO j FROM worker_fixture.jobs WHERE id=p_job FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR j.status NOT IN ('queued','retry_wait','awaiting_approval') THEN RETURN jsonb_build_object('started',false,'reason','not_claimable'); END IF;
 SELECT * INTO c FROM worker_fixture.contracts WHERE application_id=j.application_id FOR UPDATE;
 IF j.owner_id<>c.owner_id OR j.contract_revision<>c.contract_revision OR NOT(j.scope_tags<@c.scope_tags) OR c.cancelled THEN RETURN jsonb_build_object('started',false,'reason','authority_mismatch'); END IF;
 IF c.quote_accepted_at IS NULL OR c.deposit_confirmed_at IS NULL OR c.production_approved_at IS NULL
 OR NOT EXISTS(SELECT 1 FROM worker_fixture.admins WHERE id=c.deposit_confirmed_by)
 OR NOT EXISTS(SELECT 1 FROM worker_fixture.admins WHERE id=c.production_approved_by)
 THEN UPDATE worker_fixture.jobs SET status='awaiting_approval' WHERE id=p_job;RETURN jsonb_build_object('started',false,'reason','approval_required'); END IF;
 IF j.attempts>=c.max_attempts THEN RETURN jsonb_build_object('started',false,'reason','attempt_limit'); END IF;
 IF c.spent+c.reserved+c.unit_ceiling>c.budget THEN RETURN jsonb_build_object('started',false,'reason','budget_limit'); END IF;
 UPDATE worker_fixture.contracts SET reserved=reserved+c.unit_ceiling WHERE application_id=c.application_id;
 UPDATE worker_fixture.jobs SET status='running',attempts=attempts+1,reserved=c.unit_ceiling,lease=gen_random_uuid() WHERE id=p_job RETURNING * INTO j;
 INSERT INTO worker_fixture.attempts(job_id,ordinal,amount) VALUES(j.id,j.attempts,c.unit_ceiling);
 INSERT INTO worker_fixture.audit(job_id,event) VALUES(j.id,'attempt_reserved');
 RETURN jsonb_build_object('started',true,'job_id',j.id,'lease',j.lease,'attempt',j.attempts,'amount',c.unit_ceiling);
END $$;
CREATE FUNCTION worker_fixture.finish(p_job text,p_lease uuid,p_success boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j worker_fixture.jobs;c worker_fixture.contracts;v_status text;
BEGIN
 SELECT * INTO j FROM worker_fixture.jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION 'stale completion'; END IF;
 SELECT * INTO c FROM worker_fixture.contracts WHERE application_id=j.application_id FOR UPDATE;
 UPDATE worker_fixture.contracts SET reserved=reserved-j.reserved,spent=spent+j.reserved WHERE application_id=c.application_id;
 IF c.cancelled OR c.production_approved_at IS NULL OR c.deposit_confirmed_at IS NULL OR c.quote_accepted_at IS NULL OR j.contract_revision<>c.contract_revision THEN v_status:='blocked';
 ELSIF p_success THEN v_status:='completed';
 ELSIF j.attempts<c.max_attempts THEN v_status:='retry_wait'; ELSE v_status:='failed'; END IF;
 UPDATE worker_fixture.jobs SET status=v_status,reserved=0,lease=NULL WHERE id=p_job;
 UPDATE worker_fixture.attempts SET outcome=v_status WHERE job_id=j.id AND ordinal=j.attempts;
 INSERT INTO worker_fixture.audit(job_id,event) VALUES(j.id,v_status);
 RETURN jsonb_build_object('status',v_status,'reservation_consumed',j.reserved);
END $$;
REVOKE ALL ON FUNCTION worker_fixture.claim(text),worker_fixture.finish(text,uuid,boolean) FROM PUBLIC;
