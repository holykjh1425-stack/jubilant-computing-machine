"""Synthetic PostgreSQL 17+ runner. No hosted URL, credentials or customer rows.
Usage: python native-multisession.py /absolute/path/to/pg/bin
Uses psycopg[binary]==3.2.13; temporary cluster, loopback only, no extensions/Cron.
"""
import concurrent.futures as futures
import contextlib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import psycopg
from psycopg import sql

HERE=Path(__file__).parent
A='11111111-1111-4111-8111-111111111111'; B='22222222-2222-4222-8222-222222222222'; ADMIN='99999999-9999-4999-8999-999999999999'
APP_C='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
APP_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; APP_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
CA='10000000-0000-4000-8000-000000000001'; CB='10000000-0000-4000-8000-000000000002'
SA='30000000-0000-4000-8000-000000000001'; SB='30000000-0000-4000-8000-000000000002'; SD='30000000-0000-4000-8000-000000000009'
TABLES=['solq_customer_cases','solq_customer_consent_events','solq_customer_messages','solq_customer_requests','solq_customer_previews','solq_customer_artifacts']
checks=[]; backend_pids=set()
def check(name,fn):
    fn();checks.append(name);print('PASS '+name,flush=True)
def equal(a,b):
    assert a==b,(a,b)
def denied(fn,code='42501'):
    try: fn()
    except psycopg.Error as e: equal(e.sqlstate,code);return
    raise AssertionError('expected denial '+code)
def claims(uid,sid,**extra):
    return dict(sub=uid,session_id=sid,role='authenticated',exp=int(time.time())+3600,is_anonymous=False,**extra)

def run(binpath):
  with tempfile.TemporaryDirectory(prefix='solq-native-') as temp:
    root=Path(temp);data=root/'data'
    subprocess.run([str(binpath/'initdb'),'-D',str(data),'--no-locale','--encoding=UTF8','-A','trust'],check=True,stdout=subprocess.DEVNULL)
    (data/'pg_hba.conf').write_text('host solq_isolated,postgres all 127.0.0.1/32 trust\nhost all all 0.0.0.0/0 reject\nhost all all ::0/0 reject\n')
    with (root/'server.log').open('wb') as logfile:
      proc=subprocess.Popen([str(binpath/'postgres'),'-D',str(data),'-h','127.0.0.1','-p','55439','-c',"unix_socket_directories=",'-c','shared_preload_libraries=','-c','max_connections=40','-c','log_statement=none','-c','log_min_error_statement=panic','-c','log_parameter_max_length_on_error=0'],stdout=logfile,stderr=logfile)
      try:
        for i in range(100):
          try:
            with psycopg.connect(host='127.0.0.1',port=55439,dbname='postgres',autocommit=True) as bootstrap: bootstrap.execute('CREATE DATABASE solq_isolated')
            break
          except psycopg.OperationalError: time.sleep(.05)
        else: raise RuntimeError('isolated postgres not ready')
        def conn(role=None,identity=None):
          c=psycopg.connect(host='127.0.0.1',port=55439,dbname='solq_isolated',autocommit=True)
          backend_pids.add(c.info.backend_pid)
          c.execute("SET statement_timeout='10s'")
          if role:c.execute(sql.SQL('SET ROLE {}').format(sql.Identifier(role)))
          if identity:c.execute("SELECT set_config('request.jwt.claims',%s,false)",[json.dumps(identity)])
          return c
        with conn() as db:
          db.execute('''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
          CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
          CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
          CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
          CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,is_anonymous boolean DEFAULT false,banned_until timestamptz);
          CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
          CREATE TABLE admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users(id));
          CREATE TABLE applications(id uuid PRIMARY KEY,receipt_number text,status text,privacy_consent boolean,internal_note text);
          ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY; ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
          GRANT REFERENCES,TRIGGER ON admin_users TO anon;
          GRANT REFERENCES,SELECT,TRIGGER ON admin_users TO authenticated;
          GRANT REFERENCES,SELECT,TRIGGER,TRUNCATE ON admin_users TO service_role;
          GRANT INSERT ON applications TO anon;
          GRANT INSERT,SELECT,UPDATE ON applications TO authenticated;
          GRANT ALL ON applications TO service_role;
          CREATE POLICY "admin reads own record" ON admin_users FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
          CREATE POLICY "admins read applications" ON applications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM admin_users au WHERE au.user_id=(SELECT auth.uid())));
          CREATE POLICY "admins update applications" ON applications FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM admin_users au WHERE au.user_id=(SELECT auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM admin_users au WHERE au.user_id=(SELECT auth.uid())));
          CREATE POLICY "public submits only new applications" ON applications FOR INSERT TO anon,authenticated WITH CHECK(privacy_consent=true AND status='received' AND internal_note IS NULL);''')
          for uid,sid in [(A,SA),(B,SB),(ADMIN,SD)]:
            db.execute('INSERT INTO auth.users(id,email_confirmed_at) VALUES(%s,now())',[uid]);db.execute('INSERT INTO auth.sessions VALUES(%s,%s,NULL)',[sid,uid])
          db.execute('INSERT INTO admin_users VALUES(%s)',[ADMIN])
          for app,receipt in [(APP_A,'NX-SYNTHETIC-A'),(APP_B,'NX-SYNTHETIC-B'),(APP_C,'NX-SYNTHETIC-C')]:db.execute("INSERT INTO applications VALUES(%s,%s,'received',true,NULL)",[app,receipt])
          def original():
            return [db.execute(q).fetchall() for q in ["SELECT * FROM applications ORDER BY id","SELECT * FROM admin_users ORDER BY user_id","SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('admin_users','applications') ORDER BY 1,2,3","SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE tablename IN ('admin_users','applications') ORDER BY 1,2"]]
          before=original()
          for path in ['customer-schema.candidate.sql','enrollment-proof.candidate.sql','session-hardening.candidate.sql']:db.execute((HERE/path).read_text())
          with conn('authenticated',claims(ADMIN,SD)) as admin:
            for case,app,owner in [(CA,APP_A,A),(CB,APP_B,B)]:admin.execute("INSERT INTO solq_customer_cases(id,application_id,account_id,verification_reference) VALUES(%s,%s,%s,'SYNTHETIC_VERIFICATION')",[case,app,owner])
            check('operating admin-own RLS supports provisioning without recursive/permission errors',lambda:equal(admin.execute('SELECT count(*) FROM solq_customer_cases').fetchone()[0],2))
            check('existing admin application SELECT/UPDATE authority remains intact',lambda:equal(admin.execute('SELECT count(*) FROM applications').fetchone()[0],3))
          for case in [CA,CB]:
            for version,state in [(1,'validated'),(2,'draft')]:
              db.execute('INSERT INTO solq_customer_previews(case_id,version,state,validation_summary) VALUES(%s,%s,%s,%s)',[case,version,state,'SYNTHETIC'])
              db.execute("INSERT INTO solq_customer_artifacts(case_id,version,path,content,sha256) VALUES(%s,%s,'index.html','SYNTHETIC',%s)",[case,version,'a'*64])
          with conn('authenticated',claims(A,SA)) as a,conn('authenticated',claims(B,SB)) as b,conn('anon') as anon:
            check('A/B see only own mapping and existing applications remain admin-only',lambda:(equal(a.execute('SELECT id FROM solq_customer_cases').fetchall(),[(uuid.UUID(CA),)]),equal(b.execute('SELECT id FROM solq_customer_cases').fetchall(),[(uuid.UUID(CB),)]),equal(a.execute('SELECT * FROM applications').fetchall(),[])))
            check('A/B cannot read foreign validated previews/artifacts or own draft',lambda:(equal(a.execute('SELECT version FROM solq_customer_previews').fetchall(),[(1,)]),equal(b.execute('SELECT * FROM solq_customer_artifacts WHERE case_id=%s',[CA]).fetchall(),[])))
            def message(c,case,uid):return c.execute("INSERT INTO solq_customer_messages(case_id,actor_id,role,content) VALUES(%s,%s,'customer','SYNTHETIC')",[case,uid])
            check('message requires own explicit chat-v1 consent',lambda:denied(lambda:message(a,CA,A)))
            a.execute("INSERT INTO solq_customer_consent_events(case_id,actor_id,accepted,policy_version) VALUES(%s,%s,true,'chat-v1')",[CA,A]);message(a,CA,A)
            check('foreign insert and worker actor spoof denied',lambda:(denied(lambda:message(a,CB,A)),denied(lambda:a.execute("INSERT INTO solq_customer_messages(case_id,actor_id,role,content) VALUES(%s,%s,'worker','SYNTHETIC')",[CA,A]))))
            check('B cannot read A chat and consent',lambda:(equal(b.execute('SELECT * FROM solq_customer_messages').fetchall(),[]),equal(b.execute('SELECT * FROM solq_customer_consent_events').fetchall(),[])))
            for table in TABLES:
              check('no anonymous SELECT or authenticated UPDATE DELETE TRUNCATE: '+table,lambda table=table:(denied(lambda:anon.execute('SELECT * FROM '+table)),*[denied(lambda verb=verb:a.execute(verb+' '+table+((' SET case_id=case_id' if table=='solq_customer_consent_events' else ' SET id=id') if verb=='UPDATE' else ''))) for verb in ['UPDATE','DELETE FROM','TRUNCATE']]))
            check('customer cannot self-provision mapping or preview/artifact',lambda:(denied(lambda:a.execute("INSERT INTO solq_customer_cases(application_id,account_id,verification_reference) VALUES(%s,%s,'name/receipt claim')",[APP_A,A])),denied(lambda:a.execute("INSERT INTO solq_customer_previews(case_id,version,state,validation_summary) VALUES(%s,9,'validated','forged')",[CA])),denied(lambda:a.execute("INSERT INTO solq_customer_artifacts(case_id,version,path,content,sha256) VALUES(%s,1,'styles.css','x',%s)",[CA,'b'*64]))))
            a.execute("INSERT INTO solq_customer_consent_events(case_id,actor_id,accepted,policy_version) VALUES(%s,%s,false,'chat-v1')",[CA,A])
            check('withdrawal blocks message and revision, preserves existing history',lambda:(denied(lambda:message(a,CA,A)),denied(lambda:a.execute("INSERT INTO solq_customer_requests(case_id,actor_id,kind,message,expected_version,client_request_id) VALUES(%s,%s,'revision','x',1,gen_random_uuid())",[CA,A])),equal(a.execute('SELECT count(*) FROM solq_customer_messages').fetchone()[0],1)))
            for patch in [dict(exp=1),dict(session_id=SB),dict(session_id='bad'),dict(is_anonymous=True),dict(session_id=None)]:
              bad=claims(A,SA);bad.update(patch)
              with conn('authenticated',bad) as expired:
                check('missing/malformed/expired/foreign/anonymous session fails closed '+str(patch),lambda:(equal(expired.execute('SELECT solq_customer_session_active()').fetchone()[0],False),*[equal(expired.execute('SELECT count(*) FROM '+t).fetchone()[0],0) for t in TABLES]))
            db.execute('DELETE FROM auth.sessions WHERE id=%s',[SA])
            check('revoked but unexpired A JWT loses all six table reads and writes next statement',lambda:(equal(a.execute('SELECT solq_customer_session_active()').fetchone()[0],False),*[equal(a.execute('SELECT count(*) FROM '+t).fetchone()[0],0) for t in TABLES],denied(lambda:message(a,CA,A))))
            db.execute('INSERT INTO auth.sessions VALUES(%s,%s,NULL)',[SA,A])
            for f in ["SELECT solq_customer_security.lock_verified_session(%s,%s)","SELECT public.solq_exchange_customer_enrollment_v2('"+'a'*64+"',%s,'NX-SYNTHETIC-A',%s)"]:
              check('authenticated cannot call server-only session/proof RPC '+f.split('(')[0],lambda f=f:denied(lambda:a.execute(f,[A,SA])))
            check('clients cannot SELECT auth.sessions or private proof state',lambda:(denied(lambda:a.execute('SELECT * FROM auth.sessions')),denied(lambda:a.execute('SELECT * FROM solq_customer_private.enrollment_proofs'))))
          # Real independent connections, synchronized starts, not Promise serialization on PGlite.
          def parallel(n,fn):
            barrier=threading.Barrier(n)
            def task(i):
              with conn('service_role') as c:barrier.wait();return fn(c,i)
            with futures.ThreadPoolExecutor(max_workers=n) as pool:return list(pool.map(task,range(n)))
          issue="SELECT solq_issue_customer_enrollment_v2(%s,%s,%s,%s,clock_timestamp()+interval '299 seconds',%s)"
          exchange="SELECT solq_exchange_customer_enrollment_v2(%s,%s,%s,%s)"
          h=hashlib.sha256(b'SYNTHETIC-NOT-A-REAL-SECRET').hexdigest()
          with conn('service_role') as server:
            check('v1 unbound issuer/exchange disabled even for server role',lambda:(denied(lambda:server.execute("SELECT solq_issue_customer_enrollment(%s,%s,%s,%s,now()+interval '5 minutes')",[h,APP_A,A,'NX-SYNTHETIC-A'])),denied(lambda:server.execute('SELECT solq_exchange_customer_enrollment(%s,%s,%s)',[h,A,'NX-SYNTHETIC-A']))))
            server.execute(issue,[h,APP_C,A,'NX-SYNTHETIC-C',SA])
            check('wrong account/receipt/session cannot consume proof',lambda:(equal(server.execute(exchange,[h,B,'NX-SYNTHETIC-A',SB]).fetchone()[0],None),equal(server.execute(exchange,[h,A,'WRONG',SA]).fetchone()[0],None),equal(server.execute(exchange,[h,A,'NX-SYNTHETIC-A',SB]).fetchone()[0],None)))
          winners=parallel(20,lambda c,i:c.execute(exchange,[h,A,'NX-SYNTHETIC-C',SA]).fetchone()[0])
          check('20 real concurrent DB sessions consume proof exactly once',lambda:(equal(sum(x is not None for x in winners),1),equal(db.execute('SELECT count(*) FROM solq_customer_cases WHERE application_id=%s',[APP_C]).fetchone()[0],1)))
          with conn('service_role') as server:
            check('proof replay rejected',lambda:equal(server.execute(exchange,[h,A,'NX-SYNTHETIC-C',SA]).fetchone()[0],None))
            other_sid='30000000-0000-4000-8000-000000000003'
            db.execute('INSERT INTO auth.sessions VALUES(%s,%s,NULL)',[other_sid,A])
            same_account_hash='f'*64;server.execute(issue,[same_account_hash,APP_A,A,'NX-SYNTHETIC-A',SA])
            check('same account on a different live session cannot consume proof',lambda:equal(server.execute(exchange,[same_account_hash,A,'NX-SYNTHETIC-A',other_sid]).fetchone()[0],None))
            # One transaction holds proof consumption and rolls back; another real session waits then succeeds.
            first=conn('service_role');second=conn('service_role')
            try:
              first.execute('BEGIN');assert first.execute(exchange,[same_account_hash,A,'NX-SYNTHETIC-A',SA]).fetchone()[0]
              waiting=threading.Event()
              def redeem_after_rollback():waiting.set();return second.execute(exchange,[same_account_hash,A,'NX-SYNTHETIC-A',SA]).fetchone()[0]
              with futures.ThreadPoolExecutor(max_workers=1) as pool:
                pending=pool.submit(redeem_after_rollback);waiting.wait(timeout=2)
                # pg_stat_activity confirms the second backend reached a real lock wait.
                for _ in range(100):
                  if db.execute('SELECT wait_event_type FROM pg_stat_activity WHERE pid=%s',[second.info.backend_pid]).fetchone()[0]=='Lock':break
                  time.sleep(.01)
                else:raise AssertionError('expected independent session lock wait')
                first.execute('ROLLBACK');result=pending.result(timeout=5)
                check('waiting session succeeds after competing exchange transaction rolls back',lambda:equal(bool(result),True))
            finally:first.close();second.close()

            h2='b'*64;server.execute(issue,[h2,APP_A,B,'NX-SYNTHETIC-A',SB])
            check('binding conflict rolls proof consumption back',lambda:(denied(lambda:server.execute(exchange,[h2,B,'NX-SYNTHETIC-A',SB])),equal(db.execute('SELECT consumed_at FROM solq_customer_private.enrollment_proofs WHERE proof_hash=%s',[h2]).fetchone()[0],None)))
            h3='c'*64;server.execute(issue,[h3,APP_B,B,'NX-SYNTHETIC-B',SB])
            db.execute("UPDATE solq_customer_private.enrollment_proofs SET created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' WHERE proof_hash=%s",[h3])
            check('expired five-minute proof cannot bind',lambda:equal(server.execute(exchange,[h3,B,'NX-SYNTHETIC-B',SB]).fetchone()[0],None))
            h4='d'*64;server.execute(issue,[h4,APP_B,B,'NX-SYNTHETIC-B',SB]);db.execute('DELETE FROM auth.sessions WHERE id=%s',[SB])
            check('revoked proof session cannot exchange or consume',lambda:(equal(server.execute(exchange,[h4,B,'NX-SYNTHETIC-B',SB]).fetchone()[0],None),equal(db.execute('SELECT consumed_at FROM solq_customer_private.enrollment_proofs WHERE proof_hash=%s',[h4]).fetchone()[0],None)))
            db.execute('INSERT INTO auth.sessions VALUES(%s,%s,NULL)',[SB,B])
            check('issuer rejects >five-minute TTL',lambda:denied(lambda:server.execute("SELECT solq_issue_customer_enrollment_v2(%s,%s,%s,%s,now()+interval '6 minutes',%s)",['e'*64,APP_B,B,'NX-SYNTHETIC-B',SB])))
          # Separate-case B has no message yet: verify real concurrent per-case rate bound.
          with conn('authenticated',claims(B,SB)) as b:b.execute("INSERT INTO solq_customer_consent_events(case_id,actor_id,accepted,policy_version) VALUES(%s,%s,true,'chat-v1')",[CB,B])
          def send(c,i):
            c.execute('RESET ROLE');c.execute('SET ROLE authenticated');c.execute("SELECT set_config('request.jwt.claims',%s,false)",[json.dumps(claims(B,SB))])
            try:message(c,CB,B);return 'inserted'
            except psycopg.Error as e:return e.sqlstate
          rates=parallel(20,send)
          check('20 concurrent customer inserts respect 12/minute trigger bound',lambda:(equal(rates.count('inserted'),12),equal(rates.count('P0001'),8)))
          check('original synthetic customer/admin rows, grants and policies unchanged',lambda:equal(original(),before))
          # Existing server approval/cost/lease SQL fixture, no AI or network execution.
          db.execute((HERE.parent/'worker/reservation-fixture.sql').read_text())
          db.execute('INSERT INTO worker_fixture.admins VALUES(%s)',[ADMIN])
          db.execute("INSERT INTO worker_fixture.contracts(application_id,owner_id,customer_id,scope_tags,budget,unit_ceiling,max_attempts) VALUES('SYNTHETIC-WORK',%s,'A',ARRAY['style'],100,60,2)",[A])
          for n in range(2):db.execute("INSERT INTO worker_fixture.jobs(id,application_id,owner_id,contract_revision,scope_tags,idempotency_key,fingerprint) VALUES(%s,'SYNTHETIC-WORK',%s,1,ARRAY['style'],%s,'synthetic')",['job'+str(n),A,'key'+str(n)])
          check('atomic worker claim blocks before quote/deposit/separate approval',lambda:equal(db.execute("SELECT worker_fixture.claim('job0')->>'started'").fetchone()[0],'false'))
          db.execute("UPDATE worker_fixture.contracts SET quote_accepted_at=now(),deposit_confirmed_at=now(),deposit_confirmed_by=%s WHERE application_id='SYNTHETIC-WORK'",[ADMIN])
          check('deposit alone cannot start worker',lambda:equal(db.execute("SELECT worker_fixture.claim('job0')->>'started'").fetchone()[0],'false'))
          db.execute("UPDATE worker_fixture.contracts SET production_approved_at=now(),production_approved_by=%s WHERE application_id='SYNTHETIC-WORK'",[ADMIN])
          def claim_job(c,i):c.execute('RESET ROLE');return c.execute('SELECT worker_fixture.claim(%s)',['job'+str(i%2)]).fetchone()[0]
          work=parallel(20,claim_job);started=[x for x in work if x['started']]
          check('20 independent worker claims reserve one job within 100 budget/60 ceiling',lambda:(equal(len(started),1),equal(db.execute('SELECT reserved FROM worker_fixture.contracts').fetchone()[0],60)))
          win=started[0]
          check('stale lease completion denied',lambda:denied(lambda:db.execute('SELECT worker_fixture.finish(%s,%s,true)',[win['job_id'],str(uuid.uuid4())]),'P0001'))
          db.execute("UPDATE worker_fixture.contracts SET production_approved_at=NULL")
          check('approval revoked during execution blocks publication and consumes reservation',lambda:(equal(db.execute('SELECT worker_fixture.finish(%s,%s,true)',[win['job_id'],win['lease']]).fetchone()[0]['status'],'blocked'),equal(db.execute('SELECT spent,reserved FROM worker_fixture.contracts').fetchone(),(60,0))))
          check('new exposed tables all RLS enabled, no customer update/delete/truncate or secret grants',lambda:equal(db.execute("SELECT count(*) FROM pg_class WHERE relname=ANY(%s) AND relrowsecurity",[TABLES]).fetchone()[0],6))
          logs=(root/'server.log').read_text()
          check('raw synthetic proof marker absent from SQL state and server logs',lambda:(equal(db.execute("SELECT count(*) FROM solq_customer_private.enrollment_proofs WHERE proof_hash='SYNTHETIC-NOT-A-REAL-SECRET'").fetchone()[0],0),equal('SYNTHETIC-NOT-A-REAL-SECRET' in logs,False)))
          print(json.dumps({'postgres':db.execute('SHOW server_version').fetchone()[0],'passed':len(checks),'failed':0,'independentBackendPids':len(backend_pids),'listen':'127.0.0.1 only','extensions':db.execute('SELECT extname FROM pg_extension ORDER BY extname').fetchall(),'scope':'SQL authorization and multi-session model; not hosted Auth/PostgREST'},default=str),flush=True)
      finally:
        proc.terminate()
        try:proc.wait(timeout=10)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
if __name__=='__main__':run(Path(sys.argv[1]).resolve())
