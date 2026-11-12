import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMailWorker} from './mail-worker.mjs';
import {SMTP_PROFILE} from './smtp-provider.mjs';

const job={id:'synthetic-job',lease:'synthetic-lease',recipient:'test@example.invalid',receiptNumber:'NX-20261112-AAAAAAAA',version:1,kind:'production_completed'};
function fixture(overrides={}){
 const events=[],finished=[];
 const store={claim:async()=>({...job}),confirm:async()=>{events.push('confirm');return true},finish:async r=>finished.push(r)};
 const options={enabled:true,synthetic:true,transport:{sendMail:async m=>{events.push('send');assert.equal(m.from.address,'ggwell06@gmail.com');assert.equal(m.to,job.recipient);return {accepted:[m.to]}}},receiptStore:store,completionStore:store,reserveBudget:async()=>{events.push('budget');return true},authorizeCurrent:async()=>{events.push('authority');return true},...overrides};
 return {events,finished,options,worker:()=>createMailWorker(options)};
}
test('SMTP public profile matches saved implicit TLS port and certificate verification',()=>{assert.deepEqual(SMTP_PROFILE,{host:'smtp.gmail.com',port:465,secure:true,tls:{rejectUnauthorized:true}});assert.ok(Object.isFrozen(SMTP_PROFILE.tls))});
test('construction is disabled by default and never calls a transport',()=>{let calls=0;assert.throws(()=>createMailWorker({transport:{sendMail(){calls++}}}),{code:'NOT_DEPLOYED'});assert.equal(calls,0)});
test('every real execution approval is independently required',()=>{for(const flag of ['smtpApproved','deliveryApproved','costApproved']){const f=fixture({synthetic:false,smtpApproved:true,deliveryApproved:true,costApproved:true,[flag]:false});assert.throws(f.worker,{code:'NOT_DEPLOYED'});assert.deepEqual(f.events,[])}});
test('shared durable budget injection is mandatory',()=>{const f=fixture({reserveBudget:undefined});assert.throws(f.worker,{code:'NOT_DEPLOYED'})});
test('receipt reserves budget and confirms destination before SMTP acceptance',async()=>{const f=fixture();assert.equal((await f.worker().tick('receipt')).state,'accepted');assert.deepEqual(f.events,['budget','confirm','send']);assert.equal(f.finished[0].result,'accepted')});
test('budget denial does not send and retains a definitive failure transition',async()=>{const f=fixture({reserveBudget:async()=>false});assert.equal((await f.worker().tick('receipt')).started,false);assert.equal(f.finished[0].result,'failed');assert.deepEqual(f.events,[])});
test('completion revalidates current authority after shared reservation',async()=>{const f=fixture({authorizeCurrent:async()=>false});assert.equal((await f.worker().tick('completion')).state,'cancelled');assert.equal(f.finished[0].result,'cancelled');assert.deepEqual(f.events,['budget'])});
test('ambiguous SMTP exception is unknown and never retried in this invocation',async()=>{let n=0;const f=fixture({transport:{sendMail:async()=>{n++;throw Error('synthetic secret must not escape')}}});assert.equal((await f.worker().tick('receipt')).state,'unknown');assert.equal(n,1);assert.equal(f.finished[0].reference,null);assert.ok(!JSON.stringify(f.finished).includes('secret'))});
test('receipt and completion cannot overlap in one worker; guard clears afterwards',async()=>{let release;const f=fixture({reserveBudget:()=>new Promise(r=>{release=r})});const w=f.worker(),first=w.tick('receipt');await new Promise(r=>setImmediate(r));await assert.rejects(w.tick('completion'),{code:'REQUEST_PENDING'});release(true);await first;await assert.rejects(w.tick('untrusted-kind'),{code:'INVALID_EVENT'})});
test('changed receipt recipient cancels before transport',async()=>{const f=fixture();f.options.receiptStore.confirm=async()=>false;assert.equal((await f.worker().tick('receipt')).state,'cancelled');assert.deepEqual(f.events,['budget'])});
