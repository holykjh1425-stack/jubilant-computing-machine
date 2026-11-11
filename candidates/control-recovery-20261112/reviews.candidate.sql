-- DESIGN / ISOLATED TEST ONLY. Not applied to the operating project.
-- No existing relation, grant, function, trigger, or customer row is changed.
BEGIN;
CREATE TABLE public.solq_control_writers (user_id uuid PRIMARY KEY REFERENCES public.admin_users(user_id));
ALTER TABLE public.solq_control_writers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solq_control_writers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.solq_control_writers TO authenticated;
CREATE POLICY own_writer ON public.solq_control_writers FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE TABLE public.solq_control_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id text NOT NULL CHECK(length(task_id) BETWEEN 1 AND 80),
 revision integer NOT NULL CHECK(revision>0),
 owner text NOT NULL CHECK(owner IN ('CORE','AUTO','GUARD','SENTINEL','FIN','ATLAS')),
 verdict text NOT NULL CHECK(verdict IN ('PASS','NO-GO','미확인')),
 checked_at timestamptz NOT NULL,
 actor_id uuid NOT NULL DEFAULT auth.uid(),
 facts text NOT NULL CHECK(length(trim(facts)) BETWEEN 1 AND 4000),
 blocker text NOT NULL DEFAULT '' CHECK(length(blocker)<=4000),
 next_action text NOT NULL CHECK(length(trim(next_action)) BETWEEN 1 AND 4000),
 evidence jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence)<=10),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(task_id,revision),
 CHECK(verdict<>'PASS' OR jsonb_array_length(evidence)>0)
);
ALTER TABLE public.solq_control_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solq_control_reviews FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.solq_control_reviews_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.solq_control_reviews TO authenticated;
GRANT USAGE ON SEQUENCE public.solq_control_reviews_id_seq TO authenticated;
CREATE POLICY admin_review_read ON public.solq_control_reviews FOR SELECT TO authenticated USING(
 (auth.jwt()->>'exp')::numeric>extract(epoch from now()) AND EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid())));
CREATE POLICY writer_review_append ON public.solq_control_reviews FOR INSERT TO authenticated WITH CHECK(
 actor_id=(SELECT auth.uid()) AND (auth.jwt()->>'exp')::numeric>extract(epoch from now())
 AND EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid()))
 AND EXISTS(SELECT 1 FROM public.solq_control_writers WHERE user_id=(SELECT auth.uid())));
CREATE FUNCTION public.solq_control_review_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE last_revision integer; item jsonb;
BEGIN
 IF auth.uid() IS NULL OR NEW.actor_id IS DISTINCT FROM auth.uid()
 OR coalesce((auth.jwt()->>'exp')::numeric,0)<=extract(epoch from now())
 OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid())
 OR NOT EXISTS(SELECT 1 FROM public.solq_control_writers WHERE user_id=auth.uid())
 THEN RAISE EXCEPTION 'review authorization denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(max(revision),0) INTO last_revision FROM public.solq_control_reviews WHERE task_id=NEW.task_id;
 IF NEW.revision<>last_revision+1 THEN RAISE EXCEPTION 'review revision conflict' USING ERRCODE='23505'; END IF;
 IF NEW.checked_at>now()+interval '5 minutes' THEN RAISE EXCEPTION 'future check time'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.evidence) LOOP
  IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>1500 OR (item#>>'{}')!~'^https://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$' THEN RAISE EXCEPTION 'invalid evidence'; END IF;
 END LOOP;
 NEW.created_at=now(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.solq_control_review_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER solq_control_review_append_guard BEFORE INSERT ON public.solq_control_reviews FOR EACH ROW EXECUTE FUNCTION public.solq_control_review_guard();
COMMIT;
