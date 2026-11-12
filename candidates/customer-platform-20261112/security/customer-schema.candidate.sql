-- Candidate only: isolated PostgreSQL tests, NOT applied to production.
-- Existing applications, admin_users, grants, RLS and production triggers remain untouched.
BEGIN;
CREATE TABLE public.solq_customer_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE RESTRICT,
 account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 verification_reference text NOT NULL CHECK(length(trim(verification_reference)) BETWEEN 1 AND 500),
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solq_customer_cases_account ON public.solq_customer_cases(account_id);
CREATE TABLE public.solq_customer_consent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES public.solq_customer_cases(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL DEFAULT auth.uid(), accepted boolean NOT NULL,
 policy_version text NOT NULL CHECK(policy_version='chat-v1'), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solq_customer_consent_case ON public.solq_customer_consent_events(case_id,id DESC);
CREATE TABLE public.solq_customer_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.solq_customer_cases(id) ON DELETE RESTRICT,
 actor_id uuid, role text NOT NULL CHECK(role IN ('customer','assistant','worker')),
 content text NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 6000),
 client_message_id uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id,client_message_id)
);
CREATE INDEX solq_customer_messages_case ON public.solq_customer_messages(case_id,created_at,id);
CREATE TABLE public.solq_customer_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.solq_customer_cases(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL DEFAULT auth.uid(), kind text NOT NULL CHECK(kind='revision'),
 message text NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 3000),
 expected_version integer NOT NULL CHECK(expected_version>=0),
 client_request_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'received' CHECK(status='received'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_id,client_request_id)
);
CREATE INDEX solq_customer_requests_case ON public.solq_customer_requests(case_id,created_at);
CREATE TABLE public.solq_customer_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.solq_customer_cases(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),
 state text NOT NULL CHECK(state IN ('draft','validated','failed')),
 validation_summary text NOT NULL CHECK(length(validation_summary)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_id,version)
);
CREATE TABLE public.solq_customer_artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL,
 version integer NOT NULL, path text NOT NULL CHECK(path IN ('index.html','styles.css')),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 200000),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 UNIQUE(case_id,version,path),
 FOREIGN KEY(case_id,version) REFERENCES public.solq_customer_previews(case_id,version) ON DELETE RESTRICT
);
-- Every new exposed table starts with no inherited API grants. No customer table grants are altered.
ALTER TABLE public.solq_customer_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solq_customer_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solq_customer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solq_customer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solq_customer_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solq_customer_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solq_customer_cases,public.solq_customer_consent_events,public.solq_customer_messages,public.solq_customer_requests,public.solq_customer_previews,public.solq_customer_artifacts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.solq_customer_consent_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.solq_customer_cases,public.solq_customer_consent_events,public.solq_customer_messages,public.solq_customer_requests,public.solq_customer_previews,public.solq_customer_artifacts TO authenticated;
-- Customers may add only consent events, their own plain messages and received requests.
GRANT INSERT ON public.solq_customer_consent_events,public.solq_customer_messages,public.solq_customer_requests TO authenticated;
GRANT USAGE ON SEQUENCE public.solq_customer_consent_events_id_seq TO authenticated;
-- Admin provisioning of a verified mapping is separate from customer intake.
GRANT INSERT ON public.solq_customer_cases TO authenticated;
CREATE POLICY customer_cases_read ON public.solq_customer_cases FOR SELECT TO authenticated USING(
 coalesce((auth.jwt()->>'exp')::numeric,0)>extract(epoch from now())
 AND (account_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid()))));
CREATE POLICY admin_cases_provision ON public.solq_customer_cases FOR INSERT TO authenticated WITH CHECK(
 created_by=(SELECT auth.uid()) AND coalesce((auth.jwt()->>'exp')::numeric,0)>extract(epoch from now())
 AND EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid())));
CREATE POLICY customer_consent_read ON public.solq_customer_consent_events FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id));
CREATE POLICY customer_consent_append ON public.solq_customer_consent_events FOR INSERT TO authenticated WITH CHECK(
 actor_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id AND c.account_id=(SELECT auth.uid())));
CREATE POLICY customer_messages_read ON public.solq_customer_messages FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id));
CREATE POLICY customer_messages_append ON public.solq_customer_messages FOR INSERT TO authenticated WITH CHECK(
 role='customer' AND actor_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id AND c.account_id=(SELECT auth.uid()))
 AND (SELECT e.accepted FROM public.solq_customer_consent_events e WHERE e.case_id=solq_customer_messages.case_id ORDER BY e.id DESC LIMIT 1) IS TRUE);
CREATE POLICY customer_requests_read ON public.solq_customer_requests FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id));
CREATE POLICY customer_requests_append ON public.solq_customer_requests FOR INSERT TO authenticated WITH CHECK(
 actor_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id AND c.account_id=(SELECT auth.uid()))
 AND (SELECT e.accepted FROM public.solq_customer_consent_events e WHERE e.case_id=solq_customer_requests.case_id ORDER BY e.id DESC LIMIT 1) IS TRUE);
CREATE POLICY customer_previews_read ON public.solq_customer_previews FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.solq_customer_cases c WHERE c.id=case_id AND (EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=(SELECT auth.uid())) OR state='validated')));
CREATE POLICY customer_artifacts_read ON public.solq_customer_artifacts FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.solq_customer_cases c JOIN public.solq_customer_previews p ON p.case_id=c.id
 WHERE c.id=solq_customer_artifacts.case_id AND p.version=solq_customer_artifacts.version AND (EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=(SELECT auth.uid())) OR p.state='validated')));
-- Server timestamps prevent client backdating around ordering/rate checks.
-- Serialize each case's inserts. These functions run with caller RLS, never as a definer.
CREATE FUNCTION public.solq_customer_append_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE recent_count integer;
BEGIN
 NEW.created_at=clock_timestamp();
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.case_id::text,0));
 IF TG_TABLE_NAME='solq_customer_messages' THEN
  IF NEW.role='customer' THEN
  SELECT count(*) INTO recent_count FROM public.solq_customer_messages WHERE case_id=NEW.case_id AND role='customer' AND created_at>=clock_timestamp()-interval '1 minute';
  IF recent_count>=12 THEN RAISE EXCEPTION 'rate_limited: messages' USING ERRCODE='P0001'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='solq_customer_requests' THEN
  SELECT count(*) INTO recent_count FROM public.solq_customer_requests WHERE case_id=NEW.case_id AND created_at>=clock_timestamp()-interval '1 minute';
  IF recent_count>=3 THEN RAISE EXCEPTION 'rate_limited: requests' USING ERRCODE='P0001'; END IF;
 ELSIF TG_TABLE_NAME='solq_customer_consent_events' THEN
  SELECT count(*) INTO recent_count FROM public.solq_customer_consent_events WHERE case_id=NEW.case_id AND created_at>=clock_timestamp()-interval '1 minute';
  IF recent_count>=10 THEN RAISE EXCEPTION 'rate_limited: consent' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.solq_customer_append_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER solq_customer_message_guard BEFORE INSERT ON public.solq_customer_messages FOR EACH ROW EXECUTE FUNCTION public.solq_customer_append_guard();
CREATE TRIGGER solq_customer_request_guard BEFORE INSERT ON public.solq_customer_requests FOR EACH ROW EXECUTE FUNCTION public.solq_customer_append_guard();
CREATE TRIGGER solq_customer_consent_guard BEFORE INSERT ON public.solq_customer_consent_events FOR EACH ROW EXECUTE FUNCTION public.solq_customer_append_guard();
-- No authenticated role may write assistant/worker messages, previews or artifacts.
-- Worker writes must use the existing server-only authority after revalidating case ownership,
-- accepted quote + deposit + separate production approval + budget and lease constraints.
-- Do not give browser clients service_role, new storage URLs, UPDATE, DELETE or TRUNCATE.
COMMIT;
