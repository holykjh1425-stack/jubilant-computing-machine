import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {AdminGate,PollController,guardedFetch,localArchive,summarize,validateReview,SupabaseReadAdapter} from './ops-core.mjs';
import {createFixtureAdapter} from './fixture.mjs';
const user={id:'11111111-1111-4111-8111-111111111111'};
const dbFor=(kind='admin')=>({auth:{async getSession(){return {data:{session:{expires_at:kind==='expired'?1:9999999999,user}}}},async getUser(){return {data:{user}}}},from(t){return {select(){return this},eq(){return this},async maybeSingle(){return {data:kind==='nonadmin'?null:{user_id:user.id}}}}}});
test('auth rejects expired, missing membership, wrong identity and checks server user',async()=>{
 assert.equal((await new AdminGate(dbFor()).verify()).id,user.id);
 await assert.rejects(new AdminGate(dbFor('expired')).verify(),{code:'AUTH'});
 await assert.rejects(new AdminGate(dbFor('nonadmin')).verify(),{code:'FORBIDDEN'});
 const db=dbFor();db.auth.getUser=async()=>({data:{user:{id:'another'}}});await assert.rejects(new AdminGate(db).verify(),{code:'AUTH'});
 let clock=1000;const gate=new AdminGate(dbFor(),()=>clock);await gate.verify();clock=9999999999001;await assert.rejects(gate.verify(),{code:'AUTH'});
});
test('single flight / pause discards in-flight response and makes no operational writes',async()=>{
 let release,readCount=0,events=[];const adapter={verify:async()=>user,read:()=>{readCount++;return new Promise(r=>release=r)}};
 const ctrl=new PollController(adapter,{emit:e=>events.push(e),schedule:()=>1,cancel:()=>{}});
 const a=ctrl.refresh(),b=ctrl.refresh();await Promise.resolve();assert.equal(readCount,1);ctrl.stop('AUTH');release({at:new Date().toISOString(),sources:{}});await Promise.all([a,b]);assert.equal(events.at(-1).kind,'AUTH');assert.equal(events.filter(x=>x.kind==='SUCCESS').length,0);
});
test('auth failure prevents customer reads; three failures stop automatic polling',async()=>{
 let reads=0;const adapter={verify:async()=>{throw Object.assign(Error(),{code:'FORBIDDEN'})},read:async()=>reads++};const c=new PollController(adapter,{emit:()=>{}});await c.start();assert.equal(reads,0);assert.equal(c.automatic,false);
 let schedule=[];const bad=new PollController({verify:async()=>user,read:async()=>{throw Error()}},{schedule:f=>{schedule.push(f);return schedule.length},cancel:()=>{}});await bad.start();await bad.refresh();await bad.refresh();assert.equal(bad.failures,3);assert.equal(bad.automatic,false);assert.equal(schedule.length,2);
});
test('failed refresh clears data and retains last-success time only',async()=>{
 const fixture=createFixtureAdapter(),events=[];const c=new PollController(fixture,{emit:e=>events.push(e),schedule:()=>1,cancel:()=>{}});await c.refresh();const at=c.lastSuccess;fixture.setScenario('failure');await c.refresh();assert.equal(events.at(-1).kind,'QUERY_FAILED');assert.equal(events.at(-1).data,null);assert.equal(events.at(-1).lastSuccess,at);c.stop();
});
test('automatic interval 60 seconds; offline / hidden cannot read; expiry clears display',async()=>{
 let reads=0,scheduled=[];const adapter={gate:{deadline:8000},verify:async()=>user,read:async()=>{reads++;return {at:'2026-11-12T00:00:00Z',sources:{}}}};
 const c=new PollController(adapter,{clock:()=>1000,schedule:(f,ms)=>{scheduled.push({f,ms});return scheduled.length},cancel:()=>{}});await c.start();assert.ok(scheduled.some(x=>x.ms===60000));assert.ok(scheduled.some(x=>x.ms===7000));scheduled.find(x=>x.ms===7000).f();assert.equal(c.automatic,false);
 await new PollController(adapter,{online:()=>false}).refresh();await new PollController(adapter,{visible:()=>false}).refresh();assert.equal(reads,1);
});
test('request guard permits reads and reviews only; rejects RPC, workers, updates, refresh and foreign origin',async()=>{
 let requests=[];const base='https://example.supabase.co';const f=guardedFetch(base,async(u,i)=>{requests.push([u,i.method]);return {ok:true}});
 await f(base+'/rest/v1/applications?select=id',{method:'GET'});await f(base+'/rest/v1/solq_control_reviews',{method:'POST'});
 for(const [p,m] of [['/rest/v1/applications','PATCH'],['/rest/v1/admin_users','DELETE'],['/rest/v1/rpc/worker','POST'],['/functions/v1/nexus-ai','POST'],['/auth/v1/token?grant_type=refresh_token','POST']])await assert.rejects(f(base+p,{method:m}),{code:'FORBIDDEN'});
 await assert.rejects(f('https://other.test/rest/v1/applications'),{code:'FORBIDDEN'});assert.equal(requests.length,2);
});
test('partial sources and capped results never produce complete anomaly or status counts',async()=>{
 const f=createFixtureAdapter();const full=await f.read();assert.equal(summarize(full).anomalies.unlinkedJobs,1);f.setScenario('partial');assert.equal(summarize(await f.read()).anomalies,null);full.sources.applications.complete=false;const sum=summarize(full);assert.deepEqual(sum.counts.applications.states,{});assert.equal(sum.anomalies,null);
});
test('existing v1 raw bytes preserved including invalid JSON; no writes or removes',()=>{
 let writes=0;const raw='{"notes":{"restore":{"note":"keep me"}},"logs":[{"old":true}]}';const storage={getItem:()=>raw,setItem(){writes++},removeItem(){writes++}};assert.equal(localArchive(storage).raw,raw);assert.equal(localArchive(storage).notes.restore.note,'keep me');assert.equal(writes,0);assert.throws(()=>localArchive({getItem:()=>'{bad'}));
});
test('PASS requires evidence; unsafe URLs rejected; facts and next action required',()=>{
 const r={task_id:'G-03',owner:'GUARD',verdict:'PASS',checked_at:'2026-11-12T00:00:00Z',facts:'Synthetic evidence',next_action:'Review',revision:1,evidence:[]};assert.throws(()=>validateReview(r),{code:'EVIDENCE_REQUIRED'});r.evidence=['https://example.test/evidence'];validateReview(r);r.evidence=['https://user:pass@example.test'];assert.throws(()=>validateReview(r));r.evidence=['javascript:alert(1)'];assert.throws(()=>validateReview(r));
});
test('candidate default is fail-closed; original customer files remain untouched by candidate',async()=>{
 const flags=await readFile(new URL('./deployment.candidate.mjs',import.meta.url),'utf8');assert.match(flags,/LIVE_READ_ENABLED=false/);assert.match(flags,/SERVER_REVIEWS_ENABLED=false/);
 const page=await readFile(new URL('./SOLQ_control_recovery.html',import.meta.url),'utf8');assert.match(page,/connect-src 'none'/);assert.match(page,/solq-control-local-drafts-v2/);assert.doesNotMatch(page,/createFixtureAdapter/);assert.match(page,/@media\(max-width:700px\).*#tasks table/s);
});
