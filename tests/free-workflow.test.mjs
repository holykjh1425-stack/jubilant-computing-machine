import test from 'node:test';
import assert from 'node:assert/strict';
import {executeFree, classifyInstruction, PLAN_STEPS} from '../supabase/functions/nexus-orchestrator/engine.mjs';

function run(instruction) {
 const previous=[]; const outcomes=[];
 for(const kind of ['requirements','scope','validation','human_review']) {
  const outcome=executeFree({agent:'internal',kind,instruction,previous:[...previous]});
  outcomes.push(outcome); previous.push(outcome.result);
 }
 return outcomes;
}
test('free roles produce six-step plan and report, stopping before customer production',()=>{
 const outcomes=run('TEST ONLY: 홈페이지 제작 범위 검토');
 assert.deepEqual(outcomes.map(x=>x.status),['completed','completed','completed','awaiting_approval']);
 assert.deepEqual(outcomes.map(x=>x.result.role),['analysis','planning','validation','reporting']);
 assert.deepEqual(outcomes[1].result.plan.steps,[...PLAN_STEPS]);
 assert.deepEqual(outcomes[1].result.plan.assignments.filter(x=>x.status==='requires_separate_approval').map(x=>x.kind),['implementation','delivery']);
 assert.equal(outcomes[3].result.report.classification.service_type,'website');
 assert.equal(outcomes[3].result.report.production_completed,false);
 assert.ok(outcomes.every(x=>x.result.paid_calls===0&&x.result.execution_started===false));
});
test('ambiguous and unknown requests require review instead of guessing',()=>{
 assert.equal(classifyInstruction('홈페이지와 챗봇 자동화').service_type,'needs_review');
 assert.equal(classifyInstruction('테스트').requires_review,true);
 assert.equal(classifyInstruction('자동화 분석').service_type,'ai_automation');
 assert.equal(classifyInstruction('맞춤 시스템').service_type,'custom_system');
});
test('validation rejects executed, paid, reordered, and malformed upstream plans',()=>{
 const outcomes=run('TEST ONLY 홈페이지');
 for(const mutate of [
  p=>{p[0].paid_calls=1;},p=>{p[1].execution_started=true;},p=>p.reverse(),
  p=>{p[1].plan.steps.pop();},p=>{p[1].plan.external_execution='enabled';},
 ]) {
  const previous=structuredClone(outcomes.slice(0,2).map(x=>x.result));mutate(previous);
  assert.equal(executeFree({agent:'internal',kind:'validation',instruction:'TEST',previous}).status,'failed');
 }
});
test('report cannot claim success for missing or failed validation',()=>{
 const previous=run('TEST ONLY 홈페이지').slice(0,3).map(x=>x.result);
 previous[2].passed=false;
 assert.equal(executeFree({agent:'internal',kind:'human_review',instruction:'TEST',previous}).status,'failed');
});
