import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
const admin='11111111-1111-4111-8111-111111111111',reader='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
test('isolated PostgreSQL RLS: admin/nonadmin/anon; append-only writer ledger; preservation and conflict',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO public;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY);INSERT INTO public.admin_users VALUES('${admin}'),('${reader}');
 ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;GRANT SELECT ON public.admin_users TO authenticated;
 CREATE POLICY own_admin ON public.admin_users FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
 CREATE TABLE public.applications(id integer PRIMARY KEY,status text);INSERT INTO public.applications VALUES(1,'received');
 CREATE TABLE public.ai_work_plans(id integer PRIMARY KEY,application_id integer);INSERT INTO public.ai_work_plans VALUES(1,1);
 CREATE TABLE public.orchestrator_jobs(id integer PRIMARY KEY,status text);INSERT INTO public.orchestrator_jobs VALUES(1,'awaiting_approval');
 CREATE TABLE public.production_jobs(id integer PRIMARY KEY,status text);INSERT INTO public.production_jobs VALUES(1,'awaiting_deposit');`);
 for(const table of ['applications','ai_work_plans','orchestrator_jobs','production_jobs'])await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;GRANT SELECT ON public.${table} TO authenticated;CREATE POLICY admins_read ON public.${table} FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid())));`);
 const before=(await db.query(`select jsonb_build_object('a',(select jsonb_agg(a) from applications a),'p',(select jsonb_agg(a) from ai_work_plans a),'j',(select jsonb_agg(a) from orchestrator_jobs a),'prod',(select jsonb_agg(a) from production_jobs a)) as fingerprint`)).rows;
 await db.exec(await readFile(new URL('./reviews.candidate.sql',import.meta.url),'utf8'));
 await db.exec(`INSERT INTO public.solq_control_writers VALUES('${admin}');`);
 const identity=async(id,role='authenticated',exp=9999999999)=>{await db.exec(`RESET ROLE;SET ROLE ${role};`);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,exp})]);};
 const append=(rev=1,actor=admin,evidence=['https://example.test/evidence'],verdict='PASS')=>db.query(`INSERT INTO public.solq_control_reviews(task_id,revision,owner,verdict,checked_at,actor_id,facts,next_action,evidence) VALUES('G-03',$1,'GUARD',$2,now(),$3,'Synthetic fact','Next isolated check',$4) RETURNING id`,[rev,verdict,actor,JSON.stringify(evidence)]);
 await identity(outsider);for(const t of ['applications','ai_work_plans','orchestrator_jobs','production_jobs'])assert.equal((await db.query('select count(*)::int n from '+t)).rows[0].n,0);await assert.rejects(append());
 await identity(admin,'anon');await assert.rejects(db.query('select * from applications'));await assert.rejects(append());
 await identity(reader);assert.equal((await db.query('select count(*)::int n from applications')).rows[0].n,1);await assert.rejects(append());
 await identity(admin);await append();assert.equal((await db.query('select * from solq_control_reviews')).rows.length,1);await assert.rejects(append(1),/conflict/);
 await assert.rejects(append(2,outsider),/authorization denied|row-level security/);await assert.rejects(append(2,admin,[]),/check constraint/);
 await assert.rejects(append(2,admin,['https://user:pass@example.test']),/invalid evidence/);
 await append(2,admin,['https://example.test/evidence2'],'NO-GO');assert.equal((await db.query('select * from solq_control_reviews')).rows.length,2);
 for(const q of ['UPDATE solq_control_reviews SET facts=\'changed\'','DELETE FROM solq_control_reviews','TRUNCATE solq_control_reviews','UPDATE applications SET status=\'completed\'','DELETE FROM applications','INSERT INTO solq_control_writers VALUES(\''+outsider+'\')'])await assert.rejects(db.query(q),/permission denied/);
 await identity(admin,'authenticated',1);assert.equal((await db.query('select * from solq_control_reviews')).rows.length,0);await assert.rejects(append(3),/authorization denied|row-level security/);
 await db.exec('RESET ROLE');const after=(await db.query(`select jsonb_build_object('a',(select jsonb_agg(a) from applications a),'p',(select jsonb_agg(a) from ai_work_plans a),'j',(select jsonb_agg(a) from orchestrator_jobs a),'prod',(select jsonb_agg(a) from production_jobs a)) as fingerprint`)).rows;assert.deepEqual(after,before);
 }finally{await db.close()}
});
