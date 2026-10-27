import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require=createRequire(process.env.SOLQ_TEST_DEPS?process.env.SOLQ_TEST_DEPS+'/package.json':import.meta.url);
const {parseHTML}=require('linkedom');
const source=n=>readFileSync(new URL('../../'+n,import.meta.url),'utf8');
const {window}=parseHTML(source('admin.html'));const {document}=window;
// linkedom lacks the browser HTMLSelectElement.value setter.
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(v){for(const o of this.querySelectorAll('option')){if(o.value===v)o.setAttribute('selected','');else o.removeAttribute('selected');}}});
const actor={id:'qa-admin'},a={id:'qa-application',receipt_number:'QA-ONLY',created_at:'2026-10-27T00:00:00Z',customer_name:'SYNTHETIC',contact:'SYNTHETIC',service_type:'website',description:'SYNTHETIC',status:'received'};
const calls=[],timers=[];let count=1,approved=false,generated=false,fail=false;
const state=()=>({application_id:a.id,request_hash:'a'.repeat(32),approved,plan_id:generated?'qa-plan':null,job_id:generated?'qa-job':null,review_required:false,cancelled:false});
const db={auth:{getUser:async()=>({data:{user:actor}}),getSession:async()=>({data:{session:{}}}),onAuthStateChange:()=>{},signOut:async()=>({})},
 from(table){let head=false;const q={select(_s,o){head=o?.head;return q;},eq(){return q;},order(){return q;},range(){return q;},limit(){return q;},maybeSingle:async()=>({data:{user_id:actor.id}}),then(resolve){calls.push({read:table});return Promise.resolve({data:table==='applications'&&!head?[a]:[],count:table==='applications'?count:0}).then(resolve);}};return q;},
 async rpc(name,args){calls.push({rpc:name,action:args.p_action});if(fail)return {error:{code:'NETWORK'}};if(args.p_action==='approve')approved=true;if(args.p_action==='generate'){assert.ok(approved);generated=true;}return {data:state()};}};
window.NEXUS_CONFIG={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_synthetic'};
window.supabase={createClient:()=>db};window.SOLQ_PLAN_VIEW={render:()=>{}};
Object.defineProperty(document.querySelector('#login-form'),'elements',{value:{password:{value:''},email:{value:''}}});
Object.defineProperty(document.querySelector('#status-filter'),'value',{value:''});
const context=vm.createContext({window,document,Event:window.Event,createFreeWorkflow:()=>({snapshot:async()=>({plan:null,job:null,tasks:[]})}),setInterval:(fn,ms)=>timers.push({fn,ms}),queueMicrotask,console});
vm.runInContext(source('free-generation.js'),context);context.createFreeGeneration=window.createFreeGeneration;
vm.runInContext(source('admin.js'),context);
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};await flush();
const results=[];const test=async(name,fn)=>{await fn();results.push({name,passed:true});console.log('PASS',name);};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
await test('restored synthetic session renders approval controls without generation',()=>{assert.equal(document.querySelectorAll('.application-card').length,1);assert.ok(calls.some(c=>c.action==='inspect'));assert.ok(!calls.some(c=>['approve','generate'].includes(c.action)));assert.equal(button('승인된 무료 계획·작업 생성').disabled,true);});
await test('30 second poll only reads and displays new-intake notification',async()=>{assert.equal(timers.length,1);assert.equal(timers[0].ms,30000);const before=calls.filter(c=>c.rpc).length;count=2;await timers[0].fn();await flush();assert.match(document.querySelector('#new-intake-notice').textContent,/신규 접수 1건/);assert.equal(calls.filter(c=>c.rpc).length,before);});
await test('approval click never generates, separate generate click required',async()=>{button('무료 계획 생성 승인').click();await flush();assert.ok(approved);assert.equal(generated,false);assert.equal(button('승인된 무료 계획·작업 생성').disabled,false);button('승인된 무료 계획·작업 생성').click();await flush();assert.ok(generated);assert.equal(button('승인된 무료 계획·작업 생성').disabled,true);assert.deepEqual(calls.filter(c=>['approve','generate'].includes(c.action)).map(c=>c.action),['approve','generate']);});
await test('controller rejects repeat clicks, stale views and changed identities',async()=>{let release;const blocked=new Promise(r=>release=r);let n=0;const isolated={auth:db.auth,rpc:async()=>{n++;await blocked;return {data:state()};}};const api=window.createFreeGeneration({db:isolated,verifyAdmin:async()=>actor});const first=api.approve(a,state());await assert.rejects(api.approve(a,state()),/BUSY/);release();await first;assert.equal(n,1);await assert.rejects(api.generate(a,state(),()=>false),/STALE_VIEW/);const bad=window.createFreeGeneration({db:isolated,verifyAdmin:async()=>({id:'different'})});await assert.rejects(bad.generate(a,state()),/SESSION_CHANGED/);assert.equal(n,1);});
await test('RPC error is not automatically retried',async()=>{fail=true;const before=calls.length;const api=window.createFreeGeneration({db,verifyAdmin:async()=>actor});await assert.rejects(api.generate(a,state()),/FREE_GENERATION_FAILED/);assert.equal(calls.slice(before).filter(c=>c.rpc).length,1);});
writeFileSync(new URL('client-results.json',import.meta.url),JSON.stringify({environment:'linkedom synthetic DOM and SDK; no browser or real auth',tests:results},null,2));
