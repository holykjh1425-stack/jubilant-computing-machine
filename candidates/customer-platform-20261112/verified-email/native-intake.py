"""Run only NEW verified-email tests using the existing native cluster bootstrap.
No prior 43 checks are rerun. No SMTP or hosted SDK is available to this runner.
"""
import concurrent.futures as futures
import importlib.util
import json
from pathlib import Path
import sys
import threading
import uuid
import psycopg

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('solq_native',HERE.parent/'security/native-multisession.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
A,B,SA,SB=base.A,base.B,base.SA,base.SB
check,equal,denied=base.check,base.equal,base.denied
payload=dict(customer_name='SYNTHETIC',service_type='website',description='SYNTHETIC PRIVATE BODY NEVER EMAIL',privacy_consent=True,transfer_consent=True,consent_version='intake-email-v1')
submit_sql="SELECT solq_submit_verified_application(%s,%s,%s,%s,%s::jsonb,clock_timestamp()+interval '1 hour')"
def scenario(db,conn):
 db.execute("ALTER TABLE auth.users ADD COLUMN email text;UPDATE auth.users SET email=CASE WHEN id='"+A+"' THEN 'a@example.invalid' ELSE 'b@example.invalid' END")
 db.execute("ALTER TABLE applications ALTER COLUMN id SET DEFAULT gen_random_uuid();ALTER TABLE applications ALTER COLUMN receipt_number SET DEFAULT ('NX-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)));ALTER TABLE applications ADD COLUMN customer_name text NOT NULL DEFAULT 'SYNTHETIC';ALTER TABLE applications ADD COLUMN contact text NOT NULL DEFAULT 'old@example.invalid';ALTER TABLE applications ADD COLUMN service_type text NOT NULL DEFAULT 'website';ALTER TABLE applications ADD COLUMN description text NOT NULL DEFAULT 'SYNTHETIC preserved'")
 before=db.execute('SELECT * FROM applications ORDER BY id').fetchall();grants=db.execute("SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('admin_users','applications') ORDER BY 1,2,3").fetchall()
 db.execute((HERE/'intake.candidate.sql').read_text())
 def submit(c,key,uid=A,sid=SA,email='a@example.invalid',body=payload):return c.execute(submit_sql,[uid,sid,email,key,json.dumps(body)]).fetchone()[0]
 with conn('service_role') as server:
  check('expired verified access-token deadline rejected at SQL boundary',lambda:denied(lambda:server.execute("SELECT solq_submit_verified_application(%s,%s,%s,%s,%s::jsonb,clock_timestamp()-interval '1 second')",[A,SA,'a@example.invalid',str(uuid.uuid4()),json.dumps(payload)])))
  first_key=str(uuid.uuid4());first=submit(server,first_key)
  check('verified email saves original application, account mapping and pending outbox atomically',lambda:(equal(first['applicationSaved'],True),equal(first['mailState'],'pending'),equal(db.execute('SELECT contact,status,internal_note FROM applications WHERE receipt_number=%s',[first['receiptNumber']]).fetchone(),('a@example.invalid','received',None)),equal(db.execute('SELECT account_id FROM solq_customer_cases WHERE id=%s',[first['caseId']]).fetchone()[0],uuid.UUID(A))))
  check('same request replay returns identical receipt without duplicate application/outbox',lambda:(equal(submit(server,first_key)['receiptNumber'],first['receiptNumber']),equal(db.execute('SELECT count(*) FROM solq_verified_intake.outbox').fetchone()[0],1)))
  check('same id different payload is conflict',lambda:denied(lambda:submit(server,first_key,body={**payload,'description':'changed'}),'22023'))
  for body in [{**payload,'email':'b@example.invalid'},{**payload,'account_id':B},{**payload,'privacy_consent':False},{**payload,'transfer_consent':False},{**payload,'consent_version':'other'}]:check('client identity/consent tamper denied '+str(list(body)[-1]),lambda body=body:denied(lambda:submit(server,str(uuid.uuid4()),body=body),'22023'))
  check('phone-only/email-unconfirmed and wrong-session identities denied',lambda:(denied(lambda:submit(server,str(uuid.uuid4()),sid=SB)),denied(lambda:submit(server,str(uuid.uuid4()),email='b@example.invalid'))))
  db.execute('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=%s',[A]);check('unconfirmed email cannot submit',lambda:denied(lambda:submit(server,str(uuid.uuid4()))));db.execute('UPDATE auth.users SET email_confirmed_at=now() WHERE id=%s',[A])
  check('legacy anonymous receipt cannot be claimed by caller-supplied ID',lambda:denied(lambda:submit(server,str(uuid.uuid4()),body={**payload,'application_id':base.APP_A}),'22023'))
  def counts():return [db.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['applications','solq_customer_cases','solq_verified_intake.submissions','solq_verified_intake.outbox']]
  before_failure=counts()
  db.execute("CREATE FUNCTION solq_verified_intake.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic outbox storage failure';END$$;CREATE TRIGGER fixture_fail BEFORE INSERT ON solq_verified_intake.outbox FOR EACH ROW EXECUTE FUNCTION solq_verified_intake.fixture_fail()")
  check('outbox insert failure rolls back application, mapping and submission together',lambda:(denied(lambda:submit(server,str(uuid.uuid4())),'P0001'),equal(counts(),before_failure)))
  db.execute('DROP TRIGGER fixture_fail ON solq_verified_intake.outbox')
 def concurrent(n,fn):
  barrier=threading.Barrier(n)
  def call(i):
   with conn('service_role') as c:barrier.wait();return fn(c,i)
  with futures.ThreadPoolExecutor(max_workers=n) as pool:return list(pool.map(call,range(n)))
 concurrent_key=str(uuid.uuid4());responses=concurrent(20,lambda c,i:submit(c,concurrent_key))
 check('20 real concurrent submissions: one new application, one outbox, nineteen replays',lambda:(equal(sum(not x['duplicate'] for x in responses),1),equal(len(set(x['receiptNumber'] for x in responses)),1),equal(db.execute('SELECT count(*) FROM solq_verified_intake.outbox').fetchone()[0],2)))
 with conn('service_role') as server:
  check('B cannot read A request status',lambda:equal(server.execute("SELECT solq_verified_receipt_status(%s,%s,%s,clock_timestamp()+interval '1 hour')",[B,SB,first_key]).fetchone()[0],None))
  check('A can reconcile committed request after lost response',lambda:equal(server.execute("SELECT solq_verified_receipt_status(%s,%s,%s,clock_timestamp()+interval '1 hour')",[A,SA,first_key]).fetchone()[0]['receiptNumber'],first['receiptNumber']))
  db.execute("UPDATE auth.users SET email='new@example.invalid' WHERE id=%s",[A]);check('email changed since server authentication rejects old email',lambda:denied(lambda:submit(server,str(uuid.uuid4()))));check('queued receipt to old email cancelled before claim',lambda:equal(server.execute('SELECT solq_claim_receipt()').fetchone()[0],None));db.execute("UPDATE auth.users SET email='a@example.invalid' WHERE id=%s",[A])
  # Clear synthetic queues by marking cancelled; this never touches customer data.
  db.execute("UPDATE solq_verified_intake.outbox SET state='cancelled'")
  out_key=str(uuid.uuid4());submit(server,out_key)
 claimed=concurrent(20,lambda c,i:c.execute('SELECT solq_claim_receipt()').fetchone()[0]);jobs=[x for x in claimed if x]
 check('20 receipt dispatch claims acquire one lease only',lambda:equal(len(jobs),1));job=jobs[0]
 with conn('service_role') as server:
  check('confirmed destination only with exact live lease',lambda:(equal(server.execute('SELECT solq_confirm_receipt_destination(%s,%s)',[job['id'],job['lease']]).fetchone()[0],True),equal(server.execute('SELECT solq_confirm_receipt_destination(%s,%s)',[job['id'],str(uuid.uuid4())]).fetchone()[0],False)))
  check('stale completion cannot change receipt state',lambda:denied(lambda:server.execute("SELECT solq_finish_receipt(%s,%s,'accepted',NULL)",[job['id'],str(uuid.uuid4())])))
  server.execute("SELECT solq_finish_receipt(%s,%s,'failed',NULL)",[job['id'],job['lease']])
  check('definite send failure keeps application saved and respects retry backoff',lambda:(equal(server.execute('SELECT solq_claim_receipt()').fetchone()[0],None),equal(server.execute("SELECT solq_verified_receipt_status(%s,%s,%s,clock_timestamp()+interval '1 hour')",[A,SA,out_key]).fetchone()[0]['applicationSaved'],True)))
  db.execute("UPDATE solq_verified_intake.outbox SET next_attempt_at=now()-interval '1 second' WHERE id=%s",[job['id']]);retry=server.execute('SELECT solq_claim_receipt()').fetchone()[0]
  check('bounded retry retains outbox idempotency key and increments attempt',lambda:(equal(retry['id'],job['id']),equal(retry['attempt'],2)))
  server.execute("SELECT solq_finish_receipt(%s,%s,'unknown',NULL)",[retry['id'],retry['lease']])
  check('ambiguous delivery never automatically retries',lambda:equal(server.execute('SELECT solq_claim_receipt()').fetchone()[0],None))
  newkey=str(uuid.uuid4());submit(server,newkey);mail=server.execute('SELECT solq_claim_receipt()').fetchone()[0]
  db.execute("UPDATE auth.users SET email='new@example.invalid' WHERE id=%s",[A])
  check('recipient email change after claim cancels before transport confirmation',lambda:equal(server.execute('SELECT solq_confirm_receipt_destination(%s,%s)',[mail['id'],mail['lease']]).fetchone()[0],False));db.execute("UPDATE auth.users SET email='a@example.invalid' WHERE id=%s",[A])
  for i in range(3):
   if i==0:submit(server,str(uuid.uuid4()))
   mail=server.execute('SELECT solq_claim_receipt()').fetchone()[0];assert mail
   server.execute("SELECT solq_finish_receipt(%s,%s,'failed',NULL)",[mail['id'],mail['lease']]);db.execute("UPDATE solq_verified_intake.outbox SET next_attempt_at=now()-interval '1 second' WHERE id=%s",[mail['id']])
  check('three definite failures exhaust retries without altering saved application',lambda:equal(server.execute('SELECT solq_claim_receipt()').fetchone()[0],None))
  submit(server,str(uuid.uuid4()));mail=server.execute('SELECT solq_claim_receipt()').fetchone()[0];server.execute("SELECT solq_finish_receipt(%s,%s,'accepted','synthetic-provider-id')",[mail['id'],mail['lease']])
  check('provider acceptance is recorded separately and never resends',lambda:equal(server.execute('SELECT solq_claim_receipt()').fetchone()[0],None))
  submit(server,str(uuid.uuid4()));lost=server.execute('SELECT solq_claim_receipt()').fetchone()[0];db.execute("UPDATE solq_verified_intake.outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=%s",[lost['id']])
  check('lost dispatch lease becomes uncertain and cannot automatically resend',lambda:(equal(server.execute('SELECT solq_claim_receipt()').fetchone()[0],None),equal(db.execute('SELECT state FROM solq_verified_intake.outbox WHERE id=%s',[lost['id']]).fetchone()[0],'unknown')))
 send_limits=concurrent(20,lambda c,i:c.execute("SELECT solq_reserve_email_auth(%s,%s,'send')",['a'*64,'b'*64]).fetchone()[0]);verify_limits=concurrent(20,lambda c,i:c.execute("SELECT solq_reserve_email_auth(%s,%s,'verify')",['a'*64,'b'*64]).fetchone()[0])
 check('shared OTP limiter: 20 concurrent resends reserve one slot',lambda:equal(sum(send_limits),1));check('shared OTP limiter: 20 verification attempts allow only five',lambda:equal(sum(verify_limits),5))
 with conn('anon') as anon,conn('authenticated',base.claims(A,SA)) as customer:
  for role,c in [('anon',anon),('authenticated',customer)]:
   check(role+' cannot invoke trusted submit or outbox RPC',lambda c=c:(denied(lambda:submit(c,str(uuid.uuid4()))),denied(lambda:c.execute('SELECT solq_claim_receipt()')),denied(lambda:c.execute('SELECT * FROM solq_verified_intake.outbox'))))
  check('own case visible through earlier customer RLS; old applications stay admin-only',lambda:(equal(customer.execute('SELECT count(*) FROM solq_customer_cases WHERE account_id<>%s',[A]).fetchone()[0],0),equal(customer.execute('SELECT * FROM applications').fetchall(),[])))
 check('all original applications and legacy grants preserved',lambda:(equal(db.execute('SELECT * FROM applications WHERE id=ANY(%s::uuid[]) ORDER BY id',[[str(row[0]) for row in before]]).fetchall(),before),equal(db.execute("SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('admin_users','applications') ORDER BY 1,2,3").fetchall(),grants)))
 check('new outbox contains no description, OTP, raw proof or bearer columns',lambda:equal(db.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='solq_verified_intake' AND table_name='outbox' AND column_name IN ('description','token','proof','otp','authorization')").fetchall(),[]))
 print(json.dumps({'newSqlChecks':len(base.checks),'failed':0,'independentBackendPids':len(base.backend_pids),'actualEmails':0,'legacySuitesRerun':False}),flush=True)
if __name__=='__main__':base.run(Path(sys.argv[1]).resolve(),scenario=scenario)
