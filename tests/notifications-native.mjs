// Run only against a new disposable localhost CI PostgreSQL database. No production URLs.
import {Client} from 'pg';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
const raw=process.env.SOLQ_ISOLATED_PG_URL;
if(process.env.SOLQ_ISOLATED_PG!=='true'||!raw)throw Error('explicit isolated PostgreSQL opt-in required');
const url=new URL(raw);
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/solq_notifications_test')throw Error('only disposable localhost test database permitted');
const clients=[],connect=async()=>{const c=new Client({connectionString:raw,connectionTimeoutMillis:5000,statement_timeout:10000});await c.connect();clients.push(c);return c;};
const evidence={engine:'native PostgreSQL',synthetic:true,productionWrites:0,externalMessages:0,checks:[]};
const check=(name,value)=>{assert.ok(value,name);evidence.checks.push({name,status:'PASS'});console.log('PASS '+name);};
try{
 const db=await connect();evidence.version=(await db.query('select version()')).rows[0].version;
 await db.query(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;grant usage on schema auth to public;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table admin_users(user_id uuid primary key);grant select on admin_users to authenticated;
  create table applications(id uuid primary key default gen_random_uuid(),receipt_number text unique default 'NX-20261110-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),created_at timestamptz not null default now(),customer_name text,contact text,service_type text,description text,privacy_consent boolean,status text,internal_note text);
  create table production_jobs(application_id uuid,production_approved_at timestamptz,production_approved_by uuid);grant select on production_jobs to service_role;`);
 await db.query(await readFile(new URL('../candidates/customer-notifications-20261110/schema.sql',import.meta.url),'utf8'));
 await db.query("update solq_notification_private.settings set capture_from=now()-interval '1 minute',admin_email_enabled=true,customer_email_enabled=true,daily_attempt_limit=5,delivery_enabled=true");
 const workers=await Promise.all(Array.from({length:12},()=>connect()));
 await Promise.all(workers.map(c=>c.query('set role service_role')));
 const command=async(c,action,data={})=>(await c.query('select solq_notification_command($1,$2::jsonb) result',[action,JSON.stringify(data)])).rows[0].result;
 const payload={token:'d'.repeat(64),customer_name:'Synthetic concurrent fixture',contact:'race@example.invalid',service_type:'website',description:'Synthetic only',privacy_consent:true,transfer_consent:true};
 const receipts=await Promise.all(workers.map(c=>command(c,'submit',payload)));
 check('12 independent connections create exactly one application for same token',new Set(receipts.map(r=>r.receipt_number)).size===1&&(await db.query('select count(*)::int n from applications')).rows[0].n===1);
 for(let i=0;i<4;i++)await command(workers[0],'submit',{...payload,token:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')});
 await command(workers[0],'reconcile');
 const claimed=await Promise.all(workers.map(c=>command(c,'claim'))),jobs=claimed.filter(j=>j?.id);
 check('12 competing claimers respect atomic global daily limit of 5',jobs.length===5&&claimed.filter(x=>x?.reason==='daily_limit').length===7);
 check('all five claimed jobs have distinct ids and fencing tokens',new Set(jobs.map(j=>j.id)).size===5&&new Set(jobs.map(j=>j.lease_token)).size===5);
 const done={id:jobs[0].id,lease_token:jobs[0].lease_token,outcome:'accepted',provider_id:'synthetic-only'};
 const completions=await Promise.allSettled(workers.slice(0,2).map(c=>command(c,'finish',done)));
 check('two independent completions accept exactly one winner',completions.filter(x=>x.status==='fulfilled').length===1&&completions.filter(x=>x.status==='rejected').length===1);
 await db.query("update solq_notification_outbox set lease_until=now()-interval '1 minute' where status='sending'");
 await command(workers[0],'claim');
 check('expired work marked uncertain even when quota exhausted',(await db.query("select count(*)::int n from solq_notification_outbox where status='uncertain'")).rows[0].n===4);
 await assert.rejects(command(workers[0],'finish',{id:jobs[1].id,lease_token:jobs[1].lease_token,outcome:'accepted'}),/stale lease/);
 check('expired owner cannot finish after recovery',true);
 // Row locks held by an interrupted worker transaction must roll back on disconnect.
 await db.query('update solq_notification_private.settings set daily_attempt_limit=50');
 const interrupted=await connect();await interrupted.query('set role service_role;begin');const uncommitted=await command(interrupted,'claim');assert.ok(uncommitted?.id);await interrupted.end();
 const recovered=await command(workers[0],'claim');
 check('disconnect rolls back uncommitted reservation and a different connection recovers it',recovered?.id===uncommitted.id&&recovered.lease_token!==uncommitted.lease_token);
 evidence.connections=12;evidence.finishedAt=new Date().toISOString();
 await writeFile(new URL('../ops/notifications/evidence/native-postgres.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
}finally{await Promise.allSettled(clients.map(c=>c.end()));}
