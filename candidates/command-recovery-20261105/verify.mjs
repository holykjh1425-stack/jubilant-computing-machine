import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const here=new URL('./',import.meta.url), read=p=>fs.readFileSync(new URL(p,here),'utf8');
let db=new PGlite({extensions:{pgcrypto}});
const evidence={time:new Date().toISOString(),engine:'PGlite PostgreSQL WASM; single connection; synthetic data',realSupabaseAuth:false,realEdge:false,realIndependentConnections:false,realBackupRestored:false,productionWrites:0,paidApiCalls:0,checks:[],migrationReplay:[],platformAdapters:['auth claims are SQL test settings, not signed JWT','pg_net refuses all requests','cron only stores inactive schedules','Vault dummy metadata, no production secrets'],remaining:[]};
evidence.inputSha256=Object.fromEntries(['verify.mjs','package-lock.json','platform-test-adapters.sql','00-initial-schema.sql','10-untracked-approval-prerequisites.sql','production-catalog.json','access-metadata.json','security-candidate.sql','security-rollback.sql',...fs.readdirSync(new URL('history/',here)).map(p=>'history/'+p)].map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')]));
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks.push({name,status:'PASS'});console.log('PASS '+name)};
async function denied(sql,code){try{await db.exec(sql);return false}catch(e){if(code)assert.equal(e.code,code);return true}}
const rows=async sql=>(await db.query(sql)).rows;
const scalar=async sql=>Object.values((await rows(sql))[0])[0];
async function as(role,sub,sql){await db.exec('set role '+role);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub})]);try{return await db.query(sql)}finally{await db.exec('reset role')}}
async function rejectAs(role,sub,sql){try{await as(role,sub,sql);return false}catch{return true}}
async function rpc(role,sub,name,args){await db.exec('set role '+role);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub})]);try{return (await db.query('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as result',args)).rows[0].result}finally{await db.exec('reset role')}}
try{
 await db.exec(read('platform-test-adapters.sql'));
 check('fresh database without baseline exposes missing applications',await denied(read('history/20261018033557_secure_application_receipt_rpc.sql')+'select public.submit_application(\'Synthetic\',\'000-test\',\'ai_automation\',\'synthetic requirements\',true);','42P01'));
 // Failed multi-statement setup is discarded; reset everything before the actual replay.
 await db.close();
}catch(e){console.error('SETUP_FAILURE',e.code,e.message);throw e}
const syntheticDir=fs.mkdtempSync(path.join(os.tmpdir(),'solq-synthetic-pg-'));
db=new PGlite(syntheticDir,{extensions:{pgcrypto}});
try {
 await db.exec(read('platform-test-adapters.sql'));
 await db.exec(read('00-initial-schema.sql'));
 for(const file of fs.readdirSync(new URL('history/',here)).sort()){
  if(file.startsWith('20261026'))await db.exec(read('10-untracked-approval-prerequisites.sql'));
  const source=read('history/'+file);
  const adapted=source.replace(/^(?:create extension(?: if not exists)? pg_(?:cron|net)[^;]*;|drop extension pg_net;)/gmi,'-- platform extension handled by test adapter');
  await db.exec('begin;'+adapted+'commit;');
  evidence.migrationReplay.push({file,status:'PASS',adaptedPlatformExtensionStatements:source!==adapted});
 }
 check('all eleven historical migrations replay with explicit platform adapters',evidence.migrationReplay.length===11);
 const catalog=JSON.parse(read('production-catalog.json'));
 const actual=await rows("select n.nspname as schema,c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,a.attidentity as identity,pg_get_expr(d.adbin,d.adrelid) as default from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in ('public','nexus_ai_private','nexus_orchestrator_private','nexus_production_private') and c.relkind='r' and a.attnum>0 and not a.attisdropped order by 1,2,a.attnum");
 const norm=x=>JSON.stringify(Object.fromEntries(['schema','table','name','type','not_null','identity','default'].map(k=>[k,x[k]])));
 const expectedSet=new Set(catalog.columns.map(norm)),actualSet=new Set(actual.map(norm));
 evidence.columnDifferences={missing:catalog.columns.filter(x=>!actualSet.has(norm(x))),extra:actual.filter(x=>!expectedSet.has(norm(x)))};
 console.log('COLUMN_DIFF '+JSON.stringify(evidence.columnDifferences));
 check('application metadata columns match production snapshot',evidence.columnDifferences.missing.length===0&&evidence.columnDifferences.extra.length===0);
 const schemas="('public','nexus_ai_private','nexus_orchestrator_private','nexus_production_private')";
 const localConstraints=await rows(`select n.nspname as schema,c.relname as table,con.conname as name,con.contype as type,pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas}`);
 const localPolicies=await rows(`select * from pg_policies where schemaname in ${schemas}`);
 const localIndexes=await rows(`select * from pg_indexes where schemaname in ${schemas}`);
 const localTriggers=await rows(`select n.nspname as schema,c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) as definition,t.tgenabled as enabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ${schemas}`);
 const localTables=await rows(`select n.nspname as schema,c.relname as table,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} and c.relkind='r'`);
 const clean=x=>JSON.stringify(x).replace(/\\n|\\t|\s+/g,'').replaceAll('"public".','public.');
 const diff=(wanted,found,keys)=>{
  const pick=x=>Object.fromEntries(keys.map(k=>[k,x[k]]));
  const w=wanted.map(pick),f=found.map(pick),ws=new Set(w.map(clean)),fs=new Set(f.map(clean));
  return {missing:w.filter(x=>!fs.has(clean(x))),extra:f.filter(x=>!ws.has(clean(x)))};
 };
 evidence.engineVersion=await scalar('select version()');
 evidence.notNullCatalogNormalization='PGlite PG18 exposes NOT NULL in pg_constraint; compared independently using attnotnull for all columns';
 evidence.structureDifferences={constraints:diff(catalog.constraints,localConstraints.filter(x=>x.type!=='n'),['schema','table','name','type','definition']),policies:diff(catalog.policies,localPolicies,['schemaname','tablename','policyname','permissive','roles','cmd','qual','with_check']),indexes:diff(catalog.indexes,localIndexes,['schemaname','tablename','indexname','indexdef']),triggers:diff(catalog.triggers,localTriggers,['schema','table','name','definition','enabled']),tables:diff(catalog.tables,localTables,['schema','table','rls','force_rls'])};
 check('constraints policies indexes triggers and RLS flags match captured application schemas',Object.values(evidence.structureDifferences).every(x=>!x.missing.length&&!x.extra.length));
 const access=JSON.parse(read('access-metadata.json'));
 const seq=await rows("select n.nspname as schema,c.relname as name,format_type(s.seqtypid,null) as type,s.seqstart::text as start,s.seqincrement::text as increment,s.seqmin::text as min,s.seqmax::text as max,s.seqcache::text as cache,s.seqcycle as cycle from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'");
 evidence.sequenceDifferences=diff(access.sequences,seq,['schema','name','type','start','increment','min','max','cache','cycle']);
 check('public identity sequence definitions match without reading production sequence values',!evidence.sequenceDifferences.missing.length&&!evidence.sequenceDifferences.extra.length);
 evidence.aclScope='Production table, schema, column and default ACL metadata captured. Local harness uses explicit functional grants, not full Supabase default ACL reproduction. Ancillary live management rights separately tested and candidate-remediated.';
 const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
 await db.exec(`insert into auth.users values('${id}'),('${other}');insert into public.admin_users(user_id) values('${id}');`);
 let r=await as('anon',null,"select public.submit_application('Synthetic','000-test','ai_automation','문의 내용을 규칙에 따라 분류하고 결과를 표로 정리하는 합성 요청입니다.',true) as receipt");
 const receipt=r.rows[0].receipt,app=await scalar(`select id from applications where receipt_number='${receipt}'`);
 check('public intake stores one synthetic application with receipt',/^NX-\d{8}-[A-F0-9]{8}$/.test(receipt)&&await scalar('select count(*)::int from applications')===1);
 check('anonymous direct row read denied',await denied('set role anon;select * from public.applications;'));
 await db.exec('reset role');
 check('ordinary authenticated user cannot see applications',(await as('authenticated',other,'select * from public.applications')).rows.length===0);
 check('admin role predicate sees synthetic application',(await as('authenticated',id,'select receipt_number from public.applications')).rows[0].receipt_number===receipt);
 const before=await scalar('select count(*)::int from ai_work_plans');
 await as('authenticated',id,'select * from public.applications');await as('authenticated',id,'select * from public.ai_work_plans');
 check('admin reads do not create plans or jobs',await scalar('select count(*)::int from ai_work_plans')===before&&await scalar('select count(*)::int from orchestrator_jobs')===0);
 const plan=await scalar(`select nexus_production_private.free_plan('${app}')`);
 check('restored rule engine returns six steps and zero paid calls',plan.steps.length===6&&plan.paid_calls===0&&plan.execution_started===false);
 await db.exec('select nexus_production_private.free_cycle();');
 check('restored automatic path persists plan and one job',await scalar('select count(*)::int from ai_work_plans')===1&&await scalar('select count(*)::int from orchestrator_jobs')===1);
 await db.exec('select nexus_production_private.free_cycle();');
 check('restored automatic path retry reuses same plan and job',await scalar('select count(*)::int from ai_work_plans')===1&&await scalar('select count(*)::int from orchestrator_jobs')===1);
 await db.exec('select nexus_production_private.tick();');
 check('restored server tick enrolls production preview without execution',await scalar(`select status from production_jobs where application_id='${app}'`)==='awaiting_deposit'&&await scalar('select count(*)::int from production_attempts')===0);
 await db.exec(read('../../ops/free-plan-automation/quote-evidence.sql'));
 await db.exec(read('../../ops/admin-integration-candidate/quote-deposit-guard.sql'));
 check('existing quote and deposit candidates install on fully reconstructed application schema',await scalar("select to_regclass('public.solq_deposit_confirmations') is not null")===true);
 check('separate production approval denies missing prerequisites',await rejectAs('authenticated',id,`select public.solq_approve_production('${app}');`));
 const quote=await rpc('authenticated',id,'public.solq_quote_ledger',['issue_quote',{application_id:app,quote_reference:'SYNTHETIC-Q1',amount_krw:100000,expires_at:new Date(Date.now()+3600000).toISOString()}]);
 const acceptance={application_id:app,quote_reference:quote.quote_reference,quote_version:String(quote.version),amount_krw:100000,accepted:true,evidence_verified:true,accepted_at:await scalar('select clock_timestamp()::text'),evidence_reference:'synthetic/consent'};
 await rpc('authenticated',id,'public.solq_record_quote_evidence',[acceptance]);
 check('reconstructed schema links verified acceptance to correct application',await scalar(`select count(*)::int from production_jobs j join solq_quote_acceptances a on a.id=j.quote_acceptance_id where j.application_id=a.application_id and j.application_id='${app}'`)===1);
 const deposit=await rpc('authenticated',id,'public.solq_quote_ledger',['record_deposit',{application_id:app,quote_id:quote.id,amount_krw:30000,paid_at:await scalar('select clock_timestamp()::text'),transaction_reference:'SYNTHETIC-BANK-1',evidence_reference:'synthetic/bank'}]);
 check('deposit notice does not approve production',await rejectAs('authenticated',id,`select public.solq_approve_production('${app}');`));
 await rpc('authenticated',id,'public.solq_quote_ledger',['confirm_deposit',{application_id:app,quote_id:quote.id,deposit_id:deposit.id,bank_verified:true}]);
 check('manual evidence confirmation alone does not start production',await scalar('select count(*)::int from production_attempts')===0&&await scalar(`select status from production_jobs where application_id='${app}'`)==='awaiting_deposit');
 await as('authenticated',id,`update applications set status='deposit_confirmed' where id='${app}'`);
 const approved=await rpc('authenticated',id,'public.solq_approve_production',[app]);
 const again=await rpc('authenticated',id,'public.solq_approve_production',[app]);
 check('separate approval queues once after all three prerequisites',approved.approved===true&&again.duplicate===true&&approved.job_id===again.job_id&&await scalar('select count(*)::int from production_attempts')===0);
 check('unauthorized status mutation denied by RLS',(await as('authenticated',other,`update applications set status='cancelled' where id='${app}' returning id`)).rows.length===0);
 // Security changes are applied only after baseline compatibility checks.
 await db.exec('grant truncate,references,trigger,maintain on public.admin_users to anon,authenticated;grant maintain on public.applications to anon,authenticated;');
 await db.exec(read('security-candidate.sql'));
 check('catalog-confirmed ancillary management privileges removed in candidate',await scalar("select not has_table_privilege('anon','public.admin_users','TRUNCATE') and not has_table_privilege('authenticated','public.admin_users','TRIGGER') and not has_table_privilege('anon','public.applications','MAINTAIN')")===true);
 r=await as('anon',null,"select public.submit_application('Synthetic second','000-test','consulting','synthetic security test',true) as receipt");
 check('security candidate preserves public intake',typeof r.rows[0].receipt==='string');
 const token='a'.repeat(64),bad='b'.repeat(64);
 r=await as('anon',null,`select public.submit_support_inquiry('synthetic question','ko','${token}',true,true) as id`);
 const inquiry=r.rows[0].id;
 check('security candidate accepts consented support inquiry',!!inquiry);
 check('support token scope rejects incorrect token',(await as('anon',null,`select * from public.read_support_inquiry('${inquiry}','${bad}')`)).rows.length===0);
 check('support token scope returns matching synthetic inquiry',(await as('anon',null,`select * from public.read_support_inquiry('${inquiry}','${token}')`)).rows.length===1);
 await db.exec('set role anon');
 check('support direct table read denied',await denied('select * from public.support_inquiries;','42501'));await db.exec('reset role');
 check('public RPC wrappers are security invoker',await scalar("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('submit_application','submit_support_inquiry','read_support_inquiry') and p.prosecdef")===0);
 check('dedicated definer owner cannot login or bypass RLS',await scalar("select not rolcanlogin and not rolbypassrls and not rolsuper from pg_roles where rolname='solq_public_rpc_owner'")===true);
 check('anonymous and authenticated roles have no owner membership',await scalar("select not pg_has_role('anon','solq_public_rpc_owner','MEMBER') and not pg_has_role('authenticated','solq_public_rpc_owner','MEMBER')")===true);
 check('missing privacy consent is rejected',await rejectAs('anon',null,"select public.submit_application('Synthetic','000-test','consulting','synthetic test',false)"));
 check('malformed support token is rejected',await rejectAs('anon',null,"select public.submit_support_inquiry('synthetic question','ko','invalid',true,true)"));
 const saved=await scalar('select count(*)::int from applications');
 await db.exec("create function public.synthetic_fault() returns trigger language plpgsql as $$begin raise exception 'synthetic_rollback_fault';end$$;create trigger synthetic_fault after insert on applications for each row execute function public.synthetic_fault();");
 check('new intake failure rolls back application and capture event',await rejectAs('anon',null,"select public.submit_application('Synthetic','000-test','consulting','synthetic failure test',true)")&&await scalar('select count(*)::int from applications')===saved&&await scalar('select count(*)::int from inquiry_events')===saved);
 await db.exec('drop trigger synthetic_fault on applications;drop function public.synthetic_fault();');
 check('following request recovers after rolled-back intake error',typeof await rpc('anon',null,'public.submit_application',['Synthetic recovery','000-test','consulting','synthetic recovery test',true])==='string');
 check('no outbound network requests made',await scalar('select count(*)::int from net.http_request_queue')===0);
 const expectedCounts=await rows('select (select count(*)::int from applications) as applications,(select count(*)::int from ai_work_plans) as plans,(select count(*)::int from orchestrator_jobs) as jobs,(select count(*)::int from solq_quote_acceptances) as acceptances');
 await db.close();db=new PGlite(syntheticDir,{extensions:{pgcrypto}});
 check('synthetic application plan job and acceptance survive engine restart',JSON.stringify(await rows('select (select count(*)::int from applications) as applications,(select count(*)::int from ai_work_plans) as plans,(select count(*)::int from orchestrator_jobs) as jobs,(select count(*)::int from solq_quote_acceptances) as acceptances'))===JSON.stringify(expectedCounts));
 evidence.persistenceCounts=expectedCounts[0];
 await db.exec(read('security-rollback.sql'));
 check('security rollback restores public RPC definitions without dropping customer tables',await scalar("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('submit_application','submit_support_inquiry','read_support_inquiry') and p.prosecdef")===3&&await scalar('select count(*)::int from applications')===expectedCounts[0].applications);
 evidence.remaining=['Native PostgreSQL server requires a non-root mapped UID and extension-capable runtime','Supabase Auth/JWT and Edge are not exercised by SQL test adapters','Actual independent-session concurrency not tested','Production encrypted backup and actual restore unavailable','Provider advisory and leaked password setting remain unchanged'];
 evidence.pass=evidence.checks.length;evidence.fail=0;
}catch(e){evidence.fail=1;evidence.error={code:e.code,message:e.message};console.error('FAIL',e.code,e.message);process.exitCode=1}
finally{fs.writeFileSync(new URL('results.json',here),JSON.stringify(evidence,null,2)+'\n');await db.close();}
