"""NEW lifecycle outbox checks only, synthetic local PostgreSQL; no network/email providers."""
import importlib.util,sys,json,uuid,concurrent.futures as futures,threading
from pathlib import Path
HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('baseline',HERE.parent/'security/native-multisession.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
check,equal,denied=base.check,base.equal,base.denied
A,B,CA,CB,ADMIN=base.A,base.B,base.CA,base.CB,base.ADMIN

def scenario(db,conn):
 db.execute("ALTER TABLE auth.users ADD COLUMN email text");db.execute("UPDATE auth.users SET email=CASE WHEN id=%s THEN 'a@example.invalid' WHEN id=%s THEN 'b@example.invalid' ELSE 'admin@example.invalid' END",[A,B])
 db.execute("UPDATE applications SET receipt_number='NX-20261112-AAAAAAAA' WHERE id=%s",[base.APP_A]);db.execute("UPDATE applications SET receipt_number='NX-20261112-BBBBBBBB' WHERE id=%s",[base.APP_B])
 with conn('authenticated',base.claims(ADMIN,base.SD)) as admin:
  for case,app,owner in [(CA,base.APP_A,A),(CB,base.APP_B,B)]:admin.execute("INSERT INTO solq_customer_cases(id,application_id,account_id,verification_reference) VALUES(%s,%s,%s,'SYNTHETIC')",[case,app,owner])
 for case in [CA,CB]:
  for version,state in [(1,'validated'),(2,'draft'),(3,'validated'),(4,'validated'),(5,'validated'),(6,'validated')]:db.execute('INSERT INTO solq_customer_previews(case_id,version,state,validation_summary) VALUES(%s,%s,%s,%s)',[case,version,state,'SYNTHETIC'])
 before=db.execute('SELECT * FROM applications ORDER BY id').fetchall();grants=db.execute("SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('applications','admin_users') ORDER BY 1,2,3").fetchall()
 db.execute((HERE.parent/'verified-email/intake.candidate.sql').read_text());db.execute((HERE/'completion.candidate.sql').read_text())
 def queue(c,case=CA,version=1,kind='production_completed',deposit=ADMIN,contract=1,quote=True,scope=False):return c.execute('SELECT solq_queue_completion(%s,%s,%s,%s,%s,%s,%s,%s)',[case,version,kind,deposit,ADMIN,contract,quote,scope]).fetchone()[0]
 def claim(c):return c.execute('SELECT solq_claim_completion()').fetchone()[0]
 def finish(c,j,result):return c.execute('SELECT solq_finish_completion(%s,%s,%s)',[j['id'],j['lease'],result]).fetchone()[0]
 def concurrent(n,fn):
  barrier=threading.Barrier(n)
  def work(i):
   with conn('service_role') as c:barrier.wait();return fn(c)
  with futures.ThreadPoolExecutor(max_workers=n) as pool:return list(pool.map(work,range(n)))
 with conn('service_role') as server:
  check('draft preview cannot queue completion',lambda:denied(lambda:queue(server,version=2)))
  check('non-admin deposit attestation rejected',lambda:denied(lambda:queue(server,deposit=A)))
  check('missing quote or revision scope rejected',lambda:(denied(lambda:queue(server,quote=False),'22023'),denied(lambda:queue(server,kind='revision_completed'),'22023')))
 ids=concurrent(20,queue)
 check('20 concurrent completion events produce one durable outbox ID',lambda:(equal(len(set(ids)),1),equal(db.execute('SELECT count(*) FROM solq_mail_events.outbox').fetchone()[0],1)))
 check('completion snapshot recipient comes from verified owner, not caller',lambda:equal(db.execute('SELECT account_id::text,recipient,receipt_number FROM solq_mail_events.outbox').fetchone(),(A,'a@example.invalid','NX-20261112-AAAAAAAA')))
 jobs=[x for x in concurrent(20,claim) if x]
 check('20 concurrent dispatch claims acquire one lease',lambda:equal(len(jobs),1));j=jobs[0]
 with conn('service_role') as server:
  check('same event changed contract revision is conflict',lambda:denied(lambda:queue(server,contract=2),'22023'))
  check('foreign lease cannot acknowledge completion',lambda:denied(lambda:server.execute("SELECT solq_finish_completion(%s,%s,'accepted')",[j['id'],str(uuid.uuid4())])))
  finish(server,j,'failed')
  check('definite failure respects retry delay',lambda:equal(claim(server),None))
  for attempt in [2,3]:
   db.execute("UPDATE solq_mail_events.outbox SET next_attempt_at=now()-interval '1 second' WHERE id=%s",[j['id']]);retry=claim(server);equal(retry['attempt'],attempt);equal(retry['id'],j['id']);finish(server,retry,'failed')
  db.execute("UPDATE solq_mail_events.outbox SET next_attempt_at=now()-interval '1 second'")
  check('three attempts exhaust retry budget',lambda:equal(claim(server),None))
  queue(server,version=3);unknown=claim(server);finish(server,unknown,'unknown')
  check('ambiguous SMTP result never retries',lambda:equal(claim(server),None))
  queue(server,version=4);lost=claim(server);db.execute("UPDATE solq_mail_events.outbox SET lease_until=now()-interval '1 second' WHERE id=%s",[lost['id']])
  check('lost lease becomes unknown without resend',lambda:(equal(claim(server),None),equal(db.execute('SELECT state FROM solq_mail_events.outbox WHERE id=%s',[lost['id']]).fetchone()[0],'unknown')))
  queue(server,version=5);changed=claim(server);db.execute("UPDATE auth.users SET email='new@example.invalid' WHERE id=%s",[A])
  check('email changed after claim cancels old destination',lambda:equal(server.execute('SELECT solq_confirm_completion(%s,%s)',[changed['id'],changed['lease']]).fetchone()[0],False));db.execute("UPDATE auth.users SET email='a@example.invalid' WHERE id=%s",[A])
  queue(server,version=6);bad=claim(server);db.execute("UPDATE solq_customer_previews SET state='failed' WHERE case_id=%s AND version=6",[CA])
  check('preview invalidated after queue blocks sending',lambda:equal(server.execute('SELECT solq_confirm_completion(%s,%s)',[bad['id'],bad['lease']]).fetchone()[0],False))
  queue(server,case=CB);accepted=claim(server);finish(server,accepted,'accepted')
  check('provider accepted is terminal and does not resend',lambda:equal(claim(server),None))
  queue(server,kind='revision_completed',scope=True);rev=claim(server);finish(server,rev,'accepted')
  check('revision event has separate deduplication key',lambda:equal(rev['kind'],'revision_completed'))
 for role,identity in [('anon',None),('authenticated',base.claims(A,base.SA)),('authenticated',base.claims(B,base.SB))]:
  with conn(role,identity) as c:check(role+' cannot queue/claim/read completion mail '+str(identity and identity['sub']),lambda c=c:(denied(lambda:queue(c)),denied(lambda:claim(c)),denied(lambda:c.execute('SELECT * FROM solq_mail_events.outbox'))))
 check('new private tables have RLS and zero customer grants',lambda:(equal(db.execute("SELECT count(*) FROM pg_tables WHERE schemaname='solq_mail_events' AND rowsecurity").fetchone()[0],2),equal(db.execute("SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='solq_mail_events' AND grantee IN ('anon','authenticated','PUBLIC')").fetchone()[0],0)))
 check('existing applications and admin grants preserved',lambda:(equal(db.execute('SELECT * FROM applications ORDER BY id').fetchall(),before),equal(db.execute("SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('applications','admin_users') ORDER BY 1,2,3").fetchall(),grants)))
 print(json.dumps({'newSqlChecks':len(base.checks),'failed':0,'independentBackendPids':len(base.backend_pids),'actualEmails':0,'legacy54Rerun':False}))
if __name__=='__main__':base.run(Path(sys.argv[1]).resolve(),scenario=scenario)
