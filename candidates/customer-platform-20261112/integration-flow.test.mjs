import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createFixtureSession,B} from './ui/fixture-session.mjs';
test('same synthetic customer journey: consent, two manual gates, versioned revision and quota',async()=>{
 const s=createFixtureSession();assert.equal((await s.customer.listCases()).items[0].id,'CASE-A');await assert.rejects(s.customer.appendMessage('CASE-A','동의 전 저장'),/CONSENT/);
 const a=await s.confirm('deposit');assert.equal(a.executionStarted,false);assert.equal(a.job.status,'awaiting_approval');const b=await s.confirm('production');assert.equal(b.executionStarted,true);assert.equal(b.version.version,1);
 await s.customer.setChatConsent('CASE-A',true);const response=await s.sendPrivate({caseId:'CASE-A',message:'제목 색상만 조정해 주세요.'});assert.match(response.message,/v2/);assert.equal((await s.preview({caseId:'CASE-A'})).versions.length,2);await assert.rejects(s.sendPrivate({caseId:'CASE-A',message:'문구 색상만 조정해 주세요.'}),/REVISION_LIMIT/);assert.equal(s.worker.boundary.paidEnabled,false);
});
test('switching identities cannot read prior chat/artifacts and expired identity fails closed',async()=>{
 const s=createFixtureSession();await s.confirm('deposit');await s.confirm('production');await s.customer.setChatConsent('CASE-A',true);await s.customer.appendMessage('CASE-A','A의 합성 기록');s.setActor(B);await assert.rejects(s.customer.listMessages('CASE-A'),/FORBIDDEN/);await assert.rejects(s.preview({caseId:'CASE-A'}),/FORBIDDEN/);assert.equal((await s.preview({caseId:'CASE-B'})).versions.length,0);s.expire();await assert.rejects(s.customer.verify(),/AUTH_EXPIRED/);await assert.rejects(s.preview({caseId:'CASE-B'}),/AUTH_EXPIRED/);
});
test('public entry excludes synthetic sessions and proposed price catalog; legacy processing sources preserved',async()=>{
 const entry=await readFile(new URL('../../solq-consultant.js',import.meta.url),'utf8');assert.doesNotMatch(entry,/fixture|pricing\/catalog|createSyntheticWorker/);
 const questions=await readFile(new URL('./ui/questions.json',import.meta.url),'utf8');assert.doesNotMatch(questions,/price_krw|priceKrw|monthly_maintenance_krw/);
 const baseline=JSON.parse(await readFile(new URL('./evidence/preservation-baseline.json',import.meta.url),'utf8'));
 for(const [path,digest]of Object.entries(baseline.sha256)){const raw=await readFile(new URL('../../'+path,import.meta.url));assert.equal(createHash('sha256').update(raw).digest('hex'),digest,path);}
});
